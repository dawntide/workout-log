/**
 * 서버사이드 워크아웃 컨텍스트 로더
 * DB를 직접 쿼리해서 SSR에서 클라이언트 API 호출 없이 컨텍스트를 반환합니다.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  generatedSession,
  workoutLog,
  workoutSet,
} from "@/server/db/schema";
import {
  createWorkoutRecordDraft,
  createWorkoutRecordDraftFromLog,
  prepareWorkoutRecordDraftForEntry,
} from "@/entities/workout-record";
import type { WorkoutPreferences } from "@/lib/settings/workout-preferences";
import { applyWorkoutLogWeightRulesToDraft } from "@/lib/workout-record/weight-rules";
import {
  applyRecentWeightsToCustomExercises,
  buildLastSessionSummary,
} from "@/features/workout-log/model/last-session-summary";
import type {
  WorkoutLogDetailedLogItem,
  WorkoutLogRecentLogItem,
} from "@/features/workout-log/model/types";
import type { GeneratedSessionLike } from "@/entities/workout-record";
import type { WorkoutLogInitialContext } from "./get-workout-log-page-bootstrap";
import { shouldBlockAutoProgressionNewLog } from "./logging-policy";

// ─── DB 헬퍼 ─────────────────────────────────────────────────────────────────

/** DB Date → ISO 문자열 변환 */
function toIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  if (typeof d === "string") return d;
  return d.toISOString();
}

/** 최근 로그 목록 (세트 포함) */
export async function fetchRecentLogsServer(
  userId: string,
  planId: string,
  limit = 6,
): Promise<WorkoutLogRecentLogItem[]> {
  const logs = await db
    .select({
      id: workoutLog.id,
      generatedSessionId: workoutLog.generatedSessionId,
      performedAt: workoutLog.performedAt,
    })
    .from(workoutLog)
    .where(and(eq(workoutLog.userId, userId), eq(workoutLog.planId, planId)))
    .orderBy(desc(workoutLog.performedAt), desc(workoutLog.id))
    .limit(limit);

  if (logs.length === 0) return [];

  const logIds = logs.map((l) => l.id);
  const generatedSessionIds = Array.from(
    new Set(logs.map((l) => l.generatedSessionId).filter((id): id is string => Boolean(id))),
  );

  const [sets, sessions] = await Promise.all([
    db
      .select({
        logId: workoutSet.logId,
        exerciseName: workoutSet.exerciseName,
        reps: workoutSet.reps,
        weightKg: workoutSet.weightKg,
        meta: workoutSet.meta,
      })
      .from(workoutSet)
      .where(inArray(workoutSet.logId, logIds))
      .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id)),

    generatedSessionIds.length > 0
      ? db
          .select({ id: generatedSession.id, sessionKey: generatedSession.sessionKey })
          .from(generatedSession)
          .where(inArray(generatedSession.id, generatedSessionIds))
      : Promise.resolve([] as Array<{ id: string; sessionKey: string }>),
  ]);

  const setsByLogId = new Map<string, typeof sets>();
  for (const s of sets) {
    const list = setsByLogId.get(s.logId) ?? [];
    list.push(s);
    setsByLogId.set(s.logId, list);
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  return logs.map((log) => ({
    id: log.id,
    performedAt: toIso(log.performedAt),
    generatedSession: log.generatedSessionId
      ? (sessionById.get(log.generatedSessionId) ?? null)
      : null,
    sets: (setsByLogId.get(log.id) ?? []).map((s) => ({
      exerciseName: s.exerciseName ?? "",
      reps: s.reps ?? null,
      weightKg: s.weightKg ?? null,
      meta: s.meta,
    })),
  }));
}

/** 특정 날짜의 기존 로그 ID 조회 (UTC 기준 date-only 비교) */
async function findLogIdForDate(
  userId: string,
  planId: string,
  dateKey: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(
      and(
        eq(workoutLog.userId, userId),
        eq(workoutLog.planId, planId),
        // UTC 기준 날짜 범위 필터
        sql`${workoutLog.performedAt} >= ${dateKey}::date
          AND ${workoutLog.performedAt} < (${dateKey}::date + interval '1 day')`,
      ),
    )
    .orderBy(desc(workoutLog.performedAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function hasLaterLog(
  userId: string,
  planId: string,
  dateKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(
      and(
        eq(workoutLog.userId, userId),
        eq(workoutLog.planId, planId),
        sql`${workoutLog.performedAt} >= (${dateKey}::date + interval '1 day')`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** 로그 상세 정보 조회 (세트 + generatedSession 포함) */
export async function fetchLogDetailServer(
  userId: string,
  logId: string,
): Promise<WorkoutLogDetailedLogItem | null> {
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
  if (!log || log.userId !== userId) return null;

  const [sets, generatedRow] = await Promise.all([
    db
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
      .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id)),

    log.generatedSessionId
      ? db
          .select({
            id: generatedSession.id,
            planId: generatedSession.planId,
            sessionKey: generatedSession.sessionKey,
            snapshot: generatedSession.snapshot,
            updatedAt: generatedSession.updatedAt,
          })
          .from(generatedSession)
          .where(eq(generatedSession.id, log.generatedSessionId))
          .limit(1)
      : Promise.resolve([] as any[]),
  ]);

  const gen = Array.isArray(generatedRow) ? generatedRow[0] : null;

  return {
    id: log.id,
    planId: log.planId,
    generatedSessionId: log.generatedSessionId,
    performedAt: toIso(log.performedAt),
    notes: log.notes,
    sets: sets.map((s) => ({
      id: s.id,
      logId: s.logId,
      exerciseId: s.exerciseId,
      exerciseName: s.exerciseName,
      sortOrder: s.sortOrder,
      setNumber: s.setNumber,
      reps: s.reps,
      weightKg: s.weightKg ?? null,
      rpe: s.rpe !== null && s.rpe !== undefined ? Number(s.rpe) : null,
      isExtra: s.isExtra,
      meta: s.meta,
    })),
    generatedSession: gen
      ? {
          id: gen.id,
          planId: gen.planId,
          sessionKey: gen.sessionKey,
          snapshot: gen.snapshot,
          updatedAt: gen.updatedAt ? toIso(gen.updatedAt) : undefined,
        }
      : null,
  };
}

// ─── 컨텍스트 빌더 ──────────────────────────────────────────────────────────

type ServerContextInput = {
  planId: string;
  planName: string;
  dateKey: string;
  preferences: WorkoutPreferences;
  planAutoProgression?: boolean;
  planSchedule?: unknown;
  planParams?: Record<string, unknown> | null;
  logId?: string | null;
  locale: "ko" | "en";
  /** page.tsx searchParams 에서 읽은 매칭 키 */
  matchKey: string;
};

/**
 * 서버사이드에서 WorkoutLogInitialContext 를 구성합니다.
 * 실패하면 null 을 반환하고 클라이언트가 폴백합니다.
 */
export async function loadWorkoutContextServer(
  userId: string,
  input: ServerContextInput,
  generatedSessionData?: GeneratedSessionLike | null,
): Promise<WorkoutLogInitialContext | null> {
  const { planId, planName, dateKey, preferences, locale, matchKey } = input;

  try {
    // logId 있는 경우: 기존 로그 편집
    if (input.logId) {
      const [logDetail, recentLogs] = await Promise.all([
        fetchLogDetailServer(userId, input.logId),
        fetchRecentLogsServer(userId, planId),
      ]);
      if (!logDetail) return null;

      const selectedPlanId =
        typeof logDetail.planId === "string" && logDetail.planId.trim()
          ? logDetail.planId
          : planId;

      const draft = applyWorkoutLogWeightRulesToDraft(
        createWorkoutRecordDraftFromLog(logDetail, planName, {
          sessionDate: dateKey || undefined,
          timezone: "UTC",
          planSchedule: input.planSchedule,
          locale,
        }),
        preferences,
      );

      const summaryDateKey = dateKey || draft.session.sessionDate;

      return {
        kind: "loaded",
        matchKey,
        selectedPlanId,
        draft,
        programEntryState: {},
        recentLogItems: recentLogs,
        lastSession: buildLastSessionSummary(
          recentLogs,
          summaryDateKey,
          input.planParams,
          preferences.bodyweightKg,
          locale,
        ),
      };
    }

    // 선택 날짜 기록 + 최근 로그 + 이후 로그 존재 여부를 병렬 조회
    const [existingLogIdForDate, recentLogs, hasLaterLogs] = await Promise.all([
      findLogIdForDate(userId, planId, dateKey),
      fetchRecentLogsServer(userId, planId),
      input.planAutoProgression === true && dateKey
        ? hasLaterLog(userId, planId, dateKey)
        : Promise.resolve(false),
    ]);

    if (existingLogIdForDate) {
      const logDetail = await fetchLogDetailServer(userId, existingLogIdForDate);
      if (!logDetail) return null;

      const selectedPlanId =
        typeof logDetail.planId === "string" && logDetail.planId.trim()
          ? logDetail.planId
          : planId;

      const draft = applyWorkoutLogWeightRulesToDraft(
        createWorkoutRecordDraftFromLog(logDetail, planName, {
          sessionDate: dateKey || undefined,
          timezone: "UTC",
          planSchedule: input.planSchedule,
          locale,
        }),
        preferences,
      );

      const summaryDateKey = dateKey || draft.session.sessionDate;

      return {
        kind: "loaded",
        matchKey,
        selectedPlanId,
        draft,
        programEntryState: {},
        recentLogItems: recentLogs,
        lastSession: buildLastSessionSummary(
          recentLogs,
          summaryDateKey,
          input.planParams,
          preferences.bodyweightKg,
          locale,
        ),
      };
    }

    if (
      shouldBlockAutoProgressionNewLog({
        planAutoProgression: input.planAutoProgression,
        hasExistingLogForDate: Boolean(existingLogIdForDate),
        hasLaterLogs,
      })
    ) {
      return {
        kind: "blocked",
        matchKey,
        message:
          locale === "ko"
            ? "선택한 날짜 이후에 운동기록이 있어 새 기록을 추가할 수 없습니다. 해당 기록을 먼저 삭제하거나 날짜를 조정해 주세요."
            : "There are workout logs after the selected date. Delete those logs first or choose a later date before adding a new log.",
      };
    }

    // 새 세션: generateAndSaveSession 결과를 사용
    if (!generatedSessionData) return null;

    const prepared = prepareWorkoutRecordDraftForEntry(
      applyRecentWeightsToCustomExercises(
        applyWorkoutLogWeightRulesToDraft(
          createWorkoutRecordDraft(generatedSessionData, planName, {
            sessionDate: dateKey,
            timezone: "UTC",
            planSchedule: input.planSchedule,
            locale,
          }),
          preferences,
        ),
        recentLogs,
      ),
    );

    return {
      kind: "loaded",
      matchKey,
      selectedPlanId: planId,
      draft: prepared.draft,
      programEntryState: prepared.programEntryState,
      recentLogItems: recentLogs,
      lastSession: buildLastSessionSummary(
        recentLogs,
        dateKey,
        input.planParams,
        preferences.bodyweightKg,
        locale,
      ),
    };
  } catch {
    // 실패 시 클라이언트 폴백
    return null;
  }
}
