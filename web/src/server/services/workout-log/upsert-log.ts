import { db } from "@/server/db/client";
import { plan, generatedSession, workoutLog, workoutSet } from "@/server/db/schema";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getExerciseById, resolveExerciseByName } from "@/server/exercise/resolve";
import { applyAutoProgressionFromLog, rebuildAutoProgressionForPlan } from "@/server/progression/autoProgression";
import type { ProgressionTargetDecision } from "@/server/progression/autoProgression";
import { buildProgressionSummary, readProgressEventByLog } from "@/server/progression/summary";
import { invalidateStatsCacheForUser } from "@/server/stats/cache";


export type UpsertWorkoutLogInput = {
  logId?: string;
  userId: string;
  timezone: string;
  performedAt?: Date;
  durationMinutes?: number | null;
  notes?: string | null;
  tags?: string[] | null;
  planId?: string | null;
  generatedSessionId?: string | null;
  sets: any[];
  progressionTargetDecisions?: Record<string, ProgressionTargetDecision> | null;
  locale: "ko" | "en";
};

export async function upsertWorkoutLogService({
  logId,
  userId,
  timezone: _timezone,
  performedAt,
  durationMinutes,
  notes,
  tags,
  planId: submittedPlanId,
  generatedSessionId: submittedGeneratedSessionId,
  sets,
  progressionTargetDecisions,
  locale,
}: UpsertWorkoutLogInput) {
  if (sets.length === 0) {
    throw new Error(locale === "ko" ? "세트 정보가 필요합니다." : "Sets are required.");
  }

  let effectivePlanId = submittedPlanId;
  let effectiveSessionId = submittedGeneratedSessionId;

  // Validation if updating existing log
  let existingLog = null;
  if (logId) {
    const existingRows = await db
      .select({
        id: workoutLog.id,
        userId: workoutLog.userId,
        planId: workoutLog.planId,
        generatedSessionId: workoutLog.generatedSessionId,
        performedAt: workoutLog.performedAt,
      })
      .from(workoutLog)
      .where(eq(workoutLog.id, logId))
      .limit(1);

    existingLog = existingRows[0];
    if (!existingLog) throw new Error(locale === "ko" ? "기록을 찾을 수 없습니다." : "Log not found.");
    if (existingLog.userId !== userId) throw new Error(locale === "ko" ? "권한이 없습니다." : "Forbidden.");

    effectivePlanId = submittedPlanId ?? existingLog.planId;
    effectiveSessionId = submittedGeneratedSessionId ?? existingLog.generatedSessionId;
    // Set performedAt if not provided in the patch
    if (!performedAt) {
      performedAt = existingLog.performedAt;
    }

    if (effectivePlanId !== existingLog.planId) {
      throw new Error(locale === "ko" ? "기록 수정 시 planId는 변경할 수 없습니다." : "planId change is not allowed on log update.");
    }
    if (effectiveSessionId !== existingLog.generatedSessionId) {
      throw new Error(locale === "ko" ? "기록 수정 시 generatedSessionId는 변경할 수 없습니다." : "generatedSessionId change is not allowed on log update.");
    }
  } else {
    // Additional validation for Creation
    let effectivePlan = null;
    const [planResult, sessionResult] = await Promise.all([
      effectivePlanId
        ? db.select({ id: plan.id, userId: plan.userId, params: plan.params }).from(plan).where(eq(plan.id, effectivePlanId)).limit(1)
        : Promise.resolve(null),
      effectiveSessionId
        ? db.select({ id: generatedSession.id, userId: generatedSession.userId, planId: generatedSession.planId }).from(generatedSession).where(eq(generatedSession.id, effectiveSessionId)).limit(1)
        : Promise.resolve(null),
    ]);

    if (effectivePlanId) {
      const p = planResult as Array<{ id: string; userId: string; params: unknown }> | null;
      if (!p?.[0]) throw new Error(locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found.");
      if (p[0].userId !== userId) throw new Error(locale === "ko" ? "권한이 없습니다." : "Forbidden.");
      effectivePlan = p[0];
    }

    if (effectiveSessionId) {
      const s = sessionResult as Array<{ id: string; userId: string; planId: string }> | null;
      if (!s?.[0]) throw new Error(locale === "ko" ? "생성된 세션을 찾을 수 없습니다." : "Generated session not found.");
      if (s[0].userId !== userId) throw new Error(locale === "ko" ? "권한이 없습니다." : "Forbidden.");
      if (effectivePlanId && s[0].planId !== effectivePlanId) {
        throw new Error(locale === "ko" ? "generatedSession이 전달된 planId에 속하지 않습니다." : "generatedSession does not belong to the provided planId.");
      }
      if (!effectivePlan && s[0].planId) {
        const p = await db.select({ id: plan.id, userId: plan.userId, params: plan.params }).from(plan).where(eq(plan.id, s[0].planId)).limit(1);
        if (!p[0]) throw new Error(locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found.");
        if (p[0].userId !== userId) throw new Error(locale === "ko" ? "권한이 없습니다." : "Forbidden.");
        effectivePlan = p[0];
      }
    }

  }

  // Resolve Exercises
  const resolvedByName = new Map<string, string | null>();
  const resolvedById = new Map<string, string | null>();

  const uniqueExerciseIds = Array.from(
    new Set(sets.map((s: any) => (typeof s.exerciseId === "string" && s.exerciseId.trim() ? s.exerciseId.trim() : null)).filter(Boolean) as string[]),
  );
  const uniqueExerciseNames: string[] = Array.from(
    new Set(
      sets
        .filter((s: any) => !(typeof s.exerciseId === "string" && s.exerciseId.trim()))
        .map((s: any) => String(s.exerciseName ?? "").trim().toLowerCase())
        .filter((n: string): n is string => n.length > 0),
    ),
  );

  await Promise.all([
    ...uniqueExerciseIds.map(async (id) => {
      const found = await getExerciseById(id);
      resolvedById.set(id, found?.id ?? null);
    }),
    ...uniqueExerciseNames.map(async (nameLower) => {
      const found = await resolveExerciseByName(nameLower);
      resolvedById.set(nameLower, found?.id ?? null);
      resolvedByName.set(nameLower, found?.id ?? null);
    }),
  ]);

  const result = await db.transaction(async (tx) => {
    let log;
    if (logId) {
      [log] = await tx
        .update(workoutLog)
        .set({
          performedAt: performedAt!,
          durationMinutes: durationMinutes === undefined ? undefined : durationMinutes,
          notes: notes === undefined ? undefined : notes,
          tags: tags === undefined ? undefined : tags,
        })
        .where(eq(workoutLog.id, logId))
        .returning({ id: workoutLog.id });
      
      await tx.delete(workoutSet).where(eq(workoutSet.logId, logId));
    } else {
      [log] = await tx
        .insert(workoutLog)
        .values({
          userId,
          planId: effectivePlanId,
          generatedSessionId: effectiveSessionId,
          performedAt: performedAt!,
          durationMinutes: durationMinutes ?? null,
          notes: notes ?? null,
          tags: tags ?? null,
        })
        .returning();
    }

    await tx.insert(workoutSet).values(
      sets.map((s: any, idx: number) => {
        const exerciseName = String(s.exerciseName ?? "").trim();
        if (!exerciseName) {
          throw new Error("exerciseName is required for all sets");
        }

        const submittedExerciseId = typeof s.exerciseId === "string" && s.exerciseId.trim() ? s.exerciseId.trim() : null;

        let exerciseId: string | null = null;
        if (submittedExerciseId) {
          exerciseId = resolvedById.get(submittedExerciseId) ?? null;
        } else {
          exerciseId = resolvedByName.get(exerciseName.toLowerCase()) ?? null;
        }

        return {
          logId: log.id,
          exerciseId,
          exerciseName,
          sortOrder: s.sortOrder ?? idx,
          setNumber: s.setNumber ?? 1,
          reps: s.reps ?? null,
          weightKg: s.weightKg ?? null,
          rpe: s.rpe ?? null,
          isExtra: Boolean(s.isExtra ?? false),
          meta: s.meta ?? {},
        };
      }),
    );

    // Decide: normal progression upsert/replay, or full rebuild?
    // A full rebuild is needed when date changes affect the chronological order of logs
    // within an auto-progression plan, to keep the protocol state consistent.
    let needsRebuild = false;
    if (effectivePlanId) {
      if (!logId) {
        // New log: rebuild if any existing log for this plan has performedAt > this log's performedAt
        const laterRows = await tx
          .select({ id: workoutLog.id })
          .from(workoutLog)
          .where(and(eq(workoutLog.planId, effectivePlanId), gt(workoutLog.performedAt, performedAt!), ne(workoutLog.id, log.id)))
          .limit(1);
        needsRebuild = laterRows.length > 0;
      } else if (existingLog && existingLog.performedAt.getTime() !== performedAt!.getTime()) {
        // Existing log with date change: rebuild if any other log falls between old and new dates
        const oldDate = existingLog.performedAt;
        const newDate = performedAt!;
        const minDate = oldDate < newDate ? oldDate : newDate;
        const maxDate = oldDate < newDate ? newDate : oldDate;
        const betweenRows = await tx
          .select({ id: workoutLog.id })
          .from(workoutLog)
          .where(and(
            eq(workoutLog.planId, effectivePlanId),
            gt(workoutLog.performedAt, minDate),
            lt(workoutLog.performedAt, maxDate),
            ne(workoutLog.id, log.id),
          ))
          .limit(1);
        needsRebuild = betweenRows.length > 0;
      }
    }

    let progressionResult;
    if (needsRebuild) {
      progressionResult = await rebuildAutoProgressionForPlan({ tx, userId, planId: effectivePlanId });
    } else {
      progressionResult = await applyAutoProgressionFromLog({
        tx,
        userId,
        planId: effectivePlanId,
        logId: log.id,
        sets,
        mode: logId ? "replay" : "upsert",
        progressionTargetDecisions,
      });
    }

    const progressionEvent = await readProgressEventByLog({
      tx,
      planId: effectivePlanId,
      logId: log.id,
    });

    await invalidateStatsCacheForUser(userId, tx);

    return {
      log,
      progression: buildProgressionSummary({
        mode: needsRebuild ? "upsert" : (logId ? "replay" : "upsert"),
        applyResult: progressionResult,
        eventRow: progressionEvent,
      }),
    };
  });

  return result;
}
