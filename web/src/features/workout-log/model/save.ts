import { toWorkoutLogPayload, type WorkoutRecordDraft } from "@/entities/workout-record";
import { isBodyweightExerciseName } from "@/lib/bodyweight-load";
import { submitWorkoutLogAction } from "../actions/submit-workout-log";
import { clearWorkoutDraft } from "@/lib/storage/workoutDraftStore";

export async function submitWorkoutLogDraft({
  draft,
  bodyweightKg,
  progressionOverride,
  persistenceKey,
}: {
  draft: WorkoutRecordDraft;
  bodyweightKg: number | null | undefined;
  progressionOverride: "hold" | "increase" | "reset" | null;
  persistenceKey: string | null;
}) {
  const payload = toWorkoutLogPayload(draft, {
    bodyweightKg: bodyweightKg ?? null,
    isBodyweightExercise: isBodyweightExerciseName,
  });

  const payloadWithOverride = progressionOverride ? { ...payload, progressionOverride } : payload;
  
  const result = await submitWorkoutLogAction({
    logId: draft.session.logId ?? undefined,
    timezone: payloadWithOverride.timezone ?? "UTC",
    performedAt: new Date(payloadWithOverride.performedAt),
    durationMinutes: payloadWithOverride.durationMinutes,
    notes: payloadWithOverride.notes,
    planId: payloadWithOverride.planId,
    generatedSessionId: payloadWithOverride.generatedSessionId,
    sets: payloadWithOverride.sets,
    progressionOverride: (payloadWithOverride as any).progressionOverride as "hold" | "increase" | "reset" | undefined,
  });

  if (!result.success) {
    throw new Error(result.error);
  }

  // Draft cleanup 은 critical path 가 아니다 — IndexedDB 가 느리거나 hang 되어도
  // 저장 완료 후 화면 전이를 막지 않도록 fire-and-forget 으로 둔다.
  if (persistenceKey) {
    void clearWorkoutDraft(persistenceKey).catch(() => {});
  }

  return result.data;
}
