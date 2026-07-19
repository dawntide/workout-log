import {
  canonicalExerciseNameForInput,
  EXERCISE_NAMES,
} from "@workout/core/exercise/catalog";

export type StatsDefaultExerciseCandidate = {
  id: string;
  name: string;
  lastPerformedAt: Date | null;
};

const SQUAT_NAMES = new Set<string>([
  EXERCISE_NAMES.highBarBackSquat,
  EXERCISE_NAMES.lowBarBackSquat,
  EXERCISE_NAMES.frontSquat,
]);

const BIG_THREE_NAMES = new Set<string>([
  EXERCISE_NAMES.benchPress,
  EXERCISE_NAMES.deadlift,
]);

const NO_HISTORY_ORDER = new Map<string, number>([
  [EXERCISE_NAMES.highBarBackSquat, 0],
  [EXERCISE_NAMES.lowBarBackSquat, 1],
  [EXERCISE_NAMES.frontSquat, 2],
  [EXERCISE_NAMES.benchPress, 3],
  [EXERCISE_NAMES.deadlift, 4],
]);

function canonicalName(name: string): string {
  return canonicalExerciseNameForInput(name) ?? name.trim();
}

function exerciseTier(name: string): number {
  const canonical = canonicalName(name);
  if (SQUAT_NAMES.has(canonical)) return 0;
  if (BIG_THREE_NAMES.has(canonical)) return 1;
  return 2;
}

function performedAtMs(candidate: StatsDefaultExerciseCandidate): number | null {
  if (!candidate.lastPerformedAt) return null;
  const value = candidate.lastPerformedAt.getTime();
  return Number.isFinite(value) ? value : null;
}

function compareCandidates(
  left: StatsDefaultExerciseCandidate,
  right: StatsDefaultExerciseCandidate,
): number {
  const leftPerformedAt = performedAtMs(left);
  const rightPerformedAt = performedAtMs(right);
  const leftHasHistory = leftPerformedAt !== null;
  const rightHasHistory = rightPerformedAt !== null;

  if (leftHasHistory !== rightHasHistory) return leftHasHistory ? -1 : 1;

  const tierDifference = exerciseTier(left.name) - exerciseTier(right.name);
  if (tierDifference !== 0) return tierDifference;

  if (leftPerformedAt !== rightPerformedAt) {
    return (rightPerformedAt ?? 0) - (leftPerformedAt ?? 0);
  }

  const leftCanonical = canonicalName(left.name);
  const rightCanonical = canonicalName(right.name);
  const fallbackDifference =
    (NO_HISTORY_ORDER.get(leftCanonical) ?? Number.MAX_SAFE_INTEGER) -
    (NO_HISTORY_ORDER.get(rightCanonical) ?? Number.MAX_SAFE_INTEGER);
  if (fallbackDifference !== 0) return fallbackDifference;

  const nameDifference = left.name.localeCompare(right.name);
  return nameDifference !== 0 ? nameDifference : left.id.localeCompare(right.id);
}

/**
 * Default stats filter priority:
 * workout history -> squat -> the other big-three lifts -> latest activity.
 */
export function selectDefaultStatsExercise<T extends StatsDefaultExerciseCandidate>(
  candidates: readonly T[],
): T | null {
  let selected: T | null = null;
  for (const candidate of candidates) {
    if (!selected || compareCandidates(candidate, selected) < 0) {
      selected = candidate;
    }
  }
  return selected;
}
