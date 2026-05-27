import { and, asc, eq, inArray, lt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import {
  exercise,
  exerciseAlias,
  generatedSession,
  workoutLog,
  workoutSet,
} from "@/server/db/schema";
import { rebuildAutoProgressionForPlan } from "@/server/progression/autoProgression";
import { buildProgressionSummary, readProgressEventByLog } from "@/server/progression/summary";
import { invalidateStatsCacheForUser } from "@/server/stats/cache";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@/server/observability/logger";
import { getAuthenticatedUserId } from "@/server/auth/user";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { upsertWorkoutLogService } from "@/server/services/workout-log/upsert-log";
import { getSettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { readWorkoutPreferences } from "@/lib/settings/workout-preferences";

type Ctx = { params: Promise<{ logId: string }> };

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

/**
 * 운동 매칭 키 — exerciseId가 있으면 'eid:<id>', 없으면 alias 정규화 후 'name:<lower>'.
 * Alias 정규화: alias 테이블에서 매칭되는 canonical exercise.id를 찾아 'eid:<id>'로 승격.
 */
type MatchKey = string;

function nameKey(name: string): MatchKey {
  return `name:${name.trim().toLowerCase()}`;
}

function idKey(exerciseId: string): MatchKey {
  return `eid:${exerciseId}`;
}

async function detectPersonalRecords(input: {
  userId: string;
  logId: string;
  sets: Array<{
    exerciseName: string;
    exerciseId: string | null;
    reps: number | null;
    weightKg: number | null;
    isExtra: boolean | null;
  }>;
  performedAt: Date;
}): Promise<PersonalRecordPayload[]> {
  const { userId, logId, sets, performedAt } = input;

  // 0) Alias / exerciseId 정규화용 lookup 준비 — 이번 로그에 등장한 모든 운동명에 대해
  //    alias 테이블에서 canonical exerciseId를 미리 찾아 둔다.
  //    워크아웃 세트가 이미 exerciseId를 가지고 있으면 그것을 사용.
  const namesInLog = Array.from(
    new Set(
      sets
        .map((s) => String(s.exerciseName ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const aliasToId = new Map<string, string>(); // lowercased alias -> exerciseId
  if (namesInLog.length > 0) {
    const aliasRows = await db
      .select({
        alias: exerciseAlias.alias,
        exerciseId: exerciseAlias.exerciseId,
      })
      .from(exerciseAlias)
      .where(inArray(exerciseAlias.alias, namesInLog));
    for (const r of aliasRows) {
      aliasToId.set(r.alias.trim().toLowerCase(), r.exerciseId);
    }
    // 또한 exercise 본명도 함께 매칭
    const baseRows = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(inArray(exercise.name, namesInLog));
    for (const r of baseRows) {
      aliasToId.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  function resolveKey(
    exerciseId: string | null,
    name: string,
  ): MatchKey | null {
    if (exerciseId) return idKey(exerciseId);
    const lower = name.trim().toLowerCase();
    if (!lower) return null;
    const aliased = aliasToId.get(lower);
    if (aliased) return idKey(aliased);
    return nameKey(lower);
  }

  // 1) 이번 로그 운동별 top set (e1RM 기준)
  type Best = {
    weightKg: number;
    reps: number;
    e1rm: number;
    displayName: string;
  };
  const currentTop = new Map<MatchKey, Best>();
  for (const s of sets) {
    if (s.isExtra) continue;
    const w = Number(s.weightKg ?? 0);
    const r = Number(s.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0)
      continue;
    const displayName = String(s.exerciseName ?? "").trim();
    const key = resolveKey(s.exerciseId, displayName);
    if (!key) continue;
    const e = epley(w, r);
    const cur = currentTop.get(key);
    if (!cur || e > cur.e1rm) {
      currentTop.set(key, {
        weightKg: w,
        reps: r,
        e1rm: e,
        displayName,
      });
    }
  }
  if (currentTop.size === 0) return [];

  // 2) 사용자의 이전 모든 세트 — exerciseId / name 둘 다 select
  const priorRows = await db
    .select({
      exerciseId: workoutSet.exerciseId,
      exerciseName: workoutSet.exerciseName,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      isExtra: workoutSet.isExtra,
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

  // 이전 세트의 exerciseName도 alias 매핑 — 누적 lookup 확장
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
      .select({
        alias: exerciseAlias.alias,
        exerciseId: exerciseAlias.exerciseId,
      })
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
    const w = Number(r.weightKg ?? 0);
    const reps = Number(r.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(reps) || reps <= 0)
      continue;
    const key = resolveKey(
      r.exerciseId,
      String(r.exerciseName ?? ""),
    );
    if (!key) continue;
    const e = epley(w, reps);
    const cur = priorBest.get(key);
    if (cur == null || e > cur) priorBest.set(key, e);
  }

  // 3) 이번 top이 prior best를 넘으면 PR
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
      deltaE1rm:
        prev != null ? Number((cur.e1rm - prev).toFixed(2)) : cur.e1rm,
    });
    void key;
  }
  out.sort((a, b) => b.deltaE1rm - a.deltaE1rm);
  return out.slice(0, 3);
}

async function GETImpl(_req: Request, ctx: Ctx) {
  try {
    const locale = await resolveRequestLocale();
    const { logId } = await ctx.params;
    const userId = getAuthenticatedUserId();

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
    if (!log) return NextResponse.json({ error: locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found." }, { status: 404 });
    if (log.userId !== userId) return NextResponse.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, { status: 403 });

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
      ? buildProgressionSummary({
          mode: "upsert",
          eventRow: progressionEvent,
        })
      : null;

    // ── PR 감지 (best e1RM 비교) ─────────────────────────────────
    // exerciseId 기반 매칭. exerciseId가 없으면 alias 정규화로 canonical exercise.id 찾음.
    const personalRecords = await detectPersonalRecords({
      userId,
      logId,
      sets: sets.map((s) => ({
        exerciseName: s.exerciseName,
        exerciseId: s.exerciseId,
        reps: s.reps,
        weightKg: s.weightKg,
        isExtra: s.isExtra,
      })),
      performedAt: log.performedAt,
    });

    const settings = await getSettingsSnapshot();
    const prefs = readWorkoutPreferences(settings);
    const goal = prefs.trainingGoalPrimary;

    return NextResponse.json({
      item: {
        ...log,
        sets,
        generatedSession: generated,
        progression: progressionSummary,
        personalRecords,
        goal,
      },
    });
  } catch (e: any) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

async function PATCHImpl(req: Request, ctx: Ctx) {
  try {
    const locale = await resolveRequestLocale();
    const { logId } = await ctx.params;
    const userId = getAuthenticatedUserId();
    const body = await req.json();

    const sets = Array.isArray(body.sets) ? body.sets : [];

    // Date-only move: sets 없이 performedAt만 전달된 경우 날짜만 업데이트
    if (sets.length === 0) {
      if (!body.performedAt) {
        return NextResponse.json({ error: locale === "ko" ? "세트 정보가 필요합니다." : "Sets are required." }, { status: 400 });
      }

      const existingRows = await db
        .select({ id: workoutLog.id, userId: workoutLog.userId, planId: workoutLog.planId })
        .from(workoutLog)
        .where(eq(workoutLog.id, logId))
        .limit(1);

      const existing = existingRows[0];
      if (!existing) return NextResponse.json({ error: locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found." }, { status: 404 });
      if (existing.userId !== userId) return NextResponse.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, { status: 403 });

      await db.transaction(async (tx) => {
        await tx.update(workoutLog)
          .set({ performedAt: new Date(body.performedAt) })
          .where(eq(workoutLog.id, logId));

        if (existing.planId) {
          await rebuildAutoProgressionForPlan({ tx, userId, planId: existing.planId });
        }
        await invalidateStatsCacheForUser(userId, tx);
      });

      return NextResponse.json({ updated: true, logId });
    }

    const updated = await upsertWorkoutLogService({
      logId,
      userId,
      locale,
      timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC",
      performedAt: body.performedAt ? new Date(body.performedAt) : undefined,
      durationMinutes: body.durationMinutes,
      notes: body.notes,
      tags: body.tags,
      planId: typeof body.planId === "string" && body.planId.trim() ? body.planId.trim() : undefined,
      generatedSessionId: typeof body.generatedSessionId === "string" && body.generatedSessionId.trim() ? body.generatedSessionId.trim() : undefined,
      sets,
      progressionTargetDecisions: parseProgressionTargetDecisions(body.progressionTargetDecisions),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e: any) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

async function DELETEImpl(_req: Request, ctx: Ctx) {
  try {
    const locale = await resolveRequestLocale();
    const { logId } = await ctx.params;
    const userId = getAuthenticatedUserId();

    const existingRows = await db
      .select({
        id: workoutLog.id,
        userId: workoutLog.userId,
        planId: workoutLog.planId,
      })
      .from(workoutLog)
      .where(eq(workoutLog.id, logId))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) return NextResponse.json({ error: locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found." }, { status: 404 });
    if (existing.userId !== userId) return NextResponse.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, { status: 403 });

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(workoutLog).where(eq(workoutLog.id, logId));

      const rebuildResult = existing.planId
        ? await rebuildAutoProgressionForPlan({
            tx,
            userId,
            planId: existing.planId,
          })
        : { applied: false as const, reason: "skip:no-plan" as const };

      await invalidateStatsCacheForUser(userId, tx);

      return rebuildResult;
    });

    return NextResponse.json(
      {
        deleted: true,
        logId,
        progressionRebuilt: deleted.applied,
        progressionRebuildReason: deleted.reason,
      },
      { status: 200 },
    );
  } catch (e: any) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);
export const PATCH = withApiLogging(PATCHImpl);
export const DELETE = withApiLogging(DELETEImpl);
