import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { excludeWarmupSets } from "@workout/core/stats/set-type-filter";
import { workoutLog, workoutSet } from "@workout/core/db/schema";
import { getStatsCache, setStatsCache } from "./cache";

export type EnduranceWeekPoint = {
  weekStart: string;
  totalMinutes: number;
  sessionCount: number;
  totalReps: number;
};

export type EnduranceWeekdayCount = {
  weekday: number;
  sessionCount: number;
};

export type EnduranceResult = {
  from: string;
  to: string;
  rangeDays: number;
  weekly: EnduranceWeekPoint[];
  weekdayDistribution: EnduranceWeekdayCount[];
  totals: {
    totalMinutes: number;
    sessionCount: number;
    totalReps: number;
    averageSessionMinutes: number | null;
  };
};

export async function fetchEnduranceStats({
  userId,
  from,
  to,
  rangeDays,
}: {
  userId: string;
  from: Date;
  to: Date;
  rangeDays: number;
}): Promise<EnduranceResult> {
  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rangeDays,
  };

  const cached = await getStatsCache<EnduranceResult>({
    userId,
    metric: "endurance_v1",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const periodExprLog = sql`date_trunc('week', ${workoutLog.performedAt} at time zone 'UTC')`;

  const baseWhere = and(
    eq(workoutLog.userId, userId),
    gte(workoutLog.performedAt, from),
    lte(workoutLog.performedAt, to),
  );

  const [sessionRows, repsRows, weekdayRows] = await Promise.all([
    db
      .select({
        weekStart: sql<string>`to_char(${periodExprLog}, 'YYYY-MM-DD')`,
        totalMinutes: sql<number>`coalesce(sum(${workoutLog.durationMinutes}), 0)`,
        sessionCount: sql<number>`count(*)`,
      })
      .from(workoutLog)
      .where(baseWhere)
      .groupBy(periodExprLog)
      .orderBy(periodExprLog),
    db
      .select({
        weekStart: sql<string>`to_char(${periodExprLog}, 'YYYY-MM-DD')`,
        totalReps: sql<number>`coalesce(sum(${workoutSet.reps}), 0)`,
      })
      .from(workoutLog)
      .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
      // baseWhere는 workoutSet을 조인하지 않는 세션 쿼리와 공유한다 — 세트 조건은
      // 여기서만 얹는다(공유 쪽에 넣으면 조인 없는 쿼리가 깨진다).
      .where(and(baseWhere, excludeWarmupSets()))
      .groupBy(periodExprLog)
      .orderBy(periodExprLog),
    db
      .select({
        weekday: sql<number>`extract(dow from ${workoutLog.performedAt} at time zone 'UTC')`,
        sessionCount: sql<number>`count(*)`,
      })
      .from(workoutLog)
      .where(baseWhere)
      .groupBy(sql`extract(dow from ${workoutLog.performedAt} at time zone 'UTC')`),
  ]);

  const repsByWeek = new Map<string, number>();
  for (const row of repsRows) {
    repsByWeek.set(String(row.weekStart), Number(row.totalReps ?? 0));
  }

  const weekly: EnduranceWeekPoint[] = sessionRows.map((row) => ({
    weekStart: String(row.weekStart),
    totalMinutes: Number(row.totalMinutes ?? 0),
    sessionCount: Number(row.sessionCount ?? 0),
    totalReps: repsByWeek.get(String(row.weekStart)) ?? 0,
  }));

  const weekdayDistribution: EnduranceWeekdayCount[] = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    sessionCount: 0,
  }));
  for (const row of weekdayRows) {
    const idx = Math.max(0, Math.min(6, Math.trunc(Number(row.weekday ?? 0))));
    weekdayDistribution[idx].sessionCount = Number(row.sessionCount ?? 0);
  }

  const totalMinutes = weekly.reduce((sum, w) => sum + w.totalMinutes, 0);
  const sessionCount = weekly.reduce((sum, w) => sum + w.sessionCount, 0);
  const totalReps = weekly.reduce((sum, w) => sum + w.totalReps, 0);
  const averageSessionMinutes =
    sessionCount > 0 ? Math.round((totalMinutes / sessionCount) * 10) / 10 : null;

  const payload: EnduranceResult = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    weekly,
    weekdayDistribution,
    totals: {
      totalMinutes,
      sessionCount,
      totalReps,
      averageSessionMinutes,
    },
  };

  void setStatsCache({
    userId,
    metric: "endurance_v1",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
