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
  const frozenPlannedReps = Number(exercise.plannedSetMeta?.repsPerSet[setIndex] ?? 0);
  const plannedReps = exercise.ref5
    ? Number(
        exercise.plannedSetMeta?.repsPerSet[setIndex] ??
          exercise.set.repsPerSet[setIndex] ??
          0,
      )
    : exercise.source === "PROGRAM"
      ? Number(exercise.set.repsPerSet[setIndex] ?? 0)
      : Number.isFinite(frozenPlannedReps) && frozenPlannedReps > 0
        ? frozenPlannedReps
        : 0;
  if (exercise.source === "PROGRAM") {
    return { plannedReps, repsRaw: programInput.trim() };
  }
  const storedReps = Number(exercise.set.repsPerSet[setIndex] ?? 0);
  return {
    plannedReps,
    repsRaw: exercise.ref5 || plannedReps > 0
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

export type Ref5OapDisplay = {
  arm: "left" | "right";
  rung: number;
  rungName: string;
  rungNameKo: string;
  kind: "LADDER" | "NEGATIVE" | "FREE";
};

/**
 * Reads the frozen OAP coordinates off a prescription (§7.5.2).
 *
 * The slot has no weight, so the rung *is* what the card must show; without it
 * the two arms are indistinguishable rows of "0 kg".
 */
export function resolveRef5OapDisplay(
  exercise: WorkoutExerciseViewModel,
): Ref5OapDisplay | null {
  const prescription = exercise.ref5?.prescription;
  if (!prescription) return null;
  const value = (prescription as Record<string, unknown>).oap;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const oap = value as Record<string, unknown>;
  const arm = oap.arm === "left" || oap.arm === "right" ? oap.arm : null;
  const rung = Number(oap.rung);
  const kind =
    oap.kind === "LADDER" || oap.kind === "NEGATIVE" || oap.kind === "FREE" ? oap.kind : null;
  if (!arm || !kind || !Number.isFinite(rung)) return null;
  return {
    arm,
    rung,
    rungName: String(oap.rungName ?? ""),
    rungNameKo: String(oap.rungNameKo ?? ""),
    kind,
  };
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
