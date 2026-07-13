import {
  validateAndClassifyRef5Outcome,
  type Ref5OutcomeRecord,
} from "@workout/core/program-engine/ref5";
import type {
  WorkoutExerciseViewModel,
  WorkoutProgramExerciseEntryState,
} from "@/entities/workout-record";

export type Ref5ExerciseOutcomeView =
  | { status: "incomplete" }
  | { status: "invalid-input"; message: string }
  | { status: "classified"; value: Ref5OutcomeRecord };

export type Ref5PullDisplayLoad = {
  addedKg: number;
  actualTotalKg: number;
};

export function resolveWorkoutSetRepsEntry(
  exercise: WorkoutExerciseViewModel,
  setIndex: number,
  programInput = "",
) {
  const plannedReps = exercise.ref5
    ? Number(
        exercise.plannedSetMeta?.repsPerSet[setIndex] ??
          exercise.set.repsPerSet[setIndex] ??
          0,
      )
    : exercise.source === "PROGRAM"
      ? Number(exercise.set.repsPerSet[setIndex] ?? 0)
      : 0;
  if (exercise.source === "PROGRAM") {
    return { plannedReps, repsRaw: programInput.trim() };
  }
  const storedReps = Number(exercise.set.repsPerSet[setIndex] ?? 0);
  return {
    plannedReps,
    repsRaw: exercise.ref5
      ? String(Math.max(0, storedReps))
      : storedReps > 0
        ? String(storedReps)
        : "",
  };
}

/** Reads the frozen, start-time PULL loads used by both workout skins. */
export function resolveRef5PullDisplayLoad(
  exercise: WorkoutExerciseViewModel,
): Ref5PullDisplayLoad | null {
  const prescription = exercise.ref5?.prescription;
  if (!prescription) return null;
  const pullValue = prescription.pull;
  if (!pullValue || typeof pullValue !== "object" || Array.isArray(pullValue)) {
    return null;
  }
  const pull = pullValue as Record<string, unknown>;
  const actualTotalKg = Number(pull.actualTotalKg ?? pull.actualTotalLoadKg);
  const addedKg = Number(
    pull.lockedAddedKg ?? pull.externalLoadKg ?? exercise.set.weightKgPerSet[0],
  );
  if (!Number.isFinite(actualTotalKg) || !Number.isFinite(addedKg)) return null;
  if (actualTotalKg < 0 || addedKg < 0) return null;
  return { addedKg, actualTotalKg };
}

/**
 * UI-only projection of the canonical domain classifier. It never updates
 * progression; the server repeats validation against the immutable snapshot.
 */
export function deriveRef5ExerciseOutcomeView(
  exercise: WorkoutExerciseViewModel,
  entryState?: WorkoutProgramExerciseEntryState,
): Ref5ExerciseOutcomeView | null {
  const ref5 = exercise.ref5;
  if (!ref5) return null;
  if (!ref5.terminationReason) return { status: "incomplete" };

  const planned = exercise.plannedSetMeta?.repsPerSet ?? [];
  const effective: number[] = [];
  for (let index = 0; index < planned.length; index += 1) {
    if (exercise.source === "PROGRAM") {
      const raw = entryState?.repsInputs[index]?.trim() ?? "";
      if (raw === "") return { status: "incomplete" };
      effective.push(Number(raw));
    } else {
      effective.push(Number(exercise.set.repsPerSet[index]));
    }
  }

  const classified = validateAndClassifyRef5Outcome({
    sets: planned.map((plannedReps, index) => ({
      plannedReps: Number(plannedReps),
      effectiveReps: effective[index]!,
    })),
    endReason: ref5.terminationReason,
  });
  if (!classified.ok) {
    return { status: "invalid-input", message: classified.errors.join("; ") };
  }
  return { status: "classified", value: classified.value };
}
