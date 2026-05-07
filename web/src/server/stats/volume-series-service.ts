import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { exercise, workoutLog, workoutSet } from "@/server/db/schema";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { getExerciseById, resolveExerciseByName } from "@/server/exercise/resolve";
import { getStatsCache, setStatsCache } from "@/server/stats/cache";

export type VolumeBucket = "day" | "week" | "month";

export type VolumeSeriesPoint = {
  period: string;
  tonnage: number;
  reps: number;
  sets: number;
};

export type VolumePerExerciseEntry = {
  exerciseId: string | null;
  exerciseName: string;
  totals: { tonnage: number; reps: number; sets: number };
  series: VolumeSeriesPoint[];
};

export type VolumeSeriesResult = {
  from: string;
  to: string;
  rangeDays: number;
  bucket: VolumeBucket;
  exerciseId: string | null;
  exercise: string | null;
  series: VolumeSeriesPoint[];
  byExercise?: VolumePerExerciseEntry[];
};

export async function fetchVolumeSeries({
  userId,
  from,
  to,
  rangeDays,
  bucket = "week",
  exerciseId,
  exerciseName,
  perExercise = false,
  maxExercises = 12,
}: {
  userId: string;
  from: Date;
  to: Date;
  rangeDays: number;
  bucket?: VolumeBucket;
  exerciseId?: string | null;
  exerciseName?: string | null;
  perExercise?: boolean;
  maxExercises?: number;
}): Promise<VolumeSeriesResult> {
  const locale = await resolveRequestLocale();
  const normalizedExerciseId = exerciseId?.trim() ?? "";
  const normalizedExerciseName = exerciseName?.trim() ?? "";

  let resolvedExerciseId: string | null = null;
  let resolvedExerciseName: string | null = null;
  if (normalizedExerciseId) {
    const byId = await getExerciseById(normalizedExerciseId);
    if (byId) {
      resolvedExerciseId = byId.id;
      resolvedExerciseName = byId.name;
    } else {
      resolvedExerciseId = normalizedExerciseId;
    }
  } else if (normalizedExerciseName) {
    const resolved = await resolveExerciseByName(normalizedExerciseName);
    if (resolved) {
      resolvedExerciseId = resolved.id;
      resolvedExerciseName = resolved.name;
    } else {
      resolvedExerciseName = normalizedExerciseName;
    }
  }

  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    bucket,
    exerciseId: resolvedExerciseId,
    exerciseName: resolvedExerciseName ?? normalizedExerciseName ?? null,
    perExercise,
    maxExercises,
  };

  const cached = await getStatsCache<VolumeSeriesResult>({
    userId,
    metric: "volume_series",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const filterByExercise = resolvedExerciseId
    ? resolvedExerciseName
      ? or(
          eq(workoutSet.exerciseId, resolvedExerciseId),
          and(
            sql`${workoutSet.exerciseId} is null`,
            sql`lower(${workoutSet.exerciseName}) = lower(${resolvedExerciseName})`,
          ),
        )
      : eq(workoutSet.exerciseId, resolvedExerciseId)
    : resolvedExerciseName
      ? sql`lower(${workoutSet.exerciseName}) = lower(${resolvedExerciseName})`
      : undefined;

  const unitSql = sql.raw(`'${bucket}'`);
  const periodExpr = sql`date_trunc(${unitSql}, ${workoutLog.performedAt} at time zone 'UTC')`;

  const baseWhere = and(
    eq(workoutLog.userId, userId),
    gte(workoutLog.performedAt, from),
    lte(workoutLog.performedAt, to),
  );
  const where = filterByExercise ? and(baseWhere, filterByExercise) : baseWhere;

  const rows = await db
    .select({
      period: sql<string>`to_char(${periodExpr}, 'YYYY-MM-DD')`,
      tonnage: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)`,
      reps: sql<number>`coalesce(sum(${workoutSet.reps}), 0)`,
      sets: sql<number>`count(*)`,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(where)
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  const series: VolumeSeriesPoint[] = rows.map((r) => ({
    period: r.period,
    tonnage: Number(r.tonnage ?? 0),
    reps: Number(r.reps ?? 0),
    sets: Number(r.sets ?? 0),
  }));

  let byExercise: VolumePerExerciseEntry[] | undefined;

  if (perExercise) {
    const keyExpr = sql<string>`coalesce(${workoutSet.exerciseId}::text, lower(${workoutSet.exerciseName}))`;
    const idExpr = workoutSet.exerciseId;
    const nameExpr = sql<string>`coalesce(${exercise.name}, ${workoutSet.exerciseName})`;

    const perRows = await db
      .select({
        exerciseKey: keyExpr,
        exerciseId: idExpr,
        exerciseName: nameExpr,
        period: sql<string>`to_char(${periodExpr}, 'YYYY-MM-DD')`,
        tonnage: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)`,
        reps: sql<number>`coalesce(sum(${workoutSet.reps}), 0)`,
        sets: sql<number>`count(*)`,
      })
      .from(workoutLog)
      .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
      .leftJoin(exercise, eq(exercise.id, workoutSet.exerciseId))
      .where(where)
      .groupBy(keyExpr, idExpr, nameExpr, periodExpr)
      .orderBy(periodExpr);

    const grouped = new Map<string, VolumePerExerciseEntry>();
    for (const r of perRows) {
      const key = String(r.exerciseKey ?? "unknown");
      if (!grouped.has(key)) {
        grouped.set(key, {
          exerciseId: r.exerciseId ?? null,
          exerciseName: String(
            r.exerciseName ?? (locale === "ko" ? "알 수 없는 운동" : "Unknown Exercise"),
          ),
          totals: { tonnage: 0, reps: 0, sets: 0 },
          series: [],
        });
      }
      const bucketRow: VolumeSeriesPoint = {
        period: String(r.period),
        tonnage: Number(r.tonnage ?? 0),
        reps: Number(r.reps ?? 0),
        sets: Number(r.sets ?? 0),
      };
      const g = grouped.get(key)!;
      g.series.push(bucketRow);
      g.totals.tonnage += bucketRow.tonnage;
      g.totals.reps += bucketRow.reps;
      g.totals.sets += bucketRow.sets;
    }

    byExercise = Array.from(grouped.values())
      .sort((a, b) => b.totals.tonnage - a.totals.tonnage)
      .slice(0, maxExercises);
  }

  const payload: VolumeSeriesResult = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    bucket,
    exerciseId: resolvedExerciseId,
    exercise: resolvedExerciseName ?? normalizedExerciseName ?? null,
    series,
    byExercise,
  };

  void setStatsCache({
    userId,
    metric: "volume_series",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
