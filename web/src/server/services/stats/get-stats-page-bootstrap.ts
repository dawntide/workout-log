import { asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { exercise } from "@/server/db/schema";
import { getAuthenticatedUserId } from "@/server/auth/user";
import { fetchStatsBundle } from "@/server/stats/bundle-service";
import {
  fetchE1rmStats,
  fetchStats1RMFilterOptions,
} from "@/server/stats/e1rm-service";
import { fetchVolumeSeries, type VolumeSeriesResult } from "@/server/stats/volume-series-service";

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

export type StatsPageBootstrap = {
  initialBundle: Awaited<ReturnType<typeof fetchStatsBundle>>;
  initialExercises?: Awaited<ReturnType<typeof fetchStats1RMFilterOptions>>["exercises"];
  initialPlans?: Awaited<ReturnType<typeof fetchStats1RMFilterOptions>>["plans"];
  initialE1rm: Awaited<ReturnType<typeof fetchE1rmStats>> | null;
  initialVolumeWeekly: VolumeSeriesResult | null;
  initialSelectedExerciseId: string | null;
  initialSelectedPlanId: string;
};

export async function getStatsPageBootstrap(
  searchParams?: SearchParams,
): Promise<StatsPageBootstrap> {
  const userId = getAuthenticatedUserId();
  const params = searchParams ?? {};
  const defer1rmBootstrap = readString(params, "defer1rmBootstrap") === "1";
  const selectedExerciseId = readString(params, "exerciseId")?.trim() ?? "";
  const selectedExerciseName =
    readString(params, "exercise")?.trim() ||
    readString(params, "exerciseName")?.trim() ||
    "";
  const selectedPlanId = readString(params, "planId")?.trim() ?? "";
  const { from, to, rangeDays } = createDefaultStatsRange();

  if (defer1rmBootstrap) {
    const [bundle, volumeWeekly] = await Promise.all([
      fetchStatsBundle({ userId, days: 90 }),
      fetchWeeklyVolumeForBootstrap(userId),
    ]);
    return {
      initialBundle: bundle,
      initialExercises: undefined,
      initialPlans: undefined,
      initialE1rm: null,
      initialVolumeWeekly: volumeWeekly,
      initialSelectedExerciseId: null,
      initialSelectedPlanId: selectedPlanId,
    };
  }

  // PERF: exerciseId/exerciseName이 URL에 이미 있으면 4개 fetch를 모두 병렬로 실행
  if (selectedExerciseId || selectedExerciseName) {
    const [bundle, filterOptions, initialE1rm, volumeWeekly] = await Promise.all([
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

  const [bundle, filterOptions, initialE1rm, volumeWeekly] = await Promise.all([
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
  };
}
