import { estimateE1rmKg } from "./e1rm";
import { excludeWarmupSets } from "@workout/core/stats/set-type-filter";
import { db } from "@workout/core/db/client";
import { exercise, workoutLog, workoutSet } from "@workout/core/db/schema";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import type { AppLocale } from "../locale";
import { getStatsCache, setStatsCache } from "./cache";

// ─── 1RM Helpers ──────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrPoint = { date: string; e1rm: number; weightKg: number; reps: number };

export type PrItem = {
  exerciseId: string | null;
  exerciseName: string;
  best: PrPoint;
  latest: PrPoint;
  improvement: number;
};

export type StatsBundleResult = {
  sessions30d: number;
  tonnage30d: number;
  prs90d: PrItem[];
};

// ─── DB Queries ───────────────────────────────────────────────────────────────

async function fetchSavedLogs(userId: string, from: Date, to: Date): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(workoutLog)
    .where(and(eq(workoutLog.userId, userId), gte(workoutLog.performedAt, from), lte(workoutLog.performedAt, to)));
  return Number(rows[0]?.n ?? 0);
}

async function fetchVolumeTonnage(userId: string, from: Date, to: Date): Promise<number> {
  const rows = await db
    .select({ tonnage: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)` })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(
      and(
        eq(workoutLog.userId, userId),
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        excludeWarmupSets(),
      ),
    );
  return Number(rows[0]?.tonnage ?? 0);
}

async function fetchPrs(userId: string, from: Date, to: Date, limit: number, locale: AppLocale): Promise<PrItem[]> {
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
    .where(
      and(
        eq(workoutLog.userId, userId),
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        sql`${workoutSet.weightKg} is not null`,
        sql`${workoutSet.reps} is not null`,
        excludeWarmupSets(),
      ),
    )
    .orderBy(workoutLog.performedAt);

  type Internal = {
    exerciseId: string | null;
    exerciseName: string;
    first: PrPoint;
    best: PrPoint;
    latest: PrPoint;
  };
  const byExercise = new Map<string, Internal>();

  for (const r of rows) {
    const weightKg = resolveLoggedTotalLoadKg({
      exerciseName: String(r.exerciseName ?? ""),
      weightKg: r.weightKg,
      meta: r.meta as Record<string, unknown> | null | undefined,
    });
    const reps = Number(r.reps ?? 0);
    if (!weightKg || !reps) continue;

    const e1rm = Math.round(estimateE1rmKg(weightKg, reps) * 10) / 10;
    const date = new Date(r.performedAt).toISOString().slice(0, 10);
    const point: PrPoint = { date, e1rm, weightKg, reps };
    const key = r.exerciseId ?? String(r.exerciseName ?? "").trim().toLowerCase();
    if (!key) continue;

    if (!byExercise.has(key)) {
      byExercise.set(key, {
        exerciseId: r.exerciseId ?? null,
        exerciseName: String(r.exerciseName ?? (locale === "ko" ? "알 수 없는 운동" : "Unknown Exercise")),
        first: point,
        best: point,
        latest: point,
      });
      continue;
    }

    const cur = byExercise.get(key)!;
    if (point.e1rm > cur.best.e1rm) cur.best = point;
    if (point.date > cur.latest.date || (point.date === cur.latest.date && point.e1rm >= cur.latest.e1rm)) {
      cur.latest = point;
    }
  }

  return Array.from(byExercise.values())
    .map((x) => ({
      exerciseId: x.exerciseId,
      exerciseName: x.exerciseName,
      best: x.best,
      latest: x.latest,
      improvement: Math.round((x.best.e1rm - x.first.e1rm) * 10) / 10,
    }))
    .sort((a, b) => b.best.e1rm - a.best.e1rm)
    .slice(0, limit);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * stats 번들을 한 번에 가져옵니다.
 * DB 캐시 히트 시 모든 쿼리 생략 (5분 TTL).
 */
export async function fetchStatsBundle({
  userId,
  days,
  locale,
}: {
  userId: string;
  days: number;
  locale: AppLocale;
}): Promise<StatsBundleResult> {
  const to = new Date();
  const from = days > 0 ? new Date(to.getTime() - days * 86_400_000) : new Date(0);

  // 일 단위 캐시 키 → 같은 날 반복 호출 시 캐시 히트율 최대화
  const cacheParams = {
    to: to.toISOString().slice(0, 10),
    from: from.toISOString().slice(0, 10),
    days,
    prsLimit: 10,
  };

  const cached = await getStatsCache<StatsBundleResult>({
    userId,
    metric: "bundle_v2",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const [sessions30d, tonnage30d, prs90d] = await Promise.all([
    fetchSavedLogs(userId, from, to),
    fetchVolumeTonnage(userId, from, to),
    fetchPrs(userId, from, to, 10, locale),
  ]);

  const payload: StatsBundleResult = { sessions30d, tonnage30d, prs90d };
  // PERF: fire-and-forget 캐시 쓰기 → 응답 지연 없이 캐시 갱신
  void setStatsCache({ userId, metric: "bundle_v2", params: cacheParams, payload, maxAgeSeconds: 300 });
  return payload;
}
