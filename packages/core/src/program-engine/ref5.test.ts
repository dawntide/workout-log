import assert from "node:assert/strict";
import test from "node:test";
import {
  REF5_INITIAL_CONTROL_REFS_KG,
  REF5_INITIAL_DERIVED_STANDARDS_KG,
  REF5_INITIAL_DIRECT_STANDARDS_KG,
  REF5_PROTOCOL_VERSION,
  REF5_RUNTIME_SCHEMA_VERSION,
  REF5_SNAPSHOT_SCHEMA_VERSION,
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
  overrides: Partial<Record<Ref5Stream, Ref5Outcome | Ref5OutcomeInput>> = {},
): Partial<Record<Ref5Stream, Ref5OutcomeInput>> {
  const result: Partial<Record<Ref5Stream, Ref5OutcomeInput>> = {};
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
  overrides: Partial<Record<Ref5Stream, Ref5Outcome | Ref5OutcomeInput>> = {},
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

test("v1.2 constants, direct-derived formulas, refs, caps and 2.5 kg rounding are canonical", () => {
  assert.equal(REF5_PROTOCOL_VERSION, "1.2");
  assert.equal(REF5_RUNTIME_SCHEMA_VERSION, 2);
  assert.equal(REF5_SNAPSHOT_SCHEMA_VERSION, 2);
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

test("first normal session is PULL focus + H3 with nine working sets and lossless PULL metadata", () => {
  const state = createInitialRef5State();
  const snapshot = generateRef5Session(state, sessionInput("1", "2026-01-01T09:00:00.000Z"));
  assert.equal(snapshot.decision.sessionType, "NORMAL");
  assert.equal(snapshot.decision.focus, "PULL");
  assert.equal(snapshot.decision.squatPrescription, "H3");
  assert.equal(snapshot.totalWorkingSets, 9);
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), ["SQ_H3", "PULL_FOCUS", "BP_VOLUME", "DL"]);
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
    assert.equal(serialized.includes(removed), false, `${removed} must not be written by v1.2`);
  }
});

test("normal BP focus always includes PULL volume and has nine working sets", () => {
  const state = createInitialRef5State();
  state.nextFocus = "BP";
  const snapshot = generateRef5Session(
    state,
    sessionInput("bp-nine", "2026-01-02T09:00:00.000Z"),
  );
  assert.equal(snapshot.totalWorkingSets, 9);
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), [
    "SQ_H3",
    "BP_FOCUS",
    "PULL_VOLUME",
    "OHP",
  ]);
  assert.deepEqual(snapshot.exercises.find((item) => item.stream === "PULL_VOLUME")?.sets.map((set) => set.plannedReps), [6]);
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
  assert.equal(exact.totalWorkingSets, 9);
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

test("v1.2 snapshot decoder rejects protocol-less, v1.1, and retired inputs", () => {
  const active = generateRef5Session(
    createInitialRef5State(),
    sessionInput("decode", "2026-04-03T09:00:00.000Z"),
  );
  for (const candidate of [
    { ...active, protocolVersion: undefined },
    { ...active, protocolVersion: "1.1", schemaVersion: 1 },
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
  assert.deepEqual(snapshot.exercises.map((item) => item.stream), ["SQ_V_MICRO", "BP_VOLUME", "PULL_VOLUME"]);
});

test("closing unperformed prescriptions INVALID does not enter windows or fail streams", () => {
  const result = runSession(
    createInitialRef5State(),
    sessionInput("all-invalid", "2026-06-20T09:00:00.000Z"),
    { SQ_H3: "INVALID", PULL_FOCUS: "INVALID", BP_VOLUME: "INVALID", DL: "INVALID" },
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
): Ref5RawLogEvent {
  const streamReps: Record<Ref5Stream, number[]> = kind === "FIRST"
    ? {
        SQ_H3: [3, 3, 3],
        PULL_FOCUS: [3, 3, 3],
        BP_VOLUME: [5],
        DL: [4, 4],
        SQ_H2: [], SQ_V_NORMAL: [], SQ_V_MICRO: [], BP_FOCUS: [], PULL_VOLUME: [], OHP: [],
      }
    : {
        SQ_H2: [2, 2, 2],
        BP_FOCUS: [3, 3, 3],
        PULL_VOLUME: [6],
        OHP: [6, 6],
        SQ_H3: [], SQ_V_NORMAL: [], SQ_V_MICRO: [], BP_VOLUME: [], PULL_FOCUS: [], DL: [],
      };
  const streams = kind === "FIRST"
    ? (["SQ_H3", "PULL_FOCUS", "BP_VOLUME", "DL"] as const)
    : (["SQ_H2", "BP_FOCUS", "PULL_VOLUME", "OHP"] as const);
  const outcomes: Partial<Record<Ref5Stream, Ref5OutcomeInput>> = {};
  for (const stream of streams) {
    outcomes[stream] = {
      endReason: "NORMAL",
      sets: streamReps[stream].map((plannedReps) => ({ plannedReps, effectiveReps: plannedReps })),
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
