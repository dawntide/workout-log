import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkoutSetCompleted,
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
          setTypePerSet: [null, null, null],
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
      setTypePerSet: [null, null, null],
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

test("saved REF5 user sets count as completed without transient entry state", () => {
  assert.equal(
    isWorkoutSetCompleted({
      source: "USER",
      isRef5: true,
      recordedReps: 0,
    }),
    true,
  );
});

test("new REF5 program sets require explicit reps, including an explicit zero", () => {
  assert.equal(
    isWorkoutSetCompleted({
      source: "PROGRAM",
      isRef5: true,
      repsInput: "",
      recordedReps: 3,
    }),
    false,
  );
  assert.equal(
    isWorkoutSetCompleted({
      source: "PROGRAM",
      isRef5: true,
      repsInput: "0",
      recordedReps: 3,
    }),
    true,
  );
});

test("일반 프로그램도 1회 처방 실패를 명시한 0회를 완료 입력으로 센다", () => {
  assert.equal(
    isWorkoutSetCompleted({
      source: "PROGRAM",
      isRef5: false,
      repsInput: "",
      recordedReps: 1,
    }),
    false,
  );
  assert.equal(
    isWorkoutSetCompleted({
      source: "PROGRAM",
      isRef5: false,
      repsInput: "0",
      recordedReps: 1,
    }),
    true,
  );
});

test("저장된 일반 프로그램의 0회 실패도 재열기 후 완료 입력으로 센다", () => {
  assert.equal(
    isWorkoutSetCompleted({
      source: "USER",
      isRef5: false,
      isProgramPrescription: true,
      recordedReps: 0,
    }),
    true,
  );
  assert.equal(
    isWorkoutSetCompleted({
      source: "USER",
      isRef5: false,
      isProgramPrescription: false,
      recordedReps: 0,
    }),
    false,
  );
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

  assert.deepEqual(errors, ["Back Squat 2세트 횟수는 0~100 범위여야 합니다."]);
});

test("validateWorkoutRecordEntryState accepts an explicit zero as a failed program set", () => {
  const errors = validateWorkoutRecordEntryState(
    [createVisibleProgramExercise()],
    {
      "seed-1": {
        repsInputs: ["5", "0", "5"],
        plannedRepsPerSet: [5, 5, 5],
        memoInput: "",
        memoPlaceholder: "Operator W1",
      },
    },
  );

  assert.deepEqual(errors, []);
});
