import { estimateE1rmKg } from "./e1rm";
import { excludeWarmupSets } from "@workout/core/stats/set-type-filter";
import {
  bodyweightAsOf,
  bodyweightTimelineSignature,
} from "@workout/core/stats/bodyweight-timeline";
import { loadBodyweightTimeline } from "@workout/core/stats/bodyweight-service";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import { db } from "@workout/core/db/client";
import { workoutLog, workoutSet } from "@workout/core/db/schema";
import { resolveExerciseByName } from "@workout/core/exercise/resolve";
import { EXERCISE_NAMES } from "@workout/core/exercise/catalog";
import { getStatsCache, setStatsCache } from "./cache";

export const BIG_THREE_CANONICAL_NAMES = [
  EXERCISE_NAMES.highBarBackSquat,
  EXERCISE_NAMES.benchPress,
  EXERCISE_NAMES.deadlift,
] as const;
export type BigThreeLiftName = (typeof BIG_THREE_CANONICAL_NAMES)[number];

export type BigLiftStat = {
  liftName: BigThreeLiftName;
  exerciseId: string | null;
  bestE1rmKg: number | null;
  bestWeightKg: number | null;
  bestReps: number | null;
  bestDate: string | null;
  bodyweightRatio: number | null;
};

export type StrengthScoreResult = {
  from: string;
  to: string;
  rangeDays: number;
  /**
   * 총 배율의 분모로 실제 쓴 체중. 이력이 있으면 **가장 최근 최고 기록이 나온
   * 시점**의 체중이고, 없으면 설정의 현재값이다 — 화면이 "무엇으로 나눈 값인지"를
   * 말할 수 있어야 한다.
   */
  bodyweightKg: number | null;
  totalE1rmKg: number;
  totalBodyweightRatio: number | null;
  big3: BigLiftStat[];
};

function roundKg(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 총 배율의 분모로 쓸 날짜. 3대 최고 기록은 서로 다른 날일 수 있어 하나를 골라야 한다.
 *
 * **가장 최근** 기록의 날을 쓴다 — "지금 시점의 3대 대비 체중"에 가장 가깝고, 종목별
 * 배율과 같은 이력을 근거로 삼는다. 기록이 하나도 없으면 null(설정값 폴백).
 */
export function pickTotalRatioDate(bestDates: ReadonlyArray<string | null>): string | null {
  return (
    bestDates
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1) ?? null
  );
}

async function resolveBigThree(): Promise<
  Array<{ liftName: BigThreeLiftName; exerciseId: string | null }>
> {
  const resolved = await Promise.all(
    BIG_THREE_CANONICAL_NAMES.map(async (liftName) => {
      const found = await resolveExerciseByName(liftName);
      return { liftName, exerciseId: found?.id ?? null };
    }),
  );
  return resolved;
}

export async function fetchStrengthScore({
  userId,
  from,
  to,
  rangeDays,
  bodyweightKg,
}: {
  userId: string;
  from: Date;
  to: Date;
  rangeDays: number;
  bodyweightKg: number | null;
}): Promise<StrengthScoreResult> {
  // 이력을 캐시 확인 **전에** 읽는다. 결과가 이력에 의존하므로 서명이 키에 들어가야
  // 하고, 그러려면 먼저 읽는 수밖에 없다. 체중 행은 사용자당 수백 건 규모의 인덱스
  // 조회라 캐시 적중 시의 추가 비용이 무시할 만하다.
  const timeline = await loadBodyweightTimeline(userId);

  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rangeDays,
    bodyweightKg: bodyweightKg ?? null,
    bodyweight: bodyweightTimelineSignature(timeline),
  };

  const cached = await getStatsCache<StrengthScoreResult>({
    userId,
    metric: "strength_score_v1",
    params: cacheParams,
    maxAgeSeconds: 300,
  });
  if (cached) return cached;

  const bigThree = await resolveBigThree();
  const idsToFilter = bigThree
    .map((b) => b.exerciseId)
    .filter((id): id is string => Boolean(id));
  const namesToFilter = BIG_THREE_CANONICAL_NAMES.map((name) => name.toLowerCase());

  const exerciseFilter = idsToFilter.length
    ? or(
        inArray(workoutSet.exerciseId, idsToFilter),
        and(
          sql`${workoutSet.exerciseId} is null`,
          inArray(sql`lower(${workoutSet.exerciseName})`, namesToFilter),
        ),
      )
    : inArray(sql`lower(${workoutSet.exerciseName})`, namesToFilter);

  const rows = await db
    .select({
      performedAt: workoutLog.performedAt,
      exerciseId: workoutSet.exerciseId,
      exerciseName: workoutSet.exerciseName,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      meta: workoutSet.meta,
    })
    .from(workoutLog)
    .innerJoin(workoutSet, eq(workoutSet.logId, workoutLog.id))
    .where(
      and(
        eq(workoutLog.userId, userId),
        gte(workoutLog.performedAt, from),
        lte(workoutLog.performedAt, to),
        sql`${workoutSet.weightKg} is not null`,
        sql`${workoutSet.reps} is not null`,
        excludeWarmupSets(),
        exerciseFilter,
      ),
    );

  const liftLookup = new Map<string, BigThreeLiftName>();
  for (const lift of bigThree) {
    if (lift.exerciseId) liftLookup.set(`id:${lift.exerciseId}`, lift.liftName);
    liftLookup.set(`name:${lift.liftName.toLowerCase()}`, lift.liftName);
  }

  const bestByLift = new Map<
    BigThreeLiftName,
    { e1rm: number; weightKg: number; reps: number; date: string }
  >();

  for (const row of rows) {
    const idKey = row.exerciseId ? `id:${row.exerciseId}` : null;
    const nameKey = `name:${String(row.exerciseName ?? "").trim().toLowerCase()}`;
    const liftName = (idKey && liftLookup.get(idKey)) ?? liftLookup.get(nameKey);
    if (!liftName) continue;

    const weightKg = resolveLoggedTotalLoadKg({
      exerciseName: String(row.exerciseName ?? liftName),
      weightKg: row.weightKg,
      meta: row.meta as Record<string, unknown> | null | undefined,
    });
    const reps = Number(row.reps ?? 0);
    if (!weightKg || !reps) continue;

    const e1rm = estimateE1rmKg(weightKg, reps);
    const date = new Date(row.performedAt).toISOString().slice(0, 10);
    const current = bestByLift.get(liftName);
    if (!current || e1rm > current.e1rm) {
      bestByLift.set(liftName, { e1rm, weightKg, reps, date });
    }
  }

  const idByLift = new Map<BigThreeLiftName, string | null>();
  for (const lift of bigThree) idByLift.set(lift.liftName, lift.exerciseId);

  /**
   * 그 기록이 나온 날의 체중. 이력이 없거나 첫 기록보다 이전이면 설정의 현재값으로
   * 떨어진다 — 기록을 시작하기 전의 체중을 지어내지 않는다.
   */
  const bodyweightOn = (date: string): number | null => {
    const asOf = new Date(`${date}T23:59:59.999Z`);
    return bodyweightAsOf(timeline, asOf) ?? bodyweightKg ?? null;
  };

  const big3: BigLiftStat[] = BIG_THREE_CANONICAL_NAMES.map((liftName) => {
    const best = bestByLift.get(liftName);
    if (!best) {
      return {
        liftName,
        exerciseId: idByLift.get(liftName) ?? null,
        bestE1rmKg: null,
        bestWeightKg: null,
        bestReps: null,
        bestDate: null,
        bodyweightRatio: null,
      };
    }
    return {
      liftName,
      exerciseId: idByLift.get(liftName) ?? null,
      bestE1rmKg: roundKg(best.e1rm),
      bestWeightKg: roundKg(best.weightKg),
      bestReps: best.reps,
      bestDate: best.date,
      // 6개월 전 기록을 오늘 체중으로 나누던 것이 이 마일스톤이 고치는 문제다.
      bodyweightRatio: (() => {
        const atThatTime = bodyweightOn(best.date);
        return atThatTime && atThatTime > 0 ? roundRatio(best.e1rm / atThatTime) : null;
      })(),
    };
  });

  const totalE1rmKg = roundKg(
    big3.reduce((sum, lift) => sum + (lift.bestE1rmKg ?? 0), 0),
  );
  // 총합은 서로 다른 날의 최고 기록을 더한 값이라 분모를 하나 골라야 한다. 셋 중
  // **가장 최근** 기록 시점의 체중을 쓴다 — "지금 시점의 3대 대비 체중"에 가장 가깝고,
  // 종목별 배율과 같은 이력을 근거로 삼는다.
  const latestBestDate = pickTotalRatioDate(big3.map((lift) => lift.bestDate));
  const totalDenominator = latestBestDate ? bodyweightOn(latestBestDate) : (bodyweightKg ?? null);
  const totalBodyweightRatio =
    totalDenominator && totalDenominator > 0
      ? roundRatio(totalE1rmKg / totalDenominator)
      : null;

  const payload: StrengthScoreResult = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    bodyweightKg: totalDenominator ?? null,
    totalE1rmKg,
    totalBodyweightRatio,
    big3,
  };

  void setStatsCache({
    userId,
    metric: "strength_score_v1",
    params: cacheParams,
    payload,
    maxAgeSeconds: 300,
  });

  return payload;
}
