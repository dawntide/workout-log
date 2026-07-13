import type { AppLocale } from "@/lib/i18n/messages";
import type { WorkoutExerciseModel, WorkoutExerciseViewModel, WorkoutRecordDraft } from "./model";

export type WorkoutProgramExerciseEntryState = {
  repsInputs: string[];
  plannedRepsPerSet: number[]; // 세션 시작 시 캡처된 계획 reps (불변)
  memoInput: string;
  memoPlaceholder: string;
};

export type WorkoutProgramExerciseEntryStateMap = Record<string, WorkoutProgramExerciseEntryState>;

export function createWorkoutProgramExerciseEntryState(
  exercise: Pick<WorkoutExerciseModel, "set" | "note">,
): WorkoutProgramExerciseEntryState {
  return {
    repsInputs: exercise.set.repsPerSet.map(() => ""),
    plannedRepsPerSet: [...exercise.set.repsPerSet],
    memoInput: "",
    memoPlaceholder: exercise.note.memo,
  };
}

export function hasProgramEntryStateEdits(
  programEntryState: WorkoutProgramExerciseEntryStateMap,
): boolean {
  return Object.values(programEntryState).some((state) => {
    if (!state) return false;
    const hasReps = state.repsInputs?.some((r) => (r ?? "").trim() !== "");
    const hasMemo = (state.memoInput ?? "").trim() !== "";
    return hasReps || hasMemo;
  });
}

export function prepareWorkoutRecordDraftForEntry(draft: WorkoutRecordDraft): {
  draft: WorkoutRecordDraft;
  programEntryState: WorkoutProgramExerciseEntryStateMap;
} {
  const programEntryState: WorkoutProgramExerciseEntryStateMap = {};

  return {
    draft: {
      ...draft,
      seedExercises: draft.seedExercises.map((exercise) => {
        programEntryState[exercise.id] = createWorkoutProgramExerciseEntryState(exercise);
        return {
          ...exercise,
          note: {
            memo: "",
          },
        };
      }),
    },
    programEntryState,
  };
}

export function validateWorkoutRecordEntryState(
  exercises: WorkoutExerciseViewModel[],
  programEntryState: WorkoutProgramExerciseEntryStateMap,
  locale: AppLocale = "ko",
): string[] {
  const copy = locale === "ko"
    ? {
        missingReps: (name: string, setIndex: number) => `${name} ${setIndex + 1}세트 횟수를 입력하세요.`,
        invalidReps: (name: string, setIndex: number) => `${name} ${setIndex + 1}세트 횟수는 1~100 범위여야 합니다.`,
      }
    : {
        missingReps: (name: string, setIndex: number) => `Enter reps for ${name} set ${setIndex + 1}.`,
        invalidReps: (name: string, setIndex: number) => `${name} set ${setIndex + 1} reps must be between 1 and 100.`,
      };
  const errors: string[] = [];

  exercises.forEach((exercise) => {
    if (exercise.source !== "PROGRAM") return;

    const entryState = programEntryState[exercise.id];

    exercise.set.repsPerSet.forEach((_, setIndex) => {
      const rawValue = entryState?.repsInputs[setIndex]?.trim() ?? "";
      if (!rawValue) {
        errors.push(copy.missingReps(exercise.exerciseName, setIndex));
        return;
      }

      const parsedValue = Number(rawValue);
      const minimumReps = exercise.ref5 ? 0 : 1;
      if (!Number.isFinite(parsedValue) || parsedValue < minimumReps || parsedValue > 100) {
        errors.push(copy.invalidReps(exercise.exerciseName, setIndex));
      }
    });
  });

  return errors;
}
