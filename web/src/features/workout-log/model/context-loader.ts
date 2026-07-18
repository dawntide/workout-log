import { apiGet, apiPost } from "@/shared/api";
import {
  createWorkoutRecordDraft,
  createWorkoutRecordDraftFromLog,
  prepareWorkoutRecordDraftForEntry,
  type WorkoutProgramExerciseEntryStateMap,
  type WorkoutRecordDraft,
} from "@/entities/workout-record";
import { type WorkoutPreferences } from "@/lib/settings/workout-preferences";
import {
  applyRecentWeightsToCustomExercises,
  buildLastSessionSummary,
} from "@/lib/workout-record/last-session-summary";
import type {
  WorkoutLogDetailResponse,
  WorkoutLogDetailedLogItem,
  WorkoutLogActiveRef5SessionResponse,
  WorkoutLogGeneratedSessionResponse,
  WorkoutLogLastSessionSummary,
  WorkoutLogLogsResponse,
  WorkoutLogRecentLogItem,
} from "./types";
import { isRef5PlanParams } from "@/lib/workout-record/ref5-plan";

export type LoadWorkoutContextInput = {
  planId: string;
  planName: string;
  dateKey: string;
  preferences: WorkoutPreferences;
  planAutoProgression?: boolean;
  planSchedule?: unknown;
  planParams?: Record<string, unknown> | null;
  logId?: string | null;
  generatedSessionId?: string | null;
  initialLog?: WorkoutLogDetailedLogItem | null;
};

type LoadWorkoutContextDependencies = {
  browserTimezone: string;
  locale: "ko" | "en";
  applyWeightRulesToDraft: (
    sourceDraft: WorkoutRecordDraft,
    preferences: WorkoutPreferences,
  ) => WorkoutRecordDraft;
};

export type LoadedWorkoutContextResult = {
  kind: "loaded";
  selectedPlanId: string;
  draft: WorkoutRecordDraft;
  programEntryState: WorkoutProgramExerciseEntryStateMap;
  recentLogItems: WorkoutLogRecentLogItem[];
  lastSession: WorkoutLogLastSessionSummary;
  resumedRef5SessionId?: string;
};

export type BlockedWorkoutContextResult = {
  kind: "blocked";
  message: string;
};

export type Ref5StartRequiredWorkoutContextResult = {
  kind: "ref5-start-required";
  selectedPlanId: string;
  planId: string;
  planName: string;
  dateKey: string;
  planParams: Record<string, unknown> | null;
  recentLogItems: WorkoutLogRecentLogItem[];
  lastSession: WorkoutLogLastSessionSummary;
};

export type WorkoutContextResult =
  | LoadedWorkoutContextResult
  | BlockedWorkoutContextResult
  | Ref5StartRequiredWorkoutContextResult;

function buildRecentLogsPath(planId: string) {
  return planId
    ? `/api/logs?planId=${encodeURIComponent(planId)}&limit=6&includeProgression=0`
    : "/api/logs?limit=6&includeProgression=0";
}

/** performedAt(ISO 문자열)이 dateKey(YYYY-MM-DD) 날짜에 해당하는지 타임존 기준으로 확인 */
function isLogOnDate(performedAt: string, dateKey: string, timezone: string): boolean {
  try {
    const date = new Date(performedAt);
    if (Number.isNaN(date.getTime())) return false;
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    return local === dateKey;
  } catch {
    return false;
  }
}

export async function loadWorkoutContextData(
  input: LoadWorkoutContextInput,
  {
    browserTimezone,
    locale,
    applyWeightRulesToDraft,
  }: LoadWorkoutContextDependencies,
): Promise<WorkoutContextResult> {
  const recentLogsPath = buildRecentLogsPath(input.planId);

  if (input.logId) {
    const [logRes, logsRes] = await Promise.all([
      input.initialLog
        ? Promise.resolve({ item: input.initialLog })
        : apiGet<WorkoutLogDetailResponse>(`/api/logs/${encodeURIComponent(input.logId)}`),
      apiGet<WorkoutLogLogsResponse>(recentLogsPath),
    ]);

    const selectedPlanId =
      typeof logRes.item.planId === "string" && logRes.item.planId.trim()
        ? logRes.item.planId
        : input.planId;
    const draft = applyWeightRulesToDraft(
      createWorkoutRecordDraftFromLog(logRes.item, input.planName, {
        sessionDate: input.dateKey || undefined,
        timezone: browserTimezone,
        planSchedule: input.planSchedule,
        locale,
      }),
      input.preferences,
    );
    const summaryDateKey = input.dateKey || draft.session.sessionDate;

    return {
      kind: "loaded",
      selectedPlanId,
      draft,
      programEntryState: {},
      recentLogItems: logsRes.items ?? [],
      lastSession: buildLastSessionSummary(
        logsRes.items ?? [],
        summaryDateKey,
        input.planParams,
        input.preferences.bodyweightKg,
        locale,
      ),
    };
  }

  if (input.generatedSessionId && input.planId) {
    const [sessionRes, logsRes] = await Promise.all([
      apiGet<WorkoutLogGeneratedSessionResponse>(
        `/api/plans/${encodeURIComponent(input.planId)}/generated-sessions/${encodeURIComponent(input.generatedSessionId)}`,
        // A persisted REF5 session must be checked against the plan's current
        // protocol on every resume. SWR/IDB data can predate an upgrade or come
        // from another tab, so it must not bypass the server's stale guard.
        { cachePolicy: "network-only" },
      ),
      apiGet<WorkoutLogLogsResponse>(recentLogsPath),
    ]);
    const prepared = prepareWorkoutRecordDraftForEntry(
      applyWeightRulesToDraft(
        createWorkoutRecordDraft(sessionRes.session, input.planName, {
          timezone: browserTimezone,
          planSchedule: input.planSchedule,
          locale,
        }),
        input.preferences,
      ),
    );
    return {
      kind: "loaded",
      selectedPlanId: input.planId,
      draft: prepared.draft,
      programEntryState: prepared.programEntryState,
      recentLogItems: logsRes.items ?? [],
      lastSession: buildLastSessionSummary(
        logsRes.items ?? [],
        prepared.draft.session.sessionDate,
        input.planParams,
        input.preferences.bodyweightKg,
        locale,
      ),
    };
  }

  if (input.planId && input.dateKey) {
    // REF5 preview/start is an explicit two-step protocol. Opening the page must
    // never create a generated session or consume a runtime transition.
    const ref5Plan = isRef5PlanParams(input.planParams);
    const logsPromise = apiGet<WorkoutLogLogsResponse>(recentLogsPath);
    const sessionPromise = ref5Plan
      ? apiGet<WorkoutLogActiveRef5SessionResponse>(
          `/api/plans/${encodeURIComponent(input.planId)}/generated-sessions/active?date=${encodeURIComponent(input.dateKey)}`,
          { cachePolicy: "network-only" },
        )
      : apiPost<WorkoutLogGeneratedSessionResponse>(
          `/api/plans/${encodeURIComponent(input.planId)}/generate`,
          {
            sessionDate: input.dateKey,
            timezone: browserTimezone,
          },
        );
    const [sessionRes, logsRes] = await Promise.all([sessionPromise, logsPromise]);

    // 최근 로그에서 오늘 날짜 로그 탐지 (별도 check API 불필요)
    const todayLogItem = (logsRes.items ?? []).find((item) =>
      isLogOnDate(item.performedAt, input.dateKey, browserTimezone),
    );

    // A completed REF5 log does not block another explicit session on the same
    // calendar day, but an unfinished started session must be resumed first.
    if (todayLogItem && !ref5Plan) {
      // 오늘 기록이 이미 있으면 상세 정보만 추가 로드 (recentLogs는 이미 있음)
      const logRes = await apiGet<WorkoutLogDetailResponse>(
        `/api/logs/${encodeURIComponent(todayLogItem.id)}`,
      );
      const selectedPlanId =
        typeof logRes.item.planId === "string" && logRes.item.planId.trim()
          ? logRes.item.planId
          : input.planId;
      const draft = applyWeightRulesToDraft(
        createWorkoutRecordDraftFromLog(logRes.item, input.planName, {
          sessionDate: input.dateKey || undefined,
          timezone: browserTimezone,
          planSchedule: input.planSchedule,
          locale,
        }),
        input.preferences,
      );
      const summaryDateKey = input.dateKey || draft.session.sessionDate;
      return {
        kind: "loaded",
        selectedPlanId,
        draft,
        programEntryState: {},
        recentLogItems: logsRes.items ?? [],
        lastSession: buildLastSessionSummary(
          logsRes.items ?? [],
          summaryDateKey,
          input.planParams,
          input.preferences.bodyweightKg,
          locale,
        ),
      };
    }

    if (ref5Plan) {
      if (sessionRes.session) {
        const prepared = prepareWorkoutRecordDraftForEntry(
          applyWeightRulesToDraft(
            createWorkoutRecordDraft(sessionRes.session, input.planName, {
              timezone: browserTimezone,
              planSchedule: input.planSchedule,
              locale,
            }),
            input.preferences,
          ),
        );
        return {
          kind: "loaded",
          selectedPlanId: input.planId,
          draft: prepared.draft,
          programEntryState: prepared.programEntryState,
          recentLogItems: logsRes.items ?? [],
          lastSession: buildLastSessionSummary(
            logsRes.items ?? [],
            prepared.draft.session.sessionDate,
            input.planParams,
            input.preferences.bodyweightKg,
            locale,
          ),
          resumedRef5SessionId: sessionRes.session.id ?? undefined,
        };
      }
      return {
        kind: "ref5-start-required",
        selectedPlanId: input.planId,
        planId: input.planId,
        planName: input.planName,
        dateKey: input.dateKey,
        planParams: input.planParams ?? null,
        recentLogItems: logsRes.items ?? [],
        lastSession: buildLastSessionSummary(
          logsRes.items ?? [],
          input.dateKey,
          input.planParams,
          input.preferences.bodyweightKg,
          locale,
        ),
      };
    }

    // 오늘 기록 없음 → generate 결과 사용
    if (!sessionRes.session) {
      return {
        kind: "blocked",
        message:
          locale === "ko"
            ? "세션을 준비하지 못했습니다. 다시 시도해 주세요."
            : "Could not prepare the session. Please try again.",
      };
    }
    const prepared = prepareWorkoutRecordDraftForEntry(
      applyRecentWeightsToCustomExercises(
        applyWeightRulesToDraft(
          createWorkoutRecordDraft(sessionRes.session, input.planName, {
            sessionDate: input.dateKey,
            timezone: browserTimezone,
            planSchedule: input.planSchedule,
            locale,
          }),
          input.preferences,
        ),
        logsRes.items ?? [],
      ),
    );

    return {
      kind: "loaded",
      selectedPlanId: input.planId,
      draft: prepared.draft,
      programEntryState: prepared.programEntryState,
      recentLogItems: logsRes.items ?? [],
      lastSession: buildLastSessionSummary(
        logsRes.items ?? [],
        input.dateKey,
        input.planParams,
        input.preferences.bodyweightKg,
        locale,
      ),
    };
  }

  // planId 없는 경우 (비정상 경로)
  return {
    kind: "blocked",
    message: locale === "ko" ? "플랜을 선택해 주세요." : "Please select a plan.",
  };
}
