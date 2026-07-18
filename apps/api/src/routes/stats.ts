import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { and, desc, eq, gte, inArray, lte, or, sql } from "@workout/core/db/ops";
import { exercise, workoutLog, workoutSet } from "@workout/core/db/schema";
import { logError } from "@workout/core/observability/logger";
import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import { getExerciseById, resolveExerciseByName } from "@workout/core/exercise/resolve";
import { getStatsCache, setStatsCache } from "@workout/core/stats/cache";
import { parseDateRangeFromSearchParams } from "@workout/core/stats/range";
import { fetchE1rmStats } from "@workout/core/stats/e1rm-service";
import { fetchStatsBundle } from "@workout/core/stats/bundle-service";
import { fetchPrsList } from "@workout/core/stats/prs-service";
import {
  buildRef5StartRecommendation,
  REF5_START_CALIBRATION_LOOKBACK_DAYS,
  REF5_START_CALIBRATION_MAX_REPS,
} from "@workout/core/program-engine/ref5-start-calibration";
import {
  fetchVolumeSeries,
  type VolumeBucket,
} from "@workout/core/stats/volume-series-service";
import {
  buildUxSnapshotPayload,
  parseThresholdTargets,
  parseWindowDays,
  uxSnapshotToCsv,
  type UxSnapshotPayload,
} from "@workout/core/stats/ux-snapshot-service";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, resolveLocale } from "../lib/http";

/** The request's raw URLSearchParams (parseDateRangeFromSearchParams takes one). */
function searchParams(c: { req: { url: string } }): URLSearchParams {
  return new URL(c.req.url).searchParams;
}

function epley1RM(weightKg: number, reps: number) {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

const CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";

// ─────────────────────────────────────────────────────────────────────────────
// Routes — mounted at /api/stats. All GET (read-only). requireAuth supplies the
// user id. Logic reuses the shared @/server/stats services where the web routes
// do; the two inline routes (strength-summary, volume) are ported verbatim with
// Next-isms (NextResponse, after, cookie auth) swapped for Hono equivalents.
//
// Scope: the user-facing stats + the ux-snapshot debug dashboard (migrated here;
// logic in ux-snapshot-service). Web-resident by design: page-bootstrap (SSR,
// cookie-coupled) and migration-telemetry (reads migration files from web/Vercel's
// filesystem, where migrations run). ux-funnel / ux-events-summary were dead and
// were deleted.
// ─────────────────────────────────────────────────────────────────────────────

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.use("*", requireAuth);

// GET /api/stats/e1rm — estimated-1RM series for one exercise.
statsRoutes.get("/e1rm", async (c) => {
  try {
    const userId = c.get("userId");
    const sp = searchParams(c);
    const planId = c.req.query("planId")?.trim() ?? "";
    const exerciseId = c.req.query("exerciseId")?.trim() ?? "";
    const exerciseName =
      (c.req.query("exerciseId") ? null : c.req.query("exercise")) ??
      c.req.query("exerciseName") ??
      null;

    if (!exerciseId && !exerciseName) {
      return c.json({ error: "exerciseId or exercise is required" }, 400);
    }

    const { from, to, rangeDays } = parseDateRangeFromSearchParams(sp, 180);
    const payload = await fetchE1rmStats({
      userId,
      planId,
      exerciseId,
      exerciseName,
      from,
      to,
      rangeDays,
    });

    return c.json(payload);
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/bundle — sessions/volume totals + top PRs.
statsRoutes.get("/bundle", async (c) => {
  try {
    const userId = c.get("userId");
    const daysParam = c.req.query("days");
    const days = daysParam != null ? parseInt(daysParam, 10) : 30;

    const payload = await fetchStatsBundle({ userId, days, locale: resolveLocale(c) });

    c.header("Cache-Control", CACHE_HEADER);
    return c.json(payload);
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/volume-series — training-volume buckets (day/week/month).
statsRoutes.get("/volume-series", async (c) => {
  try {
    const userId = c.get("userId");
    const sp = searchParams(c);
    const exerciseId = c.req.query("exerciseId")?.trim() ?? "";
    const exerciseName = c.req.query("exercise") ?? c.req.query("exerciseName") ?? null;
    const bucketRaw = (c.req.query("bucket") ?? "week").toLowerCase();
    const bucket: VolumeBucket =
      bucketRaw === "day" ? "day" : bucketRaw === "month" ? "month" : "week";
    const perExercise = c.req.query("perExercise") === "1";
    const maxExercisesRaw = Number(c.req.query("maxExercises") ?? "12");
    const maxExercises = Number.isFinite(maxExercisesRaw)
      ? Math.max(1, Math.min(40, Math.floor(maxExercisesRaw)))
      : 12;

    const { from, to, rangeDays } = parseDateRangeFromSearchParams(sp, 180);

    const result = await fetchVolumeSeries({
      userId,
      from,
      to,
      rangeDays,
      bucket,
      exerciseId,
      exerciseName,
      perExercise,
      maxExercises,
      locale: resolveLocale(c),
    });

    return c.json(result);
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/prs — personal-record list.
statsRoutes.get("/prs", async (c) => {
  try {
    const userId = c.get("userId");
    const sp = searchParams(c);
    const exerciseId = c.req.query("exerciseId")?.trim() ?? "";
    const exerciseName = c.req.query("exercise") ?? c.req.query("exerciseName") ?? null;
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
      : 20;

    const { from, to, rangeDays } = parseDateRangeFromSearchParams(sp, 365);

    const result = await fetchPrsList({
      userId,
      from,
      to,
      rangeDays,
      exerciseId,
      exerciseName,
      limit,
      locale: resolveLocale(c),
    });

    return c.json({
      from: result.from,
      to: result.to,
      rangeDays: result.rangeDays,
      items: result.items,
    });
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/ref5-start-recommendation — one-time onboarding calibration.
// Runtime REF5 progression remains direct-load based; e1RM is not persisted as
// TM or used again after the plan has been created.
statsRoutes.get("/ref5-start-recommendation", async (c) => {
  try {
    const userId = c.get("userId");
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - REF5_START_CALIBRATION_LOOKBACK_DAYS);

    const result = await fetchPrsList({
      userId,
      from,
      to,
      rangeDays: REF5_START_CALIBRATION_LOOKBACK_DAYS,
      limit: 100,
      locale: resolveLocale(c),
      maxReps: REF5_START_CALIBRATION_MAX_REPS,
      requireBodyweightTotalLoad: true,
    });

    c.header("Cache-Control", CACHE_HEADER);
    return c.json({
      ...buildRef5StartRecommendation(result.items),
      recordedAt: to.toISOString(),
    });
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/strength-summary — top priority lifts with e1RM/best/trend.
// Inline DB logic ported from the web route (no service layer).
statsRoutes.get("/strength-summary", async (c) => {
  try {
    const userId = c.get("userId");
    const lookbackDays = Number(c.req.query("days") ?? "30");
    const topLimit = Number(c.req.query("limit") ?? "5");

    const from = new Date();
    from.setDate(from.getDate() - lookbackDays);

    const priorityExercises = await db
      .select({
        exerciseId: workoutSet.exerciseId,
        exerciseName: workoutSet.exerciseName,
        maxWeight: sql<number>`max(${workoutSet.weightKg})`,
        totalTonnage: sql<number>`sum(${workoutSet.weightKg} * ${workoutSet.reps})`,
      })
      .from(workoutLog)
      .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
      .where(
        and(
          eq(workoutLog.userId, userId),
          gte(workoutLog.performedAt, from),
          sql`${workoutSet.weightKg} > 0`,
        ),
      )
      .groupBy(workoutSet.exerciseId, workoutSet.exerciseName)
      .orderBy(desc(sql`max(${workoutSet.weightKg})`))
      .limit(topLimit);

    if (priorityExercises.length === 0) {
      c.header("Cache-Control", CACHE_HEADER);
      return c.json({ items: [] });
    }

    // ── D7: 종목별 이력 조회 N+1(각 최대 1000행) → window function 배치 ──
    // 우선순위 종목의 필터 키가 이원적(id가 있으면 id, 없으면 name)이고, 한 행이
    // "다른 종목의 id 그룹"과 "name 그룹"에 동시에 속할 수 있는 기존 시맨틱을
    // 보존해야 하므로 partition을 섞지 않고 키 종류별 2쿼리로 나눈다.
    // 정렬 결정화: 구 코드는 performedAt 타이(같은 세션의 세트들) 순서가 미지정이라
    // current가 비결정적이었다(2026-07-02 리라이트 divergence의 원인). 물리 삽입
    // 순서에 상응하는 (sortOrder, setNumber, id) 2차 키로 고정한다.
    const rankOrder = sql`${workoutLog.performedAt} desc, ${workoutSet.sortOrder} asc, ${workoutSet.setNumber} asc, ${workoutSet.id} asc`;
    const fetchRankedHistory = (partitionKey: ReturnType<typeof sql>, keyFilter: ReturnType<typeof sql> | ReturnType<typeof eq>) => {
      const ranked = db.$with("ranked_history").as(
        db
          .select({
            weightKg: workoutSet.weightKg,
            reps: workoutSet.reps,
            performedAt: workoutLog.performedAt,
            exerciseName: workoutSet.exerciseName,
            exerciseId: workoutSet.exerciseId,
            meta: workoutSet.meta,
            rn: sql<number>`row_number() over (partition by ${partitionKey} order by ${rankOrder})`.as("rn"),
          })
          .from(workoutLog)
          .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
          .where(
            and(
              eq(workoutLog.userId, userId),
              keyFilter,
              sql`${workoutSet.weightKg} is not null`,
              sql`${workoutSet.reps} > 0`,
            ),
          ),
      );
      return db.with(ranked).select().from(ranked).where(lte(ranked.rn, 1000));
    };

    const idKeys = priorityExercises.flatMap((ex) => (ex.exerciseId ? [ex.exerciseId] : []));
    const nameKeys = priorityExercises.filter((ex) => !ex.exerciseId).map((ex) => ex.exerciseName);

    const [idRows, nameRows] = await Promise.all([
      idKeys.length
        ? fetchRankedHistory(sql`${workoutSet.exerciseId}`, inArray(workoutSet.exerciseId, idKeys))
        : Promise.resolve([]),
      nameKeys.length
        ? fetchRankedHistory(sql`${workoutSet.exerciseName}`, inArray(workoutSet.exerciseName, nameKeys))
        : Promise.resolve([]),
    ]);

    type RankedRow = (typeof idRows)[number];
    const groupBy = (rows: RankedRow[], key: (r: RankedRow) => string | null) => {
      const map = new Map<string, RankedRow[]>();
      for (const r of rows) {
        const k = key(r);
        if (k === null) continue;
        const bucket = map.get(k);
        if (bucket) bucket.push(r);
        else map.set(k, [r]);
      }
      return map;
    };
    const historyById = groupBy(idRows, (r) => r.exerciseId);
    const historyByName = groupBy(nameRows, (r) => r.exerciseName);

    const results = priorityExercises.flatMap((ex) => {
      const rows = ex.exerciseId
        ? historyById.get(ex.exerciseId) ?? []
        : historyByName.get(ex.exerciseName) ?? [];
      // 그룹 내 정렬은 rn(=performedAt desc + 결정적 2차 키)으로 보장.
      rows.sort((a, b) => a.rn - b.rn);

      const points = rows
        .map((r) => {
          const w = resolveLoggedTotalLoadKg({
            exerciseName: r.exerciseName,
            weightKg: r.weightKg,
            meta: r.meta as any,
          });
          const reps = Number(r.reps || 0);
          if (w === null || w === undefined) return null;
          return {
            date: r.performedAt.toISOString().slice(0, 10),
            ts: r.performedAt.getTime(),
            e1rm: epley1RM(w, reps),
            weightKg: w,
            reps,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (points.length === 0) return [];

      const best = points.reduce((acc, p) => (p.e1rm > acc.e1rm ? p : acc), points[0]);
      // current = 최신 세션(동일 timestamp)의 최고 e1rm 세트. 구 코드는 points[0]인데
      // DB가 동일 performedAt 세트들을 미지정 순서로 반환해 요청마다 값이 흔들렸다
      // (dev 실측: 같은 데이터에서 147↔142.9 flap). 시맨틱을 명시해 고정한다.
      const latestTs = points[0].ts;
      const latestSets = points.filter((p) => p.ts === latestTs);
      const current = latestSets.reduce((acc, p) => (p.e1rm > acc.e1rm ? p : acc), latestSets[0]);

      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      const recentSeries = points
        .filter((p) => new Date(p.date) >= eightWeeksAgo)
        .reverse();

      return [{
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        current: {
          e1rm: Math.round(current.e1rm * 10) / 10,
          date: current.date,
          weightKg: current.weightKg,
          reps: current.reps,
        },
        best: {
          e1rm: Math.round(best.e1rm * 10) / 10,
          date: best.date,
        },
        recentSeries: recentSeries.map((p) => Math.round(p.e1rm * 10) / 10),
        improvement: best.e1rm > 0 ? (current.e1rm / best.e1rm - 1) * 100 : 0,
      }];
    });

    c.header("Cache-Control", CACHE_HEADER);
    return c.json({ items: results, recordedAt: new Date().toISOString() });
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/volume — tonnage/reps/sets totals (+ optional prev-period
// comparison), with the shared stats cache. Inline DB logic ported from the web
// route; the web `after()` deferred cache write becomes a fire-and-forget so a
// cache-write failure never fails the response (mirrors the web semantics).
statsRoutes.get("/volume", async (c) => {
  try {
    const userId = c.get("userId");
    const sp = searchParams(c);
    const exerciseId = c.req.query("exerciseId")?.trim() ?? "";
    const exerciseName = c.req.query("exercise") ?? c.req.query("exerciseName") ?? null;
    const comparePrev = c.req.query("comparePrev") === "1";

    const { from, to, rangeDays } = parseDateRangeFromSearchParams(sp, 30);

    let resolvedExerciseId: string | null = null;
    let resolvedExerciseName: string | null = null;
    if (exerciseId) {
      const byId = await getExerciseById(exerciseId);
      if (byId) {
        resolvedExerciseId = byId.id;
        resolvedExerciseName = byId.name;
      } else {
        resolvedExerciseId = exerciseId;
      }
    } else if (exerciseName) {
      const resolved = await resolveExerciseByName(exerciseName);
      if (resolved) {
        resolvedExerciseId = resolved.id;
        resolvedExerciseName = resolved.name;
      } else {
        resolvedExerciseName = exerciseName;
      }
    }

    const cacheParams = {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      exerciseId: resolvedExerciseId,
      exerciseName: resolvedExerciseName ?? exerciseName ?? null,
      comparePrev,
    };
    const cached = await getStatsCache<{
      from: string;
      to: string;
      rangeDays: number;
      totals: { tonnage: number; reps: number; sets: number };
      previousTotals?: { tonnage: number; reps: number; sets: number };
      trend?: { tonnageDelta: number; repsDelta: number; setsDelta: number };
      byExercise: Array<{
        exerciseId?: string | null;
        exerciseName: string;
        tonnage: number;
        reps: number;
        sets: number;
      }>;
    }>({
      userId,
      metric: "volume_totals",
      params: cacheParams,
      maxAgeSeconds: 300,
    });
    if (cached) return c.json(cached);

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

    const groupKey = resolvedExerciseId
      ? sql<string>`${resolvedExerciseId}`
      : sql<string>`coalesce(${workoutSet.exerciseId}::text, lower(${workoutSet.exerciseName}))`;
    const groupExerciseId = resolvedExerciseId
      ? sql<string>`${resolvedExerciseId}`
      : workoutSet.exerciseId;
    const groupExerciseName = resolvedExerciseId
      ? sql<string>`${resolvedExerciseName ?? exerciseName ?? resolvedExerciseId}`
      : sql<string>`coalesce(${exercise.name}, ${workoutSet.exerciseName})`;

    const baseWhere = and(
      eq(workoutLog.userId, userId),
      gte(workoutLog.performedAt, from),
      lte(workoutLog.performedAt, to),
    );
    const where = filterByExercise ? and(baseWhere, filterByExercise) : baseWhere;

    const rows = await db
      .select({
        key: groupKey,
        exerciseId: groupExerciseId,
        exerciseName: groupExerciseName,
        tonnage: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)`,
        reps: sql<number>`coalesce(sum(${workoutSet.reps}), 0)`,
        sets: sql<number>`count(*)`,
      })
      .from(workoutLog)
      .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
      .leftJoin(exercise, eq(exercise.id, workoutSet.exerciseId))
      .where(where)
      .groupBy(groupKey, groupExerciseId, groupExerciseName)
      .orderBy(sql`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0) desc`);

    const byExercise = rows.map((r) => ({
      exerciseId: r.exerciseId ?? null,
      exerciseName: r.exerciseName,
      tonnage: Number(r.tonnage ?? 0),
      reps: Number(r.reps ?? 0),
      sets: Number(r.sets ?? 0),
    }));

    const totals = byExercise.reduce(
      (acc, r) => {
        acc.tonnage += r.tonnage;
        acc.reps += r.reps;
        acc.sets += r.sets;
        return acc;
      },
      { tonnage: 0, reps: 0, sets: 0 },
    );

    let previousTotals: { tonnage: number; reps: number; sets: number } | undefined;
    let trend: { tonnageDelta: number; repsDelta: number; setsDelta: number } | undefined;

    if (comparePrev) {
      const rangeMs = Math.max(1, to.getTime() - from.getTime());
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - rangeMs);

      const prevBaseWhere = and(
        eq(workoutLog.userId, userId),
        gte(workoutLog.performedAt, prevFrom),
        lte(workoutLog.performedAt, prevTo),
      );
      const prevWhere = filterByExercise ? and(prevBaseWhere, filterByExercise) : prevBaseWhere;

      const prevRows = await db
        .select({
          tonnage: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)`,
          reps: sql<number>`coalesce(sum(${workoutSet.reps}), 0)`,
          sets: sql<number>`count(*)`,
        })
        .from(workoutLog)
        .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
        .where(prevWhere);

      const prev = prevRows[0] ?? { tonnage: 0, reps: 0, sets: 0 };
      previousTotals = {
        tonnage: Number(prev.tonnage ?? 0),
        reps: Number(prev.reps ?? 0),
        sets: Number(prev.sets ?? 0),
      };
      trend = {
        tonnageDelta: totals.tonnage - previousTotals.tonnage,
        repsDelta: totals.reps - previousTotals.reps,
        setsDelta: totals.sets - previousTotals.sets,
      };
    }

    const payload = {
      from: from.toISOString(),
      to: to.toISOString(),
      rangeDays,
      totals,
      previousTotals,
      trend,
      byExercise,
    };

    // Non-blocking cache write (the Hono stand-in for Next `after()`): a failure
    // is logged, never surfaced to the client.
    void setStatsCache({
      userId,
      metric: "volume_totals",
      params: cacheParams,
      payload,
    }).catch((err) => logError("api.stats.volume.cache_write_failed", { error: err }));

    return c.json(payload);
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/stats/ux-snapshot — UX funnel + per-window event summaries + thresholds
// (debug dashboard). Ported from the web route; the Next-free logic lives in the
// shared ux-snapshot-service. Next-isms swapped: NextResponse→c.json/c.body,
// after()→fire-forget, resolveRequestLocale→resolveLocale, cookie auth→requireAuth.
statsRoutes.get("/ux-snapshot", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const sp = searchParams(c);
    const { from, to, rangeDays } = parseDateRangeFromSearchParams(sp, 30);
    const planId = c.req.query("planId")?.trim() || null;
    const comparePrev = c.req.query("comparePrev") === "1";
    const windowDays = parseWindowDays(c.req.query("windows") ?? null);
    const thresholdTargets = parseThresholdTargets(sp);
    const format = (c.req.query("format") ?? "json").toLowerCase();

    if (format !== "json" && format !== "csv") {
      return c.json(
        {
          error:
            locale === "ko" ? "format은 json 또는 csv여야 합니다." : "format must be json or csv.",
        },
        400,
      );
    }

    const cacheParams = {
      from: from.toISOString(),
      to: to.toISOString(),
      planId,
      comparePrev,
      windowDays: windowDays.join(","),
      thresholdTargets,
    };

    let payload = await getStatsCache<UxSnapshotPayload>({
      userId,
      metric: "ux_snapshot",
      params: cacheParams,
      maxAgeSeconds: 120,
    });

    if (!payload) {
      payload = await buildUxSnapshotPayload({
        userId,
        from,
        to,
        rangeDays,
        planId,
        comparePrev,
        windowDays,
        thresholdTargets,
        locale,
      });
      setStatsCache({ userId, metric: "ux_snapshot", params: cacheParams, payload }).catch((err) =>
        logError("api.stats.ux_snapshot.cache_write_failed", { error: err }),
      );
    }

    if (format === "csv") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return c.body(uxSnapshotToCsv(payload), 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="workout-log-${userId}-ux-snapshot-${stamp}.csv"`,
        "cache-control": "no-store",
      });
    }

    return c.json(payload);
  } catch (e) {
    return apiError(c, e, locale);
  }
});
