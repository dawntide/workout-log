import { apiGet } from "@/shared/api";
import {
  readWorkoutPreferences,
  toDefaultWorkoutPreferences,
  type SettingsSnapshot,
  type WorkoutPreferences,
} from "@/lib/settings/workout-preferences";
import type { WorkoutLogQueryContext } from "@/lib/workout-record/query-context";
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
  const { query, initialPlans, initialSettings, locale } = input;

  const { plans, settingsSnapshot } = await getWorkoutLogClientBootstrap({
    initialPlans,
    initialSettings,
  });

  const preferences = settingsSnapshot
    ? readWorkoutPreferences(settingsSnapshot)
    : toDefaultWorkoutPreferences();

  if (query.logId) {
    const logRes = await apiGet<WorkoutLogDetailResponse>(`/api/logs/${encodeURIComponent(query.logId)}`);

    const editablePlans = plans.filter(
      (entry) => !entry.isArchived || entry.id === logRes.item.planId,
    );
    const matchedPlan =
      editablePlans.find((entry) => entry.id === logRes.item.planId) ??
      editablePlans.find((entry) => entry.id === query.planId) ??
      editablePlans[0] ??
      null;
    const resolvedPlanId =
      matchedPlan?.id ??
      (typeof logRes.item.planId === "string" ? logRes.item.planId : "");
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
        initialLog: logRes.item,
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

  const fallbackPlan = activePlans[0];
  const plan = activePlans.find((entry) => entry.id === query.planId) ?? fallbackPlan;

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
