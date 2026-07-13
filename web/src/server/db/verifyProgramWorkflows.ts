import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  generatedSession,
  plan as planTable,
  planProgressEvent,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
  workoutSet,
} from "@workout/core/db/schema";
import { runSeed } from "@workout/core/db/seed";
import {
  generateAndSaveSession,
  generateSessionSnapshot,
} from "@workout/core/program-engine/generateSession";
import { REF5_IDENTIFIERS } from "@workout/core/program-engine/ref5";
import {
  acquireRef5PlanLock,
  rebuildRef5ProgressionForPlan,
} from "@workout/core/progression/ref5-auto-progression";
import { upsertWorkoutLogService } from "@workout/core/services/workout-log/upsert-log";

type PlannedSet = {
  reps?: number;
  targetWeightKg?: number;
  percent?: number;
  note?: string;
  rpe?: number;
};

type PlannedExercise = {
  exerciseName: string;
  sets: PlannedSet[];
};

type GeneratedSessionPayload = {
  id: string;
  planId: string;
  sessionKey: string;
  snapshot: {
    week?: number;
    day?: number;
    exercises?: PlannedExercise[];
  };
};

type VerifiablePlan = {
  name: string;
  date: string;
  checks: (session: GeneratedSessionPayload) => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function toMapByExercise(session: GeneratedSessionPayload) {
  const rows = Array.isArray(session.snapshot?.exercises) ? session.snapshot.exercises : [];
  return new Map<string, PlannedExercise>(
    rows.map((exercise) => [exercise.exerciseName, exercise]),
  );
}

function assertReps(exercise: PlannedExercise, expected: number[]) {
  assert.deepEqual(
    exercise.sets.map((set) => Number(set.reps ?? 0)),
    expected,
  );
}

function assertSetCount(exercise: PlannedExercise, expected: number) {
  assert.equal(exercise.sets.length, expected);
}

function buildLogSetsFromSession(session: GeneratedSessionPayload) {
  const exercises = Array.isArray(session.snapshot?.exercises) ? session.snapshot.exercises : [];
  const payloadSets: Array<{
    exerciseName: string;
    setNumber: number;
    reps: number;
    weightKg: number;
    rpe: number;
    isExtra: boolean;
    meta: Record<string, unknown>;
  }> = [];

  exercises.forEach((exercise) => {
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    sets.forEach((set, index) => {
      payloadSets.push({
        exerciseName: exercise.exerciseName,
        setNumber: index + 1,
        reps: Number(set.reps ?? 0) || 0,
        weightKg: Number(set.targetWeightKg ?? 0) || 0,
        rpe: Number(set.rpe ?? 0) || 0,
        isExtra: false,
        meta: {
          planned: true,
          plannedRef: {
            exerciseName: exercise.exerciseName,
            setNumber: index + 1,
            reps: set.reps ?? null,
            targetWeightKg: set.targetWeightKg ?? null,
            percent: set.percent ?? null,
            note: set.note ?? null,
            rpe: set.rpe ?? null,
          },
          completed: index % 2 === 0,
        },
      });
    });
  });

  return payloadSets;
}

async function verifyRef5SeedIdempotency(userId: string) {
  const marker = randomUUID();
  const [sentinelTemplate] = await db
    .insert(programTemplate)
    .values({
      slug: `verify-seed-sentinel-${marker}`,
      name: `Seed sentinel ${marker}`,
      type: "MANUAL",
      visibility: "PRIVATE",
      ownerUserId: userId,
      description: "Must survive REF5 seed runs unchanged",
      tags: ["seed-sentinel"],
    })
    .returning();
  assert.ok(sentinelTemplate);
  const [sentinelVersion] = await db
    .insert(programVersion)
    .values({
      templateId: sentinelTemplate.id,
      version: 1,
      definition: { kind: "manual", sessions: [] },
      defaults: { sentinel: marker },
    })
    .returning();
  assert.ok(sentinelVersion);
  const [sentinelPlan] = await db
    .insert(planTable)
    .values({
      userId,
      name: `Seed sentinel ${marker}`,
      type: "MANUAL",
      rootProgramVersionId: sentinelVersion.id,
      params: { sentinel: marker },
    })
    .returning();
  assert.ok(sentinelPlan);
  const [sentinelLog] = await db
    .insert(workoutLog)
    .values({
      userId,
      planId: sentinelPlan.id,
      performedAt: new Date("2026-01-01T00:00:00.000Z"),
      notes: `seed sentinel ${marker}`,
    })
    .returning();
  assert.ok(sentinelLog);

  try {
    await runSeed({ shouldHardReset: false, includeDemoPlans: true, devUserId: userId });
    const ref5AfterFirst = await db
      .select()
      .from(programTemplate)
      .where(eq(programTemplate.slug, REF5_IDENTIFIERS.slug));
    assert.equal(ref5AfterFirst.length, 1);
    const versionsAfterFirst = await db
      .select()
      .from(programVersion)
      .where(
        and(
          eq(programVersion.templateId, ref5AfterFirst[0]!.id),
          eq(programVersion.version, 1),
        ),
      );
    assert.equal(versionsAfterFirst.length, 1);
    const ref5PlanAfterFirst = await db
      .select()
      .from(planTable)
      .where(
        and(
          eq(planTable.userId, userId),
          eq(planTable.name, "Program REF5 Adaptive Strength"),
        ),
      );
    assert.equal(ref5PlanAfterFirst.length, 1);

    await runSeed({ shouldHardReset: false, includeDemoPlans: true, devUserId: userId });

    const [sentinelTemplateAfter, sentinelVersionAfter, sentinelPlanAfter, sentinelLogAfter] =
      await Promise.all([
        db.select().from(programTemplate).where(eq(programTemplate.id, sentinelTemplate.id)),
        db.select().from(programVersion).where(eq(programVersion.id, sentinelVersion.id)),
        db.select().from(planTable).where(eq(planTable.id, sentinelPlan.id)),
        db.select().from(workoutLog).where(eq(workoutLog.id, sentinelLog.id)),
      ]);
    assert.deepEqual(sentinelTemplateAfter, [sentinelTemplate]);
    assert.deepEqual(sentinelVersionAfter, [sentinelVersion]);
    assert.deepEqual(sentinelPlanAfter, [sentinelPlan]);
    assert.deepEqual(sentinelLogAfter, [sentinelLog]);

    const ref5AfterSecond = await db
      .select()
      .from(programTemplate)
      .where(eq(programTemplate.slug, REF5_IDENTIFIERS.slug));
    const versionsAfterSecond = await db
      .select()
      .from(programVersion)
      .where(
        and(
          eq(programVersion.templateId, ref5AfterSecond[0]!.id),
          eq(programVersion.version, 1),
        ),
      );
    const ref5PlanAfterSecond = await db
      .select()
      .from(planTable)
      .where(
        and(
          eq(planTable.userId, userId),
          eq(planTable.name, "Program REF5 Adaptive Strength"),
        ),
      );
    assert.deepEqual(ref5AfterSecond, ref5AfterFirst);
    assert.deepEqual(versionsAfterSecond, versionsAfterFirst);
    assert.deepEqual(ref5PlanAfterSecond, ref5PlanAfterFirst);
    console.log("[verify] REF5 seed twice is idempotent and preserves sentinel data");
  } finally {
    await db.delete(workoutLog).where(eq(workoutLog.id, sentinelLog.id));
    await db.delete(planTable).where(eq(planTable.id, sentinelPlan.id));
    await db.delete(programTemplate).where(eq(programTemplate.id, sentinelTemplate.id));
  }
}

function buildRef5LogSets(
  session: GeneratedSessionPayload,
  options: { failFirstExercise?: boolean } = {},
) {
  const snapshot = asRecord(session.snapshot);
  const ref5 = asRecord(snapshot.ref5);
  const exercises = asRecords(snapshot.exercises);
  return exercises.flatMap((exercise, exerciseIndex) => {
    const prescription = asRecord(exercise.ref5);
    const sets = asRecords(exercise.sets);
    return sets.map((set, setIndex) => {
      const plannedReps = Number(set.plannedReps ?? set.reps ?? 0);
      const isFailedSet = options.failFirstExercise && exerciseIndex === 0 && setIndex === 0;
      const actualReps = isFailedSet ? Math.max(0, plannedReps - 1) : plannedReps;
      const terminationReason =
        options.failFirstExercise && exerciseIndex === 0
          ? "FORCE_OR_TECHNIQUE"
          : "NORMAL";
      return {
        exerciseName: String(exercise.exerciseName),
        sortOrder: exerciseIndex,
        setNumber: setIndex + 1,
        reps: actualReps,
        weightKg: Number(set.externalLoadKg ?? set.targetWeightKg ?? 0),
        rpe: 0,
        isExtra: false,
        meta: {
          ...asRecord(set.meta),
          ref5: {
            prescription,
            terminationReason,
            protocolVersion: "1.1",
            actualStartAt: ref5.actualStartAt,
            startEventId: ref5.startEventId,
            completionEventId: `${ref5.startEventId}:completion`,
            runtimeRevisionBefore: ref5.runtimeRevisionBefore,
            runtimeRevisionAfter: ref5.runtimeRevisionAfter,
            plannedReps,
            actualReps,
            setIndex,
          },
        },
      };
    });
  });
}

async function verifyRef5Workflow(input: {
  userId: string;
  planId: string;
  timezone: string;
}) {
  const generatedIds = new Set<string>();
  const logIds = new Set<string>();
  const now = Date.now();
  const requestFor = (actualStartAt: string, startEventId: string) => ({
    userId: input.userId,
    planId: input.planId,
    timezone: input.timezone,
    ref5: {
      actualStartAt,
      todayBodyweightKg: 75,
      manualMicro: false,
      climbingWithin48h: false,
      omitPullVolume: false,
      startEventId,
    },
  });

  try {
    const runtimeBefore = await db
      .select({ state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, input.planId))
      .limit(1);
    const sessionsBefore = await db
      .select({ id: generatedSession.id })
      .from(generatedSession)
      .where(eq(generatedSession.planId, input.planId));
    await generateSessionSnapshot(
      requestFor(new Date(now - 2_000).toISOString(), `verify-preview-${randomUUID()}`),
    );
    const [runtimeAfterPreview, sessionsAfterPreview] = await Promise.all([
      db
        .select({ state: planRuntimeState.state })
        .from(planRuntimeState)
        .where(eq(planRuntimeState.planId, input.planId))
        .limit(1),
      db
        .select({ id: generatedSession.id })
        .from(generatedSession)
        .where(eq(generatedSession.planId, input.planId)),
    ]);
    assert.equal(JSON.stringify(runtimeAfterPreview), JSON.stringify(runtimeBefore));
    assert.equal(sessionsAfterPreview.length, sessionsBefore.length, "REF5 preview wrote a session");

    const currentRequest = requestFor(
      new Date(now - 1_000).toISOString(),
      `verify-start-${randomUUID()}`,
    );
    const [currentA, currentB] = (await Promise.all([
      generateAndSaveSession(currentRequest),
      generateAndSaveSession(currentRequest),
    ])) as GeneratedSessionPayload[];
    assert.equal(currentA.id, currentB.id, "concurrent REF5 start was not idempotent");
    generatedIds.add(currentA.id);
    const currentSnapshot = asRecord(currentA.snapshot);
    assert.equal(currentSnapshot.protocolVersion, "1.1");
    assert.equal(asRecord(currentSnapshot.ref5).actualStartAt, currentRequest.ref5.actualStartAt);
    assert.equal(
      asRecords(currentSnapshot.exercises).reduce(
        (sum, exercise) => sum + asRecords(exercise.sets).length,
        0,
      ) > 0,
      true,
    );

    const currentSets = buildRef5LogSets(currentA);
    const [currentLogA, currentLogB] = await Promise.all([
      upsertWorkoutLogService({
        userId: input.userId,
        locale: "ko",
        timezone: input.timezone,
        performedAt: new Date(currentRequest.ref5.actualStartAt),
        planId: input.planId,
        generatedSessionId: currentA.id,
        sets: currentSets,
      }),
      upsertWorkoutLogService({
        userId: input.userId,
        locale: "ko",
        timezone: input.timezone,
        performedAt: new Date(currentRequest.ref5.actualStartAt),
        planId: input.planId,
        generatedSessionId: currentA.id,
        sets: currentSets,
      }),
    ]);
    assert.equal(currentLogA.log.id, currentLogB.log.id, "concurrent REF5 completion duplicated");
    logIds.add(currentLogA.log.id);

    // Add a genuinely backdated start/log after the later session already exists.
    const pastRequest = requestFor(
      new Date(now - 86_400_000).toISOString(),
      `verify-past-${randomUUID()}`,
    );
    const pastSession = (await generateAndSaveSession(pastRequest)) as GeneratedSessionPayload;
    generatedIds.add(pastSession.id);
    const runtimeAfterPastStart = await db
      .select({ state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, input.planId))
      .limit(1);
    const futurePreviewRequest = requestFor(
      new Date(now + 86_400_000).toISOString(),
      `verify-future-${randomUUID()}`,
    );
    const futurePreviewAfterPastStart = await generateSessionSnapshot(futurePreviewRequest);
    const pastLog = await upsertWorkoutLogService({
      userId: input.userId,
      locale: "ko",
      timezone: input.timezone,
      performedAt: new Date(pastRequest.ref5.actualStartAt),
      planId: input.planId,
      generatedSessionId: pastSession.id,
      sets: buildRef5LogSets(pastSession),
    });
    logIds.add(pastLog.log.id);

    await upsertWorkoutLogService({
      logId: pastLog.log.id,
      userId: input.userId,
      locale: "ko",
      timezone: input.timezone,
      performedAt: new Date(pastRequest.ref5.actualStartAt),
      planId: input.planId,
      generatedSessionId: pastSession.id,
      sets: buildRef5LogSets(pastSession, { failFirstExercise: true }),
    });

    const pullRows = await db
      .select({ exerciseName: workoutSet.exerciseName, meta: workoutSet.meta })
      .from(workoutSet)
      .where(eq(workoutSet.logId, currentLogA.log.id));
    const pull = pullRows.find((row) => row.exerciseName.toLowerCase().includes("pull"));
    assert.ok(pull, "REF5 canonical PULL set missing");
    const pullMeta = asRecord(pull.meta);
    assert.equal(Number.isFinite(Number(pullMeta.totalLoadKg)), true);
    assert.equal(Number.isFinite(Number(pullMeta.bodyweightKg)), true);

    await db.transaction(async (tx) => {
      await acquireRef5PlanLock(tx, input.planId);
      await tx.delete(workoutLog).where(eq(workoutLog.id, pastLog.log.id));
      await rebuildRef5ProgressionForPlan({
        tx,
        userId: input.userId,
        planId: input.planId,
        lockAlreadyHeld: true,
      });
    });
    logIds.delete(pastLog.log.id);
    const runtimeAfterDelete = await db
      .select({ state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, input.planId))
      .limit(1);
    const completedSessions = asRecords(
      asRecord(runtimeAfterDelete[0]?.state).completedSessions,
    );
    assert.equal(
      completedSessions.some((session) => session.sessionId === pastSession.sessionKey),
      false,
      "deleted REF5 completion survived replay",
    );
    assert.deepEqual(
      runtimeAfterDelete,
      runtimeAfterPastStart,
      "deleting a backdated completion did not restore the start-only replay state",
    );
    const futurePreviewAfterDelete = await generateSessionSnapshot(futurePreviewRequest);
    assert.deepEqual(
      futurePreviewAfterDelete,
      futurePreviewAfterPastStart,
      "future REF5 prescription changed after backdated insert/edit/delete was reversed",
    );
    console.log("[verify] REF5 preview/start/retry/backdate/edit/delete workflow ok");
  } finally {
    if (logIds.size > 0) {
      await db.delete(workoutLog).where(inArray(workoutLog.id, Array.from(logIds)));
    }
    if (generatedIds.size > 0) {
      await db.delete(generatedSession).where(inArray(generatedSession.id, Array.from(generatedIds)));
    }
    await db.transaction(async (tx) => {
      await acquireRef5PlanLock(tx, input.planId);
      await rebuildRef5ProgressionForPlan({
        tx,
        userId: input.userId,
        planId: input.planId,
        lockAlreadyHeld: true,
      });
    });
  }
}

async function main() {
  const userId = (process.env.WORKOUT_AUTH_USER_ID ?? "dev").trim() || "dev";
  const timezone = "Asia/Seoul";
  const createdLogIds: string[] = [];

  await verifyRef5SeedIdempotency(userId);

  const plans = await db
    .select({
      id: planTable.id,
      name: planTable.name,
      userId: planTable.userId,
    })
    .from(planTable)
    .where(eq(planTable.userId, userId));

  const planMap = new Map(plans.map((plan) => [plan.name, plan]));
  const requirePlan = (name: string) => {
    const item = planMap.get(name);
    assert.ok(item, `required plan missing: ${name}`);
    return item;
  };

  await verifyRef5Workflow({
    userId,
    planId: requirePlan("Program REF5 Adaptive Strength").id,
    timezone,
  });

  const verifiablePlans: VerifiablePlan[] = [
    {
      name: "Program Tactical Barbell Operator",
      date: "2026-01-05",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const pull = map.get("Pull-Up");
        assert.ok(squat && bench && pull, "Operator D1 base exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(bench, 3);
        assertSetCount(pull, 3);
        assertReps(squat, [5, 5, 5]);
        assert.deepEqual(
          squat.sets.map((set) => Number(Number(set.percent ?? 0).toFixed(2))),
          [0.7, 0.7, 0.7],
        );
        assert.equal(
          String(squat.sets[0]?.note ?? "").includes("Operator W1"),
          true,
          "Operator W1 note missing",
        );
      },
    },
    {
      name: "Program Tactical Barbell Operator",
      date: "2026-01-07",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && bench && deadlift, "Operator D3 base exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(bench, 3);
        assertSetCount(deadlift, 3);
        assertReps(deadlift, [5, 5, 5]);
      },
    },
    {
      name: "Program Starting Strength LP",
      date: "2026-01-05",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && bench && deadlift, "Starting Strength A day base exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(bench, 3);
        assertSetCount(deadlift, 1);
        assertReps(squat, [5, 5, 5]);
      },
    },
    {
      name: "Program StrongLifts 5x5",
      date: "2026-01-06",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const press = map.get("Overhead Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && press && deadlift, "StrongLifts B day base exercises missing");
        assertSetCount(squat, 5);
        assertSetCount(press, 5);
        assertSetCount(deadlift, 1);
      },
    },
    {
      name: "Program Texas Method",
      date: "2026-01-07",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && bench && deadlift, "Texas Method intensity day exercises missing");
        assertSetCount(squat, 1);
        assert.equal(
          String(squat.sets[0]?.note ?? "").toLowerCase().includes("intensity"),
          true,
          "Texas Method intensity note missing",
        );
      },
    },
    {
      name: "Program GZCLP",
      date: "2026-01-08",
      checks: (session) => {
        const map = toMapByExercise(session);
        const deadlift = map.get("Deadlift");
        const press = map.get("Overhead Press");
        const legPress = map.get("Leg Press");
        assert.ok(deadlift && press && legPress, "GZCLP D4 exercises missing");
        assertSetCount(deadlift, 5);
        assertSetCount(press, 3);
        assertSetCount(legPress, 3);
        assert.equal(
          String(legPress.sets[2]?.note ?? "").toUpperCase().includes("AMRAP"),
          true,
          "GZCLP T3 AMRAP note missing",
        );
      },
    },
    {
      name: "Program Greyskull LP",
      date: "2026-01-06",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const press = map.get("Overhead Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && press && deadlift, "Greyskull LP B day exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(press, 3);
        assertSetCount(deadlift, 1);
        assertReps(squat, [5, 5, 5]);
        assert.equal(
          String(squat.sets[2]?.note ?? "").toUpperCase().includes("AMRAP"),
          true,
          "Greyskull LP AMRAP note missing",
        );
      },
    },
  ];

  for (const target of verifiablePlans) {
    const p = requirePlan(target.name);
    const generated = (await generateAndSaveSession({
      userId,
      planId: p.id,
      sessionDate: target.date,
      timezone,
    })) as GeneratedSessionPayload;

    assert.equal(generated.planId, p.id, `${target.name}: generated planId mismatch`);
    assert.equal(
      Array.isArray(generated.snapshot?.exercises) && generated.snapshot.exercises.length > 0,
      true,
      `${target.name}: no generated exercises`,
    );
    target.checks(generated);
    console.log(`[verify] session ok: ${target.name} @ ${target.date}`);
  }

  const updateTargetPlan = requirePlan("Program Greyskull LP");
  const updateTargetSession = (await generateAndSaveSession({
    userId,
    planId: updateTargetPlan.id,
    sessionDate: "2026-01-07",
    timezone,
  })) as GeneratedSessionPayload;

  const payloadSets = buildLogSetsFromSession(updateTargetSession);
  assert.equal(payloadSets.length > 0, true, "log payload requires at least one set");

  const perfAt = new Date();
  const created = await upsertWorkoutLogService({
    userId,
    locale: "ko",
    timezone,
    performedAt: perfAt,
    notes: "program verify create",
    planId: updateTargetPlan.id,
    generatedSessionId: updateTargetSession.id,
    sets: payloadSets,
  });
  const createdLogId = created.log.id;
  createdLogIds.push(createdLogId);

  const beforeSetRows = await db
    .select({ reps: workoutSet.reps, weightKg: workoutSet.weightKg })
    .from(workoutSet)
    .where(eq(workoutSet.logId, createdLogId));
  assert.equal(beforeSetRows.length, payloadSets.length, "created set count mismatch");

  const beforeEventRows = await db
    .select({
      id: planProgressEvent.id,
      eventType: planProgressEvent.eventType,
      afterState: planProgressEvent.afterState,
    })
    .from(planProgressEvent)
    .where(
      and(
        eq(planProgressEvent.planId, updateTargetPlan.id),
        eq(planProgressEvent.logId, createdLogId),
      ),
    )
    .limit(1);
  assert.ok(beforeEventRows[0], "progress event missing before patch");
  const beforeEvent = beforeEventRows[0];

  const updatedSets = payloadSets.map((set) =>
    ({
      ...set,
      reps: 0,
      meta: {
        ...(set.meta ?? {}),
        editedBy: "verifyProgramWorkflows",
      },
    }),
  );

  await upsertWorkoutLogService({
    logId: createdLogId,
    userId,
    locale: "ko",
    timezone,
    performedAt: perfAt,
    notes: "program verify updated",
    planId: updateTargetPlan.id,
    generatedSessionId: updateTargetSession.id,
    sets: updatedSets,
  });

  const afterLogRows = await db
    .select({ notes: workoutLog.notes })
    .from(workoutLog)
    .where(eq(workoutLog.id, createdLogId))
    .limit(1);
  const afterSetRows = await db
    .select({ reps: workoutSet.reps, weightKg: workoutSet.weightKg, meta: workoutSet.meta })
    .from(workoutSet)
    .where(eq(workoutSet.logId, createdLogId))
    .orderBy(asc(workoutSet.sortOrder));
  assert.equal(afterSetRows.length, updatedSets.length, "updated set count mismatch");
  assert.equal(Number(afterSetRows[0]?.reps ?? 0), Number(updatedSets[0]?.reps ?? 0), "updated reps mismatch");
  assert.equal(Number(afterSetRows[0]?.weightKg ?? 0), Number(updatedSets[0]?.weightKg ?? 0), "updated weight mismatch");
  assert.equal(afterLogRows[0]?.notes, "program verify updated", "updated note mismatch");
  assert.equal(
    (afterSetRows[0]?.meta as Record<string, unknown> | null)?.editedBy,
    "verifyProgramWorkflows",
    "updated meta mismatch",
  );

  const runtimeRows = await db
    .select({
      id: planRuntimeState.id,
      userId: planRuntimeState.userId,
      state: planRuntimeState.state,
    })
    .from(planRuntimeState)
    .where(eq(planRuntimeState.planId, updateTargetPlan.id))
    .limit(1);
  assert.ok(runtimeRows[0], "runtime state missing after log save");
  assert.equal(runtimeRows[0]?.userId, userId, "runtime state user mismatch");

  const progressEventRows = await db
    .select({
      id: planProgressEvent.id,
      eventType: planProgressEvent.eventType,
      afterState: planProgressEvent.afterState,
    })
    .from(planProgressEvent)
    .where(
      and(
        eq(planProgressEvent.planId, updateTargetPlan.id),
        eq(planProgressEvent.logId, createdLogId),
      ),
    )
    .limit(1);
  assert.ok(progressEventRows[0], "progress event missing after log save");
  assert.notEqual(
    JSON.stringify(progressEventRows[0]?.afterState ?? {}),
    JSON.stringify(beforeEvent?.afterState ?? {}),
    "progress event after_state should be replayed on patch",
  );

  console.log(`[verify] log create/reload/update ok: ${createdLogId}`);

  for (const logId of createdLogIds) {
    await db.delete(workoutLog).where(eq(workoutLog.id, logId));
  }
  console.log("[verify] cleanup ok");
}

main().catch((error) => {
  console.error("[verify] failed", error);
  process.exit(1);
});
