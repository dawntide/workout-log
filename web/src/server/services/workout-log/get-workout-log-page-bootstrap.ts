import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@workout/core/db/client";
import { plan, userSetting, workoutLog } from "@workout/core/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { readWorkoutPreferences } from "@/lib/settings/workout-preferences";
import { generateAndSaveSession } from "@workout/core/program-engine/generateSession";
import { loadWorkoutContextServer } from "./load-workout-log-context";
import type {
  WorkoutRecordDraft,
  WorkoutProgramExerciseEntryStateMap,
} from "@/entities/workout-record";
import type {
  WorkoutLogRecentLogItem,
  WorkoutLogLastSessionSummary,
} from "@/features/workout-log/model/types";

export type WorkoutLogPlanListItem = {
  id: string;
  name: string;
  params: Record<string, unknown> | null;
  isArchived: boolean;
};

export type WorkoutLogSettingsSnapshot = Record<string, string | number | boolean | null>;

// ─── SSR 컨텍스트 타입 (서버 → 클라이언트 전달, JSON 직렬화 가능) ───────────

export type WorkoutLogInitialContext =
  | {
      kind: "loaded";
      /** 클라이언트가 현재 query와 일치 여부를 검증하는 키 */
      matchKey: string; // `${planId}:${dateKey}:${logId ?? ""}`
      selectedPlanId: string;
      draft: WorkoutRecordDraft;
      programEntryState: WorkoutProgramExerciseEntryStateMap;
      recentLogItems: WorkoutLogRecentLogItem[];
      lastSession: WorkoutLogLastSessionSummary;
    }
  | {
      kind: "blocked";
      matchKey: string;
      message: string;
    };

export type WorkoutLogPageBootstrap = {
  initialPlans: WorkoutLogPlanListItem[];
  initialSettings: WorkoutLogSettingsSnapshot;
  initialContext?: WorkoutLogInitialContext | null;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type RawSearchParams = Record<string, string | string[] | undefined>;

function getString(params: RawSearchParams, key: string): string | null {
  const v = params[key];
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || null;
}

export async function getWorkoutLogPageBootstrap(
  searchParams: RawSearchParams = {},
): Promise<WorkoutLogPageBootstrap> {
  const userId = await requireAuthenticatedUserId();

  // plans + settings 병렬 조회 (기존 동작)
  const [plans, settingRows] = await Promise.all([
    db
      .select({
        id: plan.id,
        name: plan.name,
        params: plan.params,
        isArchived: plan.isArchived,
      })
      .from(plan)
      .where(eq(plan.userId, userId))
      .orderBy(desc(plan.createdAt)),

    db
      .select({ key: userSetting.key, value: userSetting.value })
      .from(userSetting)
      .where(eq(userSetting.userId, userId)),
  ]);

  const initialSettings: WorkoutLogSettingsSnapshot = {};
  for (const row of settingRows) {
    const value = row.value;
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
      initialSettings[row.key] = value;
    }
  }

  const initialPlans: WorkoutLogPlanListItem[] = plans.map((entry) => ({
    id: entry.id,
    name: entry.name,
    params: entry.params as Record<string, unknown> | null,
    isArchived: entry.isArchived,
  }));

  // 활성 플랜이 없는 상태로 /workout/log 에 진입하면 빈 페이지를 띄우지 않고
  // 프로그램 스토어로 안내한다 — 홈/dock "시작" 핸들러가 동일하게 귀결되도록 (P0-2).
  // 이미 ?planId= 등 명시적 컨텍스트를 들고 들어온 경우엔 그쪽 분기에서 처리.
  const hasActivePlan = initialPlans.some((p) => !p.isArchived);
  const hasExplicitContext =
    getString(searchParams, "planId") !== null ||
    getString(searchParams, "logId") !== null ||
    getString(searchParams, "date") !== null ||
    getString(searchParams, "context") !== null;
  if (!hasActivePlan && !hasExplicitContext) {
    redirect("/program-store");
  }

  // ─── 기본 날짜 advance: ?date= 와 ?logId= 둘 다 없을 때만 적용.
  // 가장 최근 로그가 today 이상이면 그 다음날로 redirect — URL 에 ?date= 를 박아
  // client matchKey 와 일치시킨다. redirect 는 try 바깥에서 호출해야 NEXT_REDIRECT
  // 에러가 catch 에 먹히지 않는다.
  await maybeRedirectToNextSessionDate(userId, initialPlans, searchParams);

  // ─── SSR 컨텍스트 로딩 ───────────────────────────────────────────────────
  const initialContext = await resolveInitialContext(
    userId,
    initialPlans,
    initialSettings,
    searchParams,
  );

  return { initialPlans, initialSettings, initialContext };
}

async function maybeRedirectToNextSessionDate(
  userId: string,
  plans: WorkoutLogPlanListItem[],
  searchParams: RawSearchParams,
): Promise<void> {
  const rawPlanId = getString(searchParams, "planId");
  const rawDate = getString(searchParams, "date");
  const rawLogId = getString(searchParams, "logId");
  if (rawDate || rawLogId) return;

  const activePlans = plans.filter((p) => !p.isArchived);
  const targetPlan =
    (rawPlanId ? activePlans.find((p) => p.id === rawPlanId) : null) ??
    activePlans[0] ??
    null;
  if (!targetPlan) return;

  let latestKey: string | null = null;
  try {
    const latestRows = await db
      .select({ performedAt: workoutLog.performedAt })
      .from(workoutLog)
      .where(and(eq(workoutLog.userId, userId), eq(workoutLog.planId, targetPlan.id)))
      .orderBy(desc(workoutLog.performedAt))
      .limit(1);
    const latestPerformedAt = latestRows[0]?.performedAt;
    if (latestPerformedAt) {
      const asDate =
        latestPerformedAt instanceof Date ? latestPerformedAt : new Date(latestPerformedAt as string);
      latestKey = asDate.toISOString().slice(0, 10);
    }
  } catch {
    return; // 쿼리 실패 시 평소처럼 today 로 진행
  }

  if (!latestKey) return;
  const todayKey = new Date().toISOString().slice(0, 10);
  if (latestKey < todayKey) return;

  const next = new Date(`${latestKey}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const advancedKey = next.toISOString().slice(0, 10);
  redirect(`/workout/log?planId=${encodeURIComponent(targetPlan.id)}&date=${advancedKey}`);
}

async function resolveInitialContext(
  userId: string,
  plans: WorkoutLogPlanListItem[],
  settings: WorkoutLogSettingsSnapshot,
  searchParams: RawSearchParams,
): Promise<WorkoutLogInitialContext | null> {
  try {
    const rawPlanId = getString(searchParams, "planId");
    const rawDate = getString(searchParams, "date");
    const rawLogId = getString(searchParams, "logId");

    // 날짜: 명시된 경우 사용, 아니면 서버 UTC today
    const dateKey =
      rawDate && DATE_ONLY_PATTERN.test(rawDate)
        ? rawDate
        : new Date().toISOString().slice(0, 10);

    // 플랜 결정
    const activePlans = plans.filter((p) => !p.isArchived);
    const plan =
      (rawPlanId ? activePlans.find((p) => p.id === rawPlanId) : null) ??
      activePlans[0] ??
      null;
    if (!plan) return null;

    const matchKey = `${plan.id}:${dateKey}:${rawLogId ?? ""}`;
    const preferences = readWorkoutPreferences(settings);
    const planParams = plan.params as Record<string, unknown> | null;
    const locale = (preferences.locale ?? "ko") as "ko" | "en";

    const input = {
      planId: plan.id,
      planName: plan.name,
      dateKey,
      preferences,
      planAutoProgression: planParams?.autoProgression === true,
      planSchedule: planParams?.schedule,
      planParams,
      logId: rawLogId,
      locale,
      matchKey,
    };

    // logId 또는 today 기존 로그: generateAndSaveSession 불필요
    if (rawLogId) {
      return loadWorkoutContextServer(userId, input);
    }

    // 새 세션: generate 후 컨텍스트 구성
    const sessionData = await generateAndSaveSession({
      userId,
      planId: plan.id,
      sessionDate: dateKey,
      timezone: "UTC",
    });

    return loadWorkoutContextServer(userId, input, sessionData);
  } catch {
    // 실패하면 클라이언트 폴백 (렌더링은 항상 성공해야 함)
    return null;
  }
}
