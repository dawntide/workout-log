import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { generatedSession, planProgressEvent, workoutLog, workoutSet } from "@/server/db/schema";
import { buildProgressionSummary } from "@/server/progression/summary";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@/server/observability/logger";
import { getAuthenticatedUserId } from "@/server/auth/user";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { upsertWorkoutLogService } from "@/server/services/workout-log/upsert-log";

type LogCursor = {
  performedAt: string;
  id: string;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTimezone(raw: string | null) {
  const timezone = raw?.trim();
  if (!timezone) return "UTC";

  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}


function resolvePerformedAt(raw: unknown) {
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
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as LogCursor;
    if (typeof decoded?.performedAt !== "string" || typeof decoded?.id !== "string") return null;
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

async function GETImpl(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = getAuthenticatedUserId();
    const planId = searchParams.get("planId")?.trim() ?? "";
    const dateFilter = searchParams.get("date")?.trim() ?? "";
    const timezone = normalizeTimezone(searchParams.get("timezone"));
    const cursor = parseCursor(searchParams.get("cursor"));
    const includeSets = parseBooleanQueryParam(searchParams.get("includeSets"), true);
    const includeGeneratedSession = parseBooleanQueryParam(searchParams.get("includeGeneratedSession"), true);
    const includeProgression = parseBooleanQueryParam(searchParams.get("includeProgression"), true);
    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;

    const filters: Array<any> = [eq(workoutLog.userId, userId)];

    if (planId) {
      filters.push(eq(workoutLog.planId, planId));
    }

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
          new Set(pageLogs.map((log) => log.generatedSessionId).filter((value): value is string => Boolean(value))),
        )
      : [];

    // PERF: 요청한 detail level에 맞춰 보조 쿼리를 선택적으로 실행
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
            .select({
              id: generatedSession.id,
              sessionKey: generatedSession.sessionKey,
            })
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

    const progressionSummaryByLogId = new Map<string, ReturnType<typeof buildProgressionSummary>>();
    for (const event of events) {
      if (!event.logId) continue;
      if (progressionSummaryByLogId.has(event.logId)) continue;
      progressionSummaryByLogId.set(
        event.logId,
        buildProgressionSummary({
          mode: "upsert",
          eventRow: event,
        }),
      );
    }

    const items = pageLogs.map((log) => ({
      ...log,
      sets: includeSets ? (setsByLogId.get(log.id) ?? []) : [],
      generatedSession: includeGeneratedSession && log.generatedSessionId
        ? (generatedSessionsById.get(log.generatedSessionId) ?? null)
        : null,
      progression: includeProgression ? (progressionSummaryByLogId.get(log.id) ?? null) : null,
    }));

    const last = pageLogs[pageLogs.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ performedAt: last.performedAt.toISOString(), id: last.id }) : null;

    return NextResponse.json({ items, nextCursor, limit });
  } catch (e: any) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

async function POSTImpl(req: Request) {
  try {
    const locale = await resolveRequestLocale();
    const body = await req.json();
    const userId = getAuthenticatedUserId();
    const timezone = normalizeTimezone(typeof body.timezone === "string" ? body.timezone : null);
    const performedAt = resolvePerformedAt(body.performedAt);

    const sets = Array.isArray(body.sets) ? body.sets : [];
    if (sets.length === 0) {
      return NextResponse.json({ error: locale === "ko" ? "세트 정보가 필요합니다." : "Sets are required." }, { status: 400 });
    }
    if (!performedAt) {
      return NextResponse.json({ error: locale === "ko" ? "performedAt은 올바른 날짜/시간이어야 합니다." : "performedAt must be a valid datetime." }, { status: 400 });
    }

    const created = await upsertWorkoutLogService({
      userId,
      locale,
      timezone,
      performedAt,
      durationMinutes: body.durationMinutes,
      notes: body.notes,
      tags: body.tags,
      planId: typeof body.planId === "string" && body.planId.trim() ? body.planId.trim() : null,
      generatedSessionId: typeof body.generatedSessionId === "string" && body.generatedSessionId.trim() ? body.generatedSessionId.trim() : null,
      sets,
      progressionTargetDecisions: parseProgressionTargetDecisions(body.progressionTargetDecisions),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);

export const POST = withApiLogging(POSTImpl);
