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
  WorkoutLogGeneratedSessionResponse,
  WorkoutLogLastSessionSummary,
  WorkoutLogLogsResponse,
  WorkoutLogRecentLogItem,
} from "./types";

export type LoadWorkoutContextInput = {
  planId: string;
  planName: string;
  dateKey: string;
  preferences: WorkoutPreferences;
  planAutoProgression?: boolean;
  planSchedule?: unknown;
  planParams?: Record<string, unknown> | null;
  logId?: string | null;
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
};

export type BlockedWorkoutContextResult = {
  kind: "blocked";
  message: string;
};

export type WorkoutContextResult =
  | LoadedWorkoutContextResult
  | BlockedWorkoutContextResult;

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

  if (input.planId && input.dateKey) {
    // generate + recentLogs 동시 요청 (기존 check→generate 2-round-trip → 1-round-trip)
    const [sessionRes, logsRes] = await Promise.all([
      apiPost<WorkoutLogGeneratedSessionResponse>(`/api/plans/${encodeURIComponent(input.planId)}/generate`, {
        sessionDate: input.dateKey,
        timezone: browserTimezone,
      }),
      apiGet<WorkoutLogLogsResponse>(recentLogsPath),
    ]);

    // 최근 로그에서 오늘 날짜 로그 탐지 (별도 check API 불필요)
    const todayLogItem = (logsRes.items ?? []).find((item) =>
      isLogOnDate(item.performedAt, input.dateKey, browserTimezone),
    );

    if (todayLogItem) {
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

    // 오늘 기록 없음 → generate 결과 사용
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
