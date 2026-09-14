import type { WorkoutDraftData } from "../storage/workoutDraftStore";
import { materializeWorkoutExercises, toWorkoutLogPayload, type ExistingWorkoutLogLike } from "./model";

export type RecoverySavedLog = ExistingWorkoutLogLike & { clientMutationId?: string | null };

export function recoveryHref({ key, draft }: WorkoutDraftData): string {
  const session = draft.session;
  const params = new URLSearchParams({ date: session.sessionDate });
  if (session.planId) params.set("planId", session.planId);
  if (session.generatedSessionId && key.endsWith(`:${session.generatedSessionId}`)) {
    params.set("sessionId", session.generatedSessionId);
  }
  if (session.logId) params.set("logId", session.logId);
  return `/workout/log?${params}`;
}

/** Use identities, never just a date: two separate workouts can have identical sets. */
export function recoveryLookupPath({ draft }: WorkoutDraftData): string | null {
  const session = draft.session;
  const params = new URLSearchParams({ includeProgression: "false", includeGeneratedSession: "false", limit: "2" });
  if (session.logId) params.set("logId", session.logId);
  else if (session.generatedSessionId) params.set("generatedSessionId", session.generatedSessionId);
  else if (session.clientMutationId) params.set("clientMutationId", session.clientMutationId);
  else return null;
  return `/api/logs?${params}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
}

function comparableSet(set: ExistingWorkoutLogLike["sets"][number]) {
  const meta = record(set.meta);
  const ref5 = record(meta.ref5);
  return {
    exerciseId: set.exerciseId ?? null,
    name: set.exerciseName?.trim(), setNumber: set.setNumber,
    reps: Number(set.reps), weightKg: Number(set.weightKg),
    rpe: set.rpe == null || Number(set.rpe) === 0 ? null : Number(set.rpe),
    isExtra: Boolean(set.isExtra), setType: set.setType ?? null,
    memo: String(meta.memo ?? "").trim(),
    // REF5 contains user outcomes beyond reps (termination, OAP, etc.).
    ref5: stableValue(ref5),
  };
}

/** Suppress only a matching saved copy; never delete local data during reconciliation. */
export function isDraftAlreadySaved(data: WorkoutDraftData, saved: RecoverySavedLog): boolean {
  try {
    const session = data.draft.session;
    const sameIdentity = session.logId
      ? session.logId === saved.id
      : Boolean((session.generatedSessionId && session.generatedSessionId === saved.generatedSessionId) ||
          (session.clientMutationId && session.clientMutationId === saved.clientMutationId));
    if (!sameIdentity) return false;

    // Raw entry fields may contain an unfinished/invalid edit that has not reached the model.
    for (const exercise of materializeWorkoutExercises(data.draft)) {
      const entry = data.programEntryState?.[exercise.id];
      if (!entry) continue;
      if (entry.repsInputs.some((value, index) => value.trim() === "" ||
        !Number.isFinite(Number(value)) || Number(value) !== exercise.set.repsPerSet[index])) return false;
      if (entry.memoInput.trim() && entry.memoInput.trim() !== exercise.note.memo.trim()) return false;
    }
    const payload = toWorkoutLogPayload(data.draft);
    if (payload.planId !== (saved.planId ?? null) || payload.generatedSessionId !== saved.generatedSessionId ||
      new Date(payload.performedAt).getTime() !== new Date(saved.performedAt).getTime() ||
      (payload.notes ?? "") !== (saved.notes ?? "").trim()) return false;
    return JSON.stringify(payload.sets.map(comparableSet)) === JSON.stringify(saved.sets.map(comparableSet));
  } catch {
    return false;
  }
}
