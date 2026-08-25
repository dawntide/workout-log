// Asymptote × Async Hybrid — 드라이버 e1RM 모니터 서비스 (`asymptote-async-hybrid.md` §3.5 노출).
// 사용자의 활성 asymptote(하이브리드) 플랜이 있을 때만, 드라이버(SQ/BP/PULL) 탑세트 e1RM의
// 7세션 이동평균 추세를 산출한다. 순수 집계/추세 로직은 program-engine/asymptote-monitor에 위임.

import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { bodyweightAsOf } from "@workout/core/stats/bodyweight-timeline";
import { loadBodyweightTimeline } from "@workout/core/stats/bodyweight-service";
import { excludeWarmupSets } from "@workout/core/stats/set-type-filter";
import { plan, programTemplate, programVersion, workoutLog, workoutSet } from "@workout/core/db/schema";
import {
  ASYMPTOTE_DRIVERS,
  ASYMPTOTE_MONITOR_WINDOW,
  aggregateDriverExposures,
  type BodyweightResolver,
  asymptoteDriverTrend,
  type DriverKey,
  type DriverTrendDirection,
  type LoggedSetRow,
} from "@workout/core/program-engine/asymptote-monitor";

export type AsymptoteMonitorDriver = {
  target: DriverKey;
  trend: DriverTrendDirection;
  latestMovingAvg: number | null;
  latestE1rm: number | null;
  exposures: number;
};

export type AsymptoteMonitorResult = {
  planId: string;
  window: number;
  bodyweightKg: number | null;
  drivers: AsymptoteMonitorDriver[];
};

const MONITOR_LOOKBACK_DAYS = 180;

// 활성(비보관) asymptote 플랜 1건. base LOGIC(kind=asymptote)·slug·fork(programFamily) 모두 커버.
async function findActiveAsymptotePlanId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: plan.id })
    .from(plan)
    .innerJoin(programVersion, eq(plan.rootProgramVersionId, programVersion.id))
    .innerJoin(programTemplate, eq(programVersion.templateId, programTemplate.id))
    .where(
      and(
        eq(plan.userId, userId),
        eq(plan.isArchived, false),
        or(
          eq(programTemplate.slug, "asymptote-protocol"),
          sql`${programVersion.definition}->>'kind' = 'asymptote'`,
          sql`${programVersion.definition}->>'programFamily' = 'asymptote'`,
        ),
      ),
    )
    .orderBy(desc(plan.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function fetchAsymptoteDriverMonitor(input: {
  userId: string;
  bodyweightKg: number | null;
}): Promise<AsymptoteMonitorResult | null> {
  const planId = await findActiveAsymptotePlanId(input.userId);
  if (!planId) return null;

  const since = new Date();
  since.setDate(since.getDate() - MONITOR_LOOKBACK_DAYS);

  const rows = await db
    .select({
      performedAt: workoutLog.performedAt,
      exerciseName: workoutSet.exerciseName,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(
      and(
        eq(workoutLog.userId, input.userId),
        eq(workoutLog.planId, planId),
        gte(workoutLog.performedAt, since),
        sql`${workoutSet.weightKg} is not null`,
        sql`${workoutSet.reps} is not null`,
        excludeWarmupSets(),
      ),
    )
    .orderBy(workoutLog.performedAt)
    .limit(5000);

  // 그 세션 날짜의 체중을 쓴다. 이력이 없거나 첫 기록보다 이전인 노출은 설정의
  // 현재값으로 떨어진다(기록 이전 체중을 지어내지 않는다).
  const timeline = await loadBodyweightTimeline(input.userId);
  const resolveBodyweight: BodyweightResolver = (day) =>
    bodyweightAsOf(timeline, new Date(`${day}T23:59:59.999Z`)) ?? input.bodyweightKg;

  const exposuresByDriver = aggregateDriverExposures(rows as LoggedSetRow[], resolveBodyweight);

  const drivers: AsymptoteMonitorDriver[] = ASYMPTOTE_DRIVERS.map((target) => {
    const exposures = exposuresByDriver[target];
    const result = asymptoteDriverTrend(exposures);
    const latestE1rm = result.points.at(-1)?.e1rm ?? null;
    return {
      target,
      trend: result.trend,
      latestMovingAvg: result.latestMovingAvg,
      latestE1rm,
      exposures: exposures.length,
    };
  });

  // 노출이 전무하면(드라이버 데이터 없음) 표시할 게 없으므로 null.
  if (drivers.every((d) => d.exposures === 0)) return null;

  return {
    planId,
    window: ASYMPTOTE_MONITOR_WINDOW,
    bodyweightKg: input.bodyweightKg,
    drivers,
  };
}
