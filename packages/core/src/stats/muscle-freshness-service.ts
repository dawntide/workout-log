import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { exercise, workoutLog, workoutSet } from "@workout/core/db/schema";
import { excludeWarmupSets } from "@workout/core/stats/set-type-filter";
import { getStatsCache, setStatsCache } from "./cache";
import {
  MUSCLE_FRESHNESS_DEFAULTS,
  aggregateSessionMuscleLoad,
  computeMuscleFreshness,
  freshnessLookbackDays,
  type MuscleFreshnessResult,
  type MuscleSessionLoadSummary,
} from "./muscle-freshness";

export type { MuscleFreshnessResult };

const DAY_MS = 86_400_000;

/**
 * 부위별 신선도.
 *
 * **캐시 경계가 이 서비스의 핵심이다.** 캐시하는 것은 세션×부위 부하(`sessions`)뿐이고,
 * 감쇠는 매번 계산한다 — 신선도는 시간 함수라 결과를 캐시하면 캐시가 곧 거짓이 된다.
 * 저장 경로가 `invalidateStatsCacheForUser`로 userId 전체를 지우므로, 세션을 저장하면
 * 부하 캐시도 함께 날아간다.
 *
 * ⚠️ **주 단위 볼륨 집계(`fetchMuscleVolume`)를 재사용하지 않는다.** 그쪽은
 * `date_trunc('week')` 버킷이라 일·시간 단위 경과 시간을 줄 수 없다. capacity만 보면
 * 주 버킷으로 충분하지만, 같은 조회에서 감쇠 항까지 나와야 두 항이 같은 행을 본다.
 */
export async function fetchMuscleFreshness({
  userId,
  now,
  recoveryHours = MUSCLE_FRESHNESS_DEFAULTS.recoveryHours,
  capacityWeeks = MUSCLE_FRESHNESS_DEFAULTS.capacityWeeks,
}: {
  userId: string;
  now: Date;
  recoveryHours?: number;
  capacityWeeks?: number;
}): Promise<MuscleFreshnessResult> {
  const lookbackDays = freshnessLookbackDays(capacityWeeks, recoveryHours);
  // 조회 시작점을 **날짜 경계로 내린다.** 캐시 키가 날짜라, 창을 시각으로 잡으면
  // 같은 키가 서로 다른 창의 결과를 담게 된다(하루 사이에 창이 조금씩 밀린다).
  const day = now.toISOString().slice(0, 10);
  const from = new Date(new Date(`${day}T00:00:00.000Z`).getTime() - lookbackDays * DAY_MS);

  // 캐시 키에 `now`의 **시각**을 넣지 않는다 — 넣으면 매 요청이 새 키라 캐시가
  // 무의미해진다. 그날 안에서는 같은 부하 집합을 재사용하고 감쇠만 다시 계산한다.
  // 세션을 저장하면 invalidateStatsCacheForUser가 이 키까지 지운다.
  const cacheParams = { day, lookbackDays };

  let summary = await getStatsCache<MuscleSessionLoadSummary>({
    userId,
    metric: "muscle_freshness_loads_v1",
    params: cacheParams,
    maxAgeSeconds: 300,
  });

  if (!summary) {
    const rows = await db
      .select({
        logId: workoutLog.id,
        performedAt: workoutLog.performedAt,
        exerciseName: workoutSet.exerciseName,
        category: exercise.category,
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
          // 상한을 걸지 않는다 — 미래 시각 기록은 모델이 건너뛴다(감쇠를 못 매긴다).
          // 상한에 `now`를 쓰면 창이 시각에 의존해 위의 날짜 캐시 키와 어긋난다.
          sql`${workoutSet.reps} is not null`,
          // 웜업이 섞이면 신선도가 과소평가된다(M1-3 선행).
          excludeWarmupSets(),
        ),
      );

    summary = aggregateSessionMuscleLoad(
      rows.map((row) => ({
        logId: String(row.logId),
        performedAt: row.performedAt as Date,
        exerciseName: String(row.exerciseName ?? ""),
        category: row.category,
        weightKg: row.weightKg,
        reps: row.reps,
        meta: row.meta as Record<string, unknown> | null | undefined,
      })),
    );

    void setStatsCache({
      userId,
      metric: "muscle_freshness_loads_v1",
      params: cacheParams,
      payload: summary,
      maxAgeSeconds: 300,
    });
  }

  return computeMuscleFreshness({
    sessions: summary.sessions,
    now,
    recoveryHours,
    capacityWeeks,
    totalSets: summary.totalSets,
    otherSets: summary.otherSets,
  });
}
