// Asymptote × Async Hybrid — 트리거 조기 디로드 테스트 (`asymptote-async-hybrid.md` §3.3).
// 드라이버(SQ/BP/PULL) 중 2개 이상이 failureStreak ≥ 2면 빌드 사이클 중 즉시 week4(디로드)로 점프.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reduceProgressionState,
  type ProgressionRuntimeState,
  type ProgressionTarget,
} from "./reducer";

const TM = { trainingMaxKg: { SQUAT: 100, BENCH: 80, PULL: 100, DEADLIFT: 100, OHP: 40 } };

function target(progressionTarget: ProgressionTarget, failureStreak: number) {
  return { progressionTarget, workKg: 100, successStreak: 0, failureStreak };
}

function baseState(week: number, day: number, streaks: Record<string, number>): ProgressionRuntimeState {
  return {
    cycle: 1,
    week,
    day,
    lastAppliedLogId: null,
    targets: {
      SQUAT: target("SQUAT", streaks.SQUAT ?? 0),
      BENCH: target("BENCH", streaks.BENCH ?? 0),
      PULL: target("PULL", streaks.PULL ?? 0),
      DEADLIFT: target("DEADLIFT", 0),
      OHP: target("OHP", 0),
    },
  };
}

// 완료된(성공) PULL 한 세트 — 세션이 "로그됨"으로 카운트되게 한다.
const pullSuccessSet = {
  exerciseName: "Weighted Pull-Up",
  reps: 3,
  weightKg: 80,
  meta: { plannedRef: { progressionTarget: "PULL", progressionKey: "PULL", reps: 3 } },
};

function run(prev: ProgressionRuntimeState) {
  return reduceProgressionState({
    program: "asymptote",
    previousState: prev,
    planParams: TM,
    logId: "log-trigger",
    sets: [pullSuccessSet],
  }).nextState;
}

test("드라이버 2개(SQ+BP) failureStreak≥2 → week4로 점프", () => {
  const next = run(baseState(1, 1, { SQUAT: 2, BENCH: 2 }));
  assert.equal(next.week, 4, "디로드 사이클로 점프");
  assert.equal(next.day, 1, "디로드 사이클 선두");
});

test("드라이버 1개만 regress → 점프 안 함(정상 진행)", () => {
  const next = run(baseState(1, 1, { SQUAT: 2, BENCH: 0 }));
  assert.equal(next.week, 1, "빌드 사이클 유지");
  assert.equal(next.day, 2, "정상 세션 advance");
});

test("정상 진행(streak 0) → 트리거 미발동", () => {
  const next = run(baseState(2, 2, { SQUAT: 0, BENCH: 0, PULL: 0 }));
  assert.equal(next.week, 2);
  assert.equal(next.day, 3);
});

test("이미 디로드(week4)면 트리거 미발동(재점프 없음)", () => {
  const next = run(baseState(4, 1, { SQUAT: 3, BENCH: 3, PULL: 3 }));
  // week4/day1 → 정상 advance day2. 재점프/래핑 없음.
  assert.equal(next.week, 4);
  assert.equal(next.day, 2);
});

test("드라이버 3개 모두 regress → 점프 (보조 DL/OHP는 트리거 대상 아님)", () => {
  const next = run(baseState(3, 2, { SQUAT: 2, BENCH: 2, PULL: 2 }));
  assert.equal(next.week, 4);
  assert.equal(next.day, 1);
});
