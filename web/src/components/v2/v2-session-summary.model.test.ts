// v2-session-summary 순수 모델 레이어 테스트. god-component 3단계 분해로 뷰에서 떼어낸
// 도메인 로직(집계·PR 카드·최고 e1RM·요약 접기)의 동작을 잠근다.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExerciseSummaries,
  buildPrCards,
  buildSummaryData,
  findTopEstOneRm,
  formatDurationLong,
  resolveGoal,
  type V2SummaryLog,
  type V2SummarySet,
} from "./v2-session-summary.model";
import { estimateE1rmKg } from "@workout/core/stats/e1rm";

function set(partial: Partial<V2SummarySet> & { exerciseName: string }): V2SummarySet {
  return {
    setNumber: 1,
    reps: 5,
    weightKg: 100,
    isExtra: false,
    ...partial,
  };
}

// ── 집계 ────────────────────────────────────────────────────────────────────

test("buildExerciseSummaries: 같은 운동 세트를 접어 집계", () => {
  const summaries = buildExerciseSummaries([
    set({ exerciseName: "Squat", weightKg: 100, reps: 5 }),
    set({ exerciseName: "Squat", weightKg: 120, reps: 3 }),
    set({ exerciseName: "Bench", weightKg: 80, reps: 5 }),
  ]);
  const squat = summaries.find((s) => s.name === "Squat")!;
  assert.equal(squat.setCount, 2);
  assert.equal(squat.topWeightKg, 120); // 최고 중량
  assert.equal(squat.totalReps, 8);
  assert.equal(squat.volumeKg, 100 * 5 + 120 * 3); // 860
  assert.equal(summaries.length, 2);
});

test("buildExerciseSummaries: 빈 이름 세트는 무시", () => {
  const summaries = buildExerciseSummaries([
    set({ exerciseName: "  ", weightKg: 100, reps: 5 }),
    set({ exerciseName: "Deadlift", weightKg: 140, reps: 5 }),
  ]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].name, "Deadlift");
});

// ── 최고 e1RM ────────────────────────────────────────────────────────────────

test("findTopEstOneRm: e1RM 최댓값 세트 선택, isExtra 제외", () => {
  const top = findTopEstOneRm([
    set({ exerciseName: "Squat", weightKg: 100, reps: 5 }), // e ≈ 116.7
    set({ exerciseName: "Squat", weightKg: 130, reps: 1 }), // e ≈ 134.3 (최대)
    set({ exerciseName: "Squat", weightKg: 200, reps: 5, isExtra: true }), // 제외
  ]);
  assert.ok(top);
  assert.equal(top!.weightKg, 130);
  assert.equal(top!.reps, 1);
  assert.ok(Math.abs(top!.estOneRm - estimateE1rmKg(130, 1)) < 1e-9);
});

test("findTopEstOneRm: 유효 세트 없으면 null", () => {
  const top = findTopEstOneRm([
    set({ exerciseName: "Plank", weightKg: 0, reps: 0 }),
  ]);
  assert.equal(top, null);
});

// ── PR 카드 ──────────────────────────────────────────────────────────────────

test("buildPrCards: personal record가 progression보다 우선 + 중복 키 제거", () => {
  const cards = buildPrCards(
    {
      event: {
        targetDecisions: [
          {
            target: "Squat",
            eventType: "INCREASE",
            outcome: "SUCCESS",
            afterWorkKg: 105,
            beforeWorkKg: 100,
            deltaWorkKg: 5,
          },
          {
            target: "Bench",
            eventType: "INCREASE",
            outcome: "SUCCESS",
            afterWorkKg: 82.5,
            beforeWorkKg: 80,
            deltaWorkKg: 2.5,
          },
        ],
      },
    } as unknown as V2SummaryLog["progression"],
    [
      {
        exerciseName: "Squat",
        topWeightKg: 130,
        topReps: 1,
        estOneRm: 134.3,
        previousBestE1rm: 128,
        deltaE1rm: 6.3,
      },
    ],
  );
  // Squat은 personal로만(중복 제거), Bench는 progression으로
  const squat = cards.filter((c) => c.matchKey === "squat");
  assert.equal(squat.length, 1);
  assert.equal(squat[0].source, "personal");
  const bench = cards.find((c) => c.matchKey === "bench")!;
  assert.equal(bench.source, "progression");
  assert.equal(bench.deltaKg, 2.5);
});

test("buildPrCards: INCREASE/SUCCESS 아니면 제외", () => {
  const cards = buildPrCards(
    {
      event: {
        targetDecisions: [
          {
            target: "Squat",
            eventType: "HOLD",
            outcome: "SUCCESS",
            afterWorkKg: 100,
            beforeWorkKg: 100,
            deltaWorkKg: 0,
          },
        ],
      },
    } as unknown as V2SummaryLog["progression"],
    null,
  );
  assert.equal(cards.length, 0);
});

// ── 요약 접기 ────────────────────────────────────────────────────────────────

test("buildSummaryData: 총량 집계 + prKeys + progression PR estOneRm 보강", () => {
  const log: V2SummaryLog = {
    id: "log-1",
    performedAt: "2026-07-09T10:00:00.000Z",
    durationMinutes: 45,
    notes: null,
    sets: [
      set({ exerciseName: "Squat", weightKg: 100, reps: 5 }),
      set({ exerciseName: "Squat", weightKg: 105, reps: 5 }),
      set({ exerciseName: "Bench", weightKg: 80, reps: 5 }),
    ],
    progression: {
      event: {
        targetDecisions: [
          {
            target: "Squat",
            eventType: "INCREASE",
            outcome: "SUCCESS",
            afterWorkKg: 105,
            beforeWorkKg: 100,
            deltaWorkKg: 5,
          },
        ],
      },
    } as unknown as V2SummaryLog["progression"],
    personalRecords: null,
  };
  const data = buildSummaryData(log);
  assert.equal(data.totalSets, 3);
  assert.equal(data.totalReps, 15);
  assert.equal(data.totalVolume, 100 * 5 + 105 * 5 + 80 * 5); // 1425
  assert.ok(data.prKeys.has("squat"));
  const squatPr = data.prCards.find((p) => p.matchKey === "squat")!;
  // progression 카드는 운동 top set(105kg×5)로 estOneRm 보강
  assert.ok((squatPr.estOneRm ?? 0) > 0);
  assert.ok(Math.abs((squatPr.estOneRm ?? 0) - estimateE1rmKg(105, 5)) < 1e-9);
});

// ── 소형 유틸 ────────────────────────────────────────────────────────────────

test("resolveGoal: powerlifting→strength, 미지정→general", () => {
  assert.equal(resolveGoal("powerlifting"), "strength");
  assert.equal(resolveGoal("strength"), "strength");
  assert.equal(resolveGoal("hypertrophy"), "hypertrophy");
  assert.equal(resolveGoal("endurance"), "endurance");
  assert.equal(resolveGoal(null), "general");
  assert.equal(resolveGoal(undefined), "general");
});

test("formatDurationLong: mm:ss, 비양수는 null", () => {
  assert.equal(formatDurationLong(45), "45:00");
  assert.equal(formatDurationLong(3.5), "03:30");
  assert.equal(formatDurationLong(0), null);
  assert.equal(formatDurationLong(null), null);
});

// ── 세트 타입(M1-3 PR4) ─────────────────────────────────────────────────────
// 세션 요약은 클라이언트에서 집계한다. 서버 통계(SQL)와 규칙이 어긋나면 같은 세션을
// 두 화면에서 볼 때 숫자가 달라진다(계획서 docs/set-type-plan.md §3.3).

test("세트 타입: 웜업은 볼륨·세트 수·탑세트에서 빠진다", () => {
  const summaries = buildExerciseSummaries([
    set({ exerciseName: "Back Squat", setNumber: 1, reps: 8, weightKg: 60, setType: "WARMUP" }),
    set({ exerciseName: "Back Squat", setNumber: 2, reps: 5, weightKg: 100 }),
    set({ exerciseName: "Back Squat", setNumber: 3, reps: 5, weightKg: 100 }),
  ]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]!.setCount, 2);
  assert.equal(summaries[0]!.totalReps, 10);
  assert.equal(summaries[0]!.volumeKg, 1000);
  assert.equal(summaries[0]!.topWeightKg, 100);
});

test("세트 타입: 실패 세트는 통계에 남는다 — 실제로 든 무게다", () => {
  const summaries = buildExerciseSummaries([
    set({ exerciseName: "Bench Press", setNumber: 1, reps: 5, weightKg: 80 }),
    set({ exerciseName: "Bench Press", setNumber: 2, reps: 3, weightKg: 80, setType: "FAILURE" }),
  ]);
  assert.equal(summaries[0]!.setCount, 2);
  assert.equal(summaries[0]!.volumeKg, 640);
});

test("세트 타입: 웜업은 세션 최고 e1RM 후보에서 빠진다", () => {
  // 웜업이 가벼워도 고반복이면 Epley가 작업 세트를 넘길 수 있다 — 실제로 위험한 경우다.
  const top = findTopEstOneRm([
    set({ exerciseName: "Deadlift", setNumber: 1, reps: 15, weightKg: 100, setType: "WARMUP" }),
    set({ exerciseName: "Deadlift", setNumber: 2, reps: 3, weightKg: 140 }),
  ]);
  assert.equal(top?.weightKg, 140);
});

test("세트 타입: 태그 없는 레거시 세션은 종전대로 전부 집계된다", () => {
  const summaries = buildExerciseSummaries([
    set({ exerciseName: "Row", setNumber: 1, reps: 10, weightKg: 50 }),
    set({ exerciseName: "Row", setNumber: 2, reps: 10, weightKg: 50 }),
  ]);
  assert.equal(summaries[0]!.setCount, 2);
  assert.equal(summaries[0]!.volumeKg, 1000);
});
