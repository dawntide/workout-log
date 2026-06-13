import { asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { exercise } from "@/server/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import {
  readWorkoutPreferences,
  type TrainingGoalKey,
} from "@/lib/settings/workout-preferences";
import { getSettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { fetchStatsBundle } from "@/server/stats/bundle-service";
import {
  fetchE1rmStats,
  fetchStats1RMFilterOptions,
} from "@/server/stats/e1rm-service";
import {
  fetchEnduranceStats,
  type EnduranceResult,
} from "@/server/stats/endurance-service";
import {
  fetchMuscleVolume,
  type MuscleVolumeResult,
} from "@/server/stats/muscle-volume-service";
import {
  fetchStrengthScore,
  type StrengthScoreResult,
} from "@/server/stats/strength-score-service";
import { fetchVolumeSeries, type VolumeSeriesResult } from "@/server/stats/volume-series-service";
import {
  fetchAsymptoteDriverMonitor,
  type AsymptoteMonitorResult,
} from "@/server/stats/asymptote-monitor-service";

type SearchParams = Record<string, string | string[] | undefined>;

function readString(params: SearchParams, key: string) {
  const raw = params[key];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function createDefaultStatsRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 90);
  const rangeMs = Math.max(1, to.getTime() - from.getTime());
  const rangeDays = Math.max(1, Math.ceil(rangeMs / 86_400_000));
  return { from, to, rangeDays };
}

const VOLUME_TREND_WEEKS = 8;

function createWeeklyVolumeRange() {
  // 8주 + 7일 buffer (week 시작 이전 일자도 포함되도록)
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - VOLUME_TREND_WEEKS * 7 - 7);
  const rangeMs = Math.max(1, to.getTime() - from.getTime());
  const rangeDays = Math.max(1, Math.ceil(rangeMs / 86_400_000));
  return { from, to, rangeDays };
}

async function fetchWeeklyVolumeForBootstrap(
  userId: string,
): Promise<VolumeSeriesResult> {
  const { from, to, rangeDays } = createWeeklyVolumeRange();
  return fetchVolumeSeries({
    userId,
    from,
    to,
    rangeDays,
    bucket: "week",
    perExercise: false,
  });
}

export type StatsGoalMetrics = {
  muscleVolume: MuscleVolumeResult | null;
  strengthScore: StrengthScoreResult | null;
  endurance: EnduranceResult | null;
};

export type StatsPageBootstrap = {
  initialBundle: Awaited<ReturnType<typeof fetchStatsBundle>>;
  initialExercises?: Awaited<ReturnType<typeof fetchStats1RMFilterOptions>>["exercises"];
  initialPlans?: Awaited<ReturnType<typeof fetchStats1RMFilterOptions>>["plans"];
  initialE1rm: Awaited<ReturnType<typeof fetchE1rmStats>> | null;
  initialVolumeWeekly: VolumeSeriesResult | null;
  initialSelectedExerciseId: string | null;
  initialSelectedPlanId: string;
  goal: TrainingGoalKey;
  goalMetrics: StatsGoalMetrics;
  // 하이브리드 드라이버 e1RM 모니터. asymptote 플랜이 없으면 null(섹션 미표시).
  asymptoteMonitor: AsymptoteMonitorResult | null;
};

const STATS_GOAL_METRICS_RANGE_DAYS = 56;

async function fetchStatsGoalMetrics(
  userId: string,
  goal: TrainingGoalKey,
  bodyweightKg: number | null,
): Promise<StatsGoalMetrics> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - STATS_GOAL_METRICS_RANGE_DAYS);
  const baseParams = { userId, from, to: now, rangeDays: STATS_GOAL_METRICS_RANGE_DAYS };

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

export async function getStatsPageBootstrap(
  searchParams?: SearchParams,
): Promise<StatsPageBootstrap> {
  const userId = await requireAuthenticatedUserId();
  const params = searchParams ?? {};
  const defer1rmBootstrap = readString(params, "defer1rmBootstrap") === "1";
  const selectedExerciseId = readString(params, "exerciseId")?.trim() ?? "";
  const selectedExerciseName =
    readString(params, "exercise")?.trim() ||
    readString(params, "exerciseName")?.trim() ||
    "";
  const selectedPlanId = readString(params, "planId")?.trim() ?? "";
  const { from, to, rangeDays } = createDefaultStatsRange();

  const settings = await getSettingsSnapshot();
  const prefs = readWorkoutPreferences(settings);
  const goal = prefs.trainingGoalPrimary;
  const goalMetricsPromise = fetchStatsGoalMetrics(userId, goal, prefs.bodyweightKg);
  // asymptote 플랜이 없으면 즉시 null로 떨어지는 경량 조회 → 모든 경로에서 병렬로 함께 해소.
  const asymptoteMonitorPromise = fetchAsymptoteDriverMonitor({
    userId,
    bodyweightKg: prefs.bodyweightKg,
  });

  if (defer1rmBootstrap) {
    const [bundle, volumeWeekly, goalMetrics, asymptoteMonitor] = await Promise.all([
      fetchStatsBundle({ userId, days: 90 }),
      fetchWeeklyVolumeForBootstrap(userId),
      goalMetricsPromise,
      asymptoteMonitorPromise,
    ]);
    return {
      initialBundle: bundle,
      initialExercises: undefined,
      initialPlans: undefined,
      initialE1rm: null,
      initialVolumeWeekly: volumeWeekly,
      initialSelectedExerciseId: null,
      initialSelectedPlanId: selectedPlanId,
      goal,
      goalMetrics,
      asymptoteMonitor,
    };
  }

  // PERF: exerciseId/exerciseName이 URL에 이미 있으면 4개 fetch를 모두 병렬로 실행
  if (selectedExerciseId || selectedExerciseName) {
    const [bundle, filterOptions, initialE1rm, volumeWeekly, goalMetrics, asymptoteMonitor] = await Promise.all([
      fetchStatsBundle({ userId, days: 90 }),
      fetchStats1RMFilterOptions(userId),
      fetchE1rmStats({
        userId,
        planId: selectedPlanId,
        exerciseId: selectedExerciseId || null,
        exerciseName: selectedExerciseName || null,
        from,
        to,
        rangeDays,
      }),
      fetchWeeklyVolumeForBootstrap(userId),
      goalMetricsPromise,
      asymptoteMonitorPromise,
    ]);
    return {
      initialBundle: bundle,
      initialExercises: filterOptions.exercises,
      initialPlans: filterOptions.plans,
      initialE1rm,
      initialVolumeWeekly: volumeWeekly,
      initialSelectedExerciseId:
        initialE1rm?.exerciseId ?? (selectedExerciseId || null),
      initialSelectedPlanId: selectedPlanId,
      goal,
      goalMetrics,
      asymptoteMonitor,
    };
  }

  // exerciseId/exerciseName 미지정: 첫 번째 운동 ID를 빠른 쿼리로 먼저 조회한 뒤
  // bundle + filterOptions + e1rm + volumeWeekly를 모두 병렬로 실행
  const firstExerciseRows = await db
    .select({ id: exercise.id })
    .from(exercise)
    .orderBy(asc(exercise.name))
    .limit(1);
  const initialExerciseId = firstExerciseRows[0]?.id ?? "";

  const [bundle, filterOptions, initialE1rm, volumeWeekly, goalMetrics, asymptoteMonitor] = await Promise.all([
    fetchStatsBundle({ userId, days: 90 }),
    fetchStats1RMFilterOptions(userId),
    initialExerciseId
      ? fetchE1rmStats({
          userId,
          planId: selectedPlanId,
          exerciseId: initialExerciseId,
          exerciseName: null,
          from,
          to,
          rangeDays,
        })
      : Promise.resolve(null),
    fetchWeeklyVolumeForBootstrap(userId),
    goalMetricsPromise,
    asymptoteMonitorPromise,
  ]);

  return {
    initialBundle: bundle,
    initialExercises: filterOptions.exercises,
    initialPlans: filterOptions.plans,
    initialE1rm,
    initialVolumeWeekly: volumeWeekly,
    initialSelectedExerciseId:
      initialE1rm?.exerciseId ?? (initialExerciseId || null),
    initialSelectedPlanId: selectedPlanId,
    goal,
    goalMetrics,
    asymptoteMonitor,
  };
}
