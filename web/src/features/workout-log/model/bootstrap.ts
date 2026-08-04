import { apiGet } from "@/shared/api";
import { readActivePlanIdSetting, resolveActivePlan } from "@workout/core/active-plan";
import {
  readWorkoutPreferences,
  toDefaultWorkoutPreferences,
  type SettingsSnapshot,
  type WorkoutPreferences,
} from "@/lib/settings/workout-preferences";
import type { WorkoutLogQueryContext } from "@/lib/workout-record/query-context";
import type { WorkoutLogInitialContext } from "@/server/services/workout-log/get-workout-log-page-bootstrap";
import { getWorkoutLogClientBootstrap } from "./client";
import type { LoadWorkoutContextInput } from "./context-loader";
import type {
  WorkoutLogDetailResponse,
  WorkoutLogPlanItem,
} from "./types";

type ResolveWorkoutLogBootstrapInput = {
  query: WorkoutLogQueryContext;
  initialPlans?: WorkoutLogPlanItem[];
  initialSettings?: SettingsSnapshot | null;
  locale: "ko" | "en";
  /** matchKey 검증을 통과한 SSR 컨텍스트 — 있으면 logId 경로의 로그 상세 fetch를 생략한다. */
  ssrContext?: WorkoutLogInitialContext | null;
};

type NoPlanBootstrapResult = {
  kind: "no-plan";
  preferences: WorkoutPreferences;
};

type LoadContextBootstrapResult = {
  kind: "load-context";
  preferences: WorkoutPreferences;
  plans: WorkoutLogPlanItem[];
  openAdd: boolean;
  loadInput: LoadWorkoutContextInput;
};

export type WorkoutLogBootstrapResult =
  | NoPlanBootstrapResult
  | LoadContextBootstrapResult;

export async function resolveWorkoutLogBootstrap(
  input: ResolveWorkoutLogBootstrapInput,
): Promise<WorkoutLogBootstrapResult> {
  const { query, initialPlans, initialSettings, locale, ssrContext } = input;

  const { plans, settingsSnapshot } = await getWorkoutLogClientBootstrap({
    initialPlans,
    initialSettings,
  });

  const preferences = settingsSnapshot
    ? readWorkoutPreferences(settingsSnapshot)
    : toDefaultWorkoutPreferences();

  if (query.logId) {
    // SSR 컨텍스트가 같은 URL에서 만들어졌으면(matchKey 일치) 로그 상세를 이미 들고 있다 —
    // 여기서의 /api/logs/:id 재조회는 순수 중복이므로 생략한다. 미스 시에만 fetch 폴백.
    const ssrPlanId =
      ssrContext && ssrContext.kind !== "blocked" ? ssrContext.selectedPlanId : null;
    let initialLog: WorkoutLogDetailResponse["item"] | undefined;
    let logPlanId = ssrPlanId ?? "";
    if (!ssrPlanId) {
      const logRes = await apiGet<WorkoutLogDetailResponse>(
        `/api/logs/${encodeURIComponent(query.logId)}`,
      );
      initialLog = logRes.item;
      logPlanId = typeof logRes.item.planId === "string" ? logRes.item.planId : "";
    }

    const editablePlans = plans.filter(
      (entry) => !entry.isArchived || entry.id === logPlanId,
    );
    const matchedPlan =
      editablePlans.find((entry) => entry.id === logPlanId) ??
      editablePlans.find((entry) => entry.id === query.planId) ??
      editablePlans[0] ??
      null;
    const resolvedPlanId = matchedPlan?.id ?? logPlanId;
    const resolvedPlanName = matchedPlan?.name ?? (locale === "ko" ? "프로그램 미선택" : "No Program Selected");

    return {
      kind: "load-context",
      preferences,
      plans: editablePlans,
      openAdd: query.openAdd,
      loadInput: {
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        dateKey: query.hasExplicitDate ? query.date : "",
        preferences,
        planAutoProgression: matchedPlan?.params?.autoProgression === true,
        planSchedule: matchedPlan?.params?.schedule,
        planParams: matchedPlan?.params ?? null,
        logId: query.logId,
        initialLog,
      },
    };
  }

  const activePlans = plans.filter((entry) => !entry.isArchived);
  if (activePlans.length === 0) {
    return {
      kind: "no-plan",
      preferences,
    };
  }

  // URL의 planId가 우선이고, 없으면 활성 플랜(홈·캘린더와 같은 규칙)으로 떨어진다.
  const plan =
    activePlans.find((entry) => entry.id === query.planId) ??
    resolveActivePlan(activePlans, readActivePlanIdSetting(settingsSnapshot)) ??
    activePlans[0];

  return {
    kind: "load-context",
    preferences,
    plans: activePlans,
    openAdd: query.openAdd,
    loadInput: {
      planId: plan.id,
      planName: plan.name,
      dateKey: query.date,
      preferences,
      planAutoProgression: plan.params?.autoProgression === true,
      planSchedule: plan.params?.schedule,
      planParams: plan.params ?? null,
      generatedSessionId: query.sessionId,
    },
  };
}
