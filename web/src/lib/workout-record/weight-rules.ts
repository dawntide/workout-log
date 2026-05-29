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

export function applyWorkoutLogWeightRulesToDraft(
  sourceDraft: WorkoutRecordDraft,
  preferences: WorkoutPreferences,
) {
  let seedChanged = false;
  const nextSeedExercises = sourceDraft.seedExercises.map((exercise) => {
    const nextWeightKg = resolveWorkoutWeightWithPreferences(
      computeExternalLoadFromTotalKg(
        exercise.exerciseName,
        typeof exercise.prescribedWeightKg === "number"
          ? exercise.prescribedWeightKg
          : exercise.set.weightKg,
        preferences.bodyweightKg,
      ) ??
        (typeof exercise.prescribedWeightKg === "number"
          ? exercise.prescribedWeightKg
          : exercise.set.weightKg),
      exercise.exerciseId,
      exercise.exerciseName,
      preferences,
    );
    if (Math.abs(exercise.set.weightKg - nextWeightKg) < 0.0001) {
      return exercise;
    }
    seedChanged = true;
    return {
      ...exercise,
      set: {
        ...exercise.set,
        weightKg: nextWeightKg,
      },
    };
  });

  let userChanged = false;
  const nextUserExercises = sourceDraft.userExercises.map((exercise) => {
    const nextWeightKg = resolveWorkoutWeightWithPreferences(
      exercise.set.weightKg,
      exercise.exerciseId,
      exercise.exerciseName,
      preferences,
    );
    if (Math.abs(exercise.set.weightKg - nextWeightKg) < 0.0001) {
      return exercise;
    }
    userChanged = true;
    return {
      ...exercise,
      set: {
        ...exercise.set,
        weightKg: nextWeightKg,
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
