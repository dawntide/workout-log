import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import {
  isBodyweightExerciseName,
  readLoggedBodyweightTotalLoadKg,
  resolveLoggedTotalLoadKg,
} from "@workout/core/bodyweight-load";
import { db } from "@workout/core/db/client";
import { exercise, workoutLog, workoutSet } from "@workout/core/db/schema";
import type { AppLocale } from "../locale";
import { getExerciseById, resolveExerciseByName } from "@workout/core/exercise/resolve";
import { getStatsCache, setStatsCache } from "./cache";

function epley1RM(weightKg: number, reps: number) {
  return weightKg * (1 + reps / 30);
}

export type PrPoint = {
  date: string;
  e1rm: number;
  weightKg: number;
  reps: number;
};

export type PrItem = {
  exerciseId: string | null;
  exerciseName: string;
  best: PrPoint;
  latest: PrPoint;
  improvement: number;
};

type PrItemInternal = {
  exerciseId: string | null;
  exerciseName: string;
  first: PrPoint;
  best: PrPoint;
  latest: PrPoint;
};

export type FetchPrsResult = {
  from: string;
  to: string;
  rangeDays: number;
  items: PrItem[];
  resolvedExerciseId: string | null;
  resolvedExerciseName: string | null;
};

export async function fetchPrsList({
  userId,
  from,
  to,
  rangeDays,
  exerciseId,
  exerciseName,
  limit,
  locale,
  maxReps,
  requireBodyweightTotalLoad,
}: {
  userId: string;
  from: Date;
  to: Date;
  rangeDays: number;
  exerciseId?: string | null;
  exerciseName?: string | null;
  limit: number;
  locale: AppLocale;
  maxReps?: number | null;
  requireBodyweightTotalLoad?: boolean;
}): Promise<FetchPrsResult> {
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
    exerciseId: resolvedExerciseId,
    exerciseName: resolvedExerciseName ?? normalizedExerciseName ?? null,
    limit,
    maxReps:
      Number.isFinite(Number(maxReps)) && Number(maxReps) > 0
        ? Math.floor(Number(maxReps))
        : null,
    requireBodyweightTotalLoad: Boolean(requireBodyweightTotalLoad),
  };

  const cached = await getStatsCache<FetchPrsResult>({
    userId,
    metric: "prs",
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
    : resolvedExerciseName
      ? sql`lower(${workoutSet.exerciseName}) = lower(${resolvedExerciseName})`
      : undefined;

  const repCap = cacheParams.maxReps
    ? lte(workoutSet.reps, cacheParams.maxReps)
    : undefined;
  const baseWhere = and(
    eq(workoutLog.userId, userId),
    gte(workoutLog.performedAt, from),
    lte(workoutLog.performedAt, to),
    sql`${workoutSet.weightKg} is not null`,
    sql`${workoutSet.reps} > 0`,
    repCap,
  );
  const where = exerciseFilter ? and(baseWhere, exerciseFilter) : baseWhere;

  const rows = await db
    .select({
      performedAt: workoutLog.performedAt,
      exerciseId: workoutSet.exerciseId,
      exerciseName: sql<string>`coalesce(${exercise.name}, ${workoutSet.exerciseName})`,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      meta: workoutSet.meta,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .leftJoin(exercise, eq(exercise.id, workoutSet.exerciseId))
    .where(where)
    .orderBy(workoutLog.performedAt);

  const byExercise = new Map<string, PrItemInternal>();
  for (const r of rows) {
    const exerciseName = String(r.exerciseName ?? "");
    const meta = r.meta as Record<string, unknown> | null | undefined;
    const bodyweightTotalLoadKg = readLoggedBodyweightTotalLoadKg(meta);
    if (
      cacheParams.requireBodyweightTotalLoad &&
      isBodyweightExerciseName(exerciseName) &&
      (bodyweightTotalLoadKg === null || bodyweightTotalLoadKg <= 0)
    ) {
      continue;
    }
    const weightKg = resolveLoggedTotalLoadKg({
      exerciseName,
      weightKg: r.weightKg,
      meta,
    });
    const reps = Number(r.reps ?? 0);
    if (!weightKg || !reps) continue;

    const e1rm = Math.round(epley1RM(weightKg, reps) * 10) / 10;
    const date = new Date(r.performedAt).toISOString().slice(0, 10);
    const point: PrPoint = { date, e1rm, weightKg, reps };

    const key = r.exerciseId ?? String(r.exerciseName ?? "").trim().toLowerCase();
    if (!key) continue;

    if (!byExercise.has(key)) {
      byExercise.set(key, {
        exerciseId: r.exerciseId ?? null,
        exerciseName:
          exerciseName || (locale === "ko" ? "알 수 없는 운동" : "Unknown Exercise"),
        first: point,
        best: point,
        latest: point,
      });
      continue;
    }

    const cur = byExercise.get(key)!;
    if (point.e1rm > cur.best.e1rm) {
      cur.best = point;
    }
    if (
      point.date > cur.latest.date ||
      (point.date === cur.latest.date && point.e1rm >= cur.latest.e1rm)
    ) {
      cur.latest = point;
    }
  }

  const items = Array.from(byExercise.values())
    .map((x) => ({
      exerciseId: x.exerciseId,
      exerciseName: x.exerciseName,
      best: x.best,
      latest: x.latest,
      improvement: Math.round((x.best.e1rm - x.first.e1rm) * 10) / 10,
    }))
    .sort((a, b) => b.best.e1rm - a.best.e1rm)
    .slice(0, limit);

  const payload: FetchPrsResult = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    items,
    resolvedExerciseId,
    resolvedExerciseName: resolvedExerciseName ?? normalizedExerciseName ?? null,
  };

  void setStatsCache({
    userId,
    metric: "prs",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
