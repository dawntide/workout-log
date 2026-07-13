import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  parseDatabaseDate,
  requireDatabaseDate,
} from "@workout/core/db/date";
import {
  exercise,
  plan,
  programTemplate,
  programVersion,
  workoutLog,
  workoutSet,
} from "@workout/core/db/schema";
import { generateSessionSnapshot } from "@workout/core/program-engine/generateSession";
import { logInfo } from "@workout/core/observability/logger";
import { runSingleFlight } from "@workout/core/performance/single-flight";
import { getStatsCache, setStatsCache } from "../stats/cache";
import {
  fetchEnduranceStats,
  type EnduranceResult,
} from "../stats/endurance-service";
import {
  fetchMuscleVolume,
  type MuscleVolumeResult,
} from "../stats/muscle-volume-service";
import {
  fetchStrengthScore,
  type StrengthScoreResult,
} from "../stats/strength-score-service";
import { getSettingsSnapshotForUser } from "../services/settings/settings-snapshot";
import { resolveLoggedTotalLoadKg, bodyweightAddedSuffix } from "@workout/core/bodyweight-load";
import {
  formatPerformedHistoryCompact,
  formatPlannedGroups,
} from "@workout/core/workout-notation/format";
import {
  readWorkoutPreferences,
  type TrainingGoalKey,
} from "../settings/workout-preferences";
import { buildTodayLogHref, toLocalDateKey } from "@workout/core/workout-links";
import type { AppLocale } from "../locale";

// ─── Types ──────────────────────────────────────────────────────────

export type HomeTodayExercise = {
  name: string;
  exerciseId: string | null;
  role: "MAIN" | "ASSIST" | string;
  totalSets: number;
  summary: string;
};

export type HomeTodaySummary = {
  headline: string;
  programName: string;
  hasPlan: boolean;
  meta: string;
  completedSets: number;
  href: string;
  loggedExercises: HomeTodayLoggedExercise[];
  plannedExercises: HomeTodayExercise[];
  totalPlannedSets: number;
};

export type HomeTodayLoggedExercise = {
  name: string;
  bestSet: string;
};

export type HomeRecentSession = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
};

export type HomePlanOverview = {
  totalPlans: number;
  highlightedPlanId: string | null;
  highlightedPlanName: string | null;
  highlightedProgramName: string | null;
  lastPerformedAtLabel: string | null;
};

export type HomeWeeklyDay = {
  key: string;
  shortLabel: string;
  dateLabel: string;
  hasWorkout: boolean;
  isToday: boolean;
};

export type HomeWeeklySummary = {
  activeDays: number;
  restDays: number;
  sessionCount: number;
  completedSets: number;
  days: HomeWeeklyDay[];
};

export type HomeLastSessionExercise = {
  name: string;
  sets: number;
  bestSet: string;
  weightDelta: number | null;
};

export type HomeLastSession = {
  id: string;
  planName: string;
  date: string;
  totalSets: number;
  totalVolume: number;
  exercises: HomeLastSessionExercise[];
  href: string;
};

export type HomeStrengthItem = {
  exerciseName: string;
  exerciseId: string | null;
  bestE1rm: number;
  latestE1rm: number;
  improvement: number;
  trend: "up" | "down" | "flat";
};

export type HomeVolumeTrendPoint = {
  period: string;
  label: string;
  tonnage: number;
  sets: number;
  reps: number;
};

export type HomeQuickStats = {
  totalSessions: number;
  totalVolume: number;
  currentStreak: number;
  thisMonthSessions: number;
};

export type HomeGoalMetrics = {
  muscleVolume: MuscleVolumeResult | null;
  strengthScore: StrengthScoreResult | null;
  endurance: EnduranceResult | null;
};

export type HomeData = {
  today: HomeTodaySummary;
  planOverview: HomePlanOverview;
  weeklySummary: HomeWeeklySummary;
  recentLimit: number;
  recentSessions: HomeRecentSession[];
  lastSession: HomeLastSession | null;
  strengthProgress: HomeStrengthItem[];
  volumeTrend: HomeVolumeTrendPoint[];
  quickStats: HomeQuickStats;
  goal: TrainingGoalKey;
  goalMetrics: HomeGoalMetrics;
};

type HomePlanRecord = {
  id: string;
  name: string;
  type: string;
  rootProgramVersionId: string | null;
  createdAt: Date;
  baseProgramName: string;
  lastPerformedAt: Date | null;
};

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_RECENT_LIMIT = 3;
const HOME_CACHE_MAX_AGE_SECONDS = 90;

declare global {
  var __homeDataInflight: Map<string, Promise<HomeData>> | undefined;
}
const homeDataInflight =
  global.__homeDataInflight ?? new Map<string, Promise<HomeData>>();
global.__homeDataInflight = homeDataInflight;

// ─── Formatting Helpers ─────────────────────────────────────────────

const DATE_FORMATTERS = {
  ko: {
    withWeekday: new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }),
    monthDay: new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
    }),
    weekdayShort: new Intl.DateTimeFormat("ko-KR", {
      weekday: "short",
    }),
  },
  en: {
    withWeekday: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      weekday: "short",
    }),
    monthDay: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }),
    weekdayShort: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    }),
  },
} as const;

const HOME_TEXT = {
  ko: {
    unknownDate: "날짜 미상",
    selectedProgram: "선택된 프로그램",
    planNeeded: "플랜 준비 필요",
    noPlanMeta: "오늘 운동은 플랜 기반으로 동작합니다. 먼저 프로그램을 선택하거나 커스텀 프로그램을 만드세요.",
    completedMeta: (sessionCount: number, setCount: number) => `오늘 ${sessionCount}개 세션 / ${setCount}세트 완료`,
    plannedMeta: (mainNames: string[], totalSets: number) => `${mainNames.join(", ")} 외 ${totalSets}세트`,
    plannedMetaFallback: (totalSets: number) => `${totalSets}세트 예정`,
    emptyPlanMeta: "준비된 플랜으로 오늘 세션을 생성하고 기록을 시작합니다.",
    todayHeadline: "오늘의 운동 요약",
    unassignedProgram: "프로그램 미지정",
    noExerciseData: "운동 정보 없음",
    recentDescription: (setCount: number, primaryExercise: string) => `${setCount}세트 / 대표 운동: ${primaryExercise}`,
  },
  en: {
    unknownDate: "Unknown date",
    selectedProgram: "Selected Program",
    planNeeded: "Plan Needed",
    noPlanMeta: "Today's workout runs from a plan. Pick a program first or create a custom plan.",
    completedMeta: (sessionCount: number, setCount: number) => `${sessionCount} session${sessionCount === 1 ? "" : "s"} today / ${setCount} sets completed`,
    plannedMeta: (mainNames: string[], totalSets: number) => `${mainNames.join(", ")} + ${totalSets} planned sets`,
    plannedMetaFallback: (totalSets: number) => `${totalSets} planned sets`,
    emptyPlanMeta: "Generate today's session from your plan and start logging.",
    todayHeadline: "Today's Workout",
    unassignedProgram: "No Program",
    noExerciseData: "No Exercise Data",
    recentDescription: (setCount: number, primaryExercise: string) => `${setCount} sets / Main exercise: ${primaryExercise}`,
  },
} as const;

function formatDate(iso: string | Date, locale: AppLocale) {
  const parsed = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(parsed.getTime())) return HOME_TEXT[locale].unknownDate;
  return DATE_FORMATTERS[locale].withWeekday.format(parsed);
}

function epley1RM(weightKg: number, reps: number) {
  return weightKg * (1 + reps / 30);
}

// ─── Service ────────────────────────────────────────────────────────

type GetHomeDataParams = {
  userId: string;
  locale: AppLocale;
  timezone?: string;
  recentLimit?: number;
};

export function getHomeData(params: GetHomeDataParams): Promise<HomeData> {
  const { userId, locale, timezone = "UTC", recentLimit = DEFAULT_RECENT_LIMIT } = params;
  const now = new Date();
  const todayKey = dateOnlyInTimezone(now, timezone);
  const inflightKey = JSON.stringify([
    userId,
    locale,
    timezone,
    recentLimit,
    todayKey,
  ]);

  return runSingleFlight(homeDataInflight, inflightKey, () =>
    loadHomeData({ userId, locale, timezone, recentLimit, now, todayKey }),
  );
}

async function loadHomeData(params: {
  userId: string;
  locale: AppLocale;
  timezone: string;
  recentLimit: number;
  now: Date;
  todayKey: string;
}): Promise<HomeData> {
  const startedAt = Date.now();
  const { userId, locale, timezone, recentLimit, now, todayKey } = params;

  // Settings mutations invalidate this user cache. Keeping preference values out
  // of the key lets a warm home request complete with one cache lookup instead
  // of always reading user_setting first.
  const homeCacheParams = {
    locale,
    timezone,
    recentLimit,
    todayKey,
  };

  const cacheStartedAt = Date.now();
  const cached = await getStatsCache<HomeData>({
    userId,
    metric: "home_v2",
    params: homeCacheParams,
    maxAgeSeconds: HOME_CACHE_MAX_AGE_SECONDS,
  });
  if (cached) return cached;
  const cacheMs = Date.now() - cacheStartedAt;

  const settingsStartedAt = Date.now();
  const settings = await getSettingsSnapshotForUser(userId);
  const prefs = readWorkoutPreferences(settings);
  const goal = prefs.trainingGoalPrimary;
  const bodyweightKg = prefs.bodyweightKg;
  const settingsMs = Date.now() - settingsStartedAt;

  const prRangeDays = 365;
  const prFrom = new Date(now);
  prFrom.setDate(prFrom.getDate() - prRangeDays);

  // 병렬로 데이터 조회
  const queriesStartedAt = Date.now();
  const [plans, logs, prs, volumeSeries, goalMetrics] = await Promise.all([
    fetchPlans(userId, locale),
    fetchLogs(userId, 40),
    // 최근 PR 카드는 "현재 플랜 메인 운동"으로 구성하므로, 1RM 상위 N개로 자르지 않고
    // 충분히 넓게 조회해 둔 뒤 buildStrengthProgress에서 메인 운동과 매칭한다.
    fetchPrs(userId, prFrom, now, 200, locale),
    fetchVolumeSeries(userId),
    fetchGoalMetrics(userId, goal, bodyweightKg, now),
  ]);
  const queriesMs = Date.now() - queriesStartedAt;

  // 세션 스냅샷 생성 (highlightedPlan 필요)
  // PERF: 홈은 읽기 전용 미리보기만 계산하고 generated_session을 쓰지 않는다.
  // 1.5초 안에 준비되지 않으면 나머지 홈 데이터를 먼저 제공한다.
  // 타임아웃 시 snapshot=null로 빌드 → 오늘 계획 운동 목록만 비어있고 나머지 홈 데이터는 정상 표시.
  const highlightedPlan = resolveHighlightedPlan(plans, logs, todayKey);
  let snapshot = null;
  const snapshotStartedAt = Date.now();
  if (highlightedPlan) {
    try {
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 1_500),
      );
      const generatePromise = generateSessionSnapshot({
        userId,
        planId: highlightedPlan.id,
        sessionDate: todayKey,
        timezone,
      }).catch(() => null);
      snapshot = await Promise.race([generatePromise, timeoutPromise]);
    } catch {
      // ignore
    }
  }
  const snapshotMs = Date.now() - snapshotStartedAt;

  // 데이터 가공 및 빌드
  const payload = buildHomeData({
    plans,
    logs,
    prs,
    volumeSeries,
    snapshot,
    recentLimit,
    locale,
    timezone,
    todayKey,
    goal,
    goalMetrics,
    bodyweightKg,
  });

  // Keep the single-flight entry alive until the cache is visible. Otherwise a
  // request arriving in the small post-build/pre-upsert window can rebuild it.
  // Cache persistence failure is non-fatal; the next request can retry.
  await setStatsCache({
    userId,
    metric: "home_v2",
    params: homeCacheParams,
    payload,
    maxAgeSeconds: HOME_CACHE_MAX_AGE_SECONDS,
  }).catch(() => {});

  // Cache misses are infrequent (90s/user), so one structured timing event gives
  // production visibility without logging every warm request or any user data.
  logInfo("home.data_built", {
    cache: "miss",
    cacheMs,
    settingsMs,
    queriesMs,
    snapshotMs,
    totalMs: Date.now() - startedAt,
    snapshotStatus: highlightedPlan
      ? snapshot
        ? "ready"
        : "fallback"
      : "no_plan",
  });

  return payload;
}

const GOAL_METRICS_RANGE_DAYS = 56;

async function fetchGoalMetrics(
  userId: string,
  goal: TrainingGoalKey,
  bodyweightKg: number | null,
  now: Date,
): Promise<HomeGoalMetrics> {
  const from = new Date(now);
  from.setDate(from.getDate() - GOAL_METRICS_RANGE_DAYS);
  const rangeDays = GOAL_METRICS_RANGE_DAYS;
  const baseParams = { userId, from, to: now, rangeDays };

  switch (goal) {
    case "hypertrophy": {
      const muscleVolume = await fetchMuscleVolume(baseParams);
      return { muscleVolume, strengthScore: null, endurance: null };
    }
    case "strength":
    case "powerlifting": {
      const strengthScore = await fetchStrengthScore({ ...baseParams, bodyweightKg });
      return { muscleVolume: null, strengthScore, endurance: null };
    }
    case "endurance": {
      const endurance = await fetchEnduranceStats(baseParams);
      return { muscleVolume: null, strengthScore: null, endurance };
    }
    case "general":
    default:
      return { muscleVolume: null, strengthScore: null, endurance: null };
  }
}

// ─── Fetchers ───────────────────────────────────────────────────────

async function fetchPlans(
  userId: string,
  locale: AppLocale,
): Promise<HomePlanRecord[]> {
  const rows = await db
    .select({
      id: plan.id,
      name: plan.name,
      type: plan.type,
      rootProgramVersionId: plan.rootProgramVersionId,
      createdAt: plan.createdAt,
      templateName: programTemplate.name,
      // Raw SQL aggregate values are not guaranteed to run through the
      // timestamp column decoder. Normalize the unknown driver value below.
      lastPerformedAt: sql<unknown>`max(${workoutLog.performedAt})`,
    })
    .from(plan)
    .leftJoin(programVersion, eq(programVersion.id, plan.rootProgramVersionId))
    .leftJoin(programTemplate, eq(programTemplate.id, programVersion.templateId))
    .leftJoin(workoutLog, eq(workoutLog.planId, plan.id))
    .where(eq(plan.userId, userId))
    .groupBy(plan.id, programTemplate.name)
    .orderBy(desc(plan.createdAt));

  if (rows.length === 0) return [];

  return rows.map((row) => {
    const baseProgramName =
      (row.rootProgramVersionId && row.templateName)
        ? String(row.templateName).trim()
        : (row.type === "COMPOSITE"
          ? (locale === "ko" ? "복합 플랜" : "Composite Plan")
          : (locale === "ko" ? "프로그램 정보 없음" : "No Program Info"));
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      rootProgramVersionId: row.rootProgramVersionId,
      createdAt: requireDatabaseDate(row.createdAt, "plan.createdAt"),
      baseProgramName,
      lastPerformedAt: parseDatabaseDate(row.lastPerformedAt),
    };
  });
}

async function fetchLogs(userId: string, limit: number) {
  const subq = db
    .select()
    .from(workoutLog)
    .where(eq(workoutLog.userId, userId))
    .orderBy(desc(workoutLog.performedAt))
    .limit(limit)
    .as("l");

  const rows = await db
    .select({
      id: subq.id,
      planId: subq.planId,
      performedAt: subq.performedAt,
      exerciseName: workoutSet.exerciseName,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      meta: workoutSet.meta,
    })
    .from(subq)
    .leftJoin(workoutSet, eq(workoutSet.logId, subq.id))
    .orderBy(desc(subq.performedAt), subq.id, workoutSet.sortOrder);

  if (rows.length === 0) return [];

  const logsById = new Map<string, any>();

  for (const r of rows) {
    if (!logsById.has(r.id)) {
      logsById.set(r.id, {
        id: r.id,
        planId: r.planId,
        performedAt: r.performedAt,
        sets: [],
      });
    }
    if (r.exerciseName) {
      logsById.get(r.id).sets.push({
        exerciseName: r.exerciseName,
        reps: r.reps,
        weightKg: r.weightKg,
        meta: r.meta,
      });
    }
  }

  return Array.from(logsById.values());
}

async function fetchPrs(userId: string, from: Date, to: Date, limit: number, locale: AppLocale) {
  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    exerciseId: null,
    exerciseName: null,
    limit,
  };

  const cached = await getStatsCache<{ items: any[] }>({
    userId,
    metric: "prs",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached.items;

  const rows = await db
    .select({
      performedAt: workoutLog.performedAt,
      exerciseId: workoutSet.exerciseId,
      exerciseName: sql<string>`coalesce(${exercise.name}, ${workoutSet.exerciseName})`,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      meta: workoutSet.meta,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .leftJoin(exercise, eq(exercise.id, workoutSet.exerciseId))
    .where(
      and(
        eq(workoutLog.userId, userId),
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        isNotNull(workoutSet.weightKg),
        isNotNull(workoutSet.reps),
      ),
    )
    .orderBy(workoutLog.performedAt);

  const byExercise = new Map<string, any>();
  for (const r of rows) {
    const weightKg = resolveLoggedTotalLoadKg({
      exerciseName: String(r.exerciseName ?? ""),
      weightKg: r.weightKg,
      meta: r.meta as any,
    });
    const reps = Number(r.reps ?? 0);
    if (!weightKg || !reps) continue;

    const e1rm = Math.round(epley1RM(weightKg, reps) * 10) / 10;
    const date = r.performedAt.toISOString().slice(0, 10);
    const point = { date, e1rm, weightKg, reps };
    const key = r.exerciseId ?? String(r.exerciseName ?? "").trim().toLowerCase();
    if (!key) continue;

    if (!byExercise.has(key)) {
      byExercise.set(key, {
        exerciseId: r.exerciseId ?? null,
        exerciseName: String(r.exerciseName ?? (locale === "ko" ? "알 수 없는 운동" : "Unknown Exercise")),
        first: point,
        best: point,
        latest: point,
      });
      continue;
    }

    const cur = byExercise.get(key)!;
    if (point.e1rm > cur.best.e1rm) cur.best = point;
    if (point.date > cur.latest.date || (point.date === cur.latest.date && point.e1rm >= cur.latest.e1rm)) {
      cur.latest = point;
    }
  }

  const items = Array.from(byExercise.values())
    .map((x) => ({
      exerciseId: x.exerciseId,
      exerciseName: x.exerciseName,
      best: x.best,
      latest: x.latest,
      improvement: Math.round((x.best.e1rm - x.first.e1rm) * 10) / 10,
    }))
    .sort((a, b) => b.best.e1rm - a.best.e1rm)
    .slice(0, limit);

  // PERF: fire-and-forget 캐시 쓰기
  void setStatsCache({ userId, metric: "prs", params: cacheParams, payload: { items } }).catch(() => {});
  return items;
}

async function fetchVolumeSeries(userId: string) {
  const cacheParams = { bucket: "session", limit: 7, exerciseId: null, exerciseName: null, perExercise: false, maxExercises: 12 };

  const cached = await getStatsCache<{ series: any[] }>({
    userId,
    metric: "volume_series",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached.series;

  const rows = await db
    .select({
      period: sql<string>`to_char(${workoutLog.performedAt}, 'YYYY-MM-DD')`,
      tonnage: sql<number>`coalesce(sum(${workoutSet.weightKg} * ${workoutSet.reps}), 0)`,
      reps: sql<number>`coalesce(sum(${workoutSet.reps}), 0)`,
      sets: sql<number>`count(*)`,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(eq(workoutLog.userId, userId))
    .groupBy(workoutLog.id, workoutLog.performedAt)
    .orderBy(desc(workoutLog.performedAt))
    .limit(7);

  const series = rows.reverse().map((r) => ({
    period: r.period,
    tonnage: Number(r.tonnage ?? 0),
    reps: Number(r.reps ?? 0),
    sets: Number(r.sets ?? 0),
  }));

  // PERF: fire-and-forget 캐시 쓰기
  void setStatsCache({ userId, metric: "volume_series", params: cacheParams, payload: { series } }).catch(() => {});
  return series;
}

// ─── Builders ───────────────────────────────────────────────────────

function buildHomeData(params: {
  plans: HomePlanRecord[];
  logs: any[];
  prs: any[];
  volumeSeries: any[];
  snapshot: any;
  recentLimit: number;
  locale: AppLocale;
  timezone: string;
  todayKey: string;
  goal: TrainingGoalKey;
  goalMetrics: HomeGoalMetrics;
  bodyweightKg: number | null;
}): HomeData {
  const { plans, logs, prs, volumeSeries, snapshot, recentLimit, locale, todayKey, goal, goalMetrics, bodyweightKg } = params;

  const { exercises: plannedExercises, totalSets: totalPlannedSets, plannedWeightByExercise } = buildPlannedExercises(snapshot, bodyweightKg, locale);

  return {
    today: buildTodaySummary(plans, logs, plannedExercises, totalPlannedSets, locale, todayKey, bodyweightKg),
    planOverview: buildPlanOverview(plans, locale),
    weeklySummary: buildWeeklySummary(logs, locale, todayKey),
    recentLimit,
    recentSessions: buildRecentSessions(plans, logs, recentLimit, locale, todayKey),
    lastSession: buildLastSession(plans, logs, plannedWeightByExercise, locale, todayKey, bodyweightKg),
    strengthProgress: buildStrengthProgress(prs, plannedExercises),
    volumeTrend: buildVolumeTrend(volumeSeries, locale),
    quickStats: buildQuickStats(logs, todayKey),
    goal,
    goalMetrics,
  };
}

function resolveHighlightedPlan(
  plans: HomePlanRecord[],
  logs: any[],
  todayKey: string,
) {
  if (plans.length === 0) return null;
  const todayLog = logs.find((l) => toLocalDateKey(l.performedAt) === todayKey && l.planId) ?? null;
  if (todayLog?.planId) {
    const found = plans.find((p) => p.id === todayLog.planId);
    if (found) return found;
  }
  const withLastPerformed = plans
    .filter(
      (candidate): candidate is HomePlanRecord & { lastPerformedAt: Date } =>
        candidate.lastPerformedAt !== null,
    )
    .sort(
      (a, b) =>
        b.lastPerformedAt.getTime() - a.lastPerformedAt.getTime(),
    );
  if (withLastPerformed[0]) return withLastPerformed[0];
  return [...plans].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

function buildTodaySummary(plans: HomePlanRecord[], logs: any[], plannedExercises: any[], totalPlannedSets: number, locale: AppLocale, todayKey: string, bodyweightKg: number | null): HomeTodaySummary {
  const copy = HOME_TEXT[locale];
  const plansById = new Map(plans.map((p) => [p.id, p.name]));
  const todayLogs = logs.filter((l) => toLocalDateKey(l.performedAt) === todayKey);
  const todaySets = todayLogs.flatMap((l) => l.sets);

  const completedSets = todaySets.length;
  const todayLogCount = todayLogs.length;
  const latestToday = todayLogs[0] ?? null;
  const loggedExercises = groupLoggedExercises(todaySets).map((ex) => ({
    name: ex.name,
    bestSet: formatLoggedBestSet(ex.sets, ex.bestReps, ex.bestWeight, ex.name, bodyweightKg, locale),
  }));
  const highlightedPlan = resolveHighlightedPlan(plans, logs, todayKey);
  const activePlanId = latestToday?.planId ?? highlightedPlan?.id ?? null;
  const selectedProgramName = latestToday?.planId ? plansById.get(latestToday.planId) ?? copy.selectedProgram : highlightedPlan?.name ?? copy.planNeeded;

  let meta: string;
  if (!activePlanId) meta = copy.noPlanMeta;
  else if (todayLogCount > 0) meta = copy.completedMeta(todayLogCount, completedSets);
  else if (plannedExercises.length > 0) {
    const mainNames = plannedExercises.filter(e => e.role === "MAIN").slice(0, 3).map(e => e.name);
    meta = mainNames.length > 0 ? copy.plannedMeta(mainNames, totalPlannedSets) : copy.plannedMetaFallback(totalPlannedSets);
  } else meta = copy.emptyPlanMeta;

  return {
    headline: copy.todayHeadline,
    programName: selectedProgramName,
    hasPlan: Boolean(activePlanId),
    meta,
    completedSets,
    href: activePlanId ? buildTodayLogHref({ planId: activePlanId, date: todayKey, autoGenerate: todayLogCount === 0 }) : "/program-store",
    loggedExercises,
    plannedExercises,
    totalPlannedSets,
  };
}

function buildPlanOverview(plans: HomePlanRecord[], locale: AppLocale): HomePlanOverview {
  if (plans.length === 0) return { totalPlans: 0, highlightedPlanId: null, highlightedPlanName: null, highlightedProgramName: null, lastPerformedAtLabel: null };
  const highlightedPlan = resolveHighlightedPlan(plans, [], ""); // Simplified for overview
  return {
    totalPlans: plans.length,
    highlightedPlanId: highlightedPlan?.id ?? null,
    highlightedPlanName: highlightedPlan?.name ?? null,
    highlightedProgramName: highlightedPlan?.baseProgramName ?? null,
    lastPerformedAtLabel: highlightedPlan?.lastPerformedAt ? formatDate(highlightedPlan.lastPerformedAt, locale) : null,
  };
}

function buildWeeklySummary(logs: any[], locale: AppLocale, todayKey: string): HomeWeeklySummary {
  const days: HomeWeeklyDay[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toLocalDateKey(d);
    days.push({
      key,
      shortLabel: DATE_FORMATTERS[locale].weekdayShort.format(d),
      dateLabel: DATE_FORMATTERS[locale].monthDay.format(d),
      hasWorkout: false,
      isToday: key === todayKey,
    });
  }

  let sessionCount = 0, completedSets = 0;
  const dayKeys = new Set(days.map(d => d.key));
  const workoutCountByDay = new Map<string, number>();

  for (const log of logs) {
    const key = toLocalDateKey(log.performedAt);
    if (!dayKeys.has(key)) continue;
    sessionCount++;
    completedSets += log.sets.length;
    workoutCountByDay.set(key, (workoutCountByDay.get(key) ?? 0) + 1);
  }

  const resolvedDays = days.map(d => ({ ...d, hasWorkout: (workoutCountByDay.get(d.key) ?? 0) > 0 }));
  return { activeDays: resolvedDays.filter(d => d.hasWorkout).length, restDays: 7 - resolvedDays.filter(d => d.hasWorkout).length, sessionCount, completedSets, days: resolvedDays };
}

function buildRecentSessions(plans: HomePlanRecord[], logs: any[], limit: number, locale: AppLocale, todayKey: string): HomeRecentSession[] {
  const copy = HOME_TEXT[locale];
  const plansById = new Map(plans.map(p => [p.id, p.name]));
  return logs.filter(l => toLocalDateKey(l.performedAt) !== todayKey).slice(0, limit).map(l => ({
    id: l.id,
    title: l.planId ? plansById.get(l.planId) ?? copy.unassignedProgram : copy.unassignedProgram,
    subtitle: formatDate(l.performedAt, locale),
    description: copy.recentDescription(l.sets.length, l.sets[0]?.exerciseName ?? copy.noExerciseData),
    href: `/workout/log?context=recent&logId=${encodeURIComponent(l.id)}`,
  }));
}

function buildLastSession(plans: HomePlanRecord[], logs: any[], plannedWeightByExercise: Map<string, number>, locale: AppLocale, todayKey: string, bodyweightKg: number | null): HomeLastSession | null {
  const copy = HOME_TEXT[locale];
  const lastLog = logs.find(l => toLocalDateKey(l.performedAt) !== todayKey);
  if (!lastLog) return null;
  const plansById = new Map(plans.map(p => [p.id, p.name]));
  let totalVolume = 0;
  for (const s of lastLog.sets) totalVolume += (s.weightKg ?? 0) * (s.reps ?? 0);
  const exercises = groupLoggedExercises(lastLog.sets).map(ex => {
    const plannedWeight = plannedWeightByExercise.get(ex.name.toLowerCase());
    return { name: ex.name, sets: ex.sets, bestSet: formatLoggedBestSet(ex.sets, ex.bestReps, ex.bestWeight, ex.name, bodyweightKg, locale), weightDelta: plannedWeight !== undefined && ex.bestWeight > 0 ? plannedWeight - ex.bestWeight : null };
  });
  return { id: lastLog.id, planName: lastLog.planId ? plansById.get(lastLog.planId) ?? copy.unassignedProgram : copy.unassignedProgram, date: formatDate(lastLog.performedAt, locale), totalSets: lastLog.sets.length, totalVolume: Math.round(totalVolume), exercises, href: `/workout/log?context=recent&logId=${encodeURIComponent(lastLog.id)}` };
}

function buildStrengthProgress(prs: any[], plannedExercises: HomeTodayExercise[]): HomeStrengthItem[] {
  // "최근 PR" 카드는 현재 수행 중인 플랜의 메인 운동으로 구성한다.
  // 메인 운동을 플랜에 나오는 순서대로 두고, 기록(1RM)이 있는 것만 매칭해 노출한다.
  const mainExercises = plannedExercises.filter((e) => e.role === "MAIN");
  if (mainExercises.length === 0) return [];

  // PR 인덱스: exerciseId 우선, 없으면 이름(소문자)으로 매칭.
  const prById = new Map<string, any>();
  const prByName = new Map<string, any>();
  for (const item of prs) {
    if (item.exerciseId) prById.set(String(item.exerciseId), item);
    const nameKey = String(item.exerciseName ?? "").trim().toLowerCase();
    if (nameKey && !prByName.has(nameKey)) prByName.set(nameKey, item);
  }

  const result: HomeStrengthItem[] = [];
  const seen = new Set<string>();
  for (const ex of mainExercises) {
    const match =
      (ex.exerciseId ? prById.get(String(ex.exerciseId)) : null) ??
      prByName.get(ex.name.trim().toLowerCase());
    if (!match) continue;
    const dedupeKey = match.exerciseId
      ? `id:${match.exerciseId}`
      : `name:${String(match.exerciseName ?? "").trim().toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push({
      exerciseName: match.exerciseName,
      exerciseId: match.exerciseId,
      bestE1rm: Math.round(match.best.e1rm),
      latestE1rm: Math.round(match.latest.e1rm),
      improvement: Math.round(match.improvement),
      trend: match.improvement > 1 ? "up" : match.improvement < -1 ? "down" : "flat",
    });
  }
  return result;
}

function buildVolumeTrend(series: any[], locale: AppLocale): HomeVolumeTrendPoint[] {
  return series.map(p => ({ period: p.period, label: DATE_FORMATTERS[locale].monthDay.format(new Date(p.period)), tonnage: Math.round(p.tonnage), sets: p.sets, reps: p.reps }));
}

function buildQuickStats(logs: any[], todayKey: string): HomeQuickStats {
  const now = new Date();
  let totalVolume = 0, thisMonthSessions = 0;
  for (const log of logs) {
    for (const set of log.sets) totalVolume += (set.weightKg ?? 0) * (set.reps ?? 0);
    if (log.performedAt.getMonth() === now.getMonth() && log.performedAt.getFullYear() === now.getFullYear()) thisMonthSessions++;
  }
  const logKeys = new Set(logs.map(l => toLocalDateKey(l.performedAt)));
  let streak = 0;
  const d = new Date();
  if (!logKeys.has(todayKey)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    if (logKeys.has(toLocalDateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return { totalSessions: logs.length, totalVolume: Math.round(totalVolume), currentStreak: streak, thisMonthSessions };
}

function buildPlannedExercises(snapshot: any, bodyweightKg: number | null, locale: AppLocale) {
  if (!snapshot?.exercises) return { exercises: [], totalSets: 0, plannedWeightByExercise: new Map<string, number>() };
  let totalSets = 0;
  const plannedWeightByExercise = new Map<string, number>();
  const exercises = snapshot.exercises.map((ex: any) => {
    const sets = ex.sets ?? [];
    totalSets += sets.length;
    let maxW = 0;
    for (const s of sets) if (s.targetWeightKg && s.targetWeightKg > maxW) maxW = s.targetWeightKg;
    if (maxW > 0) plannedWeightByExercise.set(ex.exerciseName.toLowerCase(), maxW);
    return { name: ex.exerciseName, exerciseId: ex.exerciseId ?? null, role: ex.role, totalSets: sets.length, summary: summarizeSets(sets, ex.exerciseName, bodyweightKg, locale) };
  });
  return { exercises, totalSets, plannedWeightByExercise };
}

function summarizeSets(sets: any[], exerciseName?: string, bodyweightKg?: number | null, locale: AppLocale = "ko"): string {
  if (sets.length === 0) return "";
  const groups: Array<{ count: number; reps: number; weightKg: number }> = [];
  for (const s of sets) {
    const r = s.reps ?? 0;
    const w = s.targetWeightKg ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.reps === r && last.weightKg === w) {
      last.count++;
    } else {
      groups.push({ reps: r, weightKg: w, count: 1 });
    }
  }
  // 목표 무게(targetWeightKg)는 이미 총부하(TM×%)이므로 맨몸 운동은 추가중량 병기.
  return formatPlannedGroups(groups, { exerciseName, bodyweightKg, locale });
}

function groupLoggedExercises(sets: any[]) {
  const grouped = new Map<string, any>();
  for (const s of sets) {
    const name = String(s.exerciseName ?? "").trim();
    if (!name) continue;
    const w = Number(resolveLoggedTotalLoadKg({ exerciseName: name, weightKg: s.weightKg, meta: s.meta }) ?? s.weightKg ?? 0);
    const r = Number(s.reps ?? 0);
    const cur = grouped.get(name) ?? { sets: 0, bestWeight: 0, bestReps: 0 };
    cur.sets++;
    if (w > cur.bestWeight || (w === cur.bestWeight && r > cur.bestReps)) { cur.bestWeight = w; cur.bestReps = r; }
    grouped.set(name, cur);
  }
  return Array.from(grouped.entries()).map(([name, data]) => ({ name, ...data }));
}

function formatLoggedBestSet(
  sets: number,
  reps: number,
  weight: number,
  exerciseName?: string,
  bodyweightKg?: number | null,
  locale: AppLocale = "ko",
) {
  // 히스토리 컨벤션: `Weight × Reps × Sets` compact (best 세트 기준 압축).
  // weight는 groupLoggedExercises에서 이미 총부하로 환산된 값. 맨몸 운동은
  // 총무게 뒤에 추가중량을 병기한다 (`90kg (+20) × 5 × 3`).
  const suffix = exerciseName
    ? bodyweightAddedSuffix(exerciseName, weight, bodyweightKg ?? null, locale)
    : null;
  return formatPerformedHistoryCompact(weight, reps, sets, suffix);
}

// ─── Timezone Helpers ───────────────────────────────────────────────

function dateOnlyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const d = parts.find(p => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
