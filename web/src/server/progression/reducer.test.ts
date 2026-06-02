import assert from "node:assert/strict";
import test from "node:test";
import {
  readIncrementOverride,
  reduceProgressionState,
  resolveAutoProgressionProgram,
  rulesFor,
} from "./reducer";

test("resolveAutoProgressionProgram detects custom operator templates from definition", () => {
  assert.equal(
    resolveAutoProgressionProgram("tactical-barbell-operator-custom", {
      kind: "manual",
      operatorStyle: true,
      programFamily: "operator",
    }),
    "operator",
  );
  assert.equal(
    resolveAutoProgressionProgram("my-custom-greyskull", {
      kind: "greyskull-lp",
    }),
    "greyskull-lp",
  );
});

test("operator: successful base day advances day with no immediate load increase", () => {
  const result = reduceProgressionState({
    program: "operator",
    previousState: null,
    planParams: {
      trainingMaxKg: {
        SQUAT: 150,
        BENCH: 110,
        DEADLIFT: 190,
        PULL: 57.5,
      },
    },
    logId: "log-1",
    sets: [
      { exerciseName: "Back Squat", reps: 5, weightKg: 105, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Back Squat", reps: 5, weightKg: 105, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Back Squat", reps: 5, weightKg: 105, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Bench Press", reps: 5, weightKg: 77.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Bench Press", reps: 5, weightKg: 77.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Bench Press", reps: 5, weightKg: 77.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Pull-Up", reps: 5, weightKg: 40, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Pull-Up", reps: 5, weightKg: 40, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Pull-Up", reps: 5, weightKg: 40, meta: { plannedRef: { reps: 5 } } },
    ],
  });

  assert.equal(result.eventType, "ADVANCE_WEEK");
  assert.equal(result.didAdvanceSession, true);
  assert.equal(result.nextState.day, 2);
  assert.equal(result.nextState.week, 1);
  assert.equal(result.nextState.targets.SQUAT?.workKg, 150);
  assert.equal(result.nextState.targets.PULL?.workKg, 57.5);
});

test("operator: increase after successful 6-week block completion", () => {
  const result = reduceProgressionState({
    program: "operator",
    previousState: {
      cycle: 1,
      week: 6,
      day: 3,
      lastAppliedLogId: "older-log",
      targets: {
        SQUAT: { progressionTarget: "SQUAT", workKg: 150, successStreak: 17, failureStreak: 0 },
        BENCH: { progressionTarget: "BENCH", workKg: 110, successStreak: 17, failureStreak: 0 },
        DEADLIFT: { progressionTarget: "DEADLIFT", workKg: 190, successStreak: 5, failureStreak: 0 },
        PULL: { progressionTarget: "PULL", workKg: 57.5, successStreak: 11, failureStreak: 0 },
      },
    },
    planParams: {},
    logId: "log-2",
    sets: [
      { exerciseName: "Back Squat", reps: 5, weightKg: 112.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Bench Press", reps: 5, weightKg: 82.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Deadlift", reps: 5, weightKg: 142.5, meta: { plannedRef: { reps: 5 } } },
    ],
  });

  assert.equal(result.eventType, "INCREASE");
  assert.equal(result.didAdvanceSession, true);
  assert.equal(result.nextState.cycle, 2);
  assert.equal(result.nextState.week, 1);
  assert.equal(result.nextState.day, 1);
  assert.equal(result.nextState.targets.SQUAT?.workKg, 155);
  assert.equal(result.nextState.targets.BENCH?.workKg, 112.5);
  assert.equal(result.nextState.targets.DEADLIFT?.workKg, 195);
  assert.equal(result.nextState.targets.PULL?.workKg, 60);
  assert.equal(result.nextState.targets.SQUAT?.successStreak, 0);
});

test("greyskull: reset after failure streak threshold", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: {
      cycle: 1,
      week: 1,
      day: 1,
      lastAppliedLogId: "older-log",
      targets: {
        SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 2 },
      },
    },
    planParams: {},
    logId: "log-3",
    sets: [
      { exerciseName: "Back Squat", reps: 3, weightKg: 100, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Back Squat", reps: 4, weightKg: 100, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Back Squat", reps: 2, weightKg: 100, meta: { plannedRef: { reps: 5 } } },
    ],
  });

  assert.equal(result.eventType, "RESET");
  assert.equal(result.nextState.targets.SQUAT?.workKg, 90);
  assert.equal(result.nextState.targets.SQUAT?.failureStreak, 0);
});

test("rulesFor: increment override snaps to 2.5kg", () => {
  const rule = rulesFor("operator", "BENCH", { increaseKg: 3.7 });
  assert.equal(rule.increaseKg, 2.5);
  assert.equal(rule.defaultIncreaseKg, 2.5);
  assert.equal(rule.decreaseKg, null);
});

test("rulesFor: decreaseKg override returns absolute kg, keeps default resetFactor", () => {
  const rule = rulesFor("greyskull-lp", "SQUAT", { decreaseKg: 7.5 });
  assert.equal(rule.decreaseKg, 7.5);
  assert.equal(rule.resetFactor, 0.9);
  assert.equal(rule.increaseKg, 2.5); // greyskull default for SQUAT (only DEADLIFT is 5)

  const ruleDl = rulesFor("greyskull-lp", "DEADLIFT");
  assert.equal(ruleDl.increaseKg, 5);
});

test("rulesFor: no override preserves legacy behavior (regression guard)", () => {
  const opSquat = rulesFor("operator", "SQUAT");
  assert.equal(opSquat.increaseKg, 5);
  assert.equal(opSquat.decreaseKg, null);
  assert.equal(opSquat.resetFactor, 0.95);

  const wendlerBench = rulesFor("wendler-531", "BENCH");
  assert.equal(wendlerBench.increaseKg, 2.5);
  assert.equal(wendlerBench.decreaseKg, null);

  const gzclpDl = rulesFor("gzclp", "DEADLIFT");
  assert.equal(gzclpDl.increaseKg, 5);
  assert.equal(gzclpDl.resetFactor, 0.85);
});

test("readIncrementOverride: falls back from key to target", () => {
  const planParams = {
    incrementOverrides: {
      increaseKg: { SQUAT: 7.5 },
      decreaseKg: { EX_BACK_SQUAT: 5 },
    },
  };
  const byKey = readIncrementOverride(planParams, "EX_BACK_SQUAT", "SQUAT");
  assert.equal(byKey?.increaseKg, 7.5); // falls back to target
  assert.equal(byKey?.decreaseKg, 5); // exact key match

  const targetOnly = readIncrementOverride(planParams, "SQUAT", "SQUAT");
  assert.equal(targetOnly?.increaseKg, 7.5);
  assert.equal(targetOnly?.decreaseKg, undefined);

  const noOverride = readIncrementOverride(planParams, "BENCH", "BENCH");
  assert.equal(noOverride, undefined);
});

test("greyskull: custom decreaseKg overrides percentage-based reset", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: {
      cycle: 1,
      week: 1,
      day: 1,
      lastAppliedLogId: "older-log",
      targets: {
        SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 2 },
      },
    },
    planParams: {
      incrementOverrides: {
        decreaseKg: { SQUAT: 7.5 },
      },
    },
    logId: "log-custom-reset",
    sets: [
      { exerciseName: "Back Squat", reps: 3, weightKg: 100, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Back Squat", reps: 4, weightKg: 100, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Back Squat", reps: 2, weightKg: 100, meta: { plannedRef: { reps: 5 } } },
    ],
  });

  assert.equal(result.eventType, "RESET");
  assert.equal(result.nextState.targets.SQUAT?.workKg, 92.5); // 100 - 7.5, not 100 * 0.9 = 90
});

test("operator: block-end increase respects custom increaseKg per target", () => {
  const result = reduceProgressionState({
    program: "operator",
    previousState: {
      cycle: 1,
      week: 6,
      day: 3,
      lastAppliedLogId: "older-log",
      targets: {
        SQUAT: { progressionTarget: "SQUAT", workKg: 150, successStreak: 17, failureStreak: 0 },
        BENCH: { progressionTarget: "BENCH", workKg: 110, successStreak: 17, failureStreak: 0 },
        DEADLIFT: { progressionTarget: "DEADLIFT", workKg: 190, successStreak: 5, failureStreak: 0 },
        PULL: { progressionTarget: "PULL", workKg: 57.5, successStreak: 11, failureStreak: 0 },
      },
    },
    planParams: {
      incrementOverrides: {
        increaseKg: { BENCH: 7.5, DEADLIFT: 2.5 },
      },
    },
    logId: "log-custom-inc",
    sets: [
      { exerciseName: "Back Squat", reps: 5, weightKg: 112.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Bench Press", reps: 5, weightKg: 82.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Deadlift", reps: 5, weightKg: 142.5, meta: { plannedRef: { reps: 5 } } },
    ],
  });

  assert.equal(result.eventType, "INCREASE");
  assert.equal(result.nextState.targets.SQUAT?.workKg, 155); // default +5
  assert.equal(result.nextState.targets.BENCH?.workKg, 117.5); // override +7.5
  assert.equal(result.nextState.targets.DEADLIFT?.workKg, 192.5); // override +2.5 (instead of default +5)
  assert.equal(result.nextState.targets.PULL?.workKg, 60); // default +2.5
});

test("operator: distinct exercise progression keys stay independent within same target family", () => {
  const result = reduceProgressionState({
    program: "operator",
    previousState: null,
    planParams: {
      trainingMaxKg: {
        EX_PULL_UP: 60,
        EX_BARBELL_ROW: 80,
      },
    },
    logId: "log-4",
    sets: [
      {
        exerciseName: "Pull-Up",
        reps: 5,
        weightKg: 15,
        meta: { plannedRef: { reps: 5, progressionTarget: "PULL", progressionKey: "EX_PULL_UP", progressionLabel: "Pull-Up" } },
      },
      {
        exerciseName: "Barbell Row",
        reps: 5,
        weightKg: 60,
        meta: { plannedRef: { reps: 5, progressionTarget: "PULL", progressionKey: "EX_BARBELL_ROW", progressionLabel: "Barbell Row" } },
      },
    ],
  });

  assert.equal(result.nextState.targets.EX_PULL_UP?.progressionTarget, "PULL");
  assert.equal(result.nextState.targets.EX_BARBELL_ROW?.progressionTarget, "PULL");
  assert.equal(result.nextState.targets.EX_PULL_UP?.workKg, 60);
  assert.equal(result.nextState.targets.EX_BARBELL_ROW?.workKg, 80);
  assert.notEqual(result.nextState.targets.EX_PULL_UP?.workKg, result.nextState.targets.EX_BARBELL_ROW?.workKg);
});

// PR-C(한계2 인프라): TargetRuntimeState.stage 영속. 아직 stage 전환 로직(PR-D)은 없지만,
// deriveInitialState 명시 복원 → reduce 본문 `{...before}` 스프레드를 거쳐 silent-drop 없이
// 다음 사이클로 넘어가는지 회귀 고정한다.
test("PR-C 인프라: TargetRuntimeState.stage가 reduce 사이클을 거쳐 영속한다(silent-drop 방지)", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: {
      cycle: 1,
      week: 1,
      day: 1,
      targets: {
        D1_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0, stage: 2 },
      },
      lastAppliedLogId: null,
    },
    planParams: {},
    logId: "log-stage-1",
    sets: [
      {
        exerciseName: "Back Squat",
        reps: 3,
        weightKg: 100,
        meta: { plannedRef: { reps: 3, progressionTarget: "SQUAT", progressionKey: "D1_s0", progressionLabel: "Back Squat" } },
      },
    ],
  });

  assert.equal(result.nextState.targets.D1_s0?.stage, 2);
});

test("PR-C 인프라: stage 없는 구(舊) state도 크래시 없이 통과한다(stage undefined 유지, 후방호환)", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: {
      cycle: 1,
      week: 1,
      day: 1,
      targets: {
        D1_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 },
      },
      lastAppliedLogId: null,
    },
    planParams: {},
    logId: "log-stage-2",
    sets: [
      {
        exerciseName: "Back Squat",
        reps: 3,
        weightKg: 100,
        meta: { plannedRef: { reps: 3, progressionTarget: "SQUAT", progressionKey: "D1_s0", progressionLabel: "Back Squat" } },
      },
    ],
  });

  assert.equal(result.nextState.targets.D1_s0?.stage, undefined);
});

// PR-D(한계2 gzclp): 정석 stage 머신. v2 옵트인(progressionModel:"v2")에서만 동작.
// T1/T2는 실패 시 무게 유지·rep 스킴 강등(stage++), stage 2 소진 후 실패에만 리셋.
// T3(amrap 슬롯)는 마지막 세트 ≥25 시 증량.
function gzSet(progressionKey: string, progressionTarget: string, reps: number, plannedReps: number, weightKg: number, amrap = false) {
  return {
    exerciseName: progressionTarget === "BENCH" ? "Bench Press" : "Back Squat",
    reps,
    weightKg,
    meta: { plannedRef: { reps: plannedReps, progressionTarget, progressionKey, ...(amrap ? { amrap: true } : {}) } },
  };
}

test("PR-D gzclp(v2): T1/T2 stage 클리어(성공) → 증량 + stage 0 복귀", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { D1_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0, stage: 1 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-d1-1",
    sets: [gzSet("D1_s0", "SQUAT", 3, 3, 100)],
  });
  assert.equal(result.nextState.targets.D1_s0?.workKg, 102.5); // SQUAT +2.5
  assert.equal(result.nextState.targets.D1_s0?.stage, 0);
  assert.equal(result.eventType, "INCREASE");
});

test("PR-D gzclp(v2): T1/T2 실패 → 무게 유지 + stage++ (rep 스킴 강등, HOLD)", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { D1_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0, stage: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-d1-2",
    sets: [gzSet("D1_s0", "SQUAT", 2, 3, 100)],
  });
  assert.equal(result.nextState.targets.D1_s0?.workKg, 100); // 무게 유지
  assert.equal(result.nextState.targets.D1_s0?.stage, 1); // stage++
  assert.equal(result.eventType, "HOLD");
});

test("PR-D gzclp(v2): stage 2 소진 후 실패 → 무게 리셋(*0.85) + stage 0", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { D1_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0, stage: 2 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-d1-3",
    sets: [gzSet("D1_s0", "SQUAT", 0, 1, 100)],
  });
  assert.equal(result.nextState.targets.D1_s0?.workKg, 85); // 100 * 0.85
  assert.equal(result.nextState.targets.D1_s0?.stage, 0);
  assert.equal(result.eventType, "RESET");
});

test("PR-D gzclp(v2): T3 amrap 마지막 세트 ≥25 → 증량(stage 머신 안 탐)", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { D3_s2: { progressionTarget: "BENCH", workKg: 50, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-d1-4",
    sets: [gzSet("D3_s2", "BENCH", 15, 15, 50), gzSet("D3_s2", "BENCH", 27, 15, 50, true)],
  });
  assert.equal(result.nextState.targets.D3_s2?.workKg, 52.5); // BENCH +2.5
  assert.equal(result.eventType, "INCREASE");
});

test("PR-D gzclp(v2): T3 amrap 마지막 세트 <25 → 유지(HOLD)", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { D3_s2: { progressionTarget: "BENCH", workKg: 50, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-d1-5",
    sets: [gzSet("D3_s2", "BENCH", 20, 15, 50, true)],
  });
  assert.equal(result.nextState.targets.D3_s2?.workKg, 50); // 유지
  assert.equal(result.eventType, "HOLD");
});

test("PR-D gzclp(flag 없음): 기존 LP 유지 — stage 안 굴림(forward-only 회귀 가드)", () => {
  const result = reduceProgressionState({
    program: "gzclp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { D1_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: {}, // v2 flag 없음
    logId: "log-d1-6",
    sets: [gzSet("D1_s0", "SQUAT", 2, 3, 100)],
  });
  // 기존 LP: 실패 1회는 failResetThreshold(3) 미달 → 무게 유지 + failureStreak 누적, stage 미사용
  assert.equal(result.nextState.targets.D1_s0?.workKg, 100);
  assert.equal(result.nextState.targets.D1_s0?.failureStreak, 1);
  assert.equal(result.nextState.targets.D1_s0?.stage, undefined);
});

// PR-E(한계2 texas 주간 모델): v2에서 I(강도일) 슬롯만 reducer에 도달한다(처방이 V/R엔 progressionKey
// 미부착). I day 성공 → 즉시 증량(매주 1회), 실패 누적 → reset(×resetFactor). 비-v2는 기존 3회-연속 LP.
test("PR-E texas(v2): I day 성공 → 즉시 증량(주간 1회)", () => {
  const result = reduceProgressionState({
    program: "texas-method",
    previousState: { cycle: 1, week: 1, day: 1, targets: { I_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-tx-1",
    sets: [gzSet("I_s0", "SQUAT", 5, 5, 100)],
  });
  assert.equal(result.nextState.targets.I_s0?.workKg, 102.5); // +2.5 즉시
  assert.equal(result.eventType, "INCREASE");
});

test("PR-E texas(v2): I day 실패 누적 → reset(×0.9)", () => {
  const result = reduceProgressionState({
    program: "texas-method",
    previousState: { cycle: 1, week: 1, day: 1, targets: { I_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 2 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-tx-2",
    sets: [gzSet("I_s0", "SQUAT", 3, 5, 100)], // 목표 5 중 3 → 실패
  });
  assert.equal(result.nextState.targets.I_s0?.workKg, 90); // 100 × 0.9
  assert.equal(result.nextState.targets.I_s0?.failureStreak, 0); // reset
  assert.equal(result.eventType, "RESET");
});

test("PR-E texas(flag 없음): I 1회 성공으론 증량 안 함(기존 3회-연속 LP, forward-only)", () => {
  const result = reduceProgressionState({
    program: "texas-method",
    previousState: { cycle: 1, week: 1, day: 1, targets: { I_s0: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: {}, // 비-v2
    logId: "log-tx-3",
    sets: [gzSet("I_s0", "SQUAT", 5, 5, 100)],
  });
  assert.equal(result.nextState.targets.I_s0?.workKg, 100); // 1회론 증량 X
  assert.equal(result.nextState.targets.I_s0?.successStreak, 1);
});
