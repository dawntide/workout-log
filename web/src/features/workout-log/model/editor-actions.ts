import type { WorkoutDraftData } from "@/lib/storage/workoutDraftStore";
import type { WorkoutPreferences } from "@/lib/settings/workout-preferences";
import { computeExternalLoadFromTotalKg } from "@/lib/bodyweight-load";
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
  appendSetWeight,
  createFallbackProgramEntryState,
  patchSetRpeAtIndex,
  patchSetRepsAtIndex,
  patchSetWeightAtIndex,
  removeSetRepsAtIndex,
  removeSetRpeAtIndex,
  removeSetWeightAtIndex,
} from "./exercise-entry";
import type {
  AddExerciseDraft,
  WorkoutLogExerciseOption,
} from "./types";

export type ExerciseRowAction =
  | { type: "CHANGE_WEIGHT"; setIndex: number; value: number }
  | { type: "APPLY_TARGET_WEIGHTS" }
  | { type: "CHANGE_SET_REPS"; setIndex: number; value: number }
  | { type: "CHANGE_SET_RPE"; setIndex: number; value: number }
  | { type: "ADD_SET" }
  | { type: "REMOVE_SET"; index: number }
  | { type: "CHANGE_MEMO"; value: string }
  | { type: "DELETE" };

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
      const { setIndex, value } = action;
      if (!Number.isFinite(value)) return null;
      if (
        !Number.isFinite(setIndex) ||
        setIndex < 0 ||
        setIndex >= exercise.set.repsPerSet.length
      ) {
        return null;
      }
      const snapped = resolveWeightWithPreferences(
        value,
        exercise.exerciseId,
        exercise.exerciseName,
        preferences,
      );
      const weightKgPerSet = patchSetWeightAtIndex(
        exercise.set.weightKgPerSet,
        exercise.set.repsPerSet.length,
        setIndex,
        snapped,
      );
      return {
        draftUpdater: (prev) =>
          exercise.source === "PROGRAM"
            ? patchSeedExercise(prev, exerciseId, { set: { weightKgPerSet } })
            : updateUserExercise(prev, exerciseId, { set: { weightKgPerSet } }),
      };
    }
    case "APPLY_TARGET_WEIGHTS": {
      // "권장값" 버튼. AUTO 는 프로그램 세트별 처방 무게로, CUSTOM/USER 는 권장값으로 균일 채움.
      const length = exercise.set.repsPerSet.length;
      const targets = exercise.plannedSetMeta?.targetWeightKgPerSet ?? [];
      // 프로그램 처방 무게(targetWeightKg = TM × %)는 맨몸 운동(풀업/친업 등)에서
      // 체중을 포함한 총부하다. 하지만 무게 입력 필드는 외부 추가 중량만 받으므로,
      // 로드 시점의 시드 가중치 규칙(applyWorkoutLogWeightRulesToDraft)과 동일하게
      // 맨몸 운동이면 체중을 빼서 외부 부하로 변환한다. 변환 불가(맨몸 아님/체중 미설정)
      // 시에는 원래 총부하 값을 그대로 사용한다. USER 입력값은 이미 외부 부하이므로 변환하지 않는다.
      const toExternalLoad = (totalKg: number) =>
        exercise.source === "PROGRAM"
          ? computeExternalLoadFromTotalKg(
              exercise.exerciseName,
              totalKg,
              preferences.bodyweightKg,
            ) ?? totalKg
          : totalKg;
      const firstValidTarget = targets.find(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry) && entry > 0,
      );
      const prescribedBase =
        firstValidTarget ??
        (typeof exercise.prescribedWeightKg === "number" && exercise.prescribedWeightKg > 0
          ? exercise.prescribedWeightKg
          : null);
      const fallbackBase =
        prescribedBase !== null ? toExternalLoad(prescribedBase) : exercise.set.weightKg;
      const isAuto = exercise.source === "PROGRAM" && exercise.badge !== "CUSTOM";
      const weightKgPerSet = Array.from({ length }, (_, setIndex) => {
        const target = isAuto ? targets[setIndex] : null;
        const base =
          typeof target === "number" && Number.isFinite(target) && target >= 0
            ? toExternalLoad(target)
            : fallbackBase;
        return resolveWeightWithPreferences(
          Math.max(0, Number(base) || 0),
          exercise.exerciseId,
          exercise.exerciseName,
          preferences,
        );
      });
      return {
        draftUpdater: (prev) =>
          exercise.source === "PROGRAM"
            ? patchSeedExercise(prev, exerciseId, { set: { weightKgPerSet } })
            : updateUserExercise(prev, exerciseId, { set: { weightKgPerSet } }),
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
      const weightKgPerSet = appendSetWeight(exercise.set.weightKgPerSet, exercise.set.repsPerSet.length);
      if (exercise.source === "PROGRAM") {
        return {
          draftUpdater: (prev) => patchSeedExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet, weightKgPerSet } }),
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
        draftUpdater: (prev) => updateUserExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet, weightKgPerSet } }),
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
      const weightKgPerSet = removeSetWeightAtIndex(
        exercise.set.weightKgPerSet,
        exercise.set.repsPerSet.length,
        index,
      );
      if (exercise.source === "PROGRAM") {
        return {
          draftUpdater: (prev) => patchSeedExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet, weightKgPerSet } }),
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
        draftUpdater: (prev) => updateUserExercise(prev, exerciseId, { set: { repsPerSet, rpePerSet, weightKgPerSet } }),
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
      // 자동 진행(PROGRAM AUTO) 운동은 프로그램이 구성을 소유하므로 삭제 불가.
      // 수동(CUSTOM) 프로그램 운동과 USER 운동만 삭제 허용.
      const isProgramAuto =
        exercise.source === "PROGRAM" && exercise.badge !== "CUSTOM";
      if (isProgramAuto) return null;
      return {
        draftUpdater: (prev) =>
          exercise.source === "PROGRAM"
            ? removeSeedExercise(prev, exerciseId)
            : removeUserExercise(prev, exerciseId),
      };
    }
  }
}

export function buildSelectedExerciseDraft(
  option: WorkoutLogExerciseOption | null,
) {
  const exerciseName = option?.name ?? "";

  return (prev: AddExerciseDraft): AddExerciseDraft => ({
    ...prev,
    exerciseId: option?.id ?? null,
    exerciseName,
  });
}

export function buildAddExerciseDraftUpdate(
  addDraft: AddExerciseDraft,
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

  // 운동 종목만 추가한다. 무게/횟수/메모는 운동 기록 화면에서 입력하므로
  // 여기서는 미수행 상태(reps 0)의 1세트 로우만 생성한다.
  return {
    ok: true as const,
    draftUpdater: (prev: WorkoutRecordDraft) =>
      addUserExercise(prev, {
        exerciseId: addDraft.exerciseId,
        exerciseName,
        weightKg: 0,
        repsPerSet: [0],
        memo: "",
      }),
  };
}
