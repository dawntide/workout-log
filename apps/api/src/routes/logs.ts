import { Hono } from "hono";

import { db } from "@/server/db/client";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "@/server/db/ops";
import {
  exercise,
  exerciseAlias,
  generatedSession,
  planProgressEvent,
  workoutLog,
  workoutSet,
} from "@/server/db/schema";
import {
  buildProgressionSummary,
  readProgressEventByLog,
} from "@/server/progression/summary";
import { rebuildAutoProgressionForPlan } from "@/server/progression/autoProgression";
import { invalidateStatsCacheForUser } from "@/server/stats/cache";
import { upsertWorkoutLogService } from "@/server/services/workout-log/upsert-log";
import { getSettingsSnapshotForUser } from "@/server/services/settings/get-settings-snapshot";
import { readWorkoutPreferences } from "@/lib/settings/workout-preferences";
import { resolveLoggedTotalLoadKg } from "@/lib/bodyweight-load";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, normalizeTimezone, resolveLocale } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Route-local helpers (ported verbatim from web/src/app/api/logs/**). Pure TS —
// no Next coupling.
// ─────────────────────────────────────────────────────────────────────────────

type LogCursor = { performedAt: string; id: string };

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolvePerformedAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return new Date();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function parseCursor(raw: string | null): LogCursor | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as LogCursor;
    if (typeof decoded?.performedAt !== "string" || typeof decoded?.id !== "string")
      return null;
    return decoded;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: LogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function parseProgressionTargetDecisions(
  raw: unknown,
): Record<string, { mode: "hold" | "increase" | "reset"; workKg: number }> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, { mode: "hold" | "increase" | "reset"; workKg: number }> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const trimmedKey = String(key).trim();
    if (!trimmedKey || !value || typeof value !== "object") continue;
    const entry = value as { mode?: unknown; workKg?: unknown };
    const mode =
      entry.mode === "hold" || entry.mode === "increase" || entry.mode === "reset"
        ? entry.mode
        : null;
    if (!mode) continue;
    const numRaw = typeof entry.workKg === "number" ? entry.workKg : Number(entry.workKg);
    if (!Number.isFinite(numRaw) || numRaw < 0) continue;
    out[trimmedKey] = { mode, workKg: Math.max(0, Math.round(numRaw / 2.5) * 2.5) };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseBooleanQueryParam(raw: string | null, defaultValue: boolean) {
  if (raw == null) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  return defaultValue;
}

function buildLocalDateRangeFilter(dateFilter: string, timezone: string) {
  return sql`
    ${workoutLog.performedAt} >= (to_date(${dateFilter}, 'YYYY-MM-DD')::timestamp at time zone ${timezone})
    and ${workoutLog.performedAt} < ((to_date(${dateFilter}, 'YYYY-MM-DD') + interval '1 day')::timestamp at time zone ${timezone})
  `;
}

function epley(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  const r = Number.isFinite(reps) && reps > 0 ? reps : 1;
  return weightKg * (1 + r / 30);
}

type PersonalRecordPayload = {
  exerciseName: string;
  topWeightKg: number;
  topReps: number;
  estOneRm: number;
  previousBestE1rm: number | null;
  deltaE1rm: number;
};

type MatchKey = string;
const nameKey = (name: string): MatchKey => `name:${name.trim().toLowerCase()}`;
const idKey = (exerciseId: string): MatchKey => `eid:${exerciseId}`;

/**
 * PR 감지 — exerciseId 우선, 없으면 alias 정규화로 canonical exercise.id 매칭.
 * 맨몸 운동은 총부하(체중+추가)로 e1RM 비교 (통계 서비스와 일관).
 * web/src/app/api/logs/[logId]/route.ts 의 detectPersonalRecords 와 동일.
 */
async function detectPersonalRecords(input: {
  userId: string;
  logId: string;
  sets: Array<{
    exerciseName: string;
    exerciseId: string | null;
    reps: number | null;
    weightKg: number | null;
    isExtra: boolean | null;
    meta: Record<string, unknown> | null;
  }>;
  performedAt: Date;
}): Promise<PersonalRecordPayload[]> {
  const { userId, logId, sets, performedAt } = input;

  const namesInLog = Array.from(
    new Set(
      sets
        .map((s) => String(s.exerciseName ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const aliasToId = new Map<string, string>();
  if (namesInLog.length > 0) {
    const aliasRows = await db
      .select({ alias: exerciseAlias.alias, exerciseId: exerciseAlias.exerciseId })
      .from(exerciseAlias)
      .where(inArray(exerciseAlias.alias, namesInLog));
    for (const r of aliasRows) {
      aliasToId.set(r.alias.trim().toLowerCase(), r.exerciseId);
    }
    const baseRows = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(inArray(exercise.name, namesInLog));
    for (const r of baseRows) {
      aliasToId.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  function resolveKey(exerciseId: string | null, name: string): MatchKey | null {
    if (exerciseId) return idKey(exerciseId);
    const lower = name.trim().toLowerCase();
    if (!lower) return null;
    const aliased = aliasToId.get(lower);
    if (aliased) return idKey(aliased);
    return nameKey(lower);
  }

  type Best = { weightKg: number; reps: number; e1rm: number; displayName: string };
  const currentTop = new Map<MatchKey, Best>();
  for (const s of sets) {
    if (s.isExtra) continue;
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: s.exerciseName,
        weightKg: s.weightKg,
        meta: s.meta,
      }) ?? 0,
    );
    const r = Number(s.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
    const displayName = String(s.exerciseName ?? "").trim();
    const key = resolveKey(s.exerciseId, displayName);
    if (!key) continue;
    const e = epley(w, r);
    const cur = currentTop.get(key);
    if (!cur || e > cur.e1rm) {
      currentTop.set(key, { weightKg: w, reps: r, e1rm: e, displayName });
    }
  }
  if (currentTop.size === 0) return [];

  const priorRows = await db
    .select({
      exerciseId: workoutSet.exerciseId,
      exerciseName: workoutSet.exerciseName,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      isExtra: workoutSet.isExtra,
      meta: workoutSet.meta,
    })
    .from(workoutSet)
    .innerJoin(workoutLog, eq(workoutLog.id, workoutSet.logId))
    .where(
      and(
        eq(workoutLog.userId, userId),
        ne(workoutLog.id, logId),
        lt(workoutLog.performedAt, performedAt),
      ),
    );

  const priorNames = new Set<string>();
  for (const r of priorRows) {
    if (!r.exerciseId) {
      const n = String(r.exerciseName ?? "").trim().toLowerCase();
      if (n && !aliasToId.has(n)) priorNames.add(n);
    }
  }
  if (priorNames.size > 0) {
    const arr = Array.from(priorNames);
    const aliasRows = await db
      .select({ alias: exerciseAlias.alias, exerciseId: exerciseAlias.exerciseId })
      .from(exerciseAlias)
      .where(inArray(exerciseAlias.alias, arr));
    for (const r of aliasRows) {
      aliasToId.set(r.alias.trim().toLowerCase(), r.exerciseId);
    }
    const baseRows = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(inArray(exercise.name, arr));
    for (const r of baseRows) {
      aliasToId.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  const priorBest = new Map<MatchKey, number>();
  for (const r of priorRows) {
    if (r.isExtra) continue;
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: String(r.exerciseName ?? ""),
        weightKg: r.weightKg,
        meta: r.meta as Record<string, unknown> | null,
      }) ?? 0,
    );
    const reps = Number(r.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(reps) || reps <= 0) continue;
    const key = resolveKey(r.exerciseId, String(r.exerciseName ?? ""));
    if (!key) continue;
    const e = epley(w, reps);
    const cur = priorBest.get(key);
    if (cur == null || e > cur) priorBest.set(key, e);
  }

  const out: PersonalRecordPayload[] = [];
  for (const [key, cur] of currentTop.entries()) {
    const prev = priorBest.get(key) ?? null;
    const isPr = prev == null || cur.e1rm > prev + 0.1;
    if (!isPr) continue;
    out.push({
      exerciseName: cur.displayName,
      topWeightKg: cur.weightKg,
      topReps: cur.reps,
      estOneRm: Number(cur.e1rm.toFixed(2)),
      previousBestE1rm: prev != null ? Number(prev.toFixed(2)) : null,
      deltaE1rm: prev != null ? Number((cur.e1rm - prev).toFixed(2)) : cur.e1rm,
    });
    void key;
  }
  out.sort((a, b) => b.deltaE1rm - a.deltaE1rm);
  return out.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes — mounted at /api/logs. requireAuth supplies c.get("userId").
// ─────────────────────────────────────────────────────────────────────────────

export const logsRoutes = new Hono<AppEnv>();

logsRoutes.use("*", requireAuth);

// GET /api/logs — paginated list (cursor) with optional sets / generated session
// / progression detail. Mirrors web GET.
logsRoutes.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const planId = c.req.query("planId")?.trim() ?? "";
    const dateFilter = c.req.query("date")?.trim() ?? "";
    const timezone = normalizeTimezone(c.req.query("timezone") ?? null);
    const cursor = parseCursor(c.req.query("cursor") ?? null);
    const includeSets = parseBooleanQueryParam(c.req.query("includeSets") ?? null, true);
    const includeGeneratedSession = parseBooleanQueryParam(
      c.req.query("includeGeneratedSession") ?? null,
      true,
    );
    const includeProgression = parseBooleanQueryParam(
      c.req.query("includeProgression") ?? null,
      true,
    );
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
      : 20;

    const filters: Array<any> = [eq(workoutLog.userId, userId)];
    if (planId) filters.push(eq(workoutLog.planId, planId));
    if (DATE_ONLY_PATTERN.test(dateFilter)) {
      filters.push(buildLocalDateRangeFilter(dateFilter, timezone));
    }
    if (cursor) {
      const cursorDate = new Date(cursor.performedAt);
      if (!Number.isNaN(cursorDate.getTime())) {
        filters.push(
          or(
            lt(workoutLog.performedAt, cursorDate),
            and(eq(workoutLog.performedAt, cursorDate), lt(workoutLog.id, cursor.id)),
          ),
        );
      }
    }

    const logs = await db
      .select({
        id: workoutLog.id,
        userId: workoutLog.userId,
        planId: workoutLog.planId,
        generatedSessionId: workoutLog.generatedSessionId,
        performedAt: workoutLog.performedAt,
        durationMinutes: workoutLog.durationMinutes,
        notes: workoutLog.notes,
        tags: workoutLog.tags,
        createdAt: workoutLog.createdAt,
      })
      .from(workoutLog)
      .where(and(...filters))
      .orderBy(desc(workoutLog.performedAt), desc(workoutLog.id))
      .limit(limit + 1);

    const hasMore = logs.length > limit;
    const pageLogs = hasMore ? logs.slice(0, limit) : logs;
    const logIds = pageLogs.map((l) => l.id);

    const generatedSessionIds = includeGeneratedSession
      ? Array.from(
          new Set(
            pageLogs
              .map((log) => log.generatedSessionId)
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : [];

    const [sets, sessions, events] = await Promise.all([
      includeSets && logIds.length > 0
        ? db
            .select({
              id: workoutSet.id,
              logId: workoutSet.logId,
              exerciseId: workoutSet.exerciseId,
              exerciseName: workoutSet.exerciseName,
              sortOrder: workoutSet.sortOrder,
              setNumber: workoutSet.setNumber,
              reps: workoutSet.reps,
              weightKg: workoutSet.weightKg,
              rpe: workoutSet.rpe,
              isExtra: workoutSet.isExtra,
              meta: workoutSet.meta,
            })
            .from(workoutSet)
            .where(inArray(workoutSet.logId, logIds))
            .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id))
        : Promise.resolve([] as any[]),
      includeGeneratedSession && generatedSessionIds.length > 0
        ? db
            .select({ id: generatedSession.id, sessionKey: generatedSession.sessionKey })
            .from(generatedSession)
            .where(inArray(generatedSession.id, generatedSessionIds))
        : Promise.resolve([] as any[]),
      includeProgression && logIds.length > 0
        ? db
            .select({
              id: planProgressEvent.id,
              logId: planProgressEvent.logId,
              eventType: planProgressEvent.eventType,
              programSlug: planProgressEvent.programSlug,
              reason: planProgressEvent.reason,
              beforeState: planProgressEvent.beforeState,
              afterState: planProgressEvent.afterState,
              meta: planProgressEvent.meta,
              createdAt: planProgressEvent.createdAt,
            })
            .from(planProgressEvent)
            .where(inArray(planProgressEvent.logId, logIds))
            .orderBy(desc(planProgressEvent.createdAt), desc(planProgressEvent.id))
        : Promise.resolve([] as any[]),
    ]);

    const setsByLogId = new Map<string, Array<any>>();
    for (const s of sets) {
      const list = setsByLogId.get(s.logId) ?? [];
      list.push(s);
      setsByLogId.set(s.logId, list);
    }

    const generatedSessionsById = new Map<string, { id: string; sessionKey: string }>();
    for (const session of sessions) {
      generatedSessionsById.set(session.id, session);
    }

    const progressionSummaryByLogId = new Map<
      string,
      ReturnType<typeof buildProgressionSummary>
    >();
    for (const event of events) {
      if (!event.logId) continue;
      if (progressionSummaryByLogId.has(event.logId)) continue;
      progressionSummaryByLogId.set(
        event.logId,
        buildProgressionSummary({ mode: "upsert", eventRow: event }),
      );
    }

    const items = pageLogs.map((log) => ({
      ...log,
      sets: includeSets ? (setsByLogId.get(log.id) ?? []) : [],
      generatedSession:
        includeGeneratedSession && log.generatedSessionId
          ? (generatedSessionsById.get(log.generatedSessionId) ?? null)
          : null,
      progression: includeProgression
        ? (progressionSummaryByLogId.get(log.id) ?? null)
        : null,
    }));

    const last = pageLogs[pageLogs.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ performedAt: last.performedAt.toISOString(), id: last.id })
        : null;

    return c.json({ items, nextCursor, limit });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/logs — create a workout log. Mirrors web POST.
logsRoutes.post("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const timezone = normalizeTimezone(
      typeof body.timezone === "string" ? body.timezone : null,
    );
    const performedAt = resolvePerformedAt(body.performedAt);

    const sets = Array.isArray(body.sets) ? body.sets : [];
    if (sets.length === 0) {
      return c.json(
        { error: locale === "ko" ? "세트 정보가 필요합니다." : "Sets are required." },
        400,
      );
    }
    if (!performedAt) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "performedAt은 올바른 날짜/시간이어야 합니다."
              : "performedAt must be a valid datetime.",
        },
        400,
      );
    }

    const created = await upsertWorkoutLogService({
      userId,
      locale,
      timezone,
      performedAt,
      durationMinutes: body.durationMinutes,
      notes: body.notes,
      tags: body.tags,
      planId:
        typeof body.planId === "string" && body.planId.trim() ? body.planId.trim() : null,
      generatedSessionId:
        typeof body.generatedSessionId === "string" && body.generatedSessionId.trim()
          ? body.generatedSessionId.trim()
          : null,
      sets,
      progressionTargetDecisions: parseProgressionTargetDecisions(
        body.progressionTargetDecisions,
      ),
    });

    return c.json(created, 201);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// GET /api/logs/calendar — workout days within a month. Registered before
// /:logId so the static segment wins. Mirrors web calendar route.
logsRoutes.get("/calendar", async (c) => {
  try {
    const userId = c.get("userId");
    const year = Number(c.req.query("year"));
    const month = Number(c.req.query("month"));
    const timezone = normalizeTimezone(c.req.query("timezone") ?? null);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      year < 1970 ||
      year > 2999 ||
      month < 1 ||
      month > 12
    ) {
      return c.json({ error: "year and month required" }, 400);
    }

    const monthStr = String(month).padStart(2, "0");
    const start = `${year}-${monthStr}-01`;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const end = `${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01`;

    const startTs = sql`(to_date(${start}, 'YYYY-MM-DD')::timestamp at time zone ${timezone})`;
    const endTs = sql`(to_date(${end}, 'YYYY-MM-DD')::timestamp at time zone ${timezone})`;
    const dayExpr = sql<string>`
      to_char(${workoutLog.performedAt} at time zone ${timezone}, 'DD')
    `;

    const rows = await db
      .select({ id: workoutLog.id, performedAt: workoutLog.performedAt, day: dayExpr })
      .from(workoutLog)
      .where(
        and(
          eq(workoutLog.userId, userId),
          gte(workoutLog.performedAt, startTs),
          lt(workoutLog.performedAt, endTs),
        ),
      );

    const latestByDay = new Map<number, { logId: string; performedAt: Date }>();
    for (const r of rows) {
      const n = Number((r as any).day);
      if (!Number.isFinite(n) || n < 1 || n > 31) continue;
      const cur = latestByDay.get(n);
      if (!cur || r.performedAt > cur.performedAt) {
        latestByDay.set(n, { logId: r.id, performedAt: r.performedAt });
      }
    }

    const days = Array.from(latestByDay.keys()).sort((a, b) => a - b);
    const sessions = days.map((day) => {
      const v = latestByDay.get(day)!;
      return { day, logId: v.logId, performedAt: v.performedAt.toISOString() };
    });

    c.header("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    return c.json({ year, month, days, sessions });
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/logs/:logId — one log with sets, generated session, progression, and
// server-detected personal records. Mirrors web GET [logId].
logsRoutes.get("/:logId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const logId = c.req.param("logId");

    const logRows = await db
      .select({
        id: workoutLog.id,
        userId: workoutLog.userId,
        planId: workoutLog.planId,
        generatedSessionId: workoutLog.generatedSessionId,
        performedAt: workoutLog.performedAt,
        durationMinutes: workoutLog.durationMinutes,
        notes: workoutLog.notes,
        tags: workoutLog.tags,
        createdAt: workoutLog.createdAt,
      })
      .from(workoutLog)
      .where(eq(workoutLog.id, logId))
      .limit(1);

    const log = logRows[0];
    if (!log)
      return c.json(
        { error: locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found." },
        404,
      );
    if (log.userId !== userId)
      return c.json(
        { error: locale === "ko" ? "권한이 없습니다." : "Forbidden." },
        403,
      );

    const sets = await db
      .select({
        id: workoutSet.id,
        logId: workoutSet.logId,
        exerciseId: workoutSet.exerciseId,
        exerciseName: workoutSet.exerciseName,
        sortOrder: workoutSet.sortOrder,
        setNumber: workoutSet.setNumber,
        reps: workoutSet.reps,
        weightKg: workoutSet.weightKg,
        rpe: workoutSet.rpe,
        isExtra: workoutSet.isExtra,
        meta: workoutSet.meta,
      })
      .from(workoutSet)
      .where(eq(workoutSet.logId, logId))
      .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id));

    const generated = log.generatedSessionId
      ? (
          await db
            .select({
              id: generatedSession.id,
              sessionKey: generatedSession.sessionKey,
              snapshot: generatedSession.snapshot,
              updatedAt: generatedSession.updatedAt,
            })
            .from(generatedSession)
            .where(eq(generatedSession.id, log.generatedSessionId))
            .limit(1)
        )[0] ?? null
      : null;

    const progressionEvent = await readProgressEventByLog({
      tx: db,
      planId: log.planId,
      logId,
    });
    const progressionSummary = progressionEvent
      ? buildProgressionSummary({ mode: "upsert", eventRow: progressionEvent })
      : null;

    const personalRecords = await detectPersonalRecords({
      userId,
      logId,
      sets: sets.map((s) => ({
        exerciseName: s.exerciseName,
        exerciseId: s.exerciseId,
        reps: s.reps,
        weightKg: s.weightKg,
        isExtra: s.isExtra,
        meta: s.meta as Record<string, unknown> | null,
      })),
      performedAt: log.performedAt,
    });

    const settings = await getSettingsSnapshotForUser(userId);
    const prefs = readWorkoutPreferences(settings);
    const goal = prefs.trainingGoalPrimary;

    return c.json({
      item: {
        ...log,
        sets,
        generatedSession: generated,
        progression: progressionSummary,
        personalRecords,
        goal,
      },
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// PATCH /api/logs/:logId — replace a past log's sets (or date-only move).
// Mirrors web PATCH.
logsRoutes.patch("/:logId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const logId = c.req.param("logId");
    const body = await c.req.json();

    const sets = Array.isArray(body.sets) ? body.sets : [];

    // Date-only move: performedAt without sets just shifts the date.
    if (sets.length === 0) {
      if (!body.performedAt) {
        return c.json(
          { error: locale === "ko" ? "세트 정보가 필요합니다." : "Sets are required." },
          400,
        );
      }

      const existingRows = await db
        .select({ id: workoutLog.id, userId: workoutLog.userId, planId: workoutLog.planId })
        .from(workoutLog)
        .where(eq(workoutLog.id, logId))
        .limit(1);

      const existing = existingRows[0];
      if (!existing)
        return c.json(
          { error: locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found." },
          404,
        );
      if (existing.userId !== userId)
        return c.json(
          { error: locale === "ko" ? "권한이 없습니다." : "Forbidden." },
          403,
        );

      await db.transaction(async (tx) => {
        await tx
          .update(workoutLog)
          .set({ performedAt: new Date(body.performedAt) })
          .where(eq(workoutLog.id, logId));

        if (existing.planId) {
          await rebuildAutoProgressionForPlan({ tx, userId, planId: existing.planId });
        }
        await invalidateStatsCacheForUser(userId, tx);
      });

      return c.json({ updated: true, logId });
    }

    const updated = await upsertWorkoutLogService({
      logId,
      userId,
      locale,
      timezone:
        typeof body.timezone === "string" && body.timezone.trim()
          ? body.timezone.trim()
          : "UTC",
      performedAt: body.performedAt ? new Date(body.performedAt) : undefined,
      durationMinutes: body.durationMinutes,
      notes: body.notes,
      tags: body.tags,
      planId:
        typeof body.planId === "string" && body.planId.trim()
          ? body.planId.trim()
          : undefined,
      generatedSessionId:
        typeof body.generatedSessionId === "string" && body.generatedSessionId.trim()
          ? body.generatedSessionId.trim()
          : undefined,
      sets,
      progressionTargetDecisions: parseProgressionTargetDecisions(
        body.progressionTargetDecisions,
      ),
    });

    return c.json(updated, 200);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// DELETE /api/logs/:logId — delete a log and rebuild plan progression.
// Mirrors web DELETE.
logsRoutes.delete("/:logId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const logId = c.req.param("logId");

    const existingRows = await db
      .select({ id: workoutLog.id, userId: workoutLog.userId, planId: workoutLog.planId })
      .from(workoutLog)
      .where(eq(workoutLog.id, logId))
      .limit(1);

    const existing = existingRows[0];
    if (!existing)
      return c.json(
        { error: locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found." },
        404,
      );
    if (existing.userId !== userId)
      return c.json(
        { error: locale === "ko" ? "권한이 없습니다." : "Forbidden." },
        403,
      );

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(workoutLog).where(eq(workoutLog.id, logId));

      const rebuildResult = existing.planId
        ? await rebuildAutoProgressionForPlan({ tx, userId, planId: existing.planId })
        : { applied: false as const, reason: "skip:no-plan" as const };

      await invalidateStatsCacheForUser(userId, tx);
      return rebuildResult;
    });

    return c.json(
      {
        deleted: true,
        logId,
        progressionRebuilt: deleted.applied,
        progressionRebuildReason: deleted.reason,
      },
      200,
    );
  } catch (e) {
    return apiError(c, e, locale);
  }
});
