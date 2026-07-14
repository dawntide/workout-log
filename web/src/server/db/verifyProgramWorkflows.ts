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
import {
  REF5_IDENTIFIERS,
  REF5_LEGACY_PROTOCOL_VERSION,
  REF5_LEGACY_SNAPSHOT_SCHEMA_VERSION,
  REF5_PROTOCOL_VERSION,
  applyRef5FirstSquatStart,
  createInitialRef5LegacyV11State,
  createInitialRef5State,
  generateRef5Session,
  type Ref5LegacyV11SessionSnapshot,
} from "@workout/core/program-engine/ref5";
import { toRef5GeneratedSnapshot } from "@workout/core/program-engine/ref5-integration";
import {
  REF5_LEGACY_PROGRESSION_ENGINE_VERSION,
  REF5_PROGRESSION_ENGINE_VERSION_V12,
  acquireRef5PlanLock,
  rebuildRef5ProgressionForPlan,
} from "@workout/core/progression/ref5-auto-progression";
import {
  inspectRef5ProtocolUpgrade,
  upgradeRef5PlansToV12,
} from "@workout/core/progression/ref5-protocol-upgrade";
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
  week: number;
  day: number;
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
      .where(eq(programVersion.templateId, ref5AfterFirst[0]!.id))
      .orderBy(asc(programVersion.version));
    assert.deepEqual(versionsAfterFirst.map((row) => row.version), [1, 2]);
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
      .where(eq(programVersion.templateId, ref5AfterSecond[0]!.id))
      .orderBy(asc(programVersion.version));
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
  options: { failFirstExercise?: boolean; completedAt?: string } = {},
) {
  const snapshot = asRecord(session.snapshot);
  const ref5 = asRecord(snapshot.ref5);
  const protocolVersion = String(ref5.protocolVersion ?? snapshot.protocolVersion ?? "");
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
            protocolVersion,
            actualStartAt: ref5.actualStartAt,
            startEventId: ref5.startEventId,
            completionEventId: `${ref5.startEventId}:completion`,
            runtimeRevisionBefore: ref5.runtimeRevisionBefore,
            runtimeRevisionAfter: ref5.runtimeRevisionAfter,
            plannedReps,
            actualReps,
            setIndex,
            ...(options.completedAt ? { completedAt: options.completedAt } : {}),
          },
        },
      };
    });
  });
}

function buildLegacyRef5Fixture(input: {
  planId: string;
  planName: string;
  actualStartAt: string;
  startEventId: string;
}) {
  const sessionKey = `REF5:${input.actualStartAt}:${input.startEventId}`;
  const activeDomain = generateRef5Session(createInitialRef5State(), {
    sessionId: sessionKey,
    snapshotId: `${input.startEventId}:snapshot`,
    actualStartAt: input.actualStartAt,
    timeZone: "Asia/Seoul",
    todayBodyweightKg: 75,
    recent7DayMeasurementCount: 0,
    recent7DayAverageKg: null,
    manualMicro: false,
  });
  const domain: Ref5LegacyV11SessionSnapshot = {
    ...structuredClone(activeDomain),
    schemaVersion: REF5_LEGACY_SNAPSHOT_SCHEMA_VERSION,
    protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
    startInput: {
      ...structuredClone(activeDomain.startInput),
      climbingWithin48h: false,
      omitPullVolume: false,
    },
    decision: { ...structuredClone(activeDomain.decision), climbingReplacement: false },
    exercises: activeDomain.exercises.map((exercise) => ({
      ...structuredClone(exercise),
      omitted: false,
    })),
  };
  const snapshot = structuredClone(
    toRef5GeneratedSnapshot({
      planId: input.planId,
      planName: input.planName,
      sessionKey,
      domain: activeDomain,
      startEventId: input.startEventId,
      runtimeRevisionAfter: 1,
      startCommitted: true,
    }),
  ) as unknown as Record<string, unknown>;
  snapshot.protocolVersion = REF5_LEGACY_PROTOCOL_VERSION;
  const program = asRecord(snapshot.program);
  program.version = 1;
  program.protocolVersion = REF5_LEGACY_PROTOCOL_VERSION;
  const ref5 = asRecord(snapshot.ref5);
  ref5.protocolVersion = REF5_LEGACY_PROTOCOL_VERSION;
  ref5.domainSnapshot = domain;
  delete ref5.startCommitted;
  for (const exercise of asRecords(snapshot.exercises)) {
    asRecord(exercise.ref5).protocolVersion = REF5_LEGACY_PROTOCOL_VERSION;
    for (const set of asRecords(exercise.sets)) {
      asRecord(asRecord(set.meta).ref5).protocolVersion = REF5_LEGACY_PROTOCOL_VERSION;
    }
  }
  return { domain, sessionKey, snapshot, startEventId: input.startEventId };
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
      protocolVersion: "1.2" as const,
      actualStartAt,
      todayBodyweightKg: 75,
      manualMicro: false,
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
    assert.equal(currentSnapshot.protocolVersion, "1.2");
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
      new Date(now - 10_000).toISOString(),
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
      new Date(now + 10_000).toISOString(),
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

async function verifyRef5ProtocolUpgradeWorkflow(userId: string) {
  const marker = randomUUID();
  const templateRows = await db
    .select({ id: programTemplate.id })
    .from(programTemplate)
    .where(eq(programTemplate.slug, REF5_IDENTIFIERS.slug));
  assert.equal(templateRows.length, 1);
  const versionRows = await db
    .select({ id: programVersion.id, version: programVersion.version })
    .from(programVersion)
    .where(eq(programVersion.templateId, templateRows[0]!.id))
    .orderBy(asc(programVersion.version));
  const v11 = versionRows.find((row) => row.version === 1);
  const v12 = versionRows.find((row) => row.version === 2);
  assert.ok(v11 && v12, "REF5 v1.1/v1.2 seed versions are required");

  const createdPlanIds: string[] = [];
  try {
    const [upgradePlan] = await db
      .insert(planTable)
      .values({
        userId,
        name: `REF5 upgrade verify ${marker}`,
        type: "SINGLE",
        rootProgramVersionId: v11.id,
        params: {
          programFamily: "ref5",
          protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
          timezone: "Asia/Seoul",
          ref5: {
            schemaVersion: 1,
            protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
          },
        },
      })
      .returning();
    assert.ok(upgradePlan);
    createdPlanIds.push(upgradePlan.id);

    const completedFixture = buildLegacyRef5Fixture({
      planId: upgradePlan.id,
      planName: upgradePlan.name,
      actualStartAt: "2026-07-10T01:00:00.000Z",
      startEventId: `verify-completed-${marker}`,
    });
    const [completedSession] = await db
      .insert(generatedSession)
      .values({
        planId: upgradePlan.id,
        userId,
        sessionKey: completedFixture.sessionKey,
        scheduledAt: new Date(completedFixture.domain.actualStartAt),
        snapshot: completedFixture.snapshot,
      })
      .returning();
    assert.ok(completedSession);
    const completedAt = "2026-07-10T03:00:00.000Z";
    const [completedLog] = await db
      .insert(workoutLog)
      .values({
        userId,
        planId: upgradePlan.id,
        generatedSessionId: completedSession.id,
        performedAt: new Date(completedFixture.domain.actualStartAt),
        notes: `REF5 immutable v1.1 ${marker}`,
      })
      .returning();
    assert.ok(completedLog);
    const completedPayload: GeneratedSessionPayload = {
      id: completedSession.id,
      planId: upgradePlan.id,
      sessionKey: completedFixture.sessionKey,
      snapshot: completedFixture.snapshot,
    };
    await db.insert(workoutSet).values(
      buildRef5LogSets(completedPayload, { completedAt }).map((set) => ({
        ...set,
        logId: completedLog.id,
      })),
    );
    await db.transaction(async (tx) => {
      await acquireRef5PlanLock(tx, upgradePlan.id);
      await rebuildRef5ProgressionForPlan({
        tx,
        userId,
        planId: upgradePlan.id,
        lockAlreadyHeld: true,
      });
    });

    const unstartedFixture = buildLegacyRef5Fixture({
      planId: upgradePlan.id,
      planName: upgradePlan.name,
      actualStartAt: "2026-07-12T01:00:00.000Z",
      startEventId: `verify-unstarted-${marker}`,
    });
    const [unstartedSession] = await db
      .insert(generatedSession)
      .values({
        planId: upgradePlan.id,
        userId,
        sessionKey: unstartedFixture.sessionKey,
        scheduledAt: new Date(unstartedFixture.domain.actualStartAt),
        snapshot: unstartedFixture.snapshot,
      })
      .returning();
    assert.ok(unstartedSession);

    const dryRun = await inspectRef5ProtocolUpgrade(db, { planIds: [upgradePlan.id] });
    assert.equal(dryRun.totals.targetPlans, 1);
    assert.equal(dryRun.totals.generatedV11, 2);
    assert.equal(dryRun.totals.startEffectsV11, 1);
    assert.equal(dryRun.totals.noStartEffectsV11, 1);
    assert.equal(dryRun.totals.completedV11, 1);
    assert.equal(dryRun.totals.startedIncompleteV11, 0);
    assert.equal(dryRun.totals.progressEventsV11, 2);

    const immutableBefore = {
      session: await db
        .select({ id: generatedSession.id, snapshot: generatedSession.snapshot, createdAt: generatedSession.createdAt })
        .from(generatedSession)
        .where(eq(generatedSession.id, completedSession.id)),
      log: await db
        .select({ id: workoutLog.id, performedAt: workoutLog.performedAt, notes: workoutLog.notes, createdAt: workoutLog.createdAt })
        .from(workoutLog)
        .where(eq(workoutLog.id, completedLog.id)),
      events: await db
        .select({ id: planProgressEvent.id, meta: planProgressEvent.meta, createdAt: planProgressEvent.createdAt })
        .from(planProgressEvent)
        .where(
          and(
            eq(planProgressEvent.planId, upgradePlan.id),
            eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
          ),
        )
        .orderBy(asc(planProgressEvent.createdAt), asc(planProgressEvent.id)),
    };

    const transitionedAt = "2026-07-14T00:00:00.000Z";
    const applied = await upgradeRef5PlansToV12({
      dryRun: false,
      transitionedAt,
      planIds: [upgradePlan.id],
    });
    assert.equal(applied.totals.upgradedPlans, 1);
    assert.equal(applied.totals.replacementSessions, 1);

    const [upgradedPlanRows, upgradedRuntimeRows, upgradedSessions, upgradeEvents] = await Promise.all([
      db.select().from(planTable).where(eq(planTable.id, upgradePlan.id)),
      db.select().from(planRuntimeState).where(eq(planRuntimeState.planId, upgradePlan.id)),
      db.select().from(generatedSession).where(eq(generatedSession.planId, upgradePlan.id)),
      db
        .select()
        .from(planProgressEvent)
        .where(
          and(
            eq(planProgressEvent.planId, upgradePlan.id),
            eq(planProgressEvent.eventType, "REF5_PROTOCOL_UPGRADE"),
          ),
        ),
    ]);
    assert.equal(upgradedPlanRows[0]?.rootProgramVersionId, v12.id);
    assert.equal(asRecord(upgradedPlanRows[0]?.params).protocolVersion, REF5_PROTOCOL_VERSION);
    assert.equal(upgradedRuntimeRows[0]?.engineVersion, REF5_PROGRESSION_ENGINE_VERSION_V12);
    assert.equal(asRecord(upgradedRuntimeRows[0]?.state).protocolVersion, REF5_PROTOCOL_VERSION);
    assert.equal(upgradeEvents.length, 1);
    assert.equal(
      asRecord(upgradeEvents[0]!.meta).stableKey,
      `ref5-protocol-upgrade:${upgradePlan.id}:1.1:1.2`,
    );
    assert.equal(
      upgradedSessions.find((session) => session.id === unstartedSession.id)?.status,
      "SKIPPED",
    );
    const replacements = upgradedSessions.filter(
      (session) =>
        asRecord(asRecord(session.snapshot).ref5).protocolVersion === REF5_PROTOCOL_VERSION &&
        session.id !== completedSession.id,
    );
    assert.equal(replacements.length, 1);
    assert.equal(asRecord(asRecord(replacements[0]!.snapshot).ref5).startCommitted, false);
    const replacementJSON = JSON.stringify(replacements[0]!.snapshot);
    for (const retired of [
      "climbingWithin48h",
      "strongClimbing",
      "pullFallback",
      "substitute",
      "omitPullVolume",
      "climbingReplacement",
      "omitted",
      "omittedPrescriptions",
    ]) {
      assert.equal(replacementJSON.includes(retired), false);
    }

    await db.transaction(async (tx) => {
      await acquireRef5PlanLock(tx, upgradePlan.id);
      await rebuildRef5ProgressionForPlan({ tx, userId, planId: upgradePlan.id, lockAlreadyHeld: true });
    });
    const replayOnce = await Promise.all([
      db.select({ state: planRuntimeState.state }).from(planRuntimeState).where(eq(planRuntimeState.planId, upgradePlan.id)),
      db.select({ id: planProgressEvent.id }).from(planProgressEvent).where(eq(planProgressEvent.planId, upgradePlan.id)).orderBy(asc(planProgressEvent.id)),
    ]);
    await db.transaction(async (tx) => {
      await acquireRef5PlanLock(tx, upgradePlan.id);
      await rebuildRef5ProgressionForPlan({ tx, userId, planId: upgradePlan.id, lockAlreadyHeld: true });
    });
    const replayTwice = await Promise.all([
      db.select({ state: planRuntimeState.state }).from(planRuntimeState).where(eq(planRuntimeState.planId, upgradePlan.id)),
      db.select({ id: planProgressEvent.id }).from(planProgressEvent).where(eq(planProgressEvent.planId, upgradePlan.id)).orderBy(asc(planProgressEvent.id)),
    ]);
    assert.deepEqual(replayTwice, replayOnce, "upgrade replay must be deterministic/idempotent");

    const immutableAfter = {
      session: await db
        .select({ id: generatedSession.id, snapshot: generatedSession.snapshot, createdAt: generatedSession.createdAt })
        .from(generatedSession)
        .where(eq(generatedSession.id, completedSession.id)),
      log: await db
        .select({ id: workoutLog.id, performedAt: workoutLog.performedAt, notes: workoutLog.notes, createdAt: workoutLog.createdAt })
        .from(workoutLog)
        .where(eq(workoutLog.id, completedLog.id)),
      events: await db
        .select({ id: planProgressEvent.id, meta: planProgressEvent.meta, createdAt: planProgressEvent.createdAt })
        .from(planProgressEvent)
        .where(inArray(planProgressEvent.id, immutableBefore.events.map((event) => event.id)))
        .orderBy(asc(planProgressEvent.createdAt), asc(planProgressEvent.id)),
    };
    assert.deepEqual(immutableAfter, immutableBefore, "completed v1.1 rows changed during upgrade");

    const rerun = await upgradeRef5PlansToV12({ dryRun: false, planIds: [upgradePlan.id] });
    assert.equal(rerun.totals.upgradedPlans, 0);
    assert.equal(rerun.totals.replacementSessions, 0);

    const [blockedPlan] = await db
      .insert(planTable)
      .values({
        userId,
        name: `REF5 blocked verify ${marker}`,
        type: "SINGLE",
        rootProgramVersionId: v11.id,
        params: {
          programFamily: "ref5",
          protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
          timezone: "Asia/Seoul",
          ref5: { schemaVersion: 1, protocolVersion: REF5_LEGACY_PROTOCOL_VERSION },
        },
      })
      .returning();
    assert.ok(blockedPlan);
    createdPlanIds.push(blockedPlan.id);
    const blockedFixture = buildLegacyRef5Fixture({
      planId: blockedPlan.id,
      planName: blockedPlan.name,
      actualStartAt: "2026-07-13T01:00:00.000Z",
      startEventId: `verify-blocked-${marker}`,
    });
    await db.insert(generatedSession).values({
      planId: blockedPlan.id,
      userId,
      sessionKey: blockedFixture.sessionKey,
      scheduledAt: new Date(blockedFixture.domain.actualStartAt),
      snapshot: blockedFixture.snapshot,
    });
    const started = applyRef5FirstSquatStart(
      createInitialRef5LegacyV11State(),
      blockedFixture.domain,
      blockedFixture.startEventId,
    );
    await db.insert(planRuntimeState).values({
      planId: blockedPlan.id,
      userId,
      engineVersion: REF5_LEGACY_PROGRESSION_ENGINE_VERSION,
      state: started.nextState,
    });
    const blocked = await upgradeRef5PlansToV12({
      dryRun: false,
      planIds: [blockedPlan.id],
    });
    assert.equal(blocked.totals.blockedPlans, 1);
    assert.equal(blocked.totals.startedIncompleteV11, 1);
    assert.equal(blocked.totals.upgradedPlans, 0);
    const blockedPlanAfter = await db.select().from(planTable).where(eq(planTable.id, blockedPlan.id));
    assert.equal(asRecord(blockedPlanAfter[0]?.params).protocolVersion, REF5_LEGACY_PROTOCOL_VERSION);

    const [unmarkedPlan] = await db
      .insert(planTable)
      .values({
        userId,
        name: `REF5 unmarked verify ${marker}`,
        type: "SINGLE",
        rootProgramVersionId: v11.id,
        params: {
          programFamily: "ref5",
          protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
          timezone: "Asia/Seoul",
          ref5: { schemaVersion: 1, protocolVersion: REF5_LEGACY_PROTOCOL_VERSION },
        },
      })
      .returning();
    assert.ok(unmarkedPlan);
    createdPlanIds.push(unmarkedPlan.id);
    const unmarkedFixture = buildLegacyRef5Fixture({
      planId: unmarkedPlan.id,
      planName: unmarkedPlan.name,
      actualStartAt: "2026-07-13T02:00:00.000Z",
      startEventId: `verify-unmarked-${marker}`,
    });
    delete asRecord(asRecord(unmarkedFixture.snapshot.ref5).domainSnapshot).protocolVersion;
    await db.insert(generatedSession).values({
      planId: unmarkedPlan.id,
      userId,
      sessionKey: unmarkedFixture.sessionKey,
      scheduledAt: new Date(unmarkedFixture.domain.actualStartAt),
      snapshot: unmarkedFixture.snapshot,
    });
    const unmarked = await upgradeRef5PlansToV12({
      dryRun: false,
      planIds: [unmarkedPlan.id],
    });
    assert.equal(unmarked.totals.blockedPlans, 1);
    assert.equal(unmarked.plans[0]?.blocker, "invalid-or-unmarked-v1.1-snapshot");
    assert.equal(unmarked.totals.upgradedPlans, 0);
    console.log("[verify] REF5 v1.1->v1.2 dry-run/CAS/replay/immutability workflow ok");
  } finally {
    if (createdPlanIds.length > 0) {
      const logRows = await db
        .select({ id: workoutLog.id })
        .from(workoutLog)
        .where(inArray(workoutLog.planId, createdPlanIds));
      if (logRows.length > 0) {
        await db.delete(workoutLog).where(inArray(workoutLog.id, logRows.map((row) => row.id)));
      }
      await db.delete(generatedSession).where(inArray(generatedSession.planId, createdPlanIds));
      await db.delete(planTable).where(inArray(planTable.id, createdPlanIds));
    }
  }
}

async function main() {
  const userId = (process.env.WORKOUT_AUTH_USER_ID ?? "dev").trim() || "dev";
  const timezone = "Asia/Seoul";
  const createdLogIds: string[] = [];

  await verifyRef5SeedIdempotency(userId);
  await verifyRef5ProtocolUpgradeWorkflow(userId);

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
      week: 1,
      day: 1,
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
      week: 1,
      day: 3,
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
      week: 1,
      day: 1,
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
      week: 1,
      day: 2,
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
      week: 1,
      day: 3,
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
      week: 1,
      day: 4,
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
      week: 1,
      day: 2,
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
      week: target.week,
      day: target.day,
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
