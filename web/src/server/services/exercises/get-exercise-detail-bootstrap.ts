import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import { db } from "@/server/db/client";
import { exercise, workoutLog, workoutSet } from "@/server/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { fetchE1rmStats } from "@/server/stats/e1rm-service";
import { getStatsCache, setStatsCache } from "@/server/stats/cache";
import type { E1RMPoint, E1RMResponse } from "@/server/stats/e1rm-service";

const LOOKBACK_DAYS = 90;
const RECENT_SETS_LIMIT = 30;
const PR_HISTORY_LIMIT = 5;

export type ExerciseDetailSet = {
  performedAt: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  logId: string;
};

export type ExerciseDetailPrPoint = {
  date: string;
  e1rm: number;
  weightKg: number;
  reps: number;
};

export type ExerciseDetailBootstrap =
  | { exercise: null }
  | {
      exercise: { id: string; name: string; category: string | null };
      bestE1rm: E1RMPoint | null;
      e1rmSeries: E1RMPoint[];
      recentSets: ExerciseDetailSet[];
      prHistory: ExerciseDetailPrPoint[];
      sessions90d: number;
      totalVolume90d: number;
      avgRpe90d: number | null;
      rangeFrom: string;
      rangeTo: string;
    };

function createDefault90dRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - LOOKBACK_DAYS);
  const rangeMs = Math.max(1, to.getTime() - from.getTime());
  const rangeDays = Math.max(1, Math.ceil(rangeMs / 86_400_000));
  return { from, to, rangeDays };
}

function buildExerciseFilter(exerciseId: string, exerciseName: string) {
  return or(
    eq(workoutSet.exerciseId, exerciseId),
    and(
      sql`${workoutSet.exerciseId} is null`,
      sql`lower(${workoutSet.exerciseName}) = lower(${exerciseName})`,
    ),
  );
}

async function fetchRecentSets(
  userId: string,
  exerciseId: string,
  exerciseName: string,
): Promise<ExerciseDetailSet[]> {
  const rows = await db
    .select({
      logId: workoutLog.id,
      performedAt: workoutLog.performedAt,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      rpe: workoutSet.rpe,
      meta: workoutSet.meta,
      exerciseName: workoutSet.exerciseName,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(
      and(
        eq(workoutLog.userId, userId),
        buildExerciseFilter(exerciseId, exerciseName),
        sql`${workoutSet.weightKg} is not null`,
        sql`${workoutSet.reps} is not null`,
      ),
    )
    .orderBy(desc(workoutLog.performedAt), desc(workoutSet.sortOrder))
    .limit(RECENT_SETS_LIMIT);

  return rows
    .map((row) => {
      const weightKg = resolveLoggedTotalLoadKg({
        exerciseName: String(row.exerciseName ?? exerciseName ?? ""),
        weightKg: row.weightKg,
        meta: row.meta as Record<string, unknown> | null | undefined,
      });
      const reps = Number(row.reps ?? 0);
      if (!weightKg || !reps) return null;
      return {
        logId: String(row.logId),
        performedAt: new Date(row.performedAt).toISOString(),
        weightKg,
        reps,
        rpe: row.rpe == null ? null : Number(row.rpe),
      };
    })
    .filter((entry): entry is ExerciseDetailSet => entry !== null);
}

async function fetchExerciseSummary(
  userId: string,
  exerciseId: string,
  exerciseName: string,
  from: Date,
  to: Date,
): Promise<{ sessions: number; totalVolume: number; avgRpe: number | null }> {
  const rows = await db
    .select({
      sessions: sql<number>`count(distinct ${workoutLog.id})`,
      totalVolume: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)`,
      avgRpe: sql<number | null>`avg(${workoutSet.rpe})`,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(
      and(
        eq(workoutLog.userId, userId),
        buildExerciseFilter(exerciseId, exerciseName),
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        sql`${workoutSet.weightKg} is not null`,
        sql`${workoutSet.reps} is not null`,
      ),
    );

  const row = rows[0];
  const avgRpeRaw = row?.avgRpe;
  const avgRpe =
    avgRpeRaw == null || Number.isNaN(Number(avgRpeRaw))
      ? null
      : Math.round(Number(avgRpeRaw) * 10) / 10;

  return {
    sessions: Number(row?.sessions ?? 0),
    totalVolume: Math.round(Number(row?.totalVolume ?? 0)),
    avgRpe,
  };
}

function deriveProgressivePrPoints(series: E1RMPoint[]): ExerciseDetailPrPoint[] {
  const prs: ExerciseDetailPrPoint[] = [];
  let runningMax = -Infinity;
  for (const point of series) {
    if (point.e1rm > runningMax) {
      runningMax = point.e1rm;
      prs.push({
        date: point.date,
        e1rm: point.e1rm,
        weightKg: point.weightKg,
        reps: point.reps,
      });
    }
  }
  // 최근 PR이 가장 위로 보이도록 desc 정렬 후 limit
  return prs.slice(-PR_HISTORY_LIMIT).reverse();
}

export async function getExerciseDetailBootstrap(
  exerciseIdRaw: string,
): Promise<ExerciseDetailBootstrap> {
  const exerciseId = exerciseIdRaw?.trim() ?? "";
  if (!exerciseId) return { exercise: null };

  const exerciseRows = await db
    .select({
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
    })
    .from(exercise)
    .where(eq(exercise.id, exerciseId))
    .limit(1);
  const exerciseRow = exerciseRows[0];
  if (!exerciseRow) return { exercise: null };

  const userId = await requireAuthenticatedUserId();
  const { from, to, rangeDays } = createDefault90dRange();

  const cacheParams = {
    exerciseId: exerciseRow.id,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };

  const cached = await getStatsCache<ExerciseDetailBootstrap>({
    userId,
    metric: "exercise_detail_v1",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const [e1rm, recentSets, summary] = await Promise.all([
    fetchE1rmStats({
      userId,
      exerciseId: exerciseRow.id,
      exerciseName: exerciseRow.name,
      from,
      to,
      rangeDays,
    }) as Promise<E1RMResponse>,
    fetchRecentSets(userId, exerciseRow.id, exerciseRow.name),
    fetchExerciseSummary(userId, exerciseRow.id, exerciseRow.name, from, to),
  ]);

  const payload: ExerciseDetailBootstrap = {
    exercise: {
      id: exerciseRow.id,
      name: exerciseRow.name,
      category: exerciseRow.category ?? null,
    },
    bestE1rm: e1rm.best,
    e1rmSeries: e1rm.series,
    recentSets,
    prHistory: deriveProgressivePrPoints(e1rm.series),
    sessions90d: summary.sessions,
    totalVolume90d: summary.totalVolume,
    avgRpe90d: summary.avgRpe,
    rangeFrom: e1rm.from,
    rangeTo: e1rm.to,
  };

  void setStatsCache({
    userId,
    metric: "exercise_detail_v1",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
