import type { WorkoutDraftData } from "@/lib/storage/workoutDraftStore";
import type { WorkoutPreferences } from "@/lib/settings/workout-preferences";
import {
  addUserExercise,
  patchSeedExercise,
  removeSeedExercise,
  removeUserExercise,
  updateUserExercise,
  type WorkoutExerciseViewModel,
  type WorkoutProgramExerciseEntryStateMap,
  type WorkoutRecordDraft,
} from "@/entities/workout-record";
import {
  appendSetReps,
  appendSetRpe,
  createFallbackProgramEntryState,
  patchSetRpeAtIndex,
  patchSetRepsAtIndex,
  removeSetRepsAtIndex,
  removeSetRpeAtIndex,
} from "./exercise-entry";
import type {
  AddExerciseDraft,
  WorkoutLogExerciseOption,
  WorkoutLogRecentLogItem,
} from "./types";

export type ExerciseRowAction =
  | { type: "CHANGE_WEIGHT"; value: number }
  | { type: "CHANGE_SET_REPS"; setIndex: number; value: number }
  | { type: "CHANGE_SET_RPE"; setIndex: number; value: number }
  | { type: "ADD_SET" }
  | { type: "REMOVE_SET"; index: number }
  | { type: "CHANGE_MEMO"; value: string }
  | { type: "DELETE" };

export type InlinePickerRequest =
  | {
      type: "CHANGE_WEIGHT";
      exerciseId: string;
      title: string;
      value: number;
      min: number;
      max: number;
      step: number;
      formatValue?: (value: number) => string;
    }
  | {
      type: "CHANGE_SET_REPS";
      exerciseId: string;
      setIndex: number;
      title: string;
      value: number;
      min: number;
      max: number;
      step: number;
      formatValue?: (value: number) => string;
    }
  | {
      type: "CHANGE_SET_RPE";
      exerciseId: string;
      setIndex: number;
      title: string;
      value: number;
      min: number;
      max: number;
      step: number;
      formatValue?: (value: number) => string;
    };

export type PendingRestorePrompt = {
  capturedKey: string | null;
  data: WorkoutDraftData;
};

type ResolveWeightWithPreferences = (
  weightKg: number,
  exerciseId: string | null | undefined,
  exerciseName: string,
  preferences: WorkoutPreferences,
) => number;

type ResolveWeightWithCurrentPreferences = (
  weightKg: number,
  exerciseId: string | null | undefined,
  exerciseName: string,
) => number;

type ExerciseActionUpdate = {
  draftUpdater: (prev: WorkoutRecordDraft) => WorkoutRecordDraft;
  programEntryStateUpdater?: (
    prev: WorkoutProgramExerciseEntryStateMap,
  ) => WorkoutProgramExerciseEntryStateMap;
};

export function buildExerciseActionUpdate(
  exerciseId: string,
  exercise: WorkoutExerciseViewModel,
  action: ExerciseRowAction,
  preferences: WorkoutPreferences,
  resolveWeightWithPreferences: ResolveWeightWithPreferences,
): ExerciseActionUpdate | null {
  switch (action.type) {
    case "CHANGE_WEIGHT": {
      const { value } = action;
      if (!Number.isFinite(value)) return null;
      const snapped = resolveWeightWithPreferences(
        value,
        exercise.exerciseId,
        exercise.exerciseName,
        preferences,
      );
      return {
        draftUpdater: (prev) =>
          exercise.source === "PROGRAM"
            ? patchSeedExercise(prev, exerciseId, { set: { weightKg: snapped } })
            : updateUserExercise(prev, exerciseId, { set: { weightKg: snapped } }),
      };
    }
    case "CHANGE_SET_REPS": {
      const { setIndex, value } = action;
      const repsPerSet = patchSetRepsAtIndex(exercise.set.repsPerSet, setIndex, value);
      if (exercise.source === "PROGRAM") {
        return {
          draftUpdater: (prev) => patchSeedExercise(prev, exerciseId, { set: { repsPerSet } }),
          programEntryStateUpdater: (prev) => {
            const current = createFallbackProgramEntryState(exercise, prev[exerciseId]);
            const repsInputs = current.repsInputs.slice();
            repsInputs[setIndex] = String(value);
            return { ...prev, [exerciseId]: { ...current, repsInputs } };
          },
        };
      }
      return {
        draftUpdater: (prev) => updateUserExercise(prev, exerciseId, { set: { repsPerSet } }),
      };
    }
    case "CHANGE_SET_RPE": {
      const { setIndex, value } = action;
      const rpePerSet = patchSetRpeAtIndex(
        exercise.set.rpePerSet,
        exercise.set.repsPerSet.length,
        setIndex,
        value,
      );
      return {
        draftUpdater: (prev) =>
          exercise.source === "PROGRAM"
            ? patchSeedExercise(prev, exerciseId, { set: { rpePerSet } })
            : updateUserExercise(prev, exerciseId, { set: { rpePerSet } }),
      };
    }
    case "ADD_SET": {
      const repsPerSet = appendSetReps(exercise.set.repsPerSet);
      const rpePerSet = appendSetRpe(exercise.set.rpePerSet, exercise.set.repsPerSet.length);
      if (exercise.source === "PROGRAM") {
        return {
          draftUpdater: (prev) => patchSeedExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet } }),
          programEntryStateUpdater: (prev) => {
            const current = createFallbackProgramEntryState(exercise, prev[exerciseId]);
            return {
              ...prev,
              [exerciseId]: { ...current, repsInputs: [...current.repsInputs, ""] },
            };
          },
        };
      }
      return {
        draftUpdater: (prev) => updateUserExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet } }),
      };
    }
    case "REMOVE_SET": {
      const { index } = action;
      const repsPerSet = removeSetRepsAtIndex(exercise.set.repsPerSet, index);
      const rpePerSet = removeSetRpeAtIndex(
        exercise.set.rpePerSet,
        exercise.set.repsPerSet.length,
        index,
      );
      if (exercise.source === "PROGRAM") {
        return {
          draftUpdater: (prev) => patchSeedExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet } }),
          programEntryStateUpdater: (prev) => {
            const current = createFallbackProgramEntryState(exercise, prev[exerciseId]);
            return {
              ...prev,
              [exerciseId]: {
                ...current,
                repsInputs: [
                  ...current.repsInputs.slice(0, index),
                  ...current.repsInputs.slice(index + 1),
                ],
              },
            };
          },
        };
      }
      return {
        draftUpdater: (prev) => updateUserExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet } }),
      };
    }
    case "CHANGE_MEMO": {
      const { value } = action;
      if (exercise.source === "PROGRAM") {
        return {
          draftUpdater: (prev) => patchSeedExercise(prev, exerciseId, { note: { memo: value } }),
          programEntryStateUpdater: (prev) => {
            const current = createFallbackProgramEntryState(exercise, prev[exerciseId]);
            return { ...prev, [exerciseId]: { ...current, memoInput: value } };
          },
        };
      }
      return {
        draftUpdater: (prev) => updateUserExercise(prev, exerciseId, { note: { memo: value } }),
      };
    }
    case "DELETE": {
      return {
        draftUpdater: (prev) =>
          exercise.source === "PROGRAM"
            ? removeSeedExercise(prev, exerciseId)
            : removeUserExercise(prev, exerciseId),
      };
    }
  }
}

function findRecentExerciseWeight(
  recentLogItems: WorkoutLogRecentLogItem[],
  exerciseName: string,
  fallback = 50,
) {
  const normalizedName = exerciseName.trim().toLowerCase();
  if (!normalizedName) return fallback;

  for (const log of recentLogItems) {
    for (const set of log.sets) {
      if (
        set.exerciseName.toLowerCase() === normalizedName &&
        set.weightKg != null &&
        set.weightKg > 0
      ) {
        return set.weightKg;
      }
    }
  }

  return fallback;
}

export function buildSelectedExerciseDraft(
  option: WorkoutLogExerciseOption | null,
  recentLogItems: WorkoutLogRecentLogItem[],
  resolveWeightWithCurrentPreferences: ResolveWeightWithCurrentPreferences,
) {
  const exerciseName = option?.name ?? "";
  const baseWeight = exerciseName
    ? findRecentExerciseWeight(recentLogItems, exerciseName)
    : 50;

  return (prev: AddExerciseDraft): AddExerciseDraft => ({
    ...prev,
    exerciseId: option?.id ?? null,
    exerciseName,
    weightKg: resolveWeightWithCurrentPreferences(
      baseWeight,
      option?.id ?? null,
      exerciseName,
    ),
  });
}

export function buildAddExerciseDraftUpdate(
  addDraft: AddExerciseDraft,
  resolveWeightWithCurrentPreferences: ResolveWeightWithCurrentPreferences,
  locale: "ko" | "en",
) {
  if (!addDraft.exerciseId) {
    return {
      ok: false as const,
      error:
        locale === "ko"
          ? "드롭다운에서 운동종목을 선택하세요."
          : "Select an exercise from the dropdown.",
    };
  }

  const exerciseName = addDraft.exerciseName.trim();
  if (!exerciseName) {
    return {
      ok: false as const,
      error:
        locale === "ko"
          ? "선택한 운동종목 이름을 확인하세요."
          : "Check the selected exercise name.",
    };
  }

  const snappedWeightKg = resolveWeightWithCurrentPreferences(
    addDraft.weightKg,
    addDraft.exerciseId,
    exerciseName,
  );

  return {
    ok: true as const,
    draftUpdater: (prev: WorkoutRecordDraft) =>
      addUserExercise(prev, {
        exerciseId: addDraft.exerciseId,
        exerciseName,
        weightKg: snappedWeightKg,
        repsPerSet: addDraft.repsPerSet,
        memo: addDraft.memo,
      }),
  };
}
