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
import type { RestTimerState } from "@/lib/workout-record/rest-timer";

// Core Data Atoms
export const draftAtom = atom<WorkoutRecordDraft | null>(null);
export const programEntryStateAtom = atom<WorkoutProgramExerciseEntryStateMap>({});
export const workoutPreferencesAtom = atom<WorkoutPreferences>(toDefaultWorkoutPreferences());
export const workflowStateAtom = atom<WorkoutWorkflowState>("idle");

// Query & Context Variables
export const recentLogItemsAtom = atom<WorkoutLogRecentLogItem[]>([]);
export const lastSessionAtom = atom<WorkoutLogLastSessionSummary | null>(null);
export const saveErrorAtom = atom<string | null>(null);

/**
 * 휴식 타이머 — 화면 스코프 jotai. 라우트를 벗어나면 소멸하지만, 시작 시각을
 * sessionStorage에 기록해 두어 돌아오면 남은 시간이 이어진다(use-rest-timer).
 * 전역 store를 도입하지 않는 이유는 계획서 docs/rest-timer-plan.md 결정 3 참고.
 */
export const restTimerAtom = atom<RestTimerState | null>(null);

/**
 * 휴식 상태를 sessionStorage에 쓸 때 쓰는 키. 화면이 채워 넣고, 카드처럼 깊은 곳에서도
 * prop 드릴링 없이 타이머를 시작할 수 있게 한다.
 */
export const restPersistenceKeyAtom = atom<string | null>(null);

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
import {
  isWorkoutSetCompleted,
  materializeWorkoutExercises,
} from "@/entities/workout-record";
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
      return isWorkoutSetCompleted({
        source: exercise.source,
        isRef5: Boolean(exercise.ref5),
        isProgramPrescription: Boolean(exercise.plannedSetMeta),
        repsInput: rawValue,
        recordedReps: setReps,
      });
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
      if (isWorkoutSetCompleted({
        source: exercise.source,
        isRef5: Boolean(exercise.ref5),
        isProgramPrescription: Boolean(exercise.plannedSetMeta),
        repsInput: rawValue,
        recordedReps: exercise.set.repsPerSet[i],
      })) count++;
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
