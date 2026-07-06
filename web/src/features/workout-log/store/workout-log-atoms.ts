import { atom } from "jotai";
import type {
  WorkoutRecordDraft,
  WorkoutProgramExerciseEntryStateMap,
  WorkoutWorkflowState,
  WorkoutExerciseViewModel,
  WorkoutProgramExerciseEntryState,
} from "@/entities/workout-record";
import type { WorkoutPreferences } from "@/lib/settings/workout-preferences";
import type { WorkoutLogLastSessionSummary, WorkoutLogRecentLogItem } from "@/features/workout-log/model/types";
import { toDefaultWorkoutPreferences } from "@/lib/settings/workout-preferences";

// Core Data Atoms
export const draftAtom = atom<WorkoutRecordDraft | null>(null);
export const programEntryStateAtom = atom<WorkoutProgramExerciseEntryStateMap>({});
export const workoutPreferencesAtom = atom<WorkoutPreferences>(toDefaultWorkoutPreferences());
export const workflowStateAtom = atom<WorkoutWorkflowState>("idle");

// Query & Context Variables
export const recentLogItemsAtom = atom<WorkoutLogRecentLogItem[]>([]);
export const lastSessionAtom = atom<WorkoutLogLastSessionSummary | null>(null);
export const saveErrorAtom = atom<string | null>(null);

// Derived Atoms for Subscriptions (Prevents full app re-renders)
export const isDraftLoadedAtom = atom((get) => get(draftAtom) !== null);

export const draftSessionAtom = atom((get) => get(draftAtom)?.session ?? null);

// Atom that selects the specific edit layer for a seed exercise to prevent full list re-renders
export const makeSeedExercisePatchAtom = (exerciseId: string) =>
  atom((get) => {
    const draft = get(draftAtom);
    return draft?.seedEditLayer?.[exerciseId] ?? null;
  });

export const makeUserExerciseAtom = (exerciseId: string) =>
  atom((get) => {
    const draft = get(draftAtom);
    return draft?.userExercises.find((ex) => ex.id === exerciseId) ?? null;
  });

export const makeProgramEntryStateAtom = (exerciseId: string) =>
  atom((get) => {
    return get(programEntryStateAtom)?.[exerciseId] ?? undefined;
  });

// Advanced Derived State Atoms
import { formatKgValue } from "@workout/core/bodyweight-load";
import { resolveMinimumPlateIncrement } from "@/lib/settings/workout-preferences";
import { materializeWorkoutExercises } from "@/entities/workout-record";
import { createFallbackProgramEntryState } from "@/features/workout-log/model/exercise-entry";

export const visibleExercisesAtom = atom((get) => {
  const draft = get(draftAtom);
  return draft ? materializeWorkoutExercises(draft) : [];
});

export const prevPerformanceMapAtom = atom((get) => {
  const recentLogItems = get(recentLogItemsAtom);
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
        map[name] = data.weight > 0 ? `${formatKgValue(data.weight)} × ${data.reps}` : `${data.reps} reps`;
      }
    }
  }
  return map;
});

export const memoizedProgramEntryStatesAtom = atom((get) => {
  const visibleExercises = get(visibleExercisesAtom);
  const entryStateMap = get(programEntryStateAtom);
  const result: Record<string, ReturnType<typeof createFallbackProgramEntryState>> = {};
  for (const exercise of visibleExercises) {
    if (exercise.source === "PROGRAM") {
      result[exercise.id] = createFallbackProgramEntryState(exercise, entryStateMap[exercise.id]);
    }
  }
  return result;
});

export type WorkoutSessionExerciseCard = {
  id: string;
  exercise: WorkoutExerciseViewModel;
  minimumPlateIncrementKg: number;
  showMinimumPlateInfo: boolean;
  prevPerformance?: string;
  programEntryState?: WorkoutProgramExerciseEntryState;
};

export const sessionExerciseCardsAtom = atom((get) => {
  const visibleExercises = get(visibleExercisesAtom);
  const workoutPreferences = get(workoutPreferencesAtom);
  const prevPerformanceMap = get(prevPerformanceMapAtom);
  const memoizedProgramEntryStates = get(memoizedProgramEntryStatesAtom);

  const cardsMap: Record<string, WorkoutSessionExerciseCard> = {};
  visibleExercises.forEach((exercise) => {
    const minimumPlateInfo = resolveMinimumPlateIncrement(workoutPreferences, {
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
    });
    cardsMap[exercise.id] = {
      id: exercise.id,
      exercise: exercise,
      minimumPlateIncrementKg: minimumPlateInfo.incrementKg,
      showMinimumPlateInfo: minimumPlateInfo.source === "RULE",
      prevPerformance: prevPerformanceMap[exercise.exerciseName] ?? undefined,
      programEntryState: memoizedProgramEntryStates[exercise.id],
    };
  });
  return cardsMap;
});

export const sessionExerciseIdsAtom = atom((get) => {
  return get(visibleExercisesAtom).map((ex) => ex.id);
});

export const makeExerciseCardAtom = (exerciseId: string) =>
  atom((get) => get(sessionExerciseCardsAtom)[exerciseId] as WorkoutSessionExerciseCard | undefined);

export const completedExercisesCountAtom = atom((get) => {
  const visibleExercises = get(visibleExercisesAtom);
  const entryStateMap = get(programEntryStateAtom);
  return visibleExercises.filter((exercise) => {
    return exercise.set.repsPerSet.some((setReps, index) => {
      const entryState = entryStateMap[exercise.id];
      const rawValue = entryState?.repsInputs[index]?.trim() ?? "";
      const actual = exercise.source === "PROGRAM" ? Number(rawValue) : setReps;
      return Number.isFinite(actual) && actual > 0;
    });
  }).length;
});

export const completedSetsCountAtom = atom((get) => {
  const visibleExercises = get(visibleExercisesAtom);
  const entryStateMap = get(programEntryStateAtom);
  let count = 0;
  for (const exercise of visibleExercises) {
    const entryState = entryStateMap[exercise.id];
    for (let i = 0; i < exercise.set.repsPerSet.length; i++) {
      const rawValue = entryState?.repsInputs[i]?.trim() ?? "";
      const actual =
        exercise.source === "PROGRAM"
          ? Number(rawValue)
          : exercise.set.repsPerSet[i];
      if (Number.isFinite(actual) && actual > 0) count++;
    }
  }
  return count;
});

export const totalSetsCountAtom = atom((get) => {
  return get(visibleExercisesAtom).reduce(
    (sum, e) => sum + e.set.repsPerSet.length,
    0,
  );
});
