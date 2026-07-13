import assert from "node:assert/strict";
import test from "node:test";

import type { Ref5TerminationReason, WorkoutExerciseViewModel } from "./model";
import {
  deriveRef5ExerciseOutcomeView,
  resolveRef5PullDisplayLoad,
  resolveWorkoutSetRepsEntry,
} from "./ref5-outcome";

function exercise(reason: Ref5TerminationReason) {
  return {
    id: "seed-1",
    exerciseId: null,
    exerciseName: "Bench Press",
    source: "PROGRAM",
    badge: "AUTO",
    plannedSetMeta: {
      percentPerSet: [null, null, null],
      targetWeightKgPerSet: [82.5, 82.5, 82.5],
      repsPerSet: [3, 3, 3],
      rpePerSet: [null, null, null],
      amrapPerSet: [false, false, false],
    },
    ref5: {
      prescription: { stream: "BP_FOCUS" },
      terminationReason: reason,
      originalSetMeta: [{}, {}, {}],
    },
    set: {
      count: 3,
      reps: 3,
      repsPerSet: [3, 3, 3],
      rpePerSet: [0, 0, 0],
      weightKgPerSet: [82.5, 82.5, 82.5],
      weightKg: 82.5,
    },
    note: { memo: "" },
    isEdited: false,
    deleted: false,
  } as WorkoutExerciseViewModel;
}

test("REF5 exercise view uses the canonical PASS/HOLD/FAIL/INVALID classifier", () => {
  const cases = [
    ["NORMAL", ["3", "3", "3"], "PASS"],
    ["CLEAR_SLOWDOWN", ["3", "3", "3"], "HOLD"],
    ["FORCE_OR_TECHNIQUE", ["3", "2", "3"], "HOLD"],
    ["FORCE_OR_TECHNIQUE", ["2", "2", "3"], "FAIL"],
    ["SAFETY", ["0", "0", "0"], "INVALID"],
  ] as const;

  for (const [reason, repsInputs, expected] of cases) {
    const result = deriveRef5ExerciseOutcomeView(exercise(reason), {
      repsInputs: [...repsInputs],
      plannedRepsPerSet: [3, 3, 3],
      memoInput: "",
      memoPlaceholder: "",
    });
    assert.equal(result?.status, "classified");
    if (result?.status === "classified") assert.equal(result.value.outcome, expected);
  }
});

test("REF5 exercise view rejects contradictory termination reasons", () => {
  const normalShort = deriveRef5ExerciseOutcomeView(exercise("NORMAL"), {
    repsInputs: ["3", "2", "3"],
    plannedRepsPerSet: [3, 3, 3],
    memoInput: "",
    memoPlaceholder: "",
  });
  assert.equal(normalShort?.status, "invalid-input");

  const forceComplete = deriveRef5ExerciseOutcomeView(exercise("FORCE_OR_TECHNIQUE"), {
    repsInputs: ["3", "3", "3"],
    plannedRepsPerSet: [3, 3, 3],
    memoInput: "",
    memoPlaceholder: "",
  });
  assert.equal(forceComplete?.status, "invalid-input");
});

test("REF5 PULL display exposes both frozen added load and today's actual total", () => {
  const pull = exercise("NORMAL");
  pull.exerciseName = "Weighted Pull-Up";
  pull.set.weightKgPerSet = [12.5, 12.5, 12.5];
  pull.ref5!.prescription = {
    lift: "PULL",
    pull: {
      lockedAddedKg: 12.5,
      actualTotalKg: 88.5,
    },
  };

  assert.deepEqual(resolveRef5PullDisplayLoad(pull), {
    addedKg: 12.5,
    actualTotalKg: 88.5,
  });
});

test("REF5 existing-log entry displays zero reps and retains the frozen planned maximum", () => {
  const logged = exercise("FORCE_OR_TECHNIQUE");
  logged.source = "USER";
  logged.set.repsPerSet = [0, 2, 3];

  assert.deepEqual(resolveWorkoutSetRepsEntry(logged, 0), {
    plannedReps: 3,
    repsRaw: "0",
  });
  assert.deepEqual(resolveWorkoutSetRepsEntry(logged, 1), {
    plannedReps: 3,
    repsRaw: "2",
  });
});
