import assert from "node:assert/strict";
import test from "node:test";

import type { WorkoutExecutor } from "@workout/core/db/client";

import {
  REF5_ARCHIVED_PROTOCOL_VERSION,
  REF5_CARRIED_PROTOCOL_VERSION,
  REF5_CARRIED_SNAPSHOT_SCHEMA_VERSION,
  REF5_INITIAL_DIRECT_STANDARDS_KG,
  REF5_PROTOCOL_VERSION,
  Ref5StaleVersionError,
  applyRef5FirstSquatStart,
  createInitialRef5State,
  generateRef5Session,
  type Ref5DecodedSessionSnapshot,
  type Ref5EndReason,
  type Ref5SessionSnapshot,
} from "../program-engine/ref5";
import {
  Ref5LogValidationError,
  canonicalizeRef5WorkoutLog,
  decodeRef5RuntimeState,
  deriveRef5StateBeforeStart,
  probeRef5CanonicalCompletionAtStartTuple,
  replayRef5CanonicalRawLogs,
} from "./ref5-auto-progression";

const START = "2026-07-13T01:00:00.000Z";

test("REF5 runtime decoder rejects protocol-less, v1.1 and v1.3 state and carries v1.4 (§24.3)", () => {
  const active = createInitialRef5State() as unknown as Record<string, unknown>;
  assert.throws(
    () => decodeRef5RuntimeState({ ...active, protocolVersion: undefined }),
    Ref5StaleVersionError,
  );
  assert.throws(
    () => decodeRef5RuntimeState({ ...active, schemaVersion: 1, protocolVersion: "1.1" }),
    Ref5StaleVersionError,
  );
  assert.throws(
    () => decodeRef5RuntimeState({ ...active, protocolVersion: REF5_ARCHIVED_PROTOCOL_VERSION }),
    Ref5StaleVersionError,
  );
  assert.deepEqual(
    decodeRef5RuntimeState({ ...active, protocolVersion: REF5_CARRIED_PROTOCOL_VERSION }),
    active,
  );
});

function domainSnapshot() {
  return generateRef5Session(createInitialRef5State(), {
    sessionId: "REF5:2026-07-13T01:00:00.000Z:start-1",
    snapshotId: "start-1:snapshot",
    actualStartAt: START,
    timeZone: "Asia/Seoul",
    todayBodyweightKg: 74.2,
    recent7DayMeasurementCount: 2,
    recent7DayAverageKg: 73.8,
    manualMicro: false,
  });
}

function generatedEnvelope(domain: Ref5DecodedSessionSnapshot) {
  return {
    schemaVersion: 4,
    actualStartAt: domain.actualStartAt,
    program: { slug: "ref5-adaptive-strength" },
    ref5: {
      protocolVersion: domain.protocolVersion,
      startCommitted: true,
      startEventId: "start-1",
      domainSnapshot: domain,
    },
  };
}

function submittedSets(
  domain: Ref5DecodedSessionSnapshot,
  reasonFor: (stream: string) => Ref5EndReason = () => "NORMAL",
) {
  return domain.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
          exerciseName: exercise.exerciseName,
          setNumber: set.setNumber,
          reps: set.plannedReps,
          weightKg: set.externalLoadKg,
          rpe: 10,
          isExtra: false,
          meta: {
            memo: "preserved",
            ref5: {
              prescription: exercise,
              protocolVersion: domain.protocolVersion,
              terminationReason: reasonFor(exercise.stream),
              actualStartAt: domain.actualStartAt,
              startEventId: "start-1",
              completionEventId: "start-1:completion",
              runtimeRevisionBefore: domain.runtimeRevision,
              runtimeRevisionAfter: domain.runtimeRevision + 1,
              plannedReps: set.plannedReps,
              actualReps: set.plannedReps,
            },
          },
        })),
  );
}

test("REF5 canonicalization freezes load/RPE and retains complete PULL context", () => {
  const domain = domainSnapshot();
  const raw = submittedSets(domain);
  const pullRow = raw.find((row) => row.exerciseName === "Weighted Pull-Up")!;
  pullRow.rpe = 9;

  const result = canonicalizeRef5WorkoutLog({
    generatedSnapshot: generatedEnvelope(domain),
    performedAt: new Date(START),
    sets: raw,
    completedAt: "2026-07-13T02:00:00.000Z",
  });

  const canonicalPull = result.sets.find((row) => row.exerciseName === "Weighted Pull-Up")!;
  const expectedPull = domain.exercises.find((exercise) => exercise.lift === "PULL")!;
  assert.equal(canonicalPull.weightKg, expectedPull.sets[0]!.externalLoadKg);
  assert.equal(canonicalPull.rpe, 0);
  assert.equal(canonicalPull.meta.memo, "preserved");
  assert.equal(canonicalPull.meta.bodyweightKg, expectedPull.pull!.todayBodyweightKg);
  assert.equal(canonicalPull.meta.externalLoadKg, expectedPull.sets[0]!.externalLoadKg);
  assert.equal(canonicalPull.meta.totalLoadKg, expectedPull.sets[0]!.totalLoadKg);
  assert.deepEqual(
    (canonicalPull.meta.ref5 as Record<string, unknown>).pull,
    expectedPull.pull,
  );
  assert.ok(result.exerciseOutcomes.every((item) => item.outcome.outcome === "PASS"));
});

test("REF5 canonicalization rejects contradictory outcome reasons", () => {
  const domain = domainSnapshot();
  const normalShortage = submittedSets(domain);
  normalShortage[0]!.reps -= 1;
  (normalShortage[0]!.meta.ref5 as Record<string, unknown>).actualReps = normalShortage[0]!.reps;
  assert.throws(
    () =>
      canonicalizeRef5WorkoutLog({
        generatedSnapshot: generatedEnvelope(domain),
        performedAt: new Date(START),
        sets: normalShortage,
      }),
    (error: unknown) =>
      error instanceof Ref5LogValidationError && error.message.includes("NORMAL is inconsistent"),
  );

  const forceWithoutShortage = submittedSets(domain, () => "FORCE_OR_TECHNIQUE");
  assert.throws(
    () =>
      canonicalizeRef5WorkoutLog({
        generatedSnapshot: generatedEnvelope(domain),
        performedAt: new Date(START),
        sets: forceWithoutShortage,
      }),
    (error: unknown) =>
      error instanceof Ref5LogValidationError && error.message.includes("requires at least one"),
  );
});

test("REF5 canonicalization enforces exact start and exact frozen set shape", () => {
  const domain = domainSnapshot();
  const sets = submittedSets(domain);
  assert.throws(
    () =>
      canonicalizeRef5WorkoutLog({
        generatedSnapshot: generatedEnvelope(domain),
        performedAt: new Date("2026-07-13T01:00:00.001Z"),
        sets,
      }),
    /must equal immutable actualStartAt/,
  );
  assert.throws(
    () =>
      canonicalizeRef5WorkoutLog({
        generatedSnapshot: generatedEnvelope(domain),
        performedAt: new Date(START),
        sets: sets.slice(1),
      }),
    /requires exactly 10 prescribed sets/,
  );
});

test("REF5 completion fingerprint is stable across server completion timestamps", () => {
  const domain = domainSnapshot();
  const args = {
    generatedSnapshot: generatedEnvelope(domain),
    performedAt: new Date(START),
    sets: submittedSets(domain),
  };
  const first = canonicalizeRef5WorkoutLog({
    ...args,
    completedAt: "2026-07-13T02:00:00.000Z",
  });
  const retry = canonicalizeRef5WorkoutLog({
    ...args,
    completedAt: "2026-07-13T03:00:00.000Z",
  });
  assert.equal(first.fingerprint, retry.fingerprint);
});

test("REF5 tuple-local completion probe replays START then completion", () => {
  const domain = domainSnapshot();
  const completion = canonicalizeRef5WorkoutLog({
    generatedSnapshot: generatedEnvelope(domain),
    performedAt: new Date(START),
    sets: submittedSets(domain),
    completedAt: "2026-07-13T02:00:00.000Z",
  });
  const validated = probeRef5CanonicalCompletionAtStartTuple({
    generatedSnapshot: generatedEnvelope(domain),
    priorState: createInitialRef5State(),
    completion,
  });
  assert.equal(validated.started.applied, true);
  assert.equal(validated.reduced.applied, true);
  assert.equal(validated.reduced.nextState.completedSessions.length, 1);
});

test("REF5 v1.2 completion metadata rejects every retired v1.1 input as stale", () => {
  const domain = domainSnapshot();
  for (const mutate of [
    (ref5: Record<string, unknown>) => { ref5.climbingWithin48h = false; },
    (ref5: Record<string, unknown>) => { ref5.omitted = false; },
    (ref5: Record<string, unknown>) => {
      (ref5.prescription as Record<string, unknown>).role = "CLIMBING_FOCUS_INVALID";
    },
  ]) {
    const sets = submittedSets(domain);
    mutate(sets[0]!.meta.ref5 as Record<string, unknown>);
    assert.throws(
      () => canonicalizeRef5WorkoutLog({
        generatedSnapshot: generatedEnvelope(domain),
        performedAt: new Date(START),
        sets,
        completedAt: "2026-07-13T02:00:00.000Z",
      }),
      Ref5StaleVersionError,
    );
  }
});

test("REF5 raw replay deduplicates the same completion idempotency key", () => {
  const event = {
    idempotencyKey: "complete-1",
    logId: "log-1",
    stableKey: "2026-07-13T01:00:00.000Z:start-1",
    sessionId: "session-1",
    snapshotId: "snapshot-1",
    actualStartAt: START,
    completedAt: "2026-07-13T02:00:00.000Z",
    timeZone: "Asia/Seoul",
    todayBodyweightKg: 74.2,
    recent7DayMeasurementCount: 2,
    recent7DayAverageKg: 73.8,
    manualMicro: false,
    outcomes: {
      SQ_H3: { endReason: "NORMAL" as const, sets: Array.from({ length: 3 }, () => ({ plannedReps: 3, effectiveReps: 3 })) },
      PULL_FOCUS: { endReason: "NORMAL" as const, sets: Array.from({ length: 3 }, () => ({ plannedReps: 3, effectiveReps: 3 })) },
      BP_VOLUME_NORMAL: { endReason: "NORMAL" as const, sets: Array.from({ length: 2 }, () => ({ plannedReps: 5, effectiveReps: 5 })) },
      DL: { endReason: "NORMAL" as const, sets: Array.from({ length: 2 }, () => ({ plannedReps: 4, effectiveReps: 4 })) },
    },
  };
  const replayed = replayRef5CanonicalRawLogs([event, structuredClone(event)]);
  assert.deepEqual(replayed.appliedIdempotencyKeys, ["complete-1"]);
  assert.deepEqual(replayed.skippedDuplicateKeys, ["complete-1"]);
  assert.equal(replayed.state.completedSessions.length, 1);
});

/**
 * The replay's DB reads for one plan. 이 목은 읽기 전용 경로가 정말 쓰기를 안 하는지만
 * 보는 최소 스텁이라 drizzle 핸들의 표면을 다 갖추지 않는다. 호출자는 lockAlreadyHeld:
 * true 분기(= db도 허용)로 들어가므로 락 불변식은 건드리지 않는다.
 */
function readOnlyReplayTx(rows: {
  planParams: Record<string, unknown>;
  generatedRows: unknown[];
  logRows: unknown[];
  setRows: unknown[];
}) {
  let writeCount = 0;
  const chain = (result: unknown[]) => {
    const query: Record<string, unknown> = {
      from: () => query,
      where: () => query,
      orderBy: () => Promise.resolve(result),
      limit: () => Promise.resolve(result),
      then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return query;
  };
  const refuseWrite = (kind: string) => () => {
    writeCount += 1;
    throw new Error(`read-only helper attempted ${kind}`);
  };
  const tx = {
    select(selection: Record<string, unknown>) {
      if ("params" in selection) {
        return chain([{ id: "plan-1", userId: "user-1", params: rows.planParams }]);
      }
      if ("sessionKey" in selection) return chain(rows.generatedRows);
      if ("generatedSessionId" in selection) return chain(rows.logRows);
      if ("logId" in selection) return chain(rows.setRows);
      return chain([]);
    },
    insert: refuseWrite("an insert"),
    update: refuseWrite("an update"),
    delete: refuseWrite("a delete"),
  };
  return { tx: tx as unknown as WorkoutExecutor, writeCount: () => writeCount };
}

test("REF5 historical state helper is read-only and excludes tuples at/after target", async () => {
  const customStarts = {
    sqH3Kg: 90,
    bpFocusKg: 90,
    pullFocusTotalKg: 100,
    deadliftKg: 80,
    ohpKg: 35,
  };
  const seed = domainSnapshot();
  const first = generateRef5Session(createInitialRef5State(customStarts), seed.startInput);
  const firstStarted = applyRef5FirstSquatStart(
    createInitialRef5State(customStarts),
    first,
    "start-1",
  ).nextState;
  const second = generateRef5Session(firstStarted, {
    ...first.startInput,
    sessionId: "REF5:2026-07-14T01:00:00.000Z:start-2",
    snapshotId: "start-2:snapshot",
    actualStartAt: "2026-07-14T01:00:00.000Z",
  });
  const generatedRows = [
    { id: "generated-1", sessionKey: first.sessionId, snapshot: generatedEnvelope(first) },
    {
      id: "generated-2",
      sessionKey: second.sessionId,
      snapshot: {
        ...generatedEnvelope(second),
        ref5: {
          ...(generatedEnvelope(second).ref5 as Record<string, unknown>),
          startEventId: "start-2",
        },
      },
    },
  ];
  const firstCompletion = canonicalizeRef5WorkoutLog({
    generatedSnapshot: generatedEnvelope(first),
    performedAt: new Date(first.actualStartAt),
    sets: submittedSets(first),
    completedAt: "2026-07-13T02:00:00.000Z",
  });
  const logRows = [
    {
      id: "log-1",
      generatedSessionId: "generated-1",
      performedAt: new Date(first.actualStartAt),
    },
  ];
  const storedSetRows = firstCompletion.sets.map((set, index) => ({
    ...set,
    id: `set-${index + 1}`,
    logId: "log-1",
  }));
  const replay = readOnlyReplayTx({
    planParams: {
      programFamily: "ref5",
      protocolVersion: REF5_PROTOCOL_VERSION,
      ref5: { startingValuesKg: customStarts },
    },
    generatedRows,
    logRows,
    setRows: storedSetRows,
  });

  const derived = await deriveRef5StateBeforeStart({
    tx: replay.tx,
    userId: "user-1",
    planId: "plan-1",
    actualStartAt: "2026-07-14T01:00:00.000Z",
    sessionKey: second.sessionId,
    lockAlreadyHeld: true,
  });
  assert.equal(replay.writeCount(), 0);
  assert.equal(derived.replayedSessionCount, 1);
  assert.equal(derived.replayedLogCount, 1);
  assert.equal(derived.state.startedSessions.length, 1);
  assert.equal(derived.state.completedSessions.length, 1);
  assert.equal(derived.state.startedSessions[0]!.sessionId, first.sessionId);
  assert.deepEqual(derived.state.directStandardsKg, customStarts);
});

/** A stored v1.4 session as the pre-v1.5 engine froze it (§24.3). */
function asCarriedV14(domain: Ref5SessionSnapshot): Ref5DecodedSessionSnapshot {
  const { startsInSevenDays, ...hard } = domain.decision.hard;
  return {
    ...domain,
    schemaVersion: REF5_CARRIED_SNAPSHOT_SCHEMA_VERSION,
    protocolVersion: REF5_CARRIED_PROTOCOL_VERSION,
    decision: { ...domain.decision, hard: { ...hard, startsIn168Hours: startsInSevenDays } },
  };
}

test("REF5 v1.5 folds a carried v1.4 plan's frozen sessions; other plans refuse them (§24.3)", async () => {
  const carried = asCarriedV14(domainSnapshot());
  const completion = canonicalizeRef5WorkoutLog({
    generatedSnapshot: generatedEnvelope(carried),
    performedAt: new Date(START),
    sets: submittedSets(carried),
    completedAt: "2026-07-13T02:00:00.000Z",
  });
  assert.equal(completion.protocolVersion, REF5_CARRIED_PROTOCOL_VERSION);

  const deriveOnPlan = (planProtocolVersion: string) =>
    deriveRef5StateBeforeStart({
      tx: readOnlyReplayTx({
        planParams: {
          programFamily: "ref5",
          protocolVersion: planProtocolVersion,
          ref5: { startingValuesKg: { ...REF5_INITIAL_DIRECT_STANDARDS_KG } },
        },
        generatedRows: [
          { id: "generated-1", sessionKey: carried.sessionId, snapshot: generatedEnvelope(carried) },
        ],
        logRows: [{ id: "log-1", generatedSessionId: "generated-1", performedAt: new Date(START) }],
        setRows: completion.sets.map((set, index) => ({ ...set, id: `set-${index + 1}`, logId: "log-1" })),
      }).tx,
      userId: "user-1",
      planId: "plan-1",
      actualStartAt: "2026-07-16T01:00:00.000Z",
      sessionKey: "REF5:2026-07-16T01:00:00.000Z:start-2",
      lockAlreadyHeld: true,
    });

  const derived = await deriveOnPlan(REF5_CARRIED_PROTOCOL_VERSION);
  assert.equal(derived.replayedLogCount, 1);
  assert.equal(derived.state.protocolVersion, REF5_PROTOCOL_VERSION);
  assert.equal(derived.state.completedSessions.length, 1);
  assert.deepEqual(derived.state.hardStartTimes.map((entry) => entry.sessionId), [carried.sessionId]);

  // A plan born on v1.5 never had a v1.4 session, and v1.3 plans stay archived.
  await assert.rejects(deriveOnPlan(REF5_PROTOCOL_VERSION), Ref5StaleVersionError);
  await assert.rejects(deriveOnPlan(REF5_ARCHIVED_PROTOCOL_VERSION), Ref5StaleVersionError);
});
