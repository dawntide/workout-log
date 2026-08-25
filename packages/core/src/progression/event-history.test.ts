import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildProgressionFeedbackFromEvent } from "./feedback-catalog";

// 이 모듈은 DB를 타므로 여기서는 **계약**을 잠근다.
//
// G2(문구 복제 금지): 이력이 자체 문구를 만들기 시작하면 카드와 이력이 같은 판정을
// 다르게 말한다. 커버리지 문서가 "클라이언트별 문구 복제 금지"를 원칙으로 못박아 뒀고,
// 이력도 같은 원칙 아래 있다.
//
// G3(두 계보): REF5는 판정을 meta.changes에, 나머지는 meta.targetDecisions에 싣는다.
// 조립기가 이미 갈라서 처리하므로 이력은 같은 함수를 통과시키기만 하면 된다.

const SOURCE = readFileSync(new URL("./event-history.ts", import.meta.url), "utf8");

test("G2: 이력 모듈은 문구를 직접 만들지 않는다", () => {
  assert.match(
    SOURCE,
    /buildProgressionFeedbackFromEvent/,
    "카드와 같은 조립기를 경유해야 한다",
  );
  // 로케일 분기가 이 파일에 생기면 문구를 복제하기 시작했다는 신호다.
  assert.ok(
    !/locale === "ko"|locale === "en"/.test(SOURCE),
    "이력 모듈에 로케일 분기가 생겼다 — 문구가 복제되고 있다",
  );
});

test("G3: 조립기가 REF5 계보(meta.changes)를 읽는다", () => {
  const payload = buildProgressionFeedbackFromEvent(
    {
      eventRow: {
        id: "evt-ref5",
        eventType: "REF5_WINDOW_JUDGED",
        reason: null,
        programSlug: "ref5-adaptive-strength",
        createdAt: "2026-08-25T00:00:00.000Z",
        meta: {
          changes: [{ lift: "SQ", kind: "INCREASE", beforeKg: 100, afterKg: 102.5 }],
        },
      },
    },
    "ko",
  );
  assert.ok(payload.report, "REF5 판정이 리포트로 조립돼야 한다");
  assert.equal(payload.report!.rows.length, 1);
  assert.match(payload.report!.rows[0]!.text, /100/);
});

test("G3: 조립기가 공통 계보(meta.targetDecisions)를 읽는다", () => {
  const payload = buildProgressionFeedbackFromEvent(
    {
      eventRow: {
        id: "evt-lp",
        eventType: "INCREASE",
        reason: "increase:success",
        programSlug: "stronglifts-5x5",
        createdAt: "2026-08-25T00:00:00.000Z",
        meta: {
          targetDecisions: [
            {
              target: "SQUAT",
              progressionTarget: "SQUAT",
              outcome: "SUCCESS",
              eventType: "INCREASE",
              reason: "increase:success",
              before: { workKg: 100 },
              after: { workKg: 102.5 },
            },
          ],
        },
      },
    },
    "ko",
  );
  assert.ok(payload.report, "공통 계보 판정이 리포트로 조립돼야 한다");
  assert.ok(payload.report!.rows.length > 0);
});

test("보고할 판정이 없는 이벤트는 report가 null이다 (이력에서 걸러진다)", () => {
  // 카드가 생략하는 것과 같은 기준 — 이력에도 노이즈가 쌓이지 않는다.
  const payload = buildProgressionFeedbackFromEvent(
    {
      eventRow: {
        id: "evt-quiet",
        eventType: "HOLD",
        reason: "hold:in-progress",
        programSlug: "stronglifts-5x5",
        createdAt: "2026-08-25T00:00:00.000Z",
        meta: { targetDecisions: [] },
      },
    },
    "ko",
  );
  assert.equal(payload.report, null);
});

test("이력은 표시 개수를 1~50으로 가둔다", () => {
  // 상한이 없으면 오래된 플랜에서 응답이 무한정 커진다.
  assert.match(SOURCE, /Math\.min\(50, Math\.max\(1,/);
});
