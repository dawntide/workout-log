import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareWorkoutRecordDraftForEntry,
  validateWorkoutRecordEntryState,
} from "./entry-state";
import type { WorkoutExerciseViewModel, WorkoutRecordDraft } from "./model";

function createDraft(): WorkoutRecordDraft {
  return {
    session: {
      logId: null,
      generatedSessionId: "session-1",
      performedAt: "2026-03-09T09:00:00.000Z",
      sessionDate: "2026-03-09",
      timezone: "Asia/Seoul",
      planId: "plan-1",
      planName: "Test Plan",
      sessionKey: "W1D1",
      week: 1,
      day: 1,
      sessionType: "A Session",
      estimatedE1rmKg: null,
      estimatedTmKg: null,
      note: { memo: "" },
    },
    seedExercises: [
      {
        id: "seed-1",
        exerciseId: "exercise-1",
        exerciseName: "Back Squat",
        source: "PROGRAM",
        badge: "AUTO",
        prescribedWeightKg: 100,
        set: {
          count: 3,
          reps: 5,
          repsPerSet: [5, 5, 5],
          rpePerSet: [0, 0, 0],
          weightKgPerSet: [100, 100, 100],
          weightKg: 100,
        },
        note: {
          memo: "Operator W1",
        },
      },
    ],
    seedEditLayer: {},
    userExercises: [],
  };
}

function createVisibleProgramExercise(): WorkoutExerciseViewModel {
  return {
    id: "seed-1",
    exerciseId: "exercise-1",
    exerciseName: "Back Squat",
    source: "PROGRAM",
    badge: "AUTO",
    prescribedWeightKg: 100,
    set: {
      count: 3,
      reps: 5,
      repsPerSet: [5, 5, 5],
      rpePerSet: [0, 0, 0],
      weightKgPerSet: [100, 100, 100],
      weightKg: 100,
    },
    note: {
      memo: "",
    },
    isEdited: false,
    deleted: false,
  };
}

test("prepareWorkoutRecordDraftForEntry clears program memo values but keeps placeholders", () => {
  const prepared = prepareWorkoutRecordDraftForEntry(createDraft());

  assert.equal(prepared.draft.seedExercises[0]?.note.memo, "");
  assert.deepEqual(prepared.programEntryState["seed-1"], {
    repsInputs: ["", "", ""],
    plannedRepsPerSet: [5, 5, 5],
    memoInput: "",
    memoPlaceholder: "Operator W1",
  });
});

test("validateWorkoutRecordEntryState requires explicit reps input for program sets", () => {
  const errors = validateWorkoutRecordEntryState(
    [createVisibleProgramExercise()],
    {
      "seed-1": {
        repsInputs: ["5", "", "5"],
        plannedRepsPerSet: [5, 5, 5],
        memoInput: "",
        memoPlaceholder: "Operator W1",
      },
    },
  );

  assert.deepEqual(errors, ["Back Squat 2세트 횟수를 입력하세요."]);
});

test("validateWorkoutRecordEntryState rejects non-numeric reps input", () => {
  const errors = validateWorkoutRecordEntryState(
    [createVisibleProgramExercise()],
    {
      "seed-1": {
        repsInputs: ["5", "abc", "5"],
        plannedRepsPerSet: [5, 5, 5],
        memoInput: "",
        memoPlaceholder: "Operator W1",
      },
    },
  );

  assert.deepEqual(errors, ["Back Squat 2세트 횟수는 1~100 범위여야 합니다."]);
});
