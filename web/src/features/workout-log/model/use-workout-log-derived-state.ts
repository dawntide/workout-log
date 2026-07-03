import { useMemo } from "react";
import { formatKgValue } from "@workout/core/bodyweight-load";
import {
  resolveMinimumPlateIncrement,
  type WorkoutPreferences,
} from "@/lib/settings/workout-preferences";
import {
  materializeWorkoutExercises,
  type WorkoutProgramExerciseEntryState,
  type WorkoutProgramExerciseEntryStateMap,
  type WorkoutRecordDraft,
} from "@/entities/workout-record";
import { createFallbackProgramEntryState } from "./exercise-entry";
import type { WorkoutLogRecentLogItem } from "./types";

type UseWorkoutLogDerivedStateInput = {
  draft: WorkoutRecordDraft | null;
  recentLogItems: WorkoutLogRecentLogItem[];
  locale: "ko" | "en";
  workoutPreferences: WorkoutPreferences;
  programEntryState: WorkoutProgramExerciseEntryStateMap;
};

export function useWorkoutLogDerivedState({
  draft,
  recentLogItems,
  locale,
  workoutPreferences,
  programEntryState,
}: UseWorkoutLogDerivedStateInput) {
  const visibleExercises = useMemo(
    () => (draft ? materializeWorkoutExercises(draft) : []),
    [draft],
  );

  const prevPerformanceMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const log of recentLogItems) {
      const best = new Map<string, { weight: number; reps: number }>();
      for (const set of log.sets) {
        const weight = set.weightKg ?? 0;
        const reps = set.reps ?? 0;
        const existing = best.get(set.exerciseName);
        if (
          !existing ||
          weight > existing.weight ||
          (weight === existing.weight && reps > existing.reps)
        ) {
          best.set(set.exerciseName, { weight, reps });
        }
      }
      for (const [name, data] of best.entries()) {
        if (!map[name]) {
          map[name] =
            data.weight > 0
              ? `${formatKgValue(data.weight)} × ${data.reps}`
              : locale === "ko"
                ? `${data.reps}회`
                : `${data.reps} reps`;
        }
      }
    }
    return map;
  }, [locale, recentLogItems]);

  const memoizedProgramEntryStates = useMemo(() => {
    const result: Record<string, WorkoutProgramExerciseEntryState> = {};
    for (const exercise of visibleExercises) {
      if (exercise.source === "PROGRAM") {
        result[exercise.id] = createFallbackProgramEntryState(
          exercise,
          programEntryState[exercise.id],
        );
      }
    }
    return result;
  }, [programEntryState, visibleExercises]);

  const completedExercisesCount = useMemo(
    () =>
      visibleExercises.filter((exercise) => {
        return exercise.set.repsPerSet.some((setReps, index) => {
          const entryState = programEntryState[exercise.id];
          const rawValue = entryState?.repsInputs[index]?.trim() ?? "";
          const actual = exercise.source === "PROGRAM" ? Number(rawValue) : setReps;
          return Number.isFinite(actual) && actual > 0;
        });
      }).length,
    [programEntryState, visibleExercises],
  );

  const sessionExerciseCards = useMemo(
    () =>
      visibleExercises.map((exercise) => {
        const minimumPlateInfo = resolveMinimumPlateIncrement(workoutPreferences, {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
        });
        return {
          id: exercise.id,
          exercise,
          minimumPlateIncrementKg: minimumPlateInfo.incrementKg,
          showMinimumPlateInfo: minimumPlateInfo.source === "RULE",
          prevPerformance: prevPerformanceMap[exercise.exerciseName],
          programEntryState: memoizedProgramEntryStates[exercise.id],
        };
      }),
    [
      memoizedProgramEntryStates,
      prevPerformanceMap,
      visibleExercises,
      workoutPreferences,
    ],
  );

  return {
    visibleExercises,
    completedExercisesCount,
    sessionExerciseCards,
  };
}
