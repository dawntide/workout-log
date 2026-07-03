import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import { db } from "@/server/db/client";
import { exercise, plan, workoutLog, workoutSet } from "@/server/db/schema";
import { getExerciseById, resolveExerciseByName } from "@/server/exercise/resolve";
import { getStatsCache, setStatsCache } from "@/server/stats/cache";

export type E1RMPoint = {
  date: string;
  e1rm: number;
  weightKg: number;
  reps: number;
};

export type E1RMResponse = {
  from: string;
  to: string;
  rangeDays: number;
  exercise: string | null;
  exerciseId: string | null;
  best: E1RMPoint | null;
  series: E1RMPoint[];
};

export type Stats1RMFilterOptions = {
  exercises: Array<{ id: string; name: string }>;
  plans: Array<{ id: string; name: string }>;
};

function epley1RM(weightKg: number, reps: number) {
  return weightKg * (1 + reps / 30);
}

async function resolveExerciseSelection({
  exerciseId,
  exerciseName,
}: {
  exerciseId?: string | null;
  exerciseName?: string | null;
}) {
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

  return { resolvedExerciseId, resolvedExerciseName };
}

export async function fetchStats1RMFilterOptions(userId: string): Promise<Stats1RMFilterOptions> {
  const [exerciseRows, planRows] = await Promise.all([
    db.select({ id: exercise.id, name: exercise.name }).from(exercise).orderBy(exercise.name).limit(200),
    db.select({ id: plan.id, name: plan.name }).from(plan).where(eq(plan.userId, userId)).orderBy(desc(plan.createdAt)),
  ]);

  return {
    exercises: exerciseRows,
    plans: planRows,
  };
}

export async function fetchE1rmStats({
  userId,
  from,
  to,
  rangeDays,
  planId,
  exerciseId,
  exerciseName,
}: {
  userId: string;
  from: Date;
  to: Date;
  rangeDays: number;
  planId?: string | null;
  exerciseId?: string | null;
  exerciseName?: string | null;
}): Promise<E1RMResponse> {
  if (!exerciseId && !exerciseName) {
    throw new Error("exerciseId or exercise is required");
  }

  const normalizedPlanId = planId?.trim() ?? "";
  const { resolvedExerciseId, resolvedExerciseName } = await resolveExerciseSelection({
    exerciseId,
    exerciseName,
  });

  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    planId: normalizedPlanId || null,
    exerciseId: resolvedExerciseId,
    exerciseName: resolvedExerciseName ?? exerciseName ?? null,
  };

  const cached = await getStatsCache<E1RMResponse>({
    userId,
    metric: "e1rm_best",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const exerciseFilter = resolvedExerciseId
    ? resolvedExerciseName
      ? or(
          eq(workoutSet.exerciseId, resolvedExerciseId),
          and(
            sql`${workoutSet.exerciseId} is null`,
            sql`lower(${workoutSet.exerciseName}) = lower(${resolvedExerciseName})`,
          ),
        )
      : eq(workoutSet.exerciseId, resolvedExerciseId)
    : sql`lower(${workoutSet.exerciseName}) = lower(${resolvedExerciseName ?? exerciseName ?? ""})`;

  const rows = await db
    .select({
      performedAt: workoutLog.performedAt,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      exerciseName: workoutSet.exerciseName,
      meta: workoutSet.meta,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(
      and(
        eq(workoutLog.userId, userId),
        normalizedPlanId ? eq(workoutLog.planId, normalizedPlanId) : undefined,
        exerciseFilter,
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        sql`${workoutSet.weightKg} is not null`,
        sql`${workoutSet.reps} is not null`,
      ),
    )
    .orderBy(desc(workoutLog.performedAt))
    .limit(5000);

  const points = rows
    .map((row) => {
      const weightKg = resolveLoggedTotalLoadKg({
        exerciseName: String(row.exerciseName ?? resolvedExerciseName ?? exerciseName ?? ""),
        weightKg: row.weightKg,
        meta: row.meta as Record<string, unknown> | null | undefined,
      });
      const reps = Number(row.reps ?? 0);
      if (!weightKg || !reps) return null;
      return {
        performedAt: row.performedAt,
        weightKg,
        reps,
        e1rm: Math.round(epley1RM(weightKg, reps) * 10) / 10,
      };
    })
    .filter(Boolean) as Array<{ performedAt: Date; weightKg: number; reps: number; e1rm: number }>;

  const bestByDay = new Map<string, (typeof points)[number]>();
  for (const point of points) {
    const dayKey = point.performedAt.toISOString().slice(0, 10);
    const current = bestByDay.get(dayKey);
    if (!current || point.e1rm > current.e1rm) {
      bestByDay.set(dayKey, point);
    }
  }

  const series = Array.from(bestByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, point]) => ({
      date,
      e1rm: Number(point.e1rm),
      weightKg: Number(point.weightKg),
      reps: Number(point.reps),
    }));

  const best = series.reduce((acc, point) => (!acc || point.e1rm > acc.e1rm ? point : acc), null as E1RMPoint | null);

  const payload: E1RMResponse = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    exercise: resolvedExerciseName ?? exerciseName ?? resolvedExerciseId ?? null,
    exerciseId: resolvedExerciseId,
    best,
    series,
  };

  // PERF: fire-and-forget 캐시 쓰기 → 응답 지연 없이 캐시 갱신
  void setStatsCache({
    userId,
    metric: "e1rm_best",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
