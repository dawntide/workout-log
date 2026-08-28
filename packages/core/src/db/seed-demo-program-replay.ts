import { and, eq, inArray } from "drizzle-orm";

import { db } from "./client";
import { generatedSession, plan, planProgressEvent, planRuntimeState, workoutLog } from "./schema";
import { generateAndSaveSession } from "../program-engine/generateSession";
import { upsertWorkoutLogService } from "../services/workout-log/upsert-log";
import { DEMO_HISTORY_TAG } from "./seed-demo-history";

/**
 * 테스트 계정용 **프로그램 흐름 재생**.
 *
 * 종전 데모 기록은 workout_log 행을 직접 심었다. 통계·PR·체중 추이는 그것으로 충분했지만
 * 캘린더에는 아무것도 뜨지 않았고(캘린더는 planId로만 조회한다) 세션 전환·자동 진행은
 * 아예 검증할 수 없었다 — 생성 세션도 진행 이벤트도 없었기 때문이다.
 *
 * 그래서 행을 심는 대신 **진짜 경로를 그대로 돌린다**:
 *
 *   generateAndSaveSession()  → 실제 엔진이 세션과 처방을 만든다
 *   upsertWorkoutLogService() → 실제 저장 경로가 PR·진행 이벤트·런타임 상태를 움직인다
 *
 * 그 결과 캘린더·세션 상세·자동 진행이 실사용과 같은 데이터 위에서 동작한다. 처방을
 * 흉내 내지 않으므로 프로그램 로직이 바뀌면 데모도 자동으로 그 로직을 따른다.
 */

/** 재생 대상. LOGIC(SINGLE) 플랜만 — MANUAL은 세션 생성 경로가 다르다. */
export type ReplayPlanName =
  | "Program Tactical Barbell Operator"
  | "Program REF5 Adaptive Strength";

export type SeedProgramReplayOptions = {
  userId: string;
  planName: ReplayPlanName;
  /** 재생할 세션 수. 주 3회 기준 12주면 36. */
  sessionCount?: number;
  timezone?: string;
  locale?: "ko" | "en";
  now?: Date;
};

export type SeedProgramReplaySummary = {
  planId: string;
  sessionCount: number;
  loggedCount: number;
  skipped: number;
};

/**
 * 처방을 그대로 수행한 것으로 기록한다.
 *
 * 실패를 섞지 않는 것은 의도다 — 데모의 목적은 "정상 진행이 어떻게 보이는가"이고,
 * 실패 판정·디로드는 저장 실패 시뮬레이션처럼 **의도적으로** 만들어 봐야 의미가 있다.
 * percent만 있고 무게가 없는 세트는 기록하지 않는다(그 처방은 사용자 입력을 전제한다).
 */
function toLoggedSets(snapshot: unknown): Array<Record<string, unknown>> {
  const snap = snapshot as { exercises?: Array<Record<string, any>> } | null;
  const out: Array<Record<string, unknown>> = [];
  let sortOrder = 0;
  for (const exercise of snap?.exercises ?? []) {
    const sets: Array<Record<string, any>> = Array.isArray(exercise.sets) ? exercise.sets : [];
    sets.forEach((set, index) => {
      const weightKg = typeof set.targetWeightKg === "number" ? set.targetWeightKg : null;
      if (weightKg === null) return;
      out.push({
        exerciseId: exercise.exerciseId ?? null,
        exerciseName: exercise.exerciseName,
        sortOrder: sortOrder++,
        setNumber: index + 1,
        reps: typeof set.reps === "number" ? set.reps : 5,
        weightKg,
      });
    });
  }
  return out;
}

/**
 * 재생 대상 플랜의 상태를 **통째로** 비운다 — 그 플랜의 기록·세션·진행 이벤트·런타임 상태.
 *
 * 태그로 좁히지 않는 건 의도다. 재생은 1주차부터 상태를 다시 쌓는데, 사용자가 그 플랜에
 * 남긴 기록이 섞여 있으면 진행 판정이 두 이력의 뒤섞임이 되어 무엇을 보고 있는지 알 수
 * 없게 된다. 테스트 계정 전용이고, 다른 플랜과 태그 없는 기록은 건드리지 않는다.
 */
async function clearReplayForPlan(userId: string, planId: string): Promise<void> {
  const logs = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(and(eq(workoutLog.userId, userId), eq(workoutLog.planId, planId)));
  const logIds = logs.map((row) => row.id);

  // 진행 이벤트는 로그·플랜 FK의 cascade로 함께 사라지지만, 재생은 런타임 상태를 처음부터
  // 다시 쌓아야 하므로 명시적으로 비운다 — 남아 있으면 두 번째 재생이 79주차에서 시작한다.
  if (logIds.length > 0) {
    await db.delete(planProgressEvent).where(inArray(planProgressEvent.logId, logIds));
    await db.delete(workoutLog).where(inArray(workoutLog.id, logIds));
  }
  await db.delete(generatedSession).where(eq(generatedSession.planId, planId));
  await db.delete(planRuntimeState).where(eq(planRuntimeState.planId, planId));
}

export async function seedDemoProgramReplay({
  userId,
  planName,
  sessionCount = 36,
  timezone = "Asia/Seoul",
  locale = "ko",
  now = new Date(),
}: SeedProgramReplayOptions): Promise<SeedProgramReplaySummary> {
  const [target] = await db
    .select({ id: plan.id })
    .from(plan)
    .where(and(eq(plan.userId, userId), eq(plan.name, planName)))
    .limit(1);
  if (!target) {
    throw new Error(`demo replay plan not found: ${planName}`);
  }

  await clearReplayForPlan(userId, target.id);

  let loggedCount = 0;
  let skipped = 0;

  // 주 3회(월·수·금 간격)로 과거에서 현재로 채운다. 마지막 세션이 어제가 되도록 하루
  // 당긴다 — 오늘로 두면 실행 시각에 따라 미래로 밀려 빠진다(데모 기록에서 겪었다).
  for (let index = 0; index < sessionCount; index += 1) {
    const daysAgo = (sessionCount - 1 - index) * 2 + 1;
    const performedAt = new Date(now);
    performedAt.setUTCDate(performedAt.getUTCDate() - daysAgo);
    performedAt.setUTCHours(9, 0, 0, 0);

    // **첫 세션만 주차를 고정한다.** 런타임 상태를 비운 직후의 첫 생성은 상태가 없어
    // sessionKeyMode="DATE" 경로로 떨어지고, 시드 플랜의 startDate가 과거라 79주차 같은
    // 값이 나온다(실측). 이후 세션은 저장이 올린 상태를 이어받으므로 건드리지 않는다.
    const generated = (await generateAndSaveSession({
      userId,
      planId: target.id,
      timezone,
      ...(index === 0 ? { week: 1, day: 1 } : {}),
    })) as { id: string; snapshot: unknown };

    const sets = toLoggedSets(generated.snapshot);
    if (sets.length === 0) {
      // 처방이 사용자 입력을 전제하는 세션(percent만 있는 경우)은 건너뛴다.
      skipped += 1;
      continue;
    }

    await upsertWorkoutLogService({
      userId,
      planId: target.id,
      generatedSessionId: generated.id,
      timezone,
      locale,
      performedAt,
      notes: `demo replay · ${planName}`,
      tags: [DEMO_HISTORY_TAG],
      sets: sets as never,
    });
    loggedCount += 1;
  }

  return { planId: target.id, sessionCount, loggedCount, skipped };
}
