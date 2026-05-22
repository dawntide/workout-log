import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { resolveLoggedTotalLoadKg } from "@/lib/bodyweight-load";
import { db } from "@/server/db/client";
import { workoutLog, workoutSet } from "@/server/db/schema";
import { resolveExerciseByName } from "@/server/exercise/resolve";
import { getStatsCache, setStatsCache } from "@/server/stats/cache";

export const BIG_THREE_CANONICAL_NAMES = ["Back Squat", "Bench Press", "Deadlift"] as const;
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
  bodyweightKg: number | null;
  totalE1rmKg: number;
  totalBodyweightRatio: number | null;
  big3: BigLiftStat[];
};

function epley1RM(weightKg: number, reps: number) {
  return weightKg * (1 + reps / 30);
}

function roundKg(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
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
  const cacheParams = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rangeDays,
    bodyweightKg: bodyweightKg ?? null,
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

    const e1rm = epley1RM(weightKg, reps);
    const date = new Date(row.performedAt).toISOString().slice(0, 10);
    const current = bestByLift.get(liftName);
    if (!current || e1rm > current.e1rm) {
      bestByLift.set(liftName, { e1rm, weightKg, reps, date });
    }
  }

  const idByLift = new Map<BigThreeLiftName, string | null>();
  for (const lift of bigThree) idByLift.set(lift.liftName, lift.exerciseId);

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
      bodyweightRatio:
        bodyweightKg && bodyweightKg > 0 ? roundRatio(best.e1rm / bodyweightKg) : null,
    };
  });

  const totalE1rmKg = roundKg(
    big3.reduce((sum, lift) => sum + (lift.bestE1rmKg ?? 0), 0),
  );
  const totalBodyweightRatio =
    bodyweightKg && bodyweightKg > 0 ? roundRatio(totalE1rmKg / bodyweightKg) : null;

  const payload: StrengthScoreResult = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    bodyweightKg: bodyweightKg ?? null,
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
