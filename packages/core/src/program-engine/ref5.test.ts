import assert from "node:assert/strict";
import test from "node:test";
import {
  REF5_INITIAL_CONTROL_REFS_KG,
  REF5_INITIAL_DERIVED_STANDARDS_KG,
  REF5_ACTIVE_STREAMS,
  REF5_INITIAL_DIRECT_STANDARDS_KG,
  REF5_OAP_KEYS,
  REF5_PRESCRIPTION_KEYS,
  REF5_PRIOR_PROTOCOL_VERSION,
  REF5_PROTOCOL_VERSION,
  REF5_RUNTIME_SCHEMA_VERSION,
  REF5_REVERTED_ONLY_STREAM,
  REF5_SNAPSHOT_SCHEMA_VERSION,
  REF5_START_CONFIG_VERSION,
  REF5_STREAMS,
  Ref5StaleVersionError,
  applyRef5FirstSquatStart,
  classifyRef5Outcome,
  createInitialRef5State,
  decodeRef5SessionSnapshot,
  deriveRef5AuxiliaryCaps,
  deriveRef5ControlRefs,
  deriveRef5Standards,
  floorRef5To2p5,
  generateRef5Session,
  nearestRef5To2p5,
  readRef5PlanStartConfig,
  ref5AuxiliaryCandidateIsWithinCap,
  reduceRef5Completion,
  ref5CalendarDate,
  replayRef5RawLogs,
  selectRef5SquatPrescription,
  validateAndClassifyRef5Outcome,
  validateRef5StartConfig,
  type Ref5CompletedSessionSummary,
  type Ref5ExercisePrescription,
  type Ref5MainLift,
  type Ref5Outcome,
  type Ref5OutcomeInput,
  type Ref5PrescriptionKey,
  type Ref5RawLogEvent,
  type Ref5RuntimeState,
  type Ref5SessionInput,
  type Ref5SessionSnapshot,
  type Ref5StartedSessionSummary,
  type Ref5Stream,
  type Ref5WindowExposure,
} from "./ref5";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

function at(base: string, offsetMs: number): string {
  return new Date(Date.parse(base) + offsetMs).toISOString();
}

function sessionInput(
  id: string,
  actualStartAt: string,
  overrides: Partial<Ref5SessionInput> = {},
): Ref5SessionInput {
  return {
    sessionId: id,
    snapshotId: `snapshot-${id}`,
    actualStartAt,
    timeZone: "UTC",
    todayBodyweightKg: 75,
    recent7DayMeasurementCount: 0,
    recent7DayAverageKg: null,
    manualMicro: false,
    ...overrides,
  };
}

function outcomeFor(
  item: Pick<Ref5ExercisePrescription, "sets" | "stream">,
  outcome: Ref5Outcome,
): Ref5OutcomeInput {
  const full = item.sets.map((set) => ({ plannedReps: set.plannedReps, effectiveReps: set.plannedReps }));
  if (outcome === "PASS") return { sets: full, endReason: "NORMAL" };
  if (outcome === "INVALID") {
    return {
      sets: item.sets.map((set) => ({ plannedReps: set.plannedReps, effectiveReps: 0 })),
      endReason: "EXTERNAL",
    };
  }
  const reduced = full.map((set) => ({ ...set }));
  if (reduced.length === 0) throw new Error(`cannot make ${outcome} for ${item.stream}`);
  const last = reduced.at(-1)!;
  last.effectiveReps = Math.max(0, last.plannedReps - (outcome === "HOLD" ? 1 : 2));
  return { sets: reduced, endReason: "FORCE_OR_TECHNIQUE" };
}

function completionOutcomes(
  snapshot: Ref5SessionSnapshot,
  overrides: Partial<Record<Ref5PrescriptionKey, Ref5Outcome | Ref5OutcomeInput>> = {},
): Partial<Record<Ref5PrescriptionKey, Ref5OutcomeInput>> {
  const result: Partial<Record<Ref5PrescriptionKey, Ref5OutcomeInput>> = {};
  for (const item of snapshot.exercises) {
    const override = overrides[item.stream];
    result[item.stream] =
      typeof override === "object"
        ? override
        : outcomeFor(item, override ?? "PASS");
  }
  return result;
}

function runSession(
  state: Ref5RuntimeState,
  input: Ref5SessionInput,
  overrides: Partial<Record<Ref5PrescriptionKey, Ref5Outcome | Ref5OutcomeInput>> = {},
) {
  const snapshot = generateRef5Session(state, input);
  const start = applyRef5FirstSquatStart(state, snapshot, `start-${input.sessionId}`);
  const completion = reduceRef5Completion(start.nextState, snapshot, {
    completionEventId: `complete-${input.sessionId}`,
    rawLogId: `log-${input.sessionId}`,
    completedAt: at(input.actualStartAt, 2 * HOUR),
    outcomes: completionOutcomes(snapshot, overrides),
  });
  return { snapshot, start, completion, state: completion.nextState };
}

function fakeExposure(
  id: string,
  stream: Ref5Stream,
  outcome: "PASS" | "HOLD" | "FAIL" = "PASS",
): Ref5WindowExposure {
  return { eventId: id, sessionId: `session-${id}`, stream, outcome };
}

function fakeStarted(
  id: string,
  calendarDate: string,
  sessionType: "NORMAL" | "MICRO" = "NORMAL",
): Ref5StartedSessionSummary {
  return {
    sessionId: id,
    snapshotId: `snapshot-${id}`,
    startEventId: `start-${id}`,
    actualStartAt: `${calendarDate}T12:00:00.000Z`,
    calendarDate,
    timeZone: "UTC",
    sessionType,
    squatPrescription: "V",
    hardStarted: false,
  };
}

test("v1.4 constants, direct-derived formulas, refs, caps and 2.5 kg rounding are canonical", () => {
  assert.equal(REF5_PROTOCOL_VERSION, "1.4");
  assert.equal(REF5_PRIOR_PROTOCOL_VERSION, "1.3");
  assert.equal(REF5_RUNTIME_SCHEMA_VERSION, 4);
  assert.equal(REF5_SNAPSHOT_SCHEMA_VERSION, 4);
  assert.equal(REF5_START_CONFIG_VERSION, 3);
  assert.deepEqual(REF5_INITIAL_DIRECT_STANDARDS_KG, {
    sqH3Kg: 82.5,
    bpFocusKg: 82.5,
    pullFocusTotalKg: 87.5,
    deadliftKg: 72.5,
    ohpKg: 32.5,
  });
  assert.deepEqual(deriveRef5Standards({ ...REF5_INITIAL_DIRECT_STANDARDS_KG }), REF5_INITIAL_DERIVED_STANDARDS_KG);
  assert.deepEqual(deriveRef5ControlRefs({ ...REF5_INITIAL_DIRECT_STANDARDS_KG }), REF5_INITIAL_CONTROL_REFS_KG);
  assert.deepEqual(deriveRef5AuxiliaryCaps({ ...REF5_INITIAL_DIRECT_STANDARDS_KG }), {
    deadliftMaxKg: 75,
    ohpMaxKg: 32.5,
    deadliftControlRefMaxKg: 104,
    ohpControlRefMaxKg: 50.5,
  });
  assert.equal(floorRef5To2p5(83.74), 82.5);
  assert.equal(floorRef5To2p5(-0.1), -2.5, "floor helper does not invent a zero floor");
  assert.equal(nearestRef5To2p5(11.25), 12.5, "exact midpoint rounds upward");
  assert.equal(nearestRef5To2p5(11.249), 10);
});

test("plan creation accepts custom direct starts, derives REFs, and rejects grid or cap violations", () => {
  const custom = {
    sqH3Kg: 100,
    bpFocusKg: 100,
    pullFocusTotalKg: 110,
    deadliftKg: 90,
    ohpKg: 37.5,
  };
  const valid = validateRef5StartConfig(custom);
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  assert.deepEqual(valid.value.startingValuesKg, custom);
  assert.deepEqual(valid.value.controlRefsKg, deriveRef5ControlRefs(custom));
  assert.deepEqual(
    readRef5PlanStartConfig({ ref5: valid.value }).startingValuesKg,
    custom,
  );

  const offGrid = validateRef5StartConfig({ ...custom, sqH3Kg: 101 });
  assert.equal(offGrid.ok, false);
  if (!offGrid.ok) assert.ok(offGrid.errors.some((error) => error.includes("2.5 kg grid")));

  const deadliftOverCap = validateRef5StartConfig({ ...custom, deadliftKg: 92.5 });
  assert.equal(deadliftOverCap.ok, false);
  if (!deadliftOverCap.ok) {
    assert.ok(deadliftOverCap.errors.some((error) => error.includes("deadliftKg exceeds")));
  }

  const ohpOverCap = validateRef5StartConfig({ ...custom, ohpKg: 40 });
  assert.equal(ohpOverCap.ok, false);
  if (!ohpOverCap.ok) {
    assert.ok(ohpOverCap.errors.some((error) => error.includes("ohpKg exceeds")));
  }
});

test("first normal session is PULL focus + H3 with ten working sets and lossless PULL metadata", () => {
  const state = createInitialRef5State();
  const snapshot = generateRef5Session(state, sessionInput("1", "2026-01-01T09:00:00.000Z"));
  assert.equal(snapshot.decision.sessionType, "NORMAL");
  assert.equal(snapshot.decision.focus, "PULL");
  assert.equal(snapshot.decision.squatPrescription, "H3");
  assert.equal(snapshot.totalWorkingSets, 10);
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), ["SQ_H3", "PULL_FOCUS", "BP_VOLUME_NORMAL", "DL"]);
  // Normal BP volume is two sets in v1.3 (§7.2).
  assert.deepEqual(
    snapshot.exercises.find((item) => item.stream === "BP_VOLUME_NORMAL")?.sets.map((set) => set.plannedReps),
    [5, 5],
  );
  assert.equal(snapshot.pullContext.focus.lockedAddedKg, 12.5);
  assert.equal(snapshot.pullContext.volume.lockedAddedKg, 0);
  assert.equal(snapshot.pullContext.focus.actualTotalKg, 87.5);
  assert.equal(snapshot.pullContext.focus.targetTotalKg, 87.5);
  assert.equal(snapshot.pullContext.focus.todayBodyweightKg, 75);
  assert.equal(snapshot.pullContext.focus.recent7DayMeasurementCount, 0);
  assert.equal(snapshot.pullContext.focus.calculationBodyweightKg, 75);
  assert.equal(state.revision, 0, "preview is pure");
  assert.equal(state.pull.lock, null, "preview does not commit the proposed PULL lock");
  const serialized = JSON.stringify(snapshot);
  for (const removed of [
    "climb",
    "climbing",
    "climbingWithin48h",
    "strongClimbing",
    "pullFallback",
    "substitute",
    "substitution",
    "omitPullVolume",
    "climbingReplacement",
    "omitted",
    "omittedPrescriptions",
  ]) {
    assert.equal(serialized.includes(removed), false, `${removed} must not be written by v1.3`);
  }
});

test("normal BP focus prescribes the OAP pair in place of PULL volume, still ten sets (§7.3, §7.5)", () => {
  const state = createInitialRef5State();
  state.nextFocus = "BP";
  const snapshot = generateRef5Session(
    state,
    sessionInput("bp-ten", "2026-01-02T09:00:00.000Z"),
  );
  // The pair counts as one working set, so the session total is unchanged.
  assert.equal(snapshot.totalWorkingSets, 10);
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), [
    "SQ_H3",
    "BP_FOCUS",
    "OAP_LEFT",
    "OAP_RIGHT",
    "OHP",
  ]);
  assert.equal(
    snapshot.exercises.some((item) => item.stream === "PULL_VOLUME_NORMAL"),
    false,
    "normal sessions no longer prescribe PULL volume (§14)",
  );

  const left = snapshot.exercises.find((item) => item.stream === "OAP_LEFT")!;
  const right = snapshot.exercises.find((item) => item.stream === "OAP_RIGHT")!;
  for (const [arm, item] of [["left", left], ["right", right]] as const) {
    assert.deepEqual(item.sets.map((set) => set.plannedReps), [3, 3], `${arm} is 2×3`);
    // A skill slot carries no load: the rung is the intensity coordinate.
    assert.deepEqual(item.sets.map((set) => set.externalLoadKg), [0, 0]);
    assert.deepEqual(item.sets.map((set) => set.totalLoadKg), [0, 0]);
    assert.equal(item.lift, "OAP");
    assert.equal(item.role, "SKILL");
    assert.equal(item.progressionTargetKg, 0);
    assert.equal(item.oap?.arm, arm);
    assert.equal(item.oap?.rung, 2, "both arms start on the forearm rung (§5.2)");
    assert.equal(item.oap?.rungName, "forearm");
    assert.equal(item.oap?.kind, "LADDER");
  }
  assert.deepEqual(snapshot.decision.oap, {
    reverted: false,
    left: { rung: 2, negative: false, free: false },
    right: { rung: 2, negative: false, free: false },
  });

  // The exercise identities must not read as pull-ups: both clients decide
  // "bodyweight lift" by substring and would fold these into total-load maths.
  for (const item of [left, right]) {
    for (const needle of ["pull-up", "pull up", "chin-up", "chin up", "풀업", "친업"]) {
      assert.equal(
        item.exerciseName.toLowerCase().includes(needle),
        false,
        `${item.exerciseName} must not match the bodyweight-name test on "${needle}"`,
      );
    }
  }
});

test("PULL focus and micro sessions are untouched by the OAP slot (§7.2, §7.4)", () => {
  const state = createInitialRef5State();
  const pullFocus = generateRef5Session(state, sessionInput("pull-focus", "2026-01-02T09:00:00.000Z"));
  assert.deepEqual(pullFocus.exercises.map((item) => item.stream), [
    "SQ_H3",
    "PULL_FOCUS",
    "BP_VOLUME_NORMAL",
    "DL",
  ]);
  assert.equal(pullFocus.totalWorkingSets, 10);
  assert.equal(pullFocus.decision.oap, null);

  const micro = generateRef5Session(
    state,
    sessionInput("micro", "2026-01-03T09:00:00.000Z", { manualMicro: true }),
  );
  assert.deepEqual(micro.exercises.map((item) => item.stream), [
    "SQ_V_MICRO",
    "BP_VOLUME_MICRO",
    "PULL_VOLUME_MICRO",
  ]);
  assert.equal(micro.totalWorkingSets, 4);
  assert.equal(micro.decision.oap, null, "the skill slot never enters a micro session");
});

test("valid completion alternates focus, and exact 48h allows H2 while 1ms early selects V", () => {
  const base = "2026-01-01T09:00:00.000Z";
  const first = runSession(createInitialRef5State(), sessionInput("1", base));
  const early = generateRef5Session(first.state, sessionInput("early", at(base, 48 * HOUR - 1)));
  const exact = generateRef5Session(first.state, sessionInput("exact", at(base, 48 * HOUR)));
  assert.equal(first.state.nextFocus, "BP");
  assert.equal(first.state.nextSquatHard, "H2");
  assert.equal(early.decision.focus, "BP");
  assert.equal(early.decision.squatPrescription, "V");
  assert.equal(exact.decision.squatPrescription, "H2");
  assert.equal(exact.totalWorkingSets, 10);
});

test("168h lower bound is open, 1ms inside counts, and an equal-time prior start blocks hard", () => {
  const now = "2026-02-01T12:00:00.000Z";
  const exactState = createInitialRef5State();
  exactState.hardStartTimes = [
    { sessionId: "old", startEventId: "old", actualStartAt: at(now, -168 * HOUR) },
    { sessionId: "last", startEventId: "last", actualStartAt: at(now, -48 * HOUR) },
  ];
  assert.equal(selectRef5SquatPrescription(exactState, now, "NORMAL").squatPrescription, "H3");
  assert.equal(selectRef5SquatPrescription(exactState, now, "NORMAL").hard.startsIn168Hours, 1);

  const insideState = createInitialRef5State();
  insideState.hardStartTimes = [
    { sessionId: "inside", startEventId: "inside", actualStartAt: at(now, -168 * HOUR + 1) },
    { sessionId: "last", startEventId: "last", actualStartAt: at(now, -48 * HOUR) },
  ];
  assert.equal(selectRef5SquatPrescription(insideState, now, "NORMAL").squatPrescription, "V");
  assert.equal(selectRef5SquatPrescription(insideState, now, "NORMAL").hard.startsIn168Hours, 2);

  const equalState = createInitialRef5State();
  equalState.hardStartTimes = [{ sessionId: "stable-a", startEventId: "same", actualStartAt: now }];
  assert.equal(selectRef5SquatPrescription(equalState, now, "NORMAL").squatPrescription, "V");
});

test("calendar-day density is timezone/DST aware and remains separate from elapsed hours", () => {
  let state = createInitialRef5State();
  const firstInput = sessionInput("dst-1", "2026-03-07T05:30:00.000Z", { timeZone: "America/New_York" });
  const firstSnapshot = generateRef5Session(state, firstInput);
  state = applyRef5FirstSquatStart(state, firstSnapshot, "start-dst-1").nextState;
  const secondInput = sessionInput("dst-2", "2026-03-08T05:30:00.000Z", { timeZone: "America/New_York" });
  const secondSnapshot = generateRef5Session(state, secondInput);
  state = applyRef5FirstSquatStart(state, secondSnapshot, "start-dst-2").nextState;
  const third = generateRef5Session(
    state,
    sessionInput("dst-3", "2026-03-09T04:30:00.000Z", { timeZone: "America/New_York" }),
  );
  assert.deepEqual(state.startedSessions.map((item) => item.calendarDate), ["2026-03-07", "2026-03-08"]);
  assert.equal(third.calendarDate, "2026-03-09");
  assert.equal(third.decision.sessionType, "MICRO", "two previous local dates trigger despite DST's 23h day");
  assert.ok(third.decision.microReasons.includes("CONSECUTIVE_PROGRAM_DAYS"));
  assert.equal(ref5CalendarDate("2026-05-01T15:00:00.000Z", "Asia/Seoul"), "2026-05-02");
});

test("preview/cancel is pure and first SQ start consumes all pending micro causes exactly once", () => {
  const state = createInitialRef5State();
  state.forcedMicro.pending = {
    eventId: "forced-token",
    sourceFailEventIds: ["fail-a", "fail-b"],
    createdByCompletionEventId: "complete-old",
  };
  for (const lift of ["SQ", "BP", "PULL"] as const) {
    state.stagnation[lift].phase = "PENDING_MICRO";
    state.stagnation[lift].pendingEventId = `pending-${lift}`;
  }
  const before = structuredClone(state);
  const snapshot = generateRef5Session(state, sessionInput("pending", "2026-01-10T09:00:00.000Z"));
  assert.deepEqual(state, before);
  assert.equal(snapshot.decision.sessionType, "MICRO");
  const first = applyRef5FirstSquatStart(state, snapshot, "start-pending");
  assert.equal(first.applied, true);
  assert.equal(first.consumedForcedMicroTokenId, "forced-token");
  assert.deepEqual(first.consumedStagnationLifts, ["SQ", "BP", "PULL"]);
  assert.equal(first.nextState.startedSessions.length, 1);
  assert.equal(first.nextState.pull.lock?.windowId, "pull-window-1");
  const retry = applyRef5FirstSquatStart(first.nextState, snapshot, "start-pending");
  assert.equal(retry.applied, false);
  assert.equal(retry.nextState.revision, first.nextState.revision);
  assert.equal(retry.nextState.startedSessions.length, 1);
});

test("outcome table distinguishes PASS/HOLD/FAIL/INVALID and rejects contradictory raw input", () => {
  assert.equal(
    classifyRef5Outcome({ sets: [{ plannedReps: 3, effectiveReps: 3 }], endReason: "NORMAL" }).outcome,
    "PASS",
  );
  assert.equal(
    classifyRef5Outcome({ sets: [{ plannedReps: 3, effectiveReps: 2 }], endReason: "FORCE_OR_TECHNIQUE" }).outcome,
    "HOLD",
  );
  assert.equal(
    classifyRef5Outcome({ sets: [{ plannedReps: 3, effectiveReps: 1 }], endReason: "FORCE_OR_TECHNIQUE" }).outcome,
    "FAIL",
  );
  assert.equal(
    classifyRef5Outcome({ sets: [{ plannedReps: 3, effectiveReps: 3 }], endReason: "CLEAR_SLOWDOWN" }).outcome,
    "HOLD",
    "slowdown first seen on the final prescribed rep is HOLD",
  );
  assert.equal(
    classifyRef5Outcome({ sets: [{ plannedReps: 3, effectiveReps: 3 }], endReason: "SAFETY" }).outcome,
    "INVALID",
  );
  assert.equal(
    classifyRef5Outcome({
      sets: [
        { plannedReps: 3, effectiveReps: 3 },
        { plannedReps: 3, effectiveReps: 2 },
      ],
      endReason: "FORCE_OR_TECHNIQUE",
    }).totalDeficit,
    1,
  );
  assert.equal(
    validateAndClassifyRef5Outcome({
      sets: [{ plannedReps: 3, effectiveReps: 2 }],
      endReason: "NORMAL",
    }).ok,
    false,
  );
  assert.equal(
    validateAndClassifyRef5Outcome({
      sets: [{ plannedReps: 3, effectiveReps: 3 }],
      endReason: "FORCE_OR_TECHNIQUE",
    }).ok,
    false,
  );
  assert.equal(
    validateAndClassifyRef5Outcome({
      sets: [{ plannedReps: 3, effectiveReps: 4 }],
      endReason: "NORMAL",
    }).ok,
    false,
  );
});

test("PULL focus PASS/HOLD/FAIL alternate to BP while INVALID retains PULL", () => {
  const base = "2026-04-01T09:00:00.000Z";
  const invalid = runSession(createInitialRef5State(), sessionInput("invalid", base), { PULL_FOCUS: "INVALID" });
  assert.equal(invalid.state.nextFocus, "PULL");
  assert.equal(invalid.state.mainWindows.PULL.exposures.length, 0);
  assert.equal(invalid.state.failStreams.PULL_FOCUS.consecutiveFails, 0);

  const failed = runSession(createInitialRef5State(), sessionInput("failed", base), { PULL_FOCUS: "FAIL" });
  assert.equal(failed.state.nextFocus, "BP", "a comparable failed focus does not repeat immediately");
  assert.equal(failed.state.mainWindows.PULL.exposures.length, 1);
  for (const outcome of ["PASS", "HOLD"] as const) {
    const result = runSession(createInitialRef5State(), sessionInput(outcome, base), {
      PULL_FOCUS: outcome,
    });
    assert.equal(result.state.nextFocus, "BP");
  }
});

test("v1.4 snapshot decoder rejects protocol-less, v1.1, v1.2, v1.3, and retired inputs (§24.3)", () => {
  const active = generateRef5Session(
    createInitialRef5State(),
    sessionInput("decode", "2026-04-03T09:00:00.000Z"),
  );
  for (const candidate of [
    { ...active, protocolVersion: undefined },
    { ...active, protocolVersion: "1.1", schemaVersion: 1 },
    { ...active, protocolVersion: "1.2", schemaVersion: 2 },
    // v1.4 does not reinterpret prior v1.3 snapshots/protocol input (§24.3);
    // those plans are archived, never folded forward.
    { ...active, protocolVersion: REF5_PRIOR_PROTOCOL_VERSION, schemaVersion: 3 },
    { ...active, climbingWithin48h: false },
    {
      ...active,
      exercises: [
        { ...active.exercises[0]!, role: "CLIMBING_FOCUS_INVALID" },
        ...active.exercises.slice(1),
      ],
    },
    {
      ...active,
      exercises: [{ ...active.exercises[0]!, omitted: false }, ...active.exercises.slice(1)],
    },
  ]) {
    assert.throws(() => decodeRef5SessionSnapshot(candidate), Ref5StaleVersionError);
  }
});

test("manual, calendar, forced-fail and multiple stagnation reasons merge into one four-set micro", () => {
  const state = createInitialRef5State();
  state.startedSessions = [
    fakeStarted("d1", "2026-06-09"),
    fakeStarted("d2", "2026-06-08"),
    fakeStarted("d3", "2026-06-07"),
  ];
  state.forcedMicro.pending = {
    eventId: "forced",
    sourceFailEventIds: ["a", "b"],
    createdByCompletionEventId: "old",
  };
  for (const lift of ["SQ", "BP", "PULL"] as const) state.stagnation[lift].phase = "PENDING_MICRO";
  const snapshot = generateRef5Session(
    state,
    sessionInput("merged", "2026-06-10T09:00:00.000Z", { manualMicro: true }),
  );
  assert.equal(snapshot.decision.sessionType, "MICRO");
  assert.equal(snapshot.totalWorkingSets, 4);
  assert.deepEqual(new Set(snapshot.decision.microReasons), new Set([
    "MANUAL",
    "CONSECUTIVE_PROGRAM_DAYS",
    "NORMAL_SESSION_DENSITY",
    "FORCED_PRIMARY_FAILS",
    "STAGNATION_SQ",
    "STAGNATION_BP",
    "STAGNATION_PULL",
  ]));
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), ["SQ_V_MICRO", "BP_VOLUME_MICRO", "PULL_VOLUME_MICRO"]);
  // Micro volume stays one set even though normal volume is now two (§7.4).
  assert.deepEqual(
    snapshot.exercises.find((item) => item.stream === "BP_VOLUME_MICRO")?.sets.map((set) => set.plannedReps),
    [5],
  );
  assert.deepEqual(
    snapshot.exercises.find((item) => item.stream === "PULL_VOLUME_MICRO")?.sets.map((set) => set.plannedReps),
    [6],
  );
});

test("closing unperformed prescriptions INVALID does not enter windows or fail streams", () => {
  const result = runSession(
    createInitialRef5State(),
    sessionInput("all-invalid", "2026-06-20T09:00:00.000Z"),
    { SQ_H3: "INVALID", PULL_FOCUS: "INVALID", BP_VOLUME_NORMAL: "INVALID", DL: "INVALID" },
  );
  assert.equal(result.state.completedSessions.length, 1);
  assert.equal(result.state.mainWindows.SQ.exposures.length, 0);
  assert.equal(result.state.mainWindows.PULL.exposures.length, 0);
  assert.equal(result.state.auxiliaryWindows.DL.exposures.length, 0);
  assert.equal(result.state.failStreams.SQ_H3.lastComparableOutcome, null);
  assert.equal(result.state.failStreams.PULL_FOCUS.lastComparableOutcome, null);
});

test("SQ6 and BP/PULL4 all-pass windows increase direct kg; aux uses new caps and initial OHP increase is denied", () => {
  let state = createInitialRef5State();
  const base = "2026-01-01T09:00:00.000Z";
  for (let index = 0; index < 8; index += 1) {
    state = runSession(state, sessionInput(`progress-${index}`, at(base, index * 4 * DAY))).state;
  }
  assert.equal(state.directStandardsKg.sqH3Kg, 85, "six valid hard exposures");
  assert.equal(state.directStandardsKg.pullFocusTotalKg, 90, "four PULL focus exposures");
  assert.equal(state.directStandardsKg.bpFocusKg, 85, "four BP focus exposures");
  assert.equal(state.directStandardsKg.deadliftKg, 75, "four PASS DL exposures fit the post-SQ cap");
  assert.equal(state.directStandardsKg.ohpKg, 32.5, "35 kg still exceeds the post-BP cap, so no slack is banked");
  assert.equal(state.auxiliaryWindows.OHP.lastWindowResult, "MAINTAIN");
});

test("two FAILs in the same stream decrease immediately; another stream and INVALID do not break the streak", () => {
  let state = createInitialRef5State();
  const base = "2026-01-01T09:00:00.000Z";
  let result = runSession(state, sessionInput("f1", base), { SQ_H3: "FAIL" });
  state = result.state;
  result = runSession(state, sessionInput("other", at(base, 4 * DAY)), { SQ_H2: "INVALID" });
  state = result.state;
  // INVALID H2 does not alternate, so make it comparable next, then H3 returns.
  result = runSession(state, sessionInput("other-pass", at(base, 8 * DAY)), { SQ_H2: "PASS" });
  state = result.state;
  result = runSession(state, sessionInput("f2", at(base, 12 * DAY)), { SQ_H3: "FAIL" });
  state = result.state;
  assert.equal(state.directStandardsKg.sqH3Kg, 80);
  assert.equal(state.failStreams.SQ_H3.consecutiveFails, 0, "direct change resets all SQ fail streams");
  assert.ok(result.completion.changes.some((change) => change.kind === "IMMEDIATE_DECREASE" && change.lift === "SQ"));
});

test("DL/OHP two-FAIL and four-exposure rules run after main changes and enforce the newly derived cap", () => {
  const base = "2026-01-01T09:00:00.000Z";
  let auxFailState = createInitialRef5State();
  auxFailState = runSession(auxFailState, sessionInput("dl-fail-1", base), { DL: "FAIL" }).state;
  auxFailState = runSession(auxFailState, sessionInput("ohp-between", at(base, 4 * DAY)), { OHP: "INVALID" }).state;
  const secondDlFail = runSession(
    auxFailState,
    sessionInput("dl-fail-2", at(base, 8 * DAY)),
    { DL: "FAIL" },
  );
  assert.equal(secondDlFail.state.directStandardsKg.deadliftKg, 70);
  assert.equal(secondDlFail.state.failStreams.DL.consecutiveFails, 0);

  const capped = createInitialRef5State({
    ...REF5_INITIAL_DIRECT_STANDARDS_KG,
    sqH3Kg: 80,
  });
  capped.failStreams.SQ_H3 = {
    consecutiveFails: 1,
    lastComparableOutcome: "FAIL",
    lastEventId: "prior-sq-fail",
  };
  const capResult = runSession(
    capped,
    sessionInput("sq-down-cap", "2026-02-01T09:00:00.000Z"),
    { SQ_H3: "FAIL" },
  );
  assert.equal(capResult.state.directStandardsKg.sqH3Kg, 77.5);
  assert.equal(capResult.state.directStandardsKg.deadliftKg, 70, "new SQ REF cap is applied after SQ decrease");
  assert.ok(
    capResult.completion.changes.some(
      (change) => change.lift === "DL" && change.kind === "AUXILIARY_CAP_DECREASE",
    ),
  );
});

test("two maintained SQ windows queue one micro; consuming it then maintaining the reassessment window lowers 2.5kg", () => {
  let state = createInitialRef5State();
  const base = "2026-01-01T09:00:00.000Z";
  let hardIndex = 0;
  for (let index = 0; index < 12; index += 1) {
    const outcome: Ref5Outcome = hardIndex % 6 < 2 ? "HOLD" : "PASS";
    const snapshot = generateRef5Session(state, sessionInput(`stagnant-${index}`, at(base, index * 4 * DAY)));
    const sqStream = snapshot.exercises[0]!.stream;
    state = runSession(state, snapshot.startInput, { [sqStream]: outcome }).state;
    hardIndex += 1;
  }
  assert.equal(state.stagnation.SQ.phase, "PENDING_MICRO");
  const microAt = at(base, 12 * 4 * DAY);
  const micro = runSession(state, sessionInput("stagnation-micro", microAt));
  assert.equal(micro.snapshot.decision.sessionType, "MICRO");
  assert.ok(micro.start.consumedStagnationLifts.includes("SQ"));
  state = micro.state;
  hardIndex = 0;
  for (let index = 0; index < 6; index += 1) {
    const input = sessionInput(`reassess-${index}`, at(microAt, (index + 1) * 4 * DAY));
    const snapshot = generateRef5Session(state, input);
    const sqStream = snapshot.exercises[0]!.stream;
    state = runSession(state, input, { [sqStream]: hardIndex < 2 ? "HOLD" : "PASS" }).state;
    hardIndex += 1;
  }
  assert.equal(state.directStandardsKg.sqH3Kg, 80);
  assert.equal(state.stagnation.SQ.phase, "BASELINE");
  assert.equal(state.stagnation.SQ.decreaseHistory.find((entry) => entry.basisKg === 82.5)?.count, 1);
});

test("overlapping immediate and stagnation decreases apply once, record both causes, and second same-basis recurrence flags review", () => {
  function primed(historyCount: number): Ref5RuntimeState {
    const state = createInitialRef5State();
    state.nextSquatHard = "H3";
    state.mainWindows.SQ.exposures = [
      fakeExposure("p1", "SQ_H2"),
      fakeExposure("p2", "SQ_H3"),
      fakeExposure("p3", "SQ_H2"),
      fakeExposure("p4", "SQ_H3"),
      fakeExposure("p5", "SQ_H2"),
    ];
    state.failStreams.SQ_H3 = { consecutiveFails: 1, lastComparableOutcome: "FAIL", lastEventId: "old-fail" };
    state.stagnation.SQ.phase = "REASSESSMENT";
    state.stagnation.SQ.basisKg = 82.5;
    if (historyCount > 0) {
      state.stagnation.SQ.decreaseHistory = [{ basisKg: 82.5, count: historyCount, eventIds: ["prior"] }];
    }
    return state;
  }
  const first = runSession(
    primed(0),
    sessionInput("overlap-1", "2026-08-01T09:00:00.000Z"),
    { SQ_H3: "FAIL" },
  );
  assert.equal(first.state.directStandardsKg.sqH3Kg, 80);
  assert.deepEqual(
    new Set(first.completion.changes.filter((change) => change.lift === "SQ").map((change) => change.kind)),
    new Set(["IMMEDIATE_DECREASE", "STAGNATION_DECREASE"]),
  );
  assert.equal(first.state.stagnation.SQ.decreaseHistory[0]?.count, 1);

  const second = runSession(
    primed(1),
    sessionInput("overlap-2", "2026-08-02T09:00:00.000Z"),
    { SQ_H3: "FAIL" },
  );
  assert.equal(second.state.directStandardsKg.sqH3Kg, 80, "not 77.5 despite two overlapping causes");
  assert.equal(second.state.stagnation.SQ.decreaseHistory[0]?.count, 2);
  assert.equal(second.state.stagnation.SQ.structureReview, true);
});

test("distinct primary FAIL events merge into one forced micro and are consumed on the next actual START", () => {
  const result = runSession(
    createInitialRef5State(),
    sessionInput("multi-fail", "2026-09-01T09:00:00.000Z"),
    { SQ_H3: "FAIL", PULL_FOCUS: "FAIL" },
  );
  assert.ok(result.state.forcedMicro.pending);
  assert.equal(result.state.forcedMicro.failEvents.filter((event) => event.status === "CLAIMED").length, 2);
  const preview = generateRef5Session(
    result.state,
    sessionInput("forced-micro", "2026-09-05T09:00:00.000Z"),
  );
  assert.equal(preview.decision.sessionType, "MICRO");
  assert.ok(preview.decision.microReasons.includes("FORCED_PRIMARY_FAILS"));
  const start = applyRef5FirstSquatStart(result.state, preview, "start-forced-micro");
  assert.ok(start.consumedForcedMicroTokenId);
  assert.equal(start.nextState.forcedMicro.pending, null);
});

test("PULL uses 2/3-measurement boundary, holds both locks through a window, then relocks without clearing stagnation", () => {
  const initial = createInitialRef5State();
  const two = generateRef5Session(
    initial,
    sessionInput("count-2", "2026-01-01T09:00:00.000Z", {
      todayBodyweightKg: 75,
      recent7DayMeasurementCount: 2,
      recent7DayAverageKg: 78.75,
    }),
  );
  const three = generateRef5Session(
    initial,
    sessionInput("count-3", "2026-01-01T09:00:00.000Z", {
      todayBodyweightKg: 75,
      recent7DayMeasurementCount: 3,
      recent7DayAverageKg: 78.75,
    }),
  );
  assert.equal(two.pullContext.calculationBodyweightKg, 75);
  assert.equal(two.pullContext.focus.lockedAddedKg, 12.5);
  assert.equal(three.pullContext.calculationBodyweightKg, 78.75);
  assert.equal(three.pullContext.focus.lockedAddedKg, 10, "8.75 kg midpoint rounds upward");
  const aboveTarget = generateRef5Session(
    initial,
    sessionInput("zero-floor", "2026-01-01T09:00:00.000Z", { todayBodyweightKg: 90 }),
  );
  assert.equal(aboveTarget.pullContext.focus.lockedAddedKg, 0);
  assert.equal(aboveTarget.pullContext.focus.actualTotalKg, 90);

  let state = initial;
  const base = "2026-02-01T09:00:00.000Z";
  for (let index = 0; index < 7; index += 1) {
    const input = sessionInput(`lock-${index}`, at(base, index * 4 * DAY), {
      todayBodyweightKg: index === 6 ? 80 : 75,
    });
    const snapshot = generateRef5Session(state, input);
    const overrides: Partial<Record<Ref5Stream, Ref5Outcome>> = {};
    if (snapshot.decision.focus === "PULL") {
      const pullIndex = Math.floor(index / 2);
      overrides.PULL_FOCUS = pullIndex < 2 ? "HOLD" : "PASS";
    }
    const result = runSession(state, input, overrides);
    if (index > 0 && index < 6) assert.equal(result.snapshot.pullContext.focus.lockedAddedKg, 12.5);
    state = result.state;
  }
  assert.equal(state.directStandardsKg.pullFocusTotalKg, 87.5, "two HOLDs make the four-focus window maintain");
  assert.equal(state.pull.lock?.focusAddedKg, 7.5, "new window relocks against current calculation BW 80");
  assert.equal(state.pull.lock?.volumeAddedKg, 0);
  assert.equal(state.pull.lock?.windowId, "pull-window-2");
  assert.equal(state.stagnation.PULL.consecutiveMaintainWindows, 1, "relock alone preserves stagnation progress");
});

test("PULL same-stream immediate decrease changes canonical target and immediately relocks", () => {
  let state = createInitialRef5State();
  const base = "2026-10-01T09:00:00.000Z";
  state = runSession(state, sessionInput("pull-fail-1", base), { PULL_FOCUS: "FAIL" }).state;
  state = runSession(state, sessionInput("between", at(base, 4 * DAY))).state;
  state = runSession(state, sessionInput("pull-fail-2", at(base, 8 * DAY)), { PULL_FOCUS: "FAIL" }).state;
  assert.equal(state.directStandardsKg.pullFocusTotalKg, 85);
  assert.equal(state.pull.lock?.focusTargetTotalKg, 85);
  assert.equal(state.pull.lock?.focusAddedKg, 10);
  assert.equal(state.mainWindows.PULL.exposures.length, 0);
  assert.equal(state.failStreams.PULL_FOCUS.consecutiveFails, 0);
  assert.equal(state.stagnation.PULL.phase, "BASELINE");
});

function rawPassEvent(
  key: string,
  sessionId: string,
  actualStartAt: string,
  kind: "FIRST" | "SECOND",
  revision = 0,
  options: { oapSlotReverted?: boolean } = {},
): Ref5RawLogEvent {
  // The second (BP-focus) session's third slot is the OAP pair in v1.4, or the
  // v1.3 PULL volume when the session was started reverted (§7.3, §7.6).
  const secondSlot: Array<[Ref5PrescriptionKey, number[]]> = options.oapSlotReverted
    ? [["PULL_VOLUME_NORMAL", [6, 6]]]
    : [
        ["OAP_LEFT", [3, 3]],
        ["OAP_RIGHT", [3, 3]],
      ];
  const slots: Array<[Ref5PrescriptionKey, number[]]> = kind === "FIRST"
    ? [
        ["SQ_H3", [3, 3, 3]],
        ["PULL_FOCUS", [3, 3, 3]],
        ["BP_VOLUME_NORMAL", [5, 5]],
        ["DL", [4, 4]],
      ]
    : [
        ["SQ_H2", [2, 2, 2]],
        ["BP_FOCUS", [3, 3, 3]],
        ...secondSlot,
        ["OHP", [6, 6]],
      ];
  const outcomes: Partial<Record<Ref5PrescriptionKey, Ref5OutcomeInput>> = {};
  for (const [stream, reps] of slots) {
    outcomes[stream] = {
      endReason: "NORMAL",
      sets: reps.map((plannedReps) => ({ plannedReps, effectiveReps: plannedReps })),
    };
  }
  return {
    idempotencyKey: key,
    logId: `log-${key}`,
    sourceRevision: revision,
    stableKey: key,
    sessionId,
    actualStartAt,
    completedAt: at(actualStartAt, 2 * HOUR),
    timeZone: "UTC",
    todayBodyweightKg: 75,
    recent7DayMeasurementCount: 0,
    recent7DayAverageKg: null,
    manualMicro: false,
    ...(options.oapSlotReverted ? { oapSlotReverted: true } : {}),
    outcomes,
  };
}

test("full replay sorts by actual start + stable key and is deterministic across retry, edit and tombstone", () => {
  const base = "2026-11-01T09:00:00.000Z";
  const first = rawPassEvent("a", "raw-a", base, "FIRST");
  const second = rawPassEvent("b", "raw-b", at(base, 4 * DAY), "SECOND");
  const replayForward = replayRef5RawLogs([first, second]);
  const replayReverse = replayRef5RawLogs([second, first]);
  assert.deepEqual(replayReverse.state, replayForward.state);
  assert.equal(replayForward.state.completedSessions.length, 2);

  const retry = replayRef5RawLogs([second, first, structuredClone(first)]);
  assert.deepEqual(retry.state, replayForward.state);
  assert.deepEqual(retry.skippedDuplicateKeys, ["a"]);

  const edited = structuredClone(first);
  edited.sourceRevision = 1;
  const pull = edited.outcomes.PULL_FOCUS as Ref5OutcomeInput;
  edited.outcomes.PULL_FOCUS = {
    endReason: "FORCE_OR_TECHNIQUE",
    sets: pull.sets.map((set, index) =>
      index === 2 ? { plannedReps: 3, effectiveReps: 1 } : { ...set },
    ),
  };
  const editReplayA = replayRef5RawLogs([second, first, edited]);
  const editReplayB = replayRef5RawLogs([edited, second, first]);
  assert.deepEqual(editReplayA.state, editReplayB.state);
  assert.equal(editReplayA.state.failStreams.PULL_FOCUS.consecutiveFails, 1);

  const tombstone = { ...structuredClone(second), sourceRevision: 2, deleted: true };
  const deleted = replayRef5RawLogs([first, second, tombstone]);
  assert.equal(deleted.state.completedSessions.length, 1);
  assert.deepEqual(deleted.appliedIdempotencyKeys, ["a"]);
});

test("start and completion retries cannot duplicate dates, queue movement, windows or increments", () => {
  const state = createInitialRef5State();
  const snapshot = generateRef5Session(state, sessionInput("retry", "2026-12-01T09:00:00.000Z"));
  const firstStart = applyRef5FirstSquatStart(state, snapshot, "start-retry");
  const secondStart = applyRef5FirstSquatStart(firstStart.nextState, snapshot, "start-retry");
  assert.equal(secondStart.applied, false);
  const payload = {
    completionEventId: "complete-retry",
    rawLogId: "log-retry",
    completedAt: "2026-12-01T11:00:00.000Z",
    outcomes: completionOutcomes(snapshot),
  };
  const firstCompletion = reduceRef5Completion(firstStart.nextState, snapshot, payload);
  const secondCompletion = reduceRef5Completion(firstCompletion.nextState, snapshot, payload);
  assert.equal(secondCompletion.applied, false);
  assert.equal(secondCompletion.nextState.completedSessions.length, 1);
  assert.equal(secondCompletion.nextState.mainWindows.SQ.exposures.length, 1);
  assert.equal(secondCompletion.nextState.mainWindows.PULL.exposures.length, 1);
  assert.equal(secondCompletion.nextState.nextFocus, "BP");
  assert.equal(secondCompletion.nextState.revision, firstCompletion.nextState.revision);
});

test("historical START keeps frozen prescription metadata but reconstructs the canonical PULL lock", () => {
  const frozen = generateRef5Session(
    createInitialRef5State(),
    sessionInput("historical-lock", "2026-12-10T09:00:00.000Z"),
  );
  const rebuilt = createInitialRef5State({
    ...REF5_INITIAL_DIRECT_STANDARDS_KG,
    pullFocusTotalKg: 85,
  });
  const historical = applyRef5FirstSquatStart(
    rebuilt,
    frozen,
    "start-historical-lock",
    { historicalReplay: true },
  );
  assert.equal(frozen.pullContext.focus.targetTotalKg, 87.5, "actual frozen session metadata is unchanged");
  assert.equal(historical.nextState.pull.lock?.focusTargetTotalKg, 85);
  assert.equal(historical.nextState.pull.lock?.focusAddedKg, 10);
  const historicalCompletion = {
    completionEventId: "complete-historical-lock",
    completedAt: "2026-12-10T11:00:00.000Z",
    outcomes: completionOutcomes(frozen),
  };
  assert.throws(
    () => reduceRef5Completion(historical.nextState, frozen, historicalCompletion),
    /conflicts with canonical progression state/,
  );
  assert.equal(
    reduceRef5Completion(historical.nextState, frozen, {
      ...historicalCompletion,
      historicalReplay: true,
    }).applied,
    true,
  );

  const conflicting = createInitialRef5State();
  conflicting.pull.lock = {
    windowId: "pull-window-99",
    focusTargetTotalKg: 87.5,
    volumeTargetTotalKg: 75,
    focusAddedKg: 12.5,
    volumeAddedKg: 0,
  };
  assert.throws(
    () => applyRef5FirstSquatStart(conflicting, frozen, "strict-conflict"),
    /PULL lock conflicts/,
  );
  assert.doesNotThrow(() =>
    applyRef5FirstSquatStart(conflicting, frozen, "historical-conflict", { historicalReplay: true }),
  );
});

// ── v1.3 protocol regressions (§25) ───────────────────────────────────────────

test("the withdrawn OHP microloading option leaves every lift on the 2.5 kg grid (§5.1, §13.3)", () => {
  const base = { sqH3Kg: 82.5, bpFocusKg: 82.5, pullFocusTotalKg: 87.5, deadliftKg: 72.5, ohpKg: 32.5 };
  const ok = validateRef5StartConfig(base);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.initializationVersion, 3);
    assert.equal(ok.value.startingValuesKg.ohpKg, 32.5);
    assert.equal("ohpMicroloading" in ok.value, false, "the option is gone from the start config");
  }
  // A 1.25 kg OHP start is off-grid: the plate that would make it real is
  // 0.625 kg per side, which is not what gyms stock.
  const microOhp = validateRef5StartConfig({ ...base, ohpKg: 31.25 });
  assert.equal(microOhp.ok, false);
  if (!microOhp.ok) assert.ok(microOhp.errors.some((error) => error.includes("ohpKg must use the 2.5 kg grid")));
  const offGridSquat = validateRef5StartConfig({ ...base, sqH3Kg: 83.75 });
  assert.equal(offGridSquat.ok, false);
  if (!offGridSquat.ok) assert.ok(offGridSquat.errors.some((error) => error.includes("sqH3Kg must use the 2.5 kg grid")));
  // Plans created while the option existed still carry the field; it is ignored.
  const legacy = readRef5PlanStartConfig({ ref5: { startingValuesKg: base, ohpMicroloading: true } });
  assert.equal("ohpMicroloading" in legacy, false);
  assert.equal(legacy.startingValuesKg.ohpKg, 32.5);
});

test("REF5 auxiliary cap is REF-based, so the OHP 2.5 kg step waits for BP (§6.4)", () => {
  assert.equal(ref5AuxiliaryCandidateIsWithinCap("OHP", 35, { ...REF5_INITIAL_DIRECT_STANDARDS_KG }), false);
  const headroom = { ...REF5_INITIAL_DIRECT_STANDARDS_KG, ohpKg: 30, bpFocusKg: 80 };
  assert.equal(
    ref5AuxiliaryCandidateIsWithinCap("OHP", 32.5, headroom),
    false,
    "BP 80 caps the OHP control REF below the 32.5 kg candidate",
  );
  assert.equal(
    ref5AuxiliaryCandidateIsWithinCap("OHP", 32.5, { ...headroom, bpFocusKg: 82.5 }),
    true,
    "the same step clears once BP advances to 82.5",
  );
});

function ohpImmediateDecrease(): number {
  // OHP only appears in normal BP-focus sessions; sessions 1 and 3 (4-day spaced,
  // hard + normal) give two consecutive OHP exposures. Failing both immediately
  // decreases OHP by the single 2.5 kg grid.
  let state = createInitialRef5State();
  const base = "2026-01-01T09:00:00.000Z";
  for (let index = 0; index < 4; index += 1) {
    state = runSession(state, sessionInput(`ohp-${index}`, at(base, index * 4 * DAY)), { OHP: "FAIL" }).state;
  }
  return state.directStandardsKg.ohpKg;
}

test("OHP immediate decrease steps on the single 2.5 kg grid (§13.3)", () => {
  assert.equal(ohpImmediateDecrease(), 30);
});

test("normal and micro volume fail streams are independent but both veto the focus window (§13.2, §14)", () => {
  const base = "2026-03-01T09:00:00.000Z";
  let state = createInitialRef5State();
  // Normal PULL-focus session fails BP volume normal.
  state = runSession(state, sessionInput("vn", base), { BP_VOLUME_NORMAL: "FAIL" }).state;
  assert.equal(state.mainWindows.BP.volumeFailEventIds.length, 1);
  assert.equal(state.failStreams.BP_VOLUME_NORMAL.consecutiveFails, 1);
  assert.equal(state.directStandardsKg.bpFocusKg, 82.5, "a single volume fail does not move the direct standard");
  // A micro session fails BP volume micro: a distinct stream that still vetoes.
  const micro = runSession(
    state,
    sessionInput("vm", at(base, 4 * DAY), { manualMicro: true }),
    { BP_VOLUME_MICRO: "FAIL" },
  );
  state = micro.state;
  assert.equal(state.mainWindows.BP.volumeFailEventIds.length, 2, "both volume streams feed the BP focus veto");
  assert.equal(state.failStreams.BP_VOLUME_MICRO.consecutiveFails, 1);
  assert.equal(state.failStreams.BP_VOLUME_NORMAL.consecutiveFails, 1, "the normal streak is untouched by a micro fail");
  assert.equal(
    micro.completion.changes.some((change) => change.kind === "IMMEDIATE_DECREASE"),
    false,
    "split streaks never combine into a decrease",
  );
});

test("completed judgment windows accumulate the §18 gain-rate flow", () => {
  let state = createInitialRef5State();
  const base = "2026-01-01T09:00:00.000Z";
  for (let index = 0; index < 8; index += 1) {
    state = runSession(state, sessionInput(`gr-${index}`, at(base, index * 4 * DAY))).state;
  }
  // Eight all-PASS normal sessions complete one window per lift.
  assert.equal(state.mainWindows.SQ.completedWindowCount, 1);
  assert.equal(state.mainWindows.SQ.increaseWindowCount, 1);
  assert.deepEqual(state.mainWindows.SQ.recentResults, ["INCREASE"]);
  assert.equal(state.mainWindows.BP.increaseWindowCount, 1);
  assert.equal(state.mainWindows.PULL.increaseWindowCount, 1);
  assert.equal(state.auxiliaryWindows.DL.increaseWindowCount, 1);
  // OHP's window completes but 35 kg exceeds the cap, so it records MAINTAIN.
  assert.equal(state.auxiliaryWindows.OHP.completedWindowCount, 1);
  assert.equal(state.auxiliaryWindows.OHP.increaseWindowCount, 0);
  assert.deepEqual(state.auxiliaryWindows.OHP.recentResults, ["MAINTAIN"]);
});

test("normal session runs ten working sets with two-set upper-body volume; micro stays four (§7)", () => {
  const normal = generateRef5Session(createInitialRef5State(), sessionInput("ten", "2026-05-01T09:00:00.000Z"));
  assert.equal(normal.totalWorkingSets, 10);
  const micro = generateRef5Session(
    createInitialRef5State(),
    sessionInput("four", "2026-05-02T09:00:00.000Z", { manualMicro: true }),
  );
  assert.equal(micro.totalWorkingSets, 4);
  assert.deepEqual(micro.exercises.map((item) => item.sets.length), [2, 1, 1]);
});

// ---------------------------------------------------------------------------
// v1.4 — OAP skill slot (§7.5–§7.6, §14, §24.3). Test names carry the § they
// implement so a future protocol change can find its contract from the spec.
// ---------------------------------------------------------------------------

/**
 * Runs one BP-focus session and returns the state after it.
 *
 * The focus queue alternates on every valid focus outcome, so a BP-focus
 * session is reached by forcing `nextFocus`; the PULL-focus session in between
 * would otherwise consume the exposure we care about.
 */
function runOapSession(
  state: Ref5RuntimeState,
  index: number,
  outcomes: Partial<Record<Ref5PrescriptionKey, Ref5Outcome | Ref5OutcomeInput>> = {},
  options: { startAt?: string; oapSlotReverted?: boolean } = {},
) {
  const primed = { ...state, nextFocus: "BP" as const };
  const startAt = options.startAt ?? at("2026-03-01T09:00:00.000Z", index * 4 * DAY);
  return runSession(
    primed,
    sessionInput(`oap-${index}`, startAt, {
      ...(options.oapSlotReverted ? { oapSlotReverted: true } : {}),
    }),
    outcomes,
  );
}

/** Repeats the same OAP outcome on both arms for `count` BP-focus sessions. */
function repeatOapOutcome(
  state: Ref5RuntimeState,
  count: number,
  outcome: Ref5Outcome,
  startIndex = 0,
): Ref5RuntimeState {
  let running = state;
  for (let index = 0; index < count; index += 1) {
    running = runOapSession(running, startIndex + index, {
      OAP_LEFT: outcome,
      OAP_RIGHT: outcome,
    }).state;
  }
  return running;
}

test("three consecutive PASS promote one rung; HOLD is neutral and INVALID does not advance (§7.5.4)", () => {
  let state = repeatOapOutcome(createInitialRef5State(), 2, "PASS");
  assert.equal(state.oap.left.rung, 2, "two PASSes are not yet a promotion");
  assert.equal(state.oap.left.passStreak, 2);

  // HOLD breaks the promotion streak without touching the demotion streak.
  state = runOapSession(state, 2, { OAP_LEFT: "HOLD", OAP_RIGHT: "HOLD" }).state;
  assert.equal(state.oap.left.passStreak, 0);
  assert.equal(state.oap.left.failStreak, 0);
  assert.equal(state.oap.left.rung, 2);

  // INVALID advances neither streak and breaks neither.
  state = runOapSession(state, 3, { OAP_LEFT: "PASS", OAP_RIGHT: "PASS" }).state;
  state = runOapSession(state, 4, { OAP_LEFT: "INVALID", OAP_RIGHT: "INVALID" }).state;
  assert.equal(state.oap.left.passStreak, 1, "INVALID left the streak where it was");
  state = repeatOapOutcome(state, 2, "PASS", 5);
  assert.equal(state.oap.left.rung, 3, "the third valid PASS promoted");
  assert.equal(state.oap.left.passStreak, 0, "promotion clears both counters");
  assert.equal(state.oap.left.failStreak, 0);

  const promote = state.progressionChanges.find((change) => change.kind === "OAP_PROMOTE");
  assert.equal(promote?.lift, "OAP");
  assert.equal(promote?.arm, "left");
  assert.equal(promote?.beforeKg, 2, "the change carries rungs, never kilograms");
  assert.equal(promote?.afterKg, 3);
});

test("two consecutive FAIL demote one rung and rung 1 is the floor (§7.5.4)", () => {
  let state = createInitialRef5State();
  state = runOapSession(state, 0, { OAP_LEFT: "FAIL", OAP_RIGHT: "FAIL" }).state;
  assert.equal(state.oap.left.rung, 2, "one FAIL is not a demotion");
  state = runOapSession(state, 1, { OAP_LEFT: "FAIL", OAP_RIGHT: "FAIL" }).state;
  assert.equal(state.oap.left.rung, 1);
  assert.equal(state.oap.left.failStreak, 0, "demotion clears the counter");
  const demote = state.progressionChanges.find((change) => change.kind === "OAP_DEMOTE");
  assert.deepEqual(
    { before: demote?.beforeKg, after: demote?.afterKg, arm: demote?.arm },
    { before: 2, after: 1, arm: "left" },
  );

  // Rung 1 is the floor: the condition is consumed but the rung cannot move.
  state = repeatOapOutcome(state, 2, "FAIL", 2);
  assert.equal(state.oap.left.rung, 1);
  assert.equal(state.oap.left.failStreak, 0);
  assert.equal(
    state.progressionChanges.filter((change) => change.kind === "OAP_DEMOTE").length,
    2,
    "one demotion per arm, and none from the floor",
  );

  // A HOLD also breaks a pending demotion streak.
  state = runOapSession(state, 4, { OAP_LEFT: "FAIL", OAP_RIGHT: "FAIL" }).state;
  state = runOapSession(state, 5, { OAP_LEFT: "HOLD", OAP_RIGHT: "HOLD" }).state;
  assert.equal(state.oap.left.failStreak, 0);
});

test("one arm's OAP result never moves the other arm (§7.5.2)", () => {
  let state = createInitialRef5State();
  for (let index = 0; index < 3; index += 1) {
    state = runOapSession(state, index, { OAP_LEFT: "PASS", OAP_RIGHT: "FAIL" }).state;
  }
  assert.equal(state.oap.left.rung, 3, "left promoted on three PASSes");
  assert.equal(state.oap.right.rung, 1, "right demoted on two FAILs");
  assert.equal(state.oap.left.failStreak, 0);
  assert.equal(state.oap.right.passStreak, 0);
});

test("negatives unlock on promotion to rung 4 and the session then runs eleven sets (§7.3, §7.5.3)", () => {
  let state = createInitialRef5State();
  // 2 -> 3 -> 4 on the left only; the right stays put on HOLDs.
  for (let index = 0; index < 6; index += 1) {
    state = runOapSession(state, index, { OAP_LEFT: "PASS", OAP_RIGHT: "HOLD" }).state;
  }
  assert.equal(state.oap.left.rung, 4);
  assert.equal(state.oap.left.negativesUnlocked, true);
  assert.equal(state.oap.right.rung, 2);
  assert.equal(state.oap.right.negativesUnlocked, false, "the other arm is unaffected");

  const withNegative = generateRef5Session(
    { ...state, nextFocus: "BP" },
    sessionInput("neg", at("2026-03-01T09:00:00.000Z", 40 * DAY)),
  );
  assert.deepEqual(withNegative.exercises.map((item) => item.stream), [
    "SQ_H3",
    "BP_FOCUS",
    "OAP_LEFT",
    "OAP_RIGHT",
    "OAP_NEG_LEFT",
    "OHP",
  ]);
  // The negative pair adds exactly one working set even though only one arm
  // has it — the pair is the unit of accounting (§7.3).
  assert.equal(withNegative.totalWorkingSets, 11);
  const negative = withNegative.exercises.find((item) => item.stream === "OAP_NEG_LEFT")!;
  assert.deepEqual(negative.sets.map((set) => set.plannedReps), [2]);
  assert.equal(negative.oap?.kind, "NEGATIVE");
  assert.equal(negative.oap?.rung, 4);

  // Demoting back below rung 4 stops the negative but keeps the unlock latched.
  let demoted = state;
  for (let index = 0; index < 2; index += 1) {
    demoted = runOapSession(demoted, 10 + index, { OAP_LEFT: "FAIL", OAP_RIGHT: "HOLD" }).state;
  }
  assert.equal(demoted.oap.left.rung, 3);
  assert.equal(demoted.oap.left.negativesUnlocked, true, "the unlock is latched (§7.5.3)");
  const belowRung4 = generateRef5Session(
    { ...demoted, nextFocus: "BP" },
    sessionInput("no-neg", at("2026-03-01T09:00:00.000Z", 60 * DAY)),
  );
  assert.equal(belowRung4.exercises.some((item) => item.oap?.kind === "NEGATIVE"), false);
  assert.equal(belowRung4.totalWorkingSets, 10);

  // Re-promoting to rung 4 resumes it immediately.
  let repromoted = demoted;
  for (let index = 0; index < 3; index += 1) {
    repromoted = runOapSession(repromoted, 20 + index, { OAP_LEFT: "PASS", OAP_RIGHT: "HOLD" }).state;
  }
  assert.equal(repromoted.oap.left.rung, 4);
  const resumed = generateRef5Session(
    { ...repromoted, nextFocus: "BP" },
    sessionInput("neg-again", at("2026-03-01T09:00:00.000Z", 80 * DAY)),
  );
  assert.equal(resumed.exercises.some((item) => item.stream === "OAP_NEG_LEFT"), true);
});

test("a plan starting at or above rung 4 has negatives from its first exposure (§5.2, §7.5.3)", () => {
  const state = createInitialRef5State(undefined, {
    left: { startRung: 4 },
    right: { startRung: 5 },
  });
  assert.equal(state.oap.left.negativesUnlocked, true);
  assert.equal(state.oap.right.negativesUnlocked, true);
  const snapshot = generateRef5Session(
    { ...state, nextFocus: "BP" },
    sessionInput("high-start", "2026-03-01T09:00:00.000Z"),
  );
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), [
    "SQ_H3",
    "BP_FOCUS",
    "OAP_LEFT",
    "OAP_RIGHT",
    "OAP_NEG_LEFT",
    "OAP_NEG_RIGHT",
    "OHP",
  ]);
  assert.equal(snapshot.totalWorkingSets, 11, "both arms share one negative pair set");

  // A plan starting at rung 3 has no negatives until it promotes.
  const lower = createInitialRef5State(undefined, {
    left: { startRung: 3 },
    right: { startRung: 3 },
  });
  assert.equal(lower.oap.left.negativesUnlocked, false);
  const lowerSnapshot = generateRef5Session(
    { ...lower, nextFocus: "BP" },
    sessionInput("low-start", "2026-03-01T09:00:00.000Z"),
  );
  assert.equal(lowerSnapshot.exercises.some((item) => item.oap?.kind === "NEGATIVE"), false);
});

test("negative results are recorded but never move the ladder (§7.5.3)", () => {
  let state = createInitialRef5State(undefined, {
    left: { startRung: 4 },
    right: { startRung: 4 },
  });
  // Two consecutive negative FAILs would be an immediate decrease for a lift;
  // for the skill slot they are inert.
  for (let index = 0; index < 2; index += 1) {
    state = runOapSession(state, index, {
      OAP_LEFT: "HOLD",
      OAP_RIGHT: "HOLD",
      OAP_NEG_LEFT: "FAIL",
      OAP_NEG_RIGHT: "FAIL",
    }).state;
  }
  assert.equal(state.oap.left.rung, 4, "negatives do not demote");
  assert.equal(state.oap.left.failStreak, 0);
  assert.equal(state.progressionChanges.some((change) => change.kind === "OAP_DEMOTE"), false);

  // Nor do negative PASSes promote.
  for (let index = 0; index < 3; index += 1) {
    state = runOapSession(state, 10 + index, {
      OAP_LEFT: "HOLD",
      OAP_RIGHT: "HOLD",
      OAP_NEG_LEFT: "PASS",
      OAP_NEG_RIGHT: "PASS",
    }).state;
  }
  assert.equal(state.oap.left.rung, 4);
  assert.equal(state.progressionChanges.some((change) => change.kind === "OAP_PROMOTE"), false);
});

test("meeting the promotion condition on rung 6 achieves OAP and switches to maintenance (§7.5.4)", () => {
  let state = createInitialRef5State(undefined, {
    left: { startRung: 6 },
    right: { startRung: 6 },
  });
  const rungSix = generateRef5Session(
    { ...state, nextFocus: "BP" },
    sessionInput("rung-six", "2026-03-01T09:00:00.000Z"),
  );
  assert.equal(rungSix.exercises.find((item) => item.stream === "OAP_LEFT")?.oap?.rung, 6);
  assert.equal(
    rungSix.exercises.some((item) => item.oap?.kind === "FREE"),
    false,
    "rung 6 before achievement is still the 2x3 ladder, not the maintenance single",
  );

  state = repeatOapOutcome(state, 3, "PASS");
  assert.equal(state.oap.left.achieved, true);
  assert.equal(state.oap.left.rung, 6, "the rung stays at the top");
  const achieve = state.progressionChanges.find((change) => change.kind === "OAP_ACHIEVE");
  assert.deepEqual(
    { before: achieve?.beforeKg, after: achieve?.afterKg },
    { before: 6, after: 6 },
  );

  // Maintenance: assisted 2x3 on rung 5 plus a free single.
  const maintenance = generateRef5Session(
    { ...state, nextFocus: "BP" },
    sessionInput("maint", at("2026-03-01T09:00:00.000Z", 40 * DAY)),
  );
  // The squat prescription alternates independently; only the slot matters here.
  assert.deepEqual(maintenance.exercises.slice(1).map((item) => item.stream), [
    "BP_FOCUS",
    "OAP_LEFT",
    "OAP_RIGHT",
    "OAP_FREE_LEFT",
    "OAP_FREE_RIGHT",
    "OHP",
  ]);
  assert.equal(maintenance.exercises.find((item) => item.stream === "OAP_LEFT")?.oap?.rung, 5);
  const free = maintenance.exercises.find((item) => item.stream === "OAP_FREE_LEFT")!;
  assert.deepEqual(free.sets.map((set) => set.plannedReps), [1]);
  assert.equal(free.oap?.rung, 6);
  assert.equal(maintenance.totalWorkingSets, 11);

  // Further exposures neither promote nor demote an achieved arm.
  const afterAchievement = repeatOapOutcome(state, 2, "FAIL", 10);
  assert.equal(afterAchievement.oap.left.rung, 6);
  assert.equal(afterAchievement.oap.left.achieved, true);
  assert.equal(
    afterAchievement.progressionChanges.some((change) => change.kind === "OAP_DEMOTE"),
    false,
  );
});

test("the achieved free single is spaced by exactly 168 hours from the prior free START (§7.5.4)", () => {
  const base = "2026-03-01T09:00:00.000Z";
  let state = createInitialRef5State(undefined, {
    left: { startRung: 6 },
    right: { startRung: 6 },
  });
  state = repeatOapOutcome(state, 3, "PASS");

  const first = runOapSession(state, 10, {}, { startAt: at(base, 40 * DAY) });
  assert.equal(first.snapshot.exercises.some((item) => item.oap?.kind === "FREE"), true);
  assert.equal(
    first.state.oap.left.lastFreeExposureAt,
    at(base, 40 * DAY),
    "the interval clock starts at START, like hard density (§8.1)",
  );

  const oneMsEarly = generateRef5Session(
    { ...first.state, nextFocus: "BP" },
    sessionInput("early", at(base, 40 * DAY + 168 * HOUR - 1)),
  );
  assert.equal(
    oneMsEarly.exercises.some((item) => item.oap?.kind === "FREE"),
    false,
    "1 ms short of 168 h prescribes no free single",
  );

  const exactly168h = generateRef5Session(
    { ...first.state, nextFocus: "BP" },
    sessionInput("exact", at(base, 40 * DAY + 168 * HOUR)),
  );
  assert.equal(
    exactly168h.exercises.some((item) => item.oap?.kind === "FREE"),
    true,
    "exactly 168 h is allowed, matching the §9 boundary convention",
  );
});

test("OAP results stay out of PULL judgment, streams, forced micro and every kg standard (§7.5.4)", () => {
  const before = createInitialRef5State();
  const after = repeatOapOutcome(before, 4, "FAIL");

  // BP is the one standard that legitimately moves here: its own four focus
  // exposures all passed and closed a window. Everything the skill slot could
  // conceivably have touched is unchanged.
  assert.equal(after.directStandardsKg.pullFocusTotalKg, before.directStandardsKg.pullFocusTotalKg);
  assert.equal(after.directStandardsKg.sqH3Kg, before.directStandardsKg.sqH3Kg);
  assert.equal(after.directStandardsKg.deadliftKg, before.directStandardsKg.deadliftKg);
  assert.equal(after.directStandardsKg.ohpKg, before.directStandardsKg.ohpKg);
  const bpIncrease = after.progressionChanges.find(
    (change) => change.lift === "BP" && change.kind === "INCREASE",
  );
  assert.deepEqual(
    bpIncrease?.causeEventIds.map((id) => id.split(":")[0]),
    ["window"],
    "the BP increase came from its own judgment window, not from the skill slot",
  );
  // The three PULL streams are exactly the ones the slot displaced, and none of
  // them recorded anything. More generally, no stream at all points at an OAP
  // exposure event.
  for (const stream of ["PULL_FOCUS", "PULL_VOLUME_NORMAL", "PULL_VOLUME_MICRO"] as const) {
    assert.deepEqual(after.failStreams[stream], before.failStreams[stream], stream);
  }
  for (const [stream, streamState] of Object.entries(after.failStreams)) {
    assert.equal(
      REF5_OAP_KEYS.some((key) => streamState.lastEventId?.endsWith(`:${key}`)),
      false,
      `${stream} must not hold an OAP exposure event`,
    );
  }
  assert.deepEqual(after.mainWindows.PULL.exposures, []);
  assert.deepEqual(after.mainWindows.PULL.volumeFailEventIds, [], "OAP never vetoes a window");
  assert.deepEqual(after.forcedMicro.failEvents, [], "an OAP FAIL is not a primary fail event");
  assert.equal(after.forcedMicro.pending, null);
  assert.deepEqual(after.stagnation.PULL, before.stagnation.PULL);
  assert.deepEqual(after.stagnation.SQ, before.stagnation.SQ);
  assert.equal(
    after.completedSessions.every((session) => session.outcomes.OAP_LEFT === "FAIL"),
    true,
  );
  assert.equal(
    after.progressionChanges.every((change) => change.lift !== "PULL" || change.kind === "PULL_RELOCK"),
    true,
    "no PULL standard change came out of the skill slot",
  );
});

test("the PULL focus window's volume veto now takes only the micro stream (§13.2)", () => {
  // A micro PULL volume FAIL still vetoes; nothing in a normal BP-focus session
  // can add a PULL volume failure any more.
  const micro = runSession(
    createInitialRef5State(),
    sessionInput("micro-veto", "2026-03-01T09:00:00.000Z", { manualMicro: true }),
    { PULL_VOLUME_MICRO: "FAIL" },
  );
  assert.equal(micro.state.mainWindows.PULL.volumeFailEventIds.length, 1);

  const oap = runOapSession(createInitialRef5State(), 0, { OAP_LEFT: "FAIL", OAP_RIGHT: "FAIL" }).state;
  assert.equal(oap.mainWindows.PULL.volumeFailEventIds.length, 0);
});

test("a reverted BP-focus session restores the v1.3 PULL volume slot and preserves the ladder (§7.6)", () => {
  const state = repeatOapOutcome(createInitialRef5State(), 2, "PASS");
  const beforeOap = structuredClone(state.oap);
  assert.equal(state.oap.left.passStreak, 2);

  const reverted = runOapSession(state, 5, { PULL_VOLUME_NORMAL: "FAIL" }, { oapSlotReverted: true });
  assert.deepEqual(reverted.snapshot.exercises.map((item) => item.stream), [
    "SQ_H3",
    "BP_FOCUS",
    "PULL_VOLUME_NORMAL",
    "OHP",
  ]);
  assert.equal(reverted.snapshot.totalWorkingSets, 10);
  assert.deepEqual(
    reverted.snapshot.exercises.find((item) => item.stream === "PULL_VOLUME_NORMAL")?.sets.map((set) => set.plannedReps),
    [6, 6],
    "the reverted slot is the v1.3 two-set prescription",
  );
  assert.equal(reverted.snapshot.decision.oap?.reverted, true);

  // The ladder is untouched — a reverted session produces no OAP exposure.
  assert.deepEqual(reverted.state.oap, beforeOap, "the ladder survives the revert (§7.5.5)");
  // ...and the restored stream behaves exactly as it did in v1.3.
  assert.equal(reverted.state.failStreams.PULL_VOLUME_NORMAL.consecutiveFails, 1);
  assert.equal(reverted.state.mainWindows.PULL.volumeFailEventIds.length, 1);

  // The ladder continues from where it was on the next non-reverted session.
  const resumed = runOapSession(reverted.state, 6, { OAP_LEFT: "PASS", OAP_RIGHT: "PASS" }).state;
  assert.equal(resumed.oap.left.rung, 3, "the third PASS still promoted");
});

test("the revert input is ignored outside a normal BP-focus session (§7.6)", () => {
  const state = createInitialRef5State();
  const pullFocus = generateRef5Session(
    state,
    sessionInput("revert-pull", "2026-03-01T09:00:00.000Z", { oapSlotReverted: true }),
  );
  assert.deepEqual(pullFocus.exercises.map((item) => item.stream), [
    "SQ_H3",
    "PULL_FOCUS",
    "BP_VOLUME_NORMAL",
    "DL",
  ]);
  assert.equal(pullFocus.decision.oap, null);

  const micro = generateRef5Session(
    { ...state, nextFocus: "BP" },
    sessionInput("revert-micro", "2026-03-02T09:00:00.000Z", {
      manualMicro: true,
      oapSlotReverted: true,
    }),
  );
  assert.deepEqual(micro.exercises.map((item) => item.stream), [
    "SQ_V_MICRO",
    "BP_VOLUME_MICRO",
    "PULL_VOLUME_MICRO",
  ]);
  assert.equal(micro.decision.oap, null);
});

test("start config 3 validates the per-arm OAP rungs and defaults both to 2 (§5.2)", () => {
  const starts = { ...REF5_INITIAL_DIRECT_STANDARDS_KG };
  const omitted = validateRef5StartConfig(starts);
  assert.equal(omitted.ok, true);
  if (omitted.ok) {
    assert.equal(omitted.value.initializationVersion, 3);
    assert.deepEqual(omitted.value.oap, {
      left: { startRung: 2 },
      right: { startRung: 2 },
    });
  }

  const custom = validateRef5StartConfig(starts, { left: { startRung: 1 }, right: { startRung: 6 } });
  assert.equal(custom.ok, true);
  if (custom.ok) {
    assert.deepEqual(custom.value.oap, { left: { startRung: 1 }, right: { startRung: 6 } });
  }

  for (const bad of [0, 7, 2.5, "2", null]) {
    const result = validateRef5StartConfig(starts, { left: { startRung: bad }, right: { startRung: 2 } });
    assert.equal(result.ok, false, `startRung ${String(bad)} must be refused`);
    if (!result.ok) {
      assert.ok(result.errors.some((error) => error.includes("oap.left.startRung must be an integer from 1 to 6")));
    }
  }

  // The §19.6 carry-forward puts PULL at 87.5 kg; it is an ordinary grid value.
  const carried = validateRef5StartConfig({ ...starts, pullFocusTotalKg: 87.5 });
  assert.equal(carried.ok, true);

  // Plan params carry the rungs through to the runtime state.
  const fromParams = readRef5PlanStartConfig({
    ref5: { startingValuesKg: starts, oap: { left: { startRung: 3 }, right: { startRung: 4 } } },
  });
  assert.deepEqual(fromParams.oap, { left: { startRung: 3 }, right: { startRung: 4 } });
  const seeded = createInitialRef5State(fromParams.startingValuesKg, fromParams.oap);
  assert.equal(seeded.oap.left.rung, 3);
  assert.equal(seeded.oap.right.rung, 4);
});

test("§14 lists eleven active streams; PULL_VOLUME_NORMAL survives only for the revert", () => {
  assert.equal(REF5_ACTIVE_STREAMS.length, 11);
  assert.equal(REF5_ACTIVE_STREAMS.includes("PULL_VOLUME_NORMAL"), false);
  assert.equal(REF5_STREAMS.length, 12, "the runtime still carries the reverted-only slot");
  assert.equal(REF5_STREAMS.includes(REF5_REVERTED_ONLY_STREAM), true);
  assert.deepEqual(
    REF5_ACTIVE_STREAMS,
    REF5_STREAMS.filter((stream) => stream !== REF5_REVERTED_ONLY_STREAM),
  );
  // OAP keys are prescriptions, not streams: nothing may treat them as one.
  for (const key of REF5_OAP_KEYS) {
    assert.equal((REF5_STREAMS as readonly string[]).includes(key), false);
    assert.equal((REF5_PRESCRIPTION_KEYS as readonly string[]).includes(key), true);
  }
  assert.equal(REF5_PRESCRIPTION_KEYS.length, REF5_STREAMS.length + REF5_OAP_KEYS.length);
});

test("replay is deterministic across OAP promotion and a reverted session (§17.4, §7.6)", () => {
  const base = "2026-11-01T09:00:00.000Z";
  const first = rawPassEvent("a", "raw-a", base, "FIRST");
  const second = rawPassEvent("b", "raw-b", at(base, 4 * DAY), "SECOND");
  const third = rawPassEvent("c", "raw-c", at(base, 8 * DAY), "FIRST");
  const fourth = rawPassEvent("d", "raw-d", at(base, 12 * DAY), "SECOND", 0, {
    oapSlotReverted: true,
  });

  const forward = replayRef5RawLogs([first, second, third, fourth]);
  const shuffled = replayRef5RawLogs([fourth, second, first, third]);
  assert.deepEqual(shuffled.state, forward.state);
  assert.equal(forward.state.completedSessions.length, 4);
  // One OAP exposure happened (session b); the reverted session d produced none.
  assert.equal(forward.state.oap.left.passStreak, 1);
  assert.equal(forward.state.oap.left.rung, 2);
  assert.equal(forward.state.failStreams.PULL_VOLUME_NORMAL.lastComparableOutcome, "PASS");

  const again = replayRef5RawLogs([first, second, third, fourth]);
  assert.deepEqual(again.state, forward.state, "the same input always yields the same state");
});
