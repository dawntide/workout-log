import { computeExternalLoadFromTotalKg } from "@/lib/bodyweight-load";
import {
  resolveMinimumPlateIncrementKg,
  snapWeightToIncrementKg,
  type WorkoutPreferences,
} from "@/lib/settings/workout-preferences";
import type { WorkoutRecordDraft } from "@/lib/workout-record/model";

export function resolveWorkoutWeightWithPreferences(
  weightKg: number,
  exerciseId: string | null | undefined,
  exerciseName: string,
  preferences: WorkoutPreferences,
) {
  const increment = resolveMinimumPlateIncrementKg(preferences, {
    exerciseId: exerciseId ?? null,
    exerciseName,
  });
  return snapWeightToIncrementKg(Math.max(0, weightKg), increment);
}

function snapWeightPerSet(
  weightKgPerSet: number[],
  exerciseId: string | null | undefined,
  exerciseName: string,
  preferences: WorkoutPreferences,
  applyBodyweightLoad: boolean,
): { next: number[]; changed: boolean } {
  let changed = false;
  const next = weightKgPerSet.map((weightKg) => {
    const basis = applyBodyweightLoad
      ? computeExternalLoadFromTotalKg(exerciseName, weightKg, preferences.bodyweightKg) ?? weightKg
      : weightKg;
    const snapped = resolveWorkoutWeightWithPreferences(
      basis,
      exerciseId,
      exerciseName,
      preferences,
    );
    if (Math.abs(weightKg - snapped) >= 0.0001) {
      changed = true;
    }
    return snapped;
  });
  return { next, changed };
}

export function applyWorkoutLogWeightRulesToDraft(
  sourceDraft: WorkoutRecordDraft,
  preferences: WorkoutPreferences,
) {
  let seedChanged = false;
  const nextSeedExercises = sourceDraft.seedExercises.map((exercise) => {
    const { next, changed } = snapWeightPerSet(
      exercise.set.weightKgPerSet,
      exercise.exerciseId,
      exercise.exerciseName,
      preferences,
      true,
    );
    if (!changed) return exercise;
    seedChanged = true;
    return {
      ...exercise,
      set: {
        ...exercise.set,
        weightKgPerSet: next,
        weightKg: next[0] ?? 0,
      },
    };
  });

  let userChanged = false;
  const nextUserExercises = sourceDraft.userExercises.map((exercise) => {
    const { next, changed } = snapWeightPerSet(
      exercise.set.weightKgPerSet,
      exercise.exerciseId,
      exercise.exerciseName,
      preferences,
      false,
    );
    if (!changed) return exercise;
    userChanged = true;
    return {
      ...exercise,
      set: {
        ...exercise.set,
        weightKgPerSet: next,
        weightKg: next[0] ?? 0,
      },
    };
  });

  if (!seedChanged && !userChanged) {
    return sourceDraft;
  }

  return {
    ...sourceDraft,
    seedExercises: nextSeedExercises,
    userExercises: nextUserExercises,
  };
}
