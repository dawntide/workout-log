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
