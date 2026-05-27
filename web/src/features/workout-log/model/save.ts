import { toWorkoutLogPayload, type WorkoutRecordDraft } from "@/entities/workout-record";
import { isBodyweightExerciseName } from "@/lib/bodyweight-load";
import type { FailureProtocolDecision } from "@/components/ui/failure-protocol-sheet";
import { submitWorkoutLogAction } from "../actions/submit-workout-log";
import { clearWorkoutDraft } from "@/lib/storage/workoutDraftStore";

export async function submitWorkoutLogDraft({
  draft,
  bodyweightKg,
  progressionTargetDecisions,
  persistenceKey,
}: {
  draft: WorkoutRecordDraft;
  bodyweightKg: number | null | undefined;
  progressionTargetDecisions?: Record<string, FailureProtocolDecision> | null;
  persistenceKey: string | null;
}) {
  const payload = toWorkoutLogPayload(draft, {
    bodyweightKg: bodyweightKg ?? null,
    isBodyweightExercise: isBodyweightExerciseName,
  });

  const result = await submitWorkoutLogAction({
    logId: draft.session.logId ?? undefined,
    timezone: payload.timezone ?? "UTC",
    performedAt: new Date(payload.performedAt),
    durationMinutes: payload.durationMinutes,
    notes: payload.notes,
    planId: payload.planId,
    generatedSessionId: payload.generatedSessionId,
    sets: payload.sets,
    progressionTargetDecisions: progressionTargetDecisions ?? undefined,
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
