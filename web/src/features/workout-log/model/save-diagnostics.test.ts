import assert from "node:assert/strict";
import test from "node:test";

import {
  diagnoseSaveFailure,
  runSaveAttempt,
  SAVE_FAILURE_STAGES,
  shouldLogSaveFailure,
} from "./save-diagnostics";

// 2026-09-08 프로덕션 저장 실패 조사에서 나온 두 결함을 잠근다.
//
// ① 폴백이 정체를 지운다. 화면에 뜬 "운동기록 저장에 실패했습니다."는 컨트롤러 폴백이고,
//    폴백이 떴다는 건 던져진 값에 message가 없었다는 뜻이다 — 그런데 그 사실이 화면에도
//    로그에도 남지 않아 서버 거부인지 전송 실패인지 사후에 가릴 수가 없었다.
// ② 저장 성공 뒤의 후처리가 같은 오류 경계 안에 있었다. 후처리가 던지면 DB에는 기록이
//    들어갔는데 화면은 "저장 실패"를 띄운다.

test("메시지가 있는 Error는 그 문구를 그대로 보여준다", () => {
  const diagnosis = diagnoseSaveFailure(
    new Error("REF5 canonical exercise is missing from the catalog: Assisted OAP · Left"),
    "ko",
  );

  assert.equal(
    diagnosis.message,
    "REF5 canonical exercise is missing from the catalog: Assisted OAP · Left",
    "서버 거부 문구는 폴백으로 덮이면 안 된다 — 이게 계층을 가르는 유일한 단서다",
  );
});

test("메시지가 없는 Error는 폴백에 name을 덧붙여 계층을 드러낸다", () => {
  const aborted = new Error("");
  aborted.name = "AbortError";

  const diagnosis = diagnoseSaveFailure(aborted, "ko");

  assert.match(diagnosis.message, /운동기록 저장에 실패했습니다/);
  assert.match(
    diagnosis.message,
    /AbortError/,
    "정체를 못 실으면 다음 조사도 똑같이 막힌다",
  );
});

test("Error가 아닌 값은 폴백에 값의 종류를 덧붙인다", () => {
  const diagnosis = diagnoseSaveFailure(undefined, "ko");

  assert.match(diagnosis.message, /운동기록 저장에 실패했습니다/);
  assert.match(diagnosis.message, /undefined/);
  assert.equal(diagnosis.props.errorName, "undefined");
});

test("문자열 throw는 그 문자열이 곧 문구가 된다", () => {
  const diagnosis = diagnoseSaveFailure("Upstream unavailable", "ko");

  assert.equal(diagnosis.message, "Upstream unavailable");
  assert.equal(diagnosis.props.errorName, "string");
});

test("en 로케일은 영문 폴백을 쓰되 정체는 똑같이 싣는다", () => {
  const diagnosis = diagnoseSaveFailure(new Error(""), "en");

  assert.match(diagnosis.message, /Failed to save the workout log/);
  assert.match(diagnosis.message, /Error/, "정체는 로케일과 무관하게 붙어야 한다");
});

test("Next의 digest를 props에 싣는다", () => {
  // 서버 액션이 리다이렉트로 끊기면 Next는 message가 "NEXT_REDIRECT"인 Error에 digest를
  // 달아 reject한다. digest에 목적지·상태코드가 들어 있어 세션 만료를 여기서 가릴 수 있다.
  const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/login;307;",
  });

  const diagnosis = diagnoseSaveFailure(redirectError, "ko");

  assert.equal(diagnosis.props.errorDigest, "NEXT_REDIRECT;replace;/login;307;");
  assert.equal(diagnosis.props.errorName, "Error");
});

test("digest가 없으면 null로 남기고 메시지는 그대로 싣는다", () => {
  const diagnosis = diagnoseSaveFailure(new Error("boom"), "ko");

  assert.equal(diagnosis.props.errorDigest, null);
  assert.equal(diagnosis.props.errorMessage, "boom");
});

test("props의 메시지는 잘라낸다", () => {
  // ux-events ingest는 페이로드 16KB에서 통째로 413을 낸다. 한 이벤트가 배치를 죽이면
  // 그 배치의 다른 실패 기록까지 같이 사라진다.
  const diagnosis = diagnoseSaveFailure(new Error("x".repeat(1000)), "ko");

  const propMessage = diagnosis.props.errorMessage as string;
  assert.equal(propMessage.length, 200, "정확히 상한까지만 남겨야 한다");
  assert.ok(propMessage.startsWith("xxx"), "자르되 앞부분은 살려야 진단에 쓸 수 있다");
});

test("저장이 던지면 그 오류를 그대로 실어 실패로 보고하고 후처리는 건너뛴다", async () => {
  let afterSaveCalls = 0;
  const thrown = new Error("boom");

  const outcome = await runSaveAttempt({
    save: async () => {
      throw thrown;
    },
    afterSave: () => {
      afterSaveCalls += 1;
    },
  });

  assert.equal(outcome.status, "failed");
  assert.equal(
    (outcome as { error: unknown }).error,
    thrown,
    "원본 오류를 잃으면 진단이 다시 폴백으로 무너진다",
  );
  assert.equal(afterSaveCalls, 0, "저장이 실패했는데 성공 후처리가 돌면 안 된다");
});

test("저장과 후처리가 모두 성공하면 saved로 끝난다", async () => {
  const seen: string[] = [];

  const outcome = await runSaveAttempt({
    save: async () => "log-1",
    afterSave: (result) => {
      seen.push(result);
    },
  });

  assert.equal(outcome.status, "saved");
  assert.deepEqual(seen, ["log-1"]);
});

test("후처리가 던져도 저장 실패로 보고하지 않는다", async () => {
  // 이게 핵심 회귀다. 후처리(토스트·라우팅)가 던졌다고 "저장 실패"를 띄우면,
  // 사용자는 DB에 이미 들어간 세션을 다시 입력하게 된다.
  const outcome = await runSaveAttempt({
    save: async () => "log-1",
    afterSave: () => {
      throw new Error("router blew up");
    },
  });

  assert.equal(
    outcome.status,
    "saved-with-post-error",
    "저장은 성공했다 — 실패로 접으면 안 된다",
  );
  assert.equal((outcome as { error: Error }).error.message, "router blew up");
});

// ③ 콘솔이 정상 UX까지 에러로 물들였다. ①을 고치면서 `console.error`를 실패 보고 한
//    군데에 몰아 넣었는데, **입력 검증 거부**까지 같은 자리를 지난다. 사용자가 화면에서
//    이미 원인을 읽고 있고 던져진 값도 그 문구 자체라 콘솔에 남길 것이 없다. 그런데도
//    찍히는 바람에 여정 E2E의 "콘솔 에러 0건" 가드가 깨졌다(ref5-user-journey.spec.ts).
//    console.error는 **예상 못 한 것**이라는 신호로 아껴 둔다 — 정상 거부까지 물들이면
//    그 가드가 무의미해지고, 진짜 예외가 소음에 묻힌다.

test("입력 검증 거부는 콘솔에 남기지 않는다", () => {
  assert.equal(shouldLogSaveFailure("entry-validation"), false);
  assert.equal(shouldLogSaveFailure("draft-validation"), false);
});

test("예외로 끝난 저장은 원본을 콘솔에 남긴다", () => {
  // 실기기 원격 디버깅의 유일한 창이다. 서버 액션이라 Vercel 에러 그룹에 안 잡힌다.
  assert.equal(shouldLogSaveFailure("progression"), true);
  assert.equal(shouldLogSaveFailure("submit"), true);
});

test("모르는 계층은 남기는 쪽으로 기운다", () => {
  // 새 예외 계층이 늘었을 때 조용히 사라지지 않게. 빠뜨리면 소음이 늘 뿐이지만,
  // 반대로 빠뜨리면 다음 조사가 또 폴백 문구 하나로 끝난다.
  assert.equal(shouldLogSaveFailure("unknown-stage"), true);
});

test("stage 문자열은 이미 쌓인 ux_event_log 행과 이어져야 한다", () => {
  // 2026-09-10부터 프로덕션 `ux_event_log`에 이 값들이 그대로 들어가 있다. 바꾸면
  // 과거 실패 기록이 새 값과 이어지지 않아, 관측성을 붙인 목적 자체가 사라진다.
  assert.deepEqual(SAVE_FAILURE_STAGES, {
    entryValidation: "entry-validation",
    draftValidation: "draft-validation",
    progression: "progression",
    submit: "submit",
  });
  // 카탈로그의 모든 계층이 콘솔 기록 여부 판정을 통과한다 — 새 계층이 늘어도 여기서 걸린다.
  for (const stage of Object.values(SAVE_FAILURE_STAGES)) {
    assert.equal(typeof shouldLogSaveFailure(stage), "boolean");
  }
});
