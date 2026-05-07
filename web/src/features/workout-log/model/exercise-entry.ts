import type {
  WorkoutExerciseViewModel,
  WorkoutProgramExerciseEntryState,
} from "@/entities/workout-record";

function clampReps(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeRepsPerSet(value: number[], fallback = 5) {
  if (!Array.isArray(value) || value.length === 0) {
    return [clampReps(fallback)];
  }
  return value.map((entry) => clampReps(entry)).slice(0, 50);
}

function clampRpe(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(10, Math.max(0, Math.round(value * 2) / 2));
}

function normalizeRpePerSet(value: number[] | undefined, length: number) {
  const count = Math.max(1, Math.min(50, Math.round(length)));
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_, index) => clampRpe(source[index] ?? 0));
}

export function patchSetRepsAtIndex(values: number[], index: number, nextReps: number) {
  const next = normalizeRepsPerSet(values);
  if (index < 0 || index >= next.length) return next;
  next[index] = clampReps(nextReps);
  return next;
}

export function appendSetReps(values: number[]) {
  const next = normalizeRepsPerSet(values);
  const last = next[next.length - 1] ?? 5;
  if (next.length >= 50) return next;
  return [...next, last];
}

export function removeSetRepsAtIndex(values: number[], index: number) {
  const next = normalizeRepsPerSet(values);
  if (next.length <= 1) return next;
  if (index < 0 || index >= next.length) return next;
  return [...next.slice(0, index), ...next.slice(index + 1)];
}

export function patchSetRpeAtIndex(
  values: number[] | undefined,
  length: number,
  index: number,
  nextRpe: number,
) {
  const next = normalizeRpePerSet(values, length);
  if (index < 0 || index >= next.length) return next;
  next[index] = clampRpe(nextRpe);
  return next;
}

export function appendSetRpe(values: number[] | undefined, length: number) {
  const next = normalizeRpePerSet(values, length);
  if (next.length >= 50) return next;
  return [...next, 0];
}

export function removeSetRpeAtIndex(
  values: number[] | undefined,
  length: number,
  index: number,
) {
  const next = normalizeRpePerSet(values, length);
  if (next.length <= 1) return next;
  if (index < 0 || index >= next.length) return next;
  return [...next.slice(0, index), ...next.slice(index + 1)];
}

export function createFallbackProgramEntryState(
  exercise: WorkoutExerciseViewModel,
  current?: WorkoutProgramExerciseEntryState,
): WorkoutProgramExerciseEntryState {
  return {
    repsInputs: Array.from({ length: exercise.set.repsPerSet.length }, (_, index) => current?.repsInputs[index] ?? ""),
    plannedRepsPerSet: current?.plannedRepsPerSet
      ?? exercise.set.repsPerSet.map((fallback, index) => {
           const fromMeta = exercise.plannedSetMeta?.repsPerSet?.[index];
           return typeof fromMeta === "number" && fromMeta > 0 ? fromMeta : fallback;
         }),
    memoInput: current?.memoInput ?? "",
    memoPlaceholder: current?.memoPlaceholder ?? "",
  };
}
