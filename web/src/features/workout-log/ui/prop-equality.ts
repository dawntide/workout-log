import type { SearchSelectOption } from "@/components/ui/search-select-sheet";
import type { PendingRestorePrompt } from "@/features/workout-log/model/editor-actions";
import type {
  AddExerciseDraft,
  WorkoutLogExerciseOption,
  WorkoutLogLastSessionSummary,
} from "@/features/workout-log/model/types";
import type {
  WorkoutExerciseViewModel,
  WorkoutProgramExerciseEntryState,
} from "@/entities/workout-record";

export function areNumberArraysEqual(
  left: Array<number | null> | null | undefined,
  right: Array<number | null> | null | undefined,
) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function areStringArraysEqual(
  left: string[] | null | undefined,
  right: string[] | null | undefined,
) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function areBooleanArraysEqual(
  left: boolean[] | null | undefined,
  right: boolean[] | null | undefined,
) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function areWorkoutProgramEntryStatesEqual(
  left: WorkoutProgramExerciseEntryState | undefined,
  right: WorkoutProgramExerciseEntryState | undefined,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.memoInput === right.memoInput &&
    left.memoPlaceholder === right.memoPlaceholder &&
    areStringArraysEqual(left.repsInputs, right.repsInputs) &&
    areNumberArraysEqual(left.plannedRepsPerSet, right.plannedRepsPerSet)
  );
}

export function areWorkoutExercisesEqual(
  left: WorkoutExerciseViewModel,
  right: WorkoutExerciseViewModel,
) {
  if (left === right) return true;
  return (
    left.id === right.id &&
    left.exerciseId === right.exerciseId &&
    left.exerciseName === right.exerciseName &&
    left.source === right.source &&
    left.badge === right.badge &&
    left.prescribedWeightKg === right.prescribedWeightKg &&
    left.isEdited === right.isEdited &&
    left.deleted === right.deleted &&
    left.note.memo === right.note.memo &&
    left.set.count === right.set.count &&
    left.set.reps === right.set.reps &&
    left.set.weightKg === right.set.weightKg &&
    areNumberArraysEqual(left.set.repsPerSet, right.set.repsPerSet) &&
    areNumberArraysEqual(left.set.rpePerSet, right.set.rpePerSet) &&
    areNumberArraysEqual(left.set.weightKgPerSet, right.set.weightKgPerSet) &&
    areNumberArraysEqual(
      left.plannedSetMeta?.repsPerSet,
      right.plannedSetMeta?.repsPerSet,
    ) &&
    areNumberArraysEqual(
      left.plannedSetMeta?.targetWeightKgPerSet,
      right.plannedSetMeta?.targetWeightKgPerSet,
    ) &&
    areNumberArraysEqual(
      left.plannedSetMeta?.rpePerSet,
      right.plannedSetMeta?.rpePerSet,
    ) &&
    areBooleanArraysEqual(
      left.plannedSetMeta?.amrapPerSet,
      right.plannedSetMeta?.amrapPerSet,
    )
  );
}

export function areWorkoutLogExerciseOptionsEqual(
  left: WorkoutLogExerciseOption[],
  right: WorkoutLogExerciseOption[],
) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const previous = left[index];
    const next = right[index];
    if (
      previous.id !== next.id ||
      previous.name !== next.name ||
      previous.category !== next.category ||
      !areStringArraysEqual(previous.aliases, next.aliases)
    ) {
      return false;
    }
  }
  return true;
}

export function areSearchSelectOptionsEqual(
  left: SearchSelectOption[],
  right: SearchSelectOption[],
) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const previous = left[index];
    const next = right[index];
    if (
      previous.key !== next.key ||
      previous.label !== next.label ||
      previous.active !== next.active ||
      previous.ariaCurrent !== next.ariaCurrent ||
      previous.onSelect !== next.onSelect
    ) {
      return false;
    }
  }
  return true;
}

export function areAddExerciseDraftsEqual(
  left: AddExerciseDraft,
  right: AddExerciseDraft,
) {
  if (left === right) return true;
  return (
    left.exerciseId === right.exerciseId &&
    left.exerciseName === right.exerciseName
  );
}

export function areWorkoutLogLastSessionSummariesEqual(
  left: WorkoutLogLastSessionSummary | null,
  right: WorkoutLogLastSessionSummary | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.dateLabel !== right.dateLabel ||
    left.weekLabel !== right.weekLabel ||
    left.sessionLabel !== right.sessionLabel ||
    left.bodyweightKg !== right.bodyweightKg ||
    left.totalSets !== right.totalSets ||
    left.totalVolume !== right.totalVolume ||
    left.exercises.length !== right.exercises.length
  ) {
    return false;
  }
  for (let index = 0; index < left.exercises.length; index += 1) {
    const previous = left.exercises[index];
    const next = right.exercises[index];
    if (
      previous.name !== next.name ||
      previous.sets !== next.sets ||
      previous.bestSet !== next.bestSet
    ) {
      return false;
    }
  }
  return true;
}

export function arePendingRestorePromptsEqual(
  left: PendingRestorePrompt | null,
  right: PendingRestorePrompt | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.capturedKey === right.capturedKey &&
    left.data.key === right.data.key &&
    left.data.updatedAt === right.data.updatedAt
  );
}
