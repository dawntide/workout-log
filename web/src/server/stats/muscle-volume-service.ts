import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { exercise, workoutLog, workoutSet } from "@/server/db/schema";
import {
  aggregateMuscleVolumeRows,
  type MuscleVolumeTotal,
  type MuscleVolumeWeekPoint,
} from "@/server/stats/muscle-volume-aggregate";
import { getStatsCache, setStatsCache } from "@/server/stats/cache";

export type { MuscleVolumeTotal, MuscleVolumeWeekPoint };
export type MuscleVolumeResult = {
  from: string;
  to: string;
  rangeDays: number;
  weekly: MuscleVolumeWeekPoint[];
  totals: MuscleVolumeTotal[];
};

export async function fetchMuscleVolume({
  userId,
  from,
  to,
  rangeDays,
}: {
  userId: string;
  from: Date;
  to: Date;
  rangeDays: number;
}): Promise<MuscleVolumeResult> {
  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rangeDays,
  };

  const cached = await getStatsCache<MuscleVolumeResult>({
    userId,
    metric: "muscle_volume_v1",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const periodExpr = sql`date_trunc('week', ${workoutLog.performedAt} at time zone 'UTC')`;

  const rows = await db
    .select({
      weekStart: sql<string>`to_char(${periodExpr}, 'YYYY-MM-DD')`,
      exerciseName: workoutSet.exerciseName,
      category: exercise.category,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      meta: workoutSet.meta,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .leftJoin(exercise, eq(exercise.id, workoutSet.exerciseId))
    .where(
      and(
        eq(workoutLog.userId, userId),
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        sql`${workoutSet.reps} is not null`,
      ),
    );

  const { weekly, totals } = aggregateMuscleVolumeRows(
    rows.map((row) => ({
      weekStart: String(row.weekStart),
      exerciseName: String(row.exerciseName ?? ""),
      category: row.category,
      weightKg: row.weightKg,
      reps: row.reps,
      meta: row.meta as Record<string, unknown> | null | undefined,
    })),
  );

  const payload: MuscleVolumeResult = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    weekly,
    totals,
  };

  void setStatsCache({
    userId,
    metric: "muscle_volume_v1",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
