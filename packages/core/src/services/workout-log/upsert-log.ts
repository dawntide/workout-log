import { db } from "@workout/core/db/client";
import { plan, generatedSession, workoutLog, workoutSet } from "@workout/core/db/schema";
import { and, asc, eq, gt, lt, ne } from "drizzle-orm";
import { getExerciseById, resolveExerciseByName } from "@workout/core/exercise/resolve";
import { applyAutoProgressionFromLog, rebuildAutoProgressionForPlan } from "@workout/core/progression/autoProgression";
import type { ProgressionTargetDecision } from "@workout/core/progression/autoProgression";
import { buildProgressionSummary, readProgressEventByLog } from "@workout/core/progression/progress-events";
import { buildProgressionFeedbackFromEvent } from "@workout/core/progression/feedback-catalog";
import { invalidateStatsCacheForUser } from "../../stats/cache";
import { invalidatePersonalRecordsFrom } from "./personal-records";
import {
  Ref5LogValidationError,
  acquireRef5PlanLock,
  canonicalizeRef5WorkoutLog,
  deriveRef5StateBeforeStart,
  isRef5GeneratedSessionSnapshot,
  isRef5PlanParameters,
  probeRef5CanonicalCompletionAtStartTuple,
  readRef5CompletedAtFromSets,
  readRef5CompletionEventIdFromSets,
  readRef5CompletionFingerprintFromSets,
  rebuildRef5ProgressionForPlan,
} from "@workout/core/progression/ref5-auto-progression";


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

type ExistingLogForUpsert = {
  id: string;
  userId: string;
  planId: string | null;
  generatedSessionId: string | null;
  performedAt: Date;
};

async function readStoredSets(tx: any, logId: string) {
  return tx
    .select({
      id: workoutSet.id,
      logId: workoutSet.logId,
      exerciseName: workoutSet.exerciseName,
      sortOrder: workoutSet.sortOrder,
      setNumber: workoutSet.setNumber,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      rpe: workoutSet.rpe,
      isExtra: workoutSet.isExtra,
      meta: workoutSet.meta,
    })
    .from(workoutSet)
    .where(eq(workoutSet.logId, logId))
    .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id));
}

async function buildRef5WriteResponse(input: {
  tx: any;
  planId: string;
  logId: string;
  locale: "ko" | "en";
  mode: "upsert" | "replay";
  applyResult: Record<string, unknown>;
  idempotent?: boolean;
}) {
  const progressionEvent = await readProgressEventByLog({
    tx: input.tx,
    planId: input.planId,
    logId: input.logId,
  });
  return {
    log: { id: input.logId },
    ...(input.idempotent ? { idempotent: true } : {}),
    progression: {
      ...buildProgressionSummary({
        mode: input.mode,
        applyResult: input.applyResult,
        eventRow: progressionEvent,
      }),
      feedback: buildProgressionFeedbackFromEvent(
        { eventRow: progressionEvent },
        input.locale,
      ),
    },
  };
}

async function upsertRef5WorkoutLog(input: {
  logId?: string;
  existingLog: ExistingLogForUpsert | null;
  userId: string;
  planId: string;
  generatedSessionId: string;
  performedAt: Date;
  durationMinutes?: number | null;
  notes?: string | null;
  tags?: string[] | null;
  sets: unknown[];
  locale: "ko" | "en";
}) {
  return db.transaction(async (tx) => {
    await acquireRef5PlanLock(tx, input.planId);

    const [planRows, sessionRows] = await Promise.all([
      tx
        .select({ id: plan.id, userId: plan.userId, params: plan.params })
        .from(plan)
        .where(eq(plan.id, input.planId))
        .limit(1),
      tx
        .select({
          id: generatedSession.id,
          userId: generatedSession.userId,
          planId: generatedSession.planId,
          sessionKey: generatedSession.sessionKey,
          snapshot: generatedSession.snapshot,
        })
        .from(generatedSession)
        .where(eq(generatedSession.id, input.generatedSessionId))
        .limit(1),
    ]);
    const planRow = planRows[0];
    const sessionRow = sessionRows[0];
    if (!planRow || planRow.userId !== input.userId) throw new Error("Forbidden");
    if (!isRef5PlanParameters(planRow.params)) throw new Error("Plan is not REF5");
    if (!sessionRow || sessionRow.userId !== input.userId) {
      throw new Error("REF5 generated session not found");
    }
    if (sessionRow.planId !== input.planId) {
      throw new Error("REF5 generated session belongs to another plan");
    }
    if (!isRef5GeneratedSessionSnapshot(sessionRow.snapshot)) {
      throw new Error("Generated session is not REF5");
    }

    const logsForSession = await tx
      .select({
        id: workoutLog.id,
        userId: workoutLog.userId,
        performedAt: workoutLog.performedAt,
      })
      .from(workoutLog)
      .where(eq(workoutLog.generatedSessionId, input.generatedSessionId))
      .orderBy(asc(workoutLog.id));
    if (logsForSession.length > 1) {
      throw new Ref5LogValidationError([
        "REF5 generated session already has duplicate workout logs",
      ]);
    }
    const existingForSession = logsForSession[0] ?? null;
    if (existingForSession && existingForSession.userId !== input.userId) {
      throw new Error("Forbidden");
    }
    if (input.logId && existingForSession?.id !== input.logId) {
      throw new Ref5LogValidationError([
        "REF5 log does not match its immutable generated session",
      ]);
    }

    const priorSets = existingForSession
      ? await readStoredSets(tx, existingForSession.id)
      : [];
    const priorCompletedAt = readRef5CompletedAtFromSets(priorSets);
    const priorCompletionEventId = readRef5CompletionEventIdFromSets(priorSets);
    const completion = canonicalizeRef5WorkoutLog({
      generatedSnapshot: sessionRow.snapshot,
      performedAt: input.performedAt,
      sets: input.sets,
      completedAt: priorCompletedAt ?? new Date().toISOString(),
    });

    if (!input.logId && existingForSession) {
      if (existingForSession.performedAt.getTime() !== input.performedAt.getTime()) {
        throw new Ref5LogValidationError([
          "REF5 completion retry contradicts the immutable actual start time",
        ]);
      }
      const priorFingerprint = readRef5CompletionFingerprintFromSets(priorSets);
      if (!priorFingerprint || priorFingerprint !== completion.fingerprint) {
        throw new Ref5LogValidationError([
          "REF5 completion retry contradicts the existing immutable completion",
        ]);
      }
      return buildRef5WriteResponse({
        tx,
        planId: input.planId,
        logId: existingForSession.id,
        locale: input.locale,
        mode: "upsert",
        applyResult: {
          applied: false,
          reason: "skip:idempotent-ref5-completion",
          eventType: "REF5_COMPLETE",
          programSlug: "ref5-adaptive-strength",
        },
        idempotent: true,
      });
    }

    if (input.logId) {
      if (!priorCompletedAt || !priorCompletionEventId) {
        throw new Ref5LogValidationError([
          "Existing REF5 log has no canonical completion metadata",
        ]);
      }
      if (priorCompletionEventId !== completion.completionEventId) {
        throw new Ref5LogValidationError([
          "REF5 completionEventId cannot change during an edit",
        ]);
      }
    }

    if (!input.logId) {
      const beforeStart = await deriveRef5StateBeforeStart({
        tx,
        userId: input.userId,
        planId: input.planId,
        actualStartAt: completion.actualStartAt,
        sessionKey: sessionRow.sessionKey,
        lockAlreadyHeld: true,
      });
      const probe = probeRef5CanonicalCompletionAtStartTuple({
        generatedSnapshot: sessionRow.snapshot,
        priorState: beforeStart.state,
        completion,
      });
      if (!probe.reduced.applied) {
        throw new Ref5LogValidationError([
          "REF5 completion was already applied at its canonical start tuple",
        ]);
      }
    }

    let savedLog: { id: string } | undefined;
    if (input.logId) {
      [savedLog] = await tx
        .update(workoutLog)
        .set({
          // Canonicalization already proved exact equality with actualStartAt.
          performedAt: input.performedAt,
          durationMinutes:
            input.durationMinutes === undefined ? undefined : input.durationMinutes,
          notes: input.notes === undefined ? undefined : input.notes,
          tags: input.tags === undefined ? undefined : input.tags,
        })
        .where(eq(workoutLog.id, input.logId))
        .returning({ id: workoutLog.id });
      if (!savedLog) throw new Error("REF5 log disappeared during edit");
      await tx.delete(workoutSet).where(eq(workoutSet.logId, input.logId));
    } else {
      [savedLog] = await tx
        .insert(workoutLog)
        .values({
          userId: input.userId,
          planId: input.planId,
          generatedSessionId: input.generatedSessionId,
          performedAt: input.performedAt,
          durationMinutes: input.durationMinutes ?? null,
          notes: input.notes ?? null,
          tags: input.tags ?? null,
        })
        .returning({ id: workoutLog.id });
    }
    if (!savedLog) throw new Error("REF5 log could not be saved");

    await tx.insert(workoutSet).values(
      completion.sets.map((set) => ({
        ...set,
        logId: savedLog!.id,
      })),
    );

    const invalidateFrom =
      input.existingLog && input.existingLog.performedAt < input.performedAt
        ? input.existingLog.performedAt
        : input.performedAt;
    await invalidatePersonalRecordsFrom({
      dbi: tx,
      userId: input.userId,
      fromPerformedAt: invalidateFrom,
    });

    const replayed = await rebuildRef5ProgressionForPlan({
      tx,
      userId: input.userId,
      planId: input.planId,
      lockAlreadyHeld: true,
    });
    await invalidateStatsCacheForUser(input.userId, tx);
    return buildRef5WriteResponse({
      tx,
      planId: input.planId,
      logId: savedLog.id,
      locale: input.locale,
      mode: input.logId ? "replay" : "upsert",
      applyResult: replayed,
    });
  });
}

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

  // REF5 has its own immutable-snapshot write contract and canonical replay.
  // Probe before the generic exercise resolver/reducer so no submitted weight,
  // RPE, name or progression metadata can enter the generic path.
  const [ref5PlanProbe, ref5SessionProbe] = await Promise.all([
    effectivePlanId
      ? db
          .select({ id: plan.id, userId: plan.userId, params: plan.params })
          .from(plan)
          .where(eq(plan.id, effectivePlanId))
          .limit(1)
      : Promise.resolve([]),
    effectiveSessionId
      ? db
          .select({
            id: generatedSession.id,
            userId: generatedSession.userId,
            planId: generatedSession.planId,
            snapshot: generatedSession.snapshot,
          })
          .from(generatedSession)
          .where(eq(generatedSession.id, effectiveSessionId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const probedSession = ref5SessionProbe[0] ?? null;
  if (!effectivePlanId && probedSession) effectivePlanId = probedSession.planId;
  const probedPlan =
    ref5PlanProbe[0] ??
    (effectivePlanId
      ? (
          await db
            .select({ id: plan.id, userId: plan.userId, params: plan.params })
            .from(plan)
            .where(eq(plan.id, effectivePlanId))
            .limit(1)
        )[0] ?? null
      : null);
  const planIsRef5 = isRef5PlanParameters(probedPlan?.params);
  const sessionIsRef5 = isRef5GeneratedSessionSnapshot(probedSession?.snapshot);
  if (planIsRef5 || sessionIsRef5) {
    if (!probedPlan || probedPlan.userId !== userId) {
      throw new Error(locale === "ko" ? "권한이 없습니다." : "Forbidden.");
    }
    if (!probedSession || !effectiveSessionId) {
      throw new Ref5LogValidationError([
        "REF5 workout logs require an explicitly started generated session",
      ]);
    }
    if (probedSession.userId !== userId || probedSession.planId !== probedPlan.id) {
      throw new Error(locale === "ko" ? "권한이 없습니다." : "Forbidden.");
    }
    if (!planIsRef5 || !sessionIsRef5) {
      throw new Ref5LogValidationError([
        "REF5 plan and generated-session protocol metadata contradict each other",
      ]);
    }
    if (!performedAt || Number.isNaN(performedAt.getTime())) {
      throw new Ref5LogValidationError(["REF5 performedAt is required"]);
    }
    return upsertRef5WorkoutLog({
      logId,
      existingLog,
      userId,
      planId: probedPlan.id,
      generatedSessionId: effectiveSessionId,
      performedAt,
      durationMinutes,
      notes,
      tags,
      sets,
      locale,
    });
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

    // D1(frozen PR): 저장/편집은 영향권(performed_at >= 시점)의 동결 PR 판정을
    // 무효화한다 — 자기 자신 포함(상세 첫 조회가 lazy 재계산·동결). 편집으로
    // performedAt이 당겨진 경우 구·신 중 이른 쪽부터 무효화해야 사이 로그들의
    // "그 당시 PR"이 어긋나지 않는다.
    const prInvalidateFrom =
      existingLog && existingLog.performedAt < performedAt!
        ? existingLog.performedAt
        : performedAt!;
    await invalidatePersonalRecordsFrom({ dbi: tx, userId, fromPerformedAt: prInvalidateFrom });

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
      progression: {
        ...buildProgressionSummary({
          mode: needsRebuild ? "upsert" : (logId ? "replay" : "upsert"),
          applyResult: progressionResult,
          eventRow: progressionEvent,
        }),
        // 서버 조립 피드백(판정 카드·조기 디로드 배너) — web·TUI가 같은 문구를 그대로 출력.
        // 저장 직후 경로라 state 미제공(F1은 reason만으로 즉시 노출).
        feedback: buildProgressionFeedbackFromEvent({ eventRow: progressionEvent }, locale),
      },
    };
  });

  return result;
}
