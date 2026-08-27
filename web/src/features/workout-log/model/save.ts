import { toWorkoutLogPayload, type WorkoutRecordDraft } from "@/entities/workout-record";
import { isBodyweightExerciseName } from "@workout/core/bodyweight-load";
import type { FailureProtocolDecision } from "@/components/ui/failure-protocol-sheet";
import { submitWorkoutLogAction } from "../actions/submit-workout-log";
import { apiInvalidateCache } from "@/lib/api";
import { clearWorkoutDraft } from "@/lib/storage/workoutDraftStore";
import {
  consumeNextSaveFailure,
  SIMULATED_SAVE_FAILURE_MESSAGE,
} from "@/lib/debug-flags";

// 세션 저장으로 서버 상태가 바뀌는 GET 경로들. 저장은 **서버 액션**이라 apiMutate 를 거치지
// 않으므로(=자동 무효화 대상이 아니다) 이 목록을 여기서 직접 지운다. 특히
// /api/plans/:id/progression-state 는 저장이 만든 진행 이벤트가 데이터원이라, 캐시가 남으면
// 다음 세션 화면이 저장 전 상태를 그려 F1 조기 디로드 배너·F2 진행 판정 카드가 통째로 사라진다.
const SAVE_INVALIDATED_CACHE_PREFIXES = ["/api/plans", "/api/logs", "/api/home", "/api/stats"];

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

  // 디버그 도구의 "다음 저장 1회 실패". **액션 호출 직전**에 끊어야 진짜 실패와 같은
  // 모양이 된다 — 초안도 캐시도 그대로 남고, 호출부는 아래 `!result.success`와 똑같이
  // throw를 받는다. 저장은 서버 액션이라 API 바디에 플래그를 실을 자리가 없어 여기서 한다.
  if (consumeNextSaveFailure()) {
    throw new Error(SIMULATED_SAVE_FAILURE_MESSAGE);
  }

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

  for (const prefix of SAVE_INVALIDATED_CACHE_PREFIXES) apiInvalidateCache(prefix);

  // Draft cleanup 은 critical path 가 아니다 — IndexedDB 가 느리거나 hang 되어도
  // 저장 완료 후 화면 전이를 막지 않도록 fire-and-forget 으로 둔다.
  if (persistenceKey) {
    void clearWorkoutDraft(persistenceKey).catch(() => {});
  }

  return result.data;
}
