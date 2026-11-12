import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  generatedSession,
  plan,
  planProgressEvent,
  planRuntimeState,
  statsCache,
  userSetting,
  uxEventLog,
  workoutLog,
} from "@workout/core/db/schema";

/** claim 대상 env userId. 프로덕션에서는 env 폴백이 명시 opt-in된 런타임에서만 값을 돌려준다. */
export function claimableFallbackUserId(): string {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.WORKOUT_WEB_ALLOW_ENV_AUTH !== "1"
  ) {
    return "";
  }
  return (process.env.WORKOUT_AUTH_USER_ID ?? "").trim();
}

/**
 * env fallback userId(WORKOUT_AUTH_USER_ID, 기본 "dev")로 쌓여 있던
 * 모든 도메인 데이터를 새 가입자(uuid)에게 옮기기.
 *
 * 시나리오:
 * - 개발 환경에서 단일 사용자로 데이터 누적
 * - 첫 가입자가 이 데이터를 claim 하면 모든 row의 user_id를 새 uuid로 update
 *
 * 안전 장치:
 * - 프로덕션 런타임에서는 `WORKOUT_WEB_ALLOW_ENV_AUTH=1` 없이는 noop. 이 함수는 env를
 *   직접 읽으므로 web의 `devFallbackUserId()` 잠금을 거치지 않는다. 같은 조건을 여기서
 *   다시 걸지 않으면 배포 env에 값이 들어온 순간 가입자가 그 계정의 기록을 가져간다.
 * - env userId가 비어 있으면 noop
 * - 새 사용자(target)가 이미 본인 데이터가 있으면 noop (충돌 회피)
 */
export async function claimEnvFallbackData(input: {
  toUserId: string;
}): Promise<{
  claimed: boolean;
  fromUserId: string | null;
  movedRowCounts: Record<string, number> | null;
}> {
  const fromUserId = claimableFallbackUserId();
  if (!fromUserId) {
    return { claimed: false, fromUserId: null, movedRowCounts: null };
  }
  if (fromUserId === input.toUserId) {
    return { claimed: false, fromUserId, movedRowCounts: null };
  }

  // 새 사용자에게 이미 데이터가 있으면 충돌 회피로 skip
  const existing = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(eq(workoutLog.userId, input.toUserId))
    .limit(1);
  if (existing.length > 0) {
    return { claimed: false, fromUserId, movedRowCounts: null };
  }

  // 모든 도메인 테이블의 user_id 일괄 update
  const tables = [
    { name: "plan", table: plan, col: plan.userId },
    {
      name: "planRuntimeState",
      table: planRuntimeState,
      col: planRuntimeState.userId,
    },
    {
      name: "generatedSession",
      table: generatedSession,
      col: generatedSession.userId,
    },
    { name: "workoutLog", table: workoutLog, col: workoutLog.userId },
    {
      name: "planProgressEvent",
      table: planProgressEvent,
      col: planProgressEvent.userId,
    },
    { name: "statsCache", table: statsCache, col: statsCache.userId },
    { name: "userSetting", table: userSetting, col: userSetting.userId },
    { name: "uxEventLog", table: uxEventLog, col: uxEventLog.userId },
  ];

  const movedRowCounts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const t of tables) {
      const result = await tx
        .update(t.table)
        .set({ userId: input.toUserId })
        .where(eq(t.col, fromUserId));
      // drizzle의 node-postgres 업데이트 결과에는 rowCount가 있지만 타입에 노출되지 않는다.
      movedRowCounts[t.name] = (result as { rowCount?: number | null }).rowCount ?? 0;
    }
  });

  return { claimed: true, fromUserId, movedRowCounts };
}
