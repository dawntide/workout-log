import assert from "node:assert/strict";
import { test } from "node:test";

import { buildExerciseActionUpdate } from "./editor-actions";
import { resolveWorkoutWeightWithPreferences } from "@/lib/workout-record/weight-rules";
import {
  materializeWorkoutExercises,
  type WorkoutExerciseViewModel,
  type WorkoutRecordDraft,
} from "@/lib/workout-record/model";
import {
  toDefaultWorkoutPreferences,
  type WorkoutPreferences,
} from "@/lib/settings/workout-preferences";

function makeDraft(exercise: WorkoutExerciseViewModel): WorkoutRecordDraft {
  const { isEdited: _isEdited, deleted: _deleted, ...model } = exercise;
  return {
    session: {
      logId: null,
      generatedSessionId: null,
      performedAt: "2026-06-01T00:00:00.000Z",
      sessionDate: "2026-06-01",
      timezone: "UTC",
      planId: "plan-1",
      planName: "Plan",
      sessionKey: "k",
      week: 1,
      day: 1,
      sessionType: "AUTO",
      estimatedE1rmKg: null,
      estimatedTmKg: null,
      note: { memo: "" },
    },
    seedExercises: [model],
    seedEditLayer: {},
    userExercises: [],
  };
}

function makeAutoExercise(input: {
  exerciseName: string;
  targets: number[];
}): WorkoutExerciseViewModel {
  const length = input.targets.length;
  return {
    id: "seed-1",
    exerciseId: null,
    exerciseName: input.exerciseName,
    source: "PROGRAM",
    badge: "AUTO",
    prescribedWeightKg: input.targets[0] ?? 0,
    plannedSetMeta: {
      percentPerSet: input.targets.map(() => 0.7),
      targetWeightKgPerSet: input.targets,
      repsPerSet: input.targets.map(() => 5),
      rpePerSet: input.targets.map(() => null),
      amrapPerSet: input.targets.map(() => false),
    },
    set: {
      count: length,
      reps: 5,
      repsPerSet: input.targets.map(() => 5),
      rpePerSet: input.targets.map(() => 0),
      weightKgPerSet: input.targets.map(() => 0),
      weightKg: 0,
    },
    note: { memo: "" },
    isEdited: false,
    deleted: false,
  };
}

function applyTargetWeights(
  exercise: WorkoutExerciseViewModel,
  preferences: WorkoutPreferences,
): number[] {
  const update = buildExerciseActionUpdate(
    exercise.id,
    exercise,
    { type: "APPLY_TARGET_WEIGHTS" },
    preferences,
    resolveWorkoutWeightWithPreferences,
  );
  assert.ok(update, "expected an action update");
  const draft = update!.draftUpdater(makeDraft(exercise));
  const materialized = materializeWorkoutExercises(draft).find(
    (e) => e.id === exercise.id,
  );
  assert.ok(materialized, "expected materialized exercise");
  return materialized!.set.weightKgPerSet;
}

test("APPLY_TARGET_WEIGHTS subtracts bodyweight for bodyweight exercises", () => {
  const exercise = makeAutoExercise({
    exerciseName: "Pull-Up",
    targets: [80, 80, 80],
  });
  const preferences: WorkoutPreferences = {
    ...toDefaultWorkoutPreferences(),
    bodyweightKg: 70,
  };

  // 처방 총부하 80kg - 체중 70kg = 외부 부하 10kg
  assert.deepEqual(applyTargetWeights(exercise, preferences), [10, 10, 10]);
});

test("APPLY_TARGET_WEIGHTS leaves non-bodyweight exercises as total load", () => {
  const exercise = makeAutoExercise({
    exerciseName: "Back Squat",
    targets: [100, 100, 100],
  });
  const preferences: WorkoutPreferences = {
    ...toDefaultWorkoutPreferences(),
    bodyweightKg: 70,
  };

  assert.deepEqual(applyTargetWeights(exercise, preferences), [100, 100, 100]);
});

test("APPLY_TARGET_WEIGHTS keeps total load when bodyweight is unset", () => {
  const exercise = makeAutoExercise({
    exerciseName: "Pull-Up",
    targets: [80, 80, 80],
  });
  const preferences: WorkoutPreferences = {
    ...toDefaultWorkoutPreferences(),
    bodyweightKg: null,
  };

  // 체중 미설정이면 변환 불가 → 원래 값 유지
  assert.deepEqual(applyTargetWeights(exercise, preferences), [80, 80, 80]);
});
