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
  assert.equal(opSquat.resetFactor, 0.9); // TB 공식 reset = 현재 TM의 90%(10% 감량)

  const wendlerBench = rulesFor("wendler-531", "BENCH");
  assert.equal(wendlerBench.increaseKg, 2.5);
  assert.equal(wendlerBench.decreaseKg, null);

  const gzclpDl = rulesFor("gzclp", "DEADLIFT");
  assert.equal(gzclpDl.increaseKg, 5);
  assert.equal(gzclpDl.resetFactor, 0.85);

  // GZCLP 하체는 SQUAT도 +5kg(=10lb), 상체는 +2.5kg(=5lb)
  assert.equal(rulesFor("gzclp", "SQUAT").increaseKg, 5);
  assert.equal(rulesFor("gzclp", "BENCH").increaseKg, 2.5);
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
  assert.equal(result.nextState.targets.D1_s0?.workKg, 105); // SQUAT 하체 +5kg(=10lb)
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

// Greyskull 정석(v2): 메인 마지막 세트 AMRAP(meta.amrap, uniform LP라 plannedRef 없음)의 실측 reps로
// 자기조절 — ≥10 더블 프로그레션, ≥5 단일 증량, <5 실패(2연속 시 ×0.9 디로드). 비-v2는 기존 단순 LP.
function gsSet(exerciseName: string, reps: number, weightKg: number, amrap = false) {
  return {
    exerciseName,
    reps,
    weightKg,
    meta: amrap ? { amrap: true } : {},
  };
}

test("greyskull(v2): AMRAP 5~9 → 단일 증량(SQUAT +2.5)", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-gs-1",
    sets: [gsSet("Back Squat", 5, 100), gsSet("Back Squat", 5, 100), gsSet("Back Squat", 7, 100, true)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 102.5); // 단일 +2.5
  assert.equal(result.eventType, "INCREASE");
});

test("greyskull(v2): AMRAP ≥10 → 더블 프로그레션(SQUAT +5)", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-gs-2",
    sets: [gsSet("Back Squat", 5, 100), gsSet("Back Squat", 5, 100), gsSet("Back Squat", 10, 100, true)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 105); // 더블 +5
  assert.equal(result.eventType, "INCREASE");
});

test("greyskull(v2): DEADLIFT 더블 프로그레션(+5 기본의 2배 = +10)", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { DEADLIFT: { progressionTarget: "DEADLIFT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-gs-3",
    sets: [gsSet("Deadlift", 12, 100, true)],
  });
  assert.equal(result.nextState.targets.DEADLIFT?.workKg, 110); // 더블 +10
});

test("greyskull(v2): AMRAP <5 1회 → HOLD(디로드 아직, failureStreak 1)", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-gs-4",
    sets: [gsSet("Back Squat", 5, 100), gsSet("Back Squat", 5, 100), gsSet("Back Squat", 3, 100, true)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 100); // 무게 유지
  assert.equal(result.nextState.targets.SQUAT?.failureStreak, 1);
  assert.equal(result.eventType, "HOLD");
});

test("greyskull(v2): AMRAP <5 2연속 → 디로드(×0.9)", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 1 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-gs-5",
    sets: [gsSet("Back Squat", 5, 100), gsSet("Back Squat", 4, 100), gsSet("Back Squat", 2, 100, true)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 90); // 100 × 0.9
  assert.equal(result.nextState.targets.SQUAT?.failureStreak, 0); // reset
  assert.equal(result.eventType, "RESET");
});

test("greyskull(flag 없음): 기존 단순 LP — AMRAP 무시(더블 안 함, +2.5만), forward-only 가드", () => {
  const result = reduceProgressionState({
    program: "greyskull-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: {}, // 비-v2
    logId: "log-gs-6",
    sets: [gsSet("Back Squat", 5, 100), gsSet("Back Squat", 5, 100), gsSet("Back Squat", 10, 100, true)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 102.5); // 단순 LP 단일 +2.5 (더블 아님)
});

// SS/StrongLifts 정석(v2): uniform LP는 슬롯키가 없어 그동안 plannedRef를 못 흘려 rep 미달을
// 감지하지 못했다(reps>0이면 무조건 성공 → 잘못 증량). reps-only plannedRef(progressionKey 없음)를
// 흘리면 reducer 분기 추가 없이도 setWasCompleted가 reps>=plannedReps로 판정 → 한 세트라도 미달이면
// 그 세션 실패. progressionKey를 안 넣어 family(SQUAT 등) 진행 키는 유지된다(슬롯키 오염 없음).
function lpSet(exerciseName: string, reps: number, weightKg: number, plannedReps: number) {
  return { exerciseName, reps, weightKg, meta: { plannedRef: { reps: plannedReps } } };
}

test("SS(v2): 3×5 중 한 세트라도 reps 미달이면 실패(증량 안 함)", () => {
  const result = reduceProgressionState({
    program: "starting-strength-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-ss-1",
    sets: [lpSet("Back Squat", 5, 100, 5), lpSet("Back Squat", 5, 100, 5), lpSet("Back Squat", 3, 100, 5)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 100); // 미달 → 증량 안 함
  assert.equal(result.nextState.targets.SQUAT?.failureStreak, 1);
  assert.notEqual(result.eventType, "INCREASE");
});

test("SS(v2): 3×5 전부 성공 → 증량(+2.5)", () => {
  const result = reduceProgressionState({
    program: "starting-strength-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-ss-2",
    sets: [lpSet("Back Squat", 5, 100, 5), lpSet("Back Squat", 5, 100, 5), lpSet("Back Squat", 5, 100, 5)],
  });
  assert.equal(result.nextState.targets.SQUAT?.workKg, 102.5);
  assert.equal(result.eventType, "INCREASE");
});

test("StrongLifts(v2): 5×5 중 마지막 세트 미달 → 실패(증량 안 함)", () => {
  const result = reduceProgressionState({
    program: "stronglifts-5x5",
    previousState: { cycle: 1, week: 1, day: 1, targets: { BENCH: { progressionTarget: "BENCH", workKg: 60, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-sl-1",
    sets: [
      lpSet("Bench Press", 5, 60, 5),
      lpSet("Bench Press", 5, 60, 5),
      lpSet("Bench Press", 5, 60, 5),
      lpSet("Bench Press", 5, 60, 5),
      lpSet("Bench Press", 3, 60, 5),
    ],
  });
  assert.equal(result.nextState.targets.BENCH?.workKg, 60);
  assert.equal(result.nextState.targets.BENCH?.failureStreak, 1);
});

test("SS(v2): Power Clean 5×3 — 세트별 처방 reps(3)로 검증, 2렙은 미달", () => {
  // 운동마다 처방 reps가 다르다(스쿼트 5, 파워클린 3). plannedRef.reps가 세트별로 흘러
  // 파워클린은 3렙 충족·2렙 미달로 판정된다. plannedRef.progressionTarget으로 키를 고정.
  const result = reduceProgressionState({
    program: "starting-strength-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { DEADLIFT: { progressionTarget: "DEADLIFT", workKg: 50, successStreak: 0, failureStreak: 0 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-pc-1",
    sets: [
      { exerciseName: "Power Clean", reps: 3, weightKg: 50, meta: { plannedRef: { reps: 3, progressionTarget: "DEADLIFT" } } },
      { exerciseName: "Power Clean", reps: 3, weightKg: 50, meta: { plannedRef: { reps: 3, progressionTarget: "DEADLIFT" } } },
      { exerciseName: "Power Clean", reps: 2, weightKg: 50, meta: { plannedRef: { reps: 3, progressionTarget: "DEADLIFT" } } },
    ],
  });
  assert.equal(result.nextState.targets.DEADLIFT?.workKg, 50); // 미달 → 증량 안 함
  assert.notEqual(result.eventType, "INCREASE");
});

test("SS(v2): rep 미달이 실패 임계(3연속)에 도달하면 ×0.9 디로드", () => {
  const result = reduceProgressionState({
    program: "starting-strength-lp",
    previousState: { cycle: 1, week: 1, day: 1, targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 2 } }, lastAppliedLogId: null },
    planParams: { progressionModel: "v2" },
    logId: "log-ss-deload",
    sets: [lpSet("Back Squat", 5, 100, 5), lpSet("Back Squat", 5, 100, 5), lpSet("Back Squat", 2, 100, 5)],
  });
  assert.equal(result.eventType, "RESET");
  assert.equal(result.nextState.targets.SQUAT?.workKg, 90); // 100 × 0.9
  assert.equal(result.nextState.targets.SQUAT?.failureStreak, 0);
});

// operator 정석(v2): TB 공식은 "블록 완주(W6 수행) 시 처방 reps 미달이면 같은 TM으로 블록 반복".
// reps-only plannedRef로 W6D3 미달이 failureStreak를 쌓으면 블록 완주 게이트(hadBlockFailure)가
// 막아 증량을 보류한다. 게이트는 어느 리프트라도 실패면 블록 전체 증량을 보류(operator 사양).
test("operator(v2): W6D3 한 리프트 reps 미달 → 블록 완주 증량 차단", () => {
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
    planParams: { progressionModel: "v2" },
    logId: "log-op-w6d3-fail",
    sets: [
      { exerciseName: "Back Squat", reps: 2, weightKg: 142.5, meta: { plannedRef: { reps: 5 } } }, // 미달
      { exerciseName: "Bench Press", reps: 5, weightKg: 82.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Deadlift", reps: 5, weightKg: 142.5, meta: { plannedRef: { reps: 5 } } },
    ],
  });
  assert.notEqual(result.eventType, "INCREASE");
  assert.equal(result.nextState.targets.SQUAT?.workKg, 150); // 미달 → 증량 안 함
  assert.equal(result.nextState.targets.BENCH?.workKg, 110); // 게이트가 블록 전체 증량 보류
});

test("operator(v2): W6D3 전부 충족 → 블록 증량(회귀, plannedRef.reps 경유)", () => {
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
    planParams: { progressionModel: "v2" },
    logId: "log-op-w6d3-pass",
    sets: [
      { exerciseName: "Back Squat", reps: 5, weightKg: 142.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Bench Press", reps: 5, weightKg: 82.5, meta: { plannedRef: { reps: 5 } } },
      { exerciseName: "Deadlift", reps: 5, weightKg: 142.5, meta: { plannedRef: { reps: 5 } } },
    ],
  });
  assert.equal(result.eventType, "INCREASE");
  assert.equal(result.nextState.targets.SQUAT?.workKg, 155); // 하체 +5
  assert.equal(result.nextState.targets.BENCH?.workKg, 112.5); // 상체 +2.5
});
