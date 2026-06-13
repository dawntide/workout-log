// 하이브리드(Asymptote × Async) 규칙 테스트 — `web/docs/asymptote-async-hybrid.md` 기준.
// 1) 그라인딩-정지: 비-AMRAP 작업 세트는 stopOnGrind 가이드를 받는다.
// 2) 연속일 AMRAP 가드: restDayGap < 최소 휴식일이면 AMRAP을 보류하고 작업 세트로 강등한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASYMPTOTE_AMRAP_MIN_REST_DAYS,
  asymptoteDayGap,
  asymptoteSetGuidance,
  asymptoteShouldDeferAmrap,
} from "./asymptote";
import { plannedExercisesFromAsymptoteManualSession } from "./generateSession";

// ──────────────────────────────────────────────────────────────────────────────
// 순수 헬퍼: asymptoteShouldDeferAmrap
// ──────────────────────────────────────────────────────────────────────────────

const DEFER_CASES: Array<{
  amrapEligible: boolean;
  restDayGap?: number | null;
  minRestDays?: number;
  expect: boolean;
  label: string;
}> = [
  { amrapEligible: false, restDayGap: 0, expect: false, label: "AMRAP 비적격이면 항상 false" },
  { amrapEligible: true, restDayGap: undefined, expect: false, label: "gap 미지정 → 보류 안 함(기존 동작)" },
  { amrapEligible: true, restDayGap: null, expect: false, label: "gap null → 보류 안 함" },
  { amrapEligible: true, restDayGap: Number.NaN, expect: false, label: "gap 비유한 → 보류 안 함" },
  { amrapEligible: true, restDayGap: 0, expect: true, label: "같은 날(0일) → 보류" },
  { amrapEligible: true, restDayGap: 1, expect: true, label: "연속일(1일) → 보류" },
  { amrapEligible: true, restDayGap: 2, expect: false, label: "48h(2일·기본 최소) → 진행" },
  { amrapEligible: true, restDayGap: 3, expect: false, label: "충분한 휴식 → 진행" },
  { amrapEligible: true, restDayGap: 2, minRestDays: 3, expect: true, label: "커스텀 최소 3일 → 2일은 보류" },
];

test("asymptoteShouldDeferAmrap: 연속일 가드 매트릭스", () => {
  for (const tc of DEFER_CASES) {
    const actual = asymptoteShouldDeferAmrap({
      amrapEligible: tc.amrapEligible,
      restDayGap: tc.restDayGap,
      minRestDays: tc.minRestDays,
    });
    assert.equal(actual, tc.expect, `${tc.label} (got ${actual})`);
  }
});

test("ASYMPTOTE_AMRAP_MIN_REST_DAYS 기본값은 2(48h)", () => {
  assert.equal(ASYMPTOTE_AMRAP_MIN_REST_DAYS, 2);
});

test("asymptoteDayGap: 세션 날짜 - 직전 세션 날짜 일 간격", () => {
  assert.equal(asymptoteDayGap("2026-06-13", "2026-06-13"), 0, "같은 날 → 0");
  assert.equal(asymptoteDayGap("2026-06-13", "2026-06-12"), 1, "연속일 → 1");
  assert.equal(asymptoteDayGap("2026-06-13", "2026-06-11"), 2, "48h → 2");
  assert.equal(asymptoteDayGap("2026-07-01", "2026-06-28"), 3, "월 경계 넘는 3일");
  assert.equal(asymptoteDayGap("2026-06-13", null), null, "직전 세션 없음 → null");
  assert.equal(asymptoteDayGap("2026-06-13", undefined), null, "undefined → null");
  assert.equal(asymptoteDayGap("2026-06-13", "2026-06-20"), null, "미래(음수) → null");
  assert.equal(asymptoteDayGap("2026-06-13", "garbage"), null, "파싱 불가 → null");
});

test("asymptoteDayGap → asymptoteShouldDeferAmrap 결합", () => {
  // 직전 세션과 1일 → gap 1 < 2 → 보류
  assert.equal(
    asymptoteShouldDeferAmrap({ amrapEligible: true, restDayGap: asymptoteDayGap("2026-06-13", "2026-06-12") }),
    true,
  );
  // 직전 세션과 2일 → gap 2 ≥ 2 → 진행
  assert.equal(
    asymptoteShouldDeferAmrap({ amrapEligible: true, restDayGap: asymptoteDayGap("2026-06-13", "2026-06-11") }),
    false,
  );
});

test("asymptoteSetGuidance: AMRAP vs STOP_ON_GRIND", () => {
  // 적격 + 충분한 휴식 → AMRAP
  assert.equal(asymptoteSetGuidance({ amrapEligible: true, restDayGap: 2 }), "AMRAP");
  assert.equal(asymptoteSetGuidance({ amrapEligible: true, restDayGap: null }), "AMRAP");
  // 적격이나 연속일 → 보류되어 그라인딩 정지
  assert.equal(asymptoteSetGuidance({ amrapEligible: true, restDayGap: 1 }), "STOP_ON_GRIND");
  // 비적격(일반 작업 세트) → 그라인딩 정지
  assert.equal(asymptoteSetGuidance({ amrapEligible: false }), "STOP_ON_GRIND");
});

// ──────────────────────────────────────────────────────────────────────────────
// 처방 레이어 wiring (manual 슬롯 경로) — LOGIC 경로와 동일 헬퍼/필드를 공유한다.
// ──────────────────────────────────────────────────────────────────────────────

const TM = { trainingMaxKg: { SQUAT: 160, BENCH: 120, PULL: 100 } };

// 세션 A: SQUAT(amrap 슬롯) + BENCH(비-amrap 슬롯).
function sessionA() {
  return {
    key: "A",
    items: [
      {
        exerciseName: "Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: { coef: 0.875, amrap: true, sessionKey: "A", role: { ko: "중강도", en: "Moderate" } },
        sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }, { reps: 3 }],
      },
      {
        exerciseName: "Bench Press",
        rowType: "AUTO",
        progressionTarget: "BENCH",
        slot: { coef: 0.775, amrap: false, sessionKey: "A", role: { ko: "볼륨", en: "Volume" } },
        sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }],
      },
    ],
  };
}

test("wiring: 비-AMRAP 작업 세트는 stopOnGrind=true (week1 전 세트)", () => {
  const out = plannedExercisesFromAsymptoteManualSession(sessionA(), 1, TM, {});
  const squat = out[0]!;
  for (const set of squat.sets) {
    assert.equal(set.amrap, false, "week1은 AMRAP 아님");
    assert.equal(set.stopOnGrind, true, "week1 작업 세트는 그라인딩 정지");
  }
});

test("wiring: week3 AMRAP 세트는 stopOnGrind 미부착, 나머지는 부착", () => {
  const out = plannedExercisesFromAsymptoteManualSession(sessionA(), 3, TM, {});
  const squat = out[0]!;
  // 마지막 세트 = AMRAP (restDayGap 미지정 → 보류 안 함, 기존 동작 보존)
  assert.equal(squat.sets[3]!.amrap, true);
  assert.equal(squat.sets[3]!.stopOnGrind, undefined, "AMRAP 세트엔 그라인딩 정지 안 붙음");
  // 앞 3세트는 작업 세트 → stopOnGrind
  for (let i = 0; i < 3; i += 1) {
    assert.equal(squat.sets[i]!.amrap, false);
    assert.equal(squat.sets[i]!.stopOnGrind, true);
  }
  // 비-amrap 슬롯(BENCH)은 검증 사이클이라도 전 세트 작업 세트
  const bench = out[1]!;
  assert.equal(bench.sets[3]!.amrap, false);
  assert.equal(bench.sets[3]!.stopOnGrind, true);
});

test("wiring: week3 + 연속일(restDayGap=1) → AMRAP 보류, 작업 세트로 강등", () => {
  const out = plannedExercisesFromAsymptoteManualSession(sessionA(), 3, { ...TM, restDayGap: 1 }, {});
  const squat = out[0]!;
  const lastSet = squat.sets[3]!;
  assert.equal(lastSet.amrap, false, "연속일이면 AMRAP 보류");
  assert.equal(lastSet.stopOnGrind, true, "보류된 AMRAP은 그라인딩-정지 작업 세트로 강등");
  assert.match(String(lastSet.note), /보류/);
});

test("wiring: week3 + 충분한 휴식(restDayGap=2) → AMRAP 유지", () => {
  const out = plannedExercisesFromAsymptoteManualSession(sessionA(), 3, { ...TM, restDayGap: 2 }, {});
  const squat = out[0]!;
  assert.equal(squat.sets[3]!.amrap, true, "48h 이상이면 AMRAP 진행");
  assert.match(String(squat.sets[3]!.note), /AMRAP/);
});
