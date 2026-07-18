/**
 * REF5 Adaptive Strength v1.2
 *
 * Framework/DB-independent domain model.  Direct kilogram standards are the
 * canonical state; control REFs, derived prescriptions and display loads are
 * always recomputed from those standards.  No Asymptote/TM/cycle semantics are
 * shared with this module.
 */

export const REF5_PROTOCOL_VERSION = "1.2" as const;
export const REF5_LEGACY_PROTOCOL_VERSION = "1.1" as const;
export const REF5_RUNTIME_SCHEMA_VERSION = 2 as const;
export const REF5_LEGACY_RUNTIME_SCHEMA_VERSION = 1 as const;
export const REF5_SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const REF5_PROGRAM_VERSION = 2 as const;
export const REF5_START_CONFIG_VERSION = 1 as const;
export const REF5_LEGACY_ENGINE_VERSION = 511 as const;

export type Ref5ProtocolVersion = typeof REF5_PROTOCOL_VERSION;

export const REF5_IDENTIFIERS = Object.freeze({
  displayName: "REF5 Adaptive Strength",
  baseTemplateName: "REF5 Adaptive Strength (Base)",
  slug: "ref5-adaptive-strength",
  kind: "ref5",
  family: "ref5",
  protocolVersion: REF5_PROTOCOL_VERSION,
});

export type Ref5Lift = "SQ" | "BP" | "PULL" | "DL" | "OHP";
export type Ref5MainLift = "SQ" | "BP" | "PULL";
export type Ref5AuxiliaryLift = "DL" | "OHP";
export type Ref5Focus = "PULL" | "BP";
export type Ref5SessionType = "NORMAL" | "MICRO";
export type Ref5SquatPrescription = "H3" | "H2" | "V";
export type Ref5Outcome = "PASS" | "HOLD" | "FAIL" | "INVALID";
export type Ref5ComparableOutcome = Exclude<Ref5Outcome, "INVALID">;
export type Ref5EndReason =
  | "NORMAL"
  | "CLEAR_SLOWDOWN"
  | "FORCE_OR_TECHNIQUE"
  | "SAFETY"
  | "EXTERNAL";

export const REF5_END_REASONS: readonly Ref5EndReason[] = Object.freeze([
  "NORMAL",
  "CLEAR_SLOWDOWN",
  "FORCE_OR_TECHNIQUE",
  "SAFETY",
  "EXTERNAL",
]);

export type Ref5Stream =
  | "SQ_H3"
  | "SQ_H2"
  | "SQ_V_NORMAL"
  | "SQ_V_MICRO"
  | "BP_FOCUS"
  | "BP_VOLUME"
  | "PULL_FOCUS"
  | "PULL_VOLUME"
  | "DL"
  | "OHP";

export const REF5_STREAMS: readonly Ref5Stream[] = Object.freeze([
  "SQ_H3",
  "SQ_H2",
  "SQ_V_NORMAL",
  "SQ_V_MICRO",
  "BP_FOCUS",
  "BP_VOLUME",
  "PULL_FOCUS",
  "PULL_VOLUME",
  "DL",
  "OHP",
]);

export interface Ref5DirectStandardsKg {
  sqH3Kg: number;
  bpFocusKg: number;
  pullFocusTotalKg: number;
  deadliftKg: number;
  ohpKg: number;
}

export interface Ref5DerivedStandardsKg {
  sqH2Kg: number;
  sqVolumeKg: number;
  bpVolumeKg: number;
  pullVolumeTargetTotalKg: number;
}

export interface Ref5ControlRefsKg {
  sqKg: number;
  bpKg: number;
  pullTotalKg: number;
  deadliftKg: number;
  ohpKg: number;
}

export interface Ref5AuxiliaryCapsKg {
  deadliftMaxKg: number;
  ohpMaxKg: number;
  deadliftControlRefMaxKg: number;
  ohpControlRefMaxKg: number;
}

export interface Ref5StartConfig {
  initializationVersion: typeof REF5_START_CONFIG_VERSION;
  schemaVersion: typeof REF5_RUNTIME_SCHEMA_VERSION;
  protocolVersion: typeof REF5_PROTOCOL_VERSION;
  startingValuesKg: Ref5DirectStandardsKg;
  controlRefsKg: Ref5ControlRefsKg;
}

export const REF5_START_LOAD_MIN_KG = 2.5;
export const REF5_START_LOAD_MAX_KG = 500;

export type Ref5StartConfigValidationResult =
  | { ok: true; value: Ref5StartConfig }
  | { ok: false; errors: string[] };

export const REF5_INITIAL_DIRECT_STANDARDS_KG: Readonly<Ref5DirectStandardsKg> = Object.freeze({
  sqH3Kg: 82.5,
  bpFocusKg: 82.5,
  pullFocusTotalKg: 87.5,
  deadliftKg: 72.5,
  ohpKg: 32.5,
});

export const REF5_INITIAL_DERIVED_STANDARDS_KG: Readonly<Ref5DerivedStandardsKg> = Object.freeze({
  sqH2Kg: 87.5,
  sqVolumeKg: 72.5,
  bpVolumeKg: 70,
  pullVolumeTargetTotalKg: 75,
});

export const REF5_INITIAL_CONTROL_REFS_KG: Readonly<Ref5ControlRefsKg> = Object.freeze({
  sqKg: 104,
  bpKg: 101,
  pullTotalKg: 108,
  deadliftKg: 100,
  ohpKg: 50,
});

const REF5_MAIN_LIFTS: readonly Ref5MainLift[] = ["SQ", "BP", "PULL"];
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

function cleanKg(value: number): number {
  const cleaned = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

/** Mathematical floor to a 2.5 kg grid. No implicit zero floor is applied. */
export function floorRef5To2p5(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return cleanKg(Math.floor(value / 2.5) * 2.5);
}

/** Nearest 2.5 kg; an exact midpoint is rounded upward. */
export function nearestRef5To2p5(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return cleanKg(Math.floor(value / 2.5 + 0.5) * 2.5);
}

// Friendly aliases matching the protocol wording.
export const floor2p5 = floorRef5To2p5;
export const nearest2p5 = nearestRef5To2p5;

export function deriveRef5Standards(direct: Ref5DirectStandardsKg): Ref5DerivedStandardsKg {
  return {
    sqH2Kg: cleanKg(direct.sqH3Kg + 5),
    sqVolumeKg: floorRef5To2p5((direct.sqH3Kg * 72.5) / 82.5),
    bpVolumeKg: floorRef5To2p5((direct.bpFocusKg * 70) / 82.5),
    pullVolumeTargetTotalKg: floorRef5To2p5((direct.pullFocusTotalKg * 75) / 87.5),
  };
}

export function deriveRef5ControlRefs(direct: Ref5DirectStandardsKg): Ref5ControlRefsKg {
  return {
    sqKg: cleanKg((104 * direct.sqH3Kg) / 82.5),
    bpKg: cleanKg((101 * direct.bpFocusKg) / 82.5),
    pullTotalKg: cleanKg((108 * direct.pullFocusTotalKg) / 87.5),
    deadliftKg: cleanKg((100 * direct.deadliftKg) / 72.5),
    ohpKg: cleanKg((50 * direct.ohpKg) / 32.5),
  };
}

export function deriveRef5AuxiliaryCaps(direct: Ref5DirectStandardsKg): Ref5AuxiliaryCapsKg {
  const refs = deriveRef5ControlRefs(direct);
  return {
    deadliftMaxKg: floorRef5To2p5((refs.sqKg * 72.5) / 100),
    ohpMaxKg: floorRef5To2p5(((refs.bpKg * 0.5) * 32.5) / 50),
    deadliftControlRefMaxKg: refs.sqKg,
    ohpControlRefMaxKg: cleanKg(refs.bpKg * 0.5),
  };
}

const REF5_DIRECT_STANDARD_KEYS = [
  "sqH3Kg",
  "bpFocusKg",
  "pullFocusTotalKg",
  "deadliftKg",
  "ohpKg",
] as const satisfies readonly (keyof Ref5DirectStandardsKg)[];

function ref5Record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Validates plan-creation loads. Runtime progression still owns later changes. */
export function validateRef5StartConfig(value: unknown): Ref5StartConfigValidationResult {
  const source = ref5Record(value);
  const errors: string[] = [];
  const startingValuesKg = {} as Ref5DirectStandardsKg;

  if (Object.keys(source).length === 0) {
    return { ok: false, errors: ["REF5 startingValuesKg must be an object"] };
  }

  for (const key of REF5_DIRECT_STANDARD_KEYS) {
    const raw = source[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      errors.push(`${key} must be a finite number`);
      continue;
    }
    if (raw < REF5_START_LOAD_MIN_KG || raw > REF5_START_LOAD_MAX_KG) {
      errors.push(
        `${key} must be between ${REF5_START_LOAD_MIN_KG} and ${REF5_START_LOAD_MAX_KG} kg`,
      );
    }
    if (Math.abs(raw - nearestRef5To2p5(raw)) > 1e-9) {
      errors.push(`${key} must use the 2.5 kg grid`);
    }
    startingValuesKg[key] = cleanKg(raw);
  }

  if (errors.length === 0) {
    const caps = deriveRef5AuxiliaryCaps(startingValuesKg);
    if (startingValuesKg.deadliftKg > caps.deadliftMaxKg + 1e-9) {
      errors.push(`deadliftKg exceeds the ${caps.deadliftMaxKg} kg REF5 auxiliary cap`);
    }
    if (startingValuesKg.ohpKg > caps.ohpMaxKg + 1e-9) {
      errors.push(`ohpKg exceeds the ${caps.ohpMaxKg} kg REF5 auxiliary cap`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      initializationVersion: REF5_START_CONFIG_VERSION,
      schemaVersion: REF5_RUNTIME_SCHEMA_VERSION,
      protocolVersion: REF5_PROTOCOL_VERSION,
      startingValuesKg,
      controlRefsKg: deriveRef5ControlRefs(startingValuesKg),
    },
  };
}

export function normalizeRef5StartConfig(value: unknown): Ref5StartConfig {
  const result = validateRef5StartConfig(value);
  if (!result.ok) throw new Ref5ValidationError(result.errors);
  return result.value;
}

export function readRef5PlanStartConfig(planParams: unknown): Ref5StartConfig {
  const params = ref5Record(planParams);
  const nested = ref5Record(params.ref5);
  return normalizeRef5StartConfig(nested.startingValuesKg);
}

export function ref5AuxiliaryCandidateIsWithinCap(
  lift: Ref5AuxiliaryLift,
  candidateKg: number,
  direct: Ref5DirectStandardsKg,
): boolean {
  const candidateRefs = deriveRef5ControlRefs({
    ...direct,
    ...(lift === "DL" ? { deadliftKg: candidateKg } : { ohpKg: candidateKg }),
  });
  const mainRefs = deriveRef5ControlRefs(direct);
  return lift === "DL"
    ? candidateRefs.deadliftKg <= mainRefs.sqKg + 1e-9
    : candidateRefs.ohpKg <= mainRefs.bpKg * 0.5 + 1e-9;
}

/** Lowers a candidate in 2.5 kg steps until the REF inequality is satisfied. */
export function constrainRef5AuxiliaryCandidate(
  lift: Ref5AuxiliaryLift,
  candidateKg: number,
  direct: Ref5DirectStandardsKg,
): number {
  let constrained = cleanKg(candidateKg);
  let guard = 0;
  while (!ref5AuxiliaryCandidateIsWithinCap(lift, constrained, direct)) {
    constrained = cleanKg(constrained - 2.5);
    guard += 1;
    if (guard > 10_000) throw new Error(`Unable to constrain REF5 ${lift} candidate`);
  }
  return constrained;
}

export interface Ref5OutcomeSetInput {
  plannedReps: number;
  effectiveReps: number;
}

export interface Ref5OutcomeInput {
  sets: readonly Ref5OutcomeSetInput[];
  endReason: Ref5EndReason;
}

export interface Ref5OutcomeRecord {
  outcome: Ref5Outcome;
  endReason: Ref5EndReason;
  plannedReps: number[];
  effectiveReps: number[];
  deficits: number[];
  totalDeficit: number;
}

export type Ref5OutcomeValidationResult =
  | { ok: true; value: Ref5OutcomeRecord }
  | { ok: false; errors: string[] };

export class Ref5ValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "Ref5ValidationError";
    this.errors = errors;
  }
}

export class Ref5StaleVersionError extends Ref5ValidationError {
  readonly expectedProtocolVersion = REF5_PROTOCOL_VERSION;

  constructor(received: unknown) {
    super([
      `stale REF5 protocol version ${String(received ?? "missing")}; expected ${REF5_PROTOCOL_VERSION}`,
    ]);
    this.name = "Ref5StaleVersionError";
  }
}

export function validateAndClassifyRef5Outcome(input: Ref5OutcomeInput): Ref5OutcomeValidationResult {
  const errors: string[] = [];
  if (!REF5_END_REASONS.includes(input.endReason)) errors.push("endReason is not a REF5 termination reason");
  if (!Array.isArray(input.sets)) errors.push("sets must be an array");
  const sets = Array.isArray(input.sets) ? input.sets : [];
  if (sets.length === 0 && input.endReason !== "SAFETY" && input.endReason !== "EXTERNAL") {
    errors.push("a comparable prescription must contain at least one planned set");
  }

  const plannedReps: number[] = [];
  const effectiveReps: number[] = [];
  const deficits: number[] = [];
  for (let index = 0; index < sets.length; index += 1) {
    const set = sets[index]!;
    if (!Number.isInteger(set.plannedReps) || set.plannedReps < 0) {
      errors.push(`sets[${index}].plannedReps must be a non-negative integer`);
    }
    if (!Number.isInteger(set.effectiveReps) || set.effectiveReps < 0) {
      errors.push(`sets[${index}].effectiveReps must be a non-negative integer`);
    }
    if (
      Number.isInteger(set.plannedReps) &&
      Number.isInteger(set.effectiveReps) &&
      set.effectiveReps > set.plannedReps
    ) {
      errors.push(`sets[${index}].effectiveReps cannot exceed plannedReps`);
    }
    plannedReps.push(set.plannedReps);
    effectiveReps.push(set.effectiveReps);
    deficits.push(Math.max(0, set.plannedReps - set.effectiveReps));
  }

  const totalDeficit = deficits.reduce((sum, deficit) => sum + deficit, 0);
  if (input.endReason === "NORMAL" && totalDeficit > 0) {
    errors.push("NORMAL is inconsistent with missing repetitions");
  }
  if (input.endReason === "FORCE_OR_TECHNIQUE" && totalDeficit === 0) {
    errors.push("FORCE_OR_TECHNIQUE requires at least one missing repetition");
  }
  if (errors.length > 0) return { ok: false, errors };

  let outcome: Ref5Outcome;
  if (input.endReason === "SAFETY" || input.endReason === "EXTERNAL") outcome = "INVALID";
  else if (totalDeficit === 0 && input.endReason === "NORMAL") outcome = "PASS";
  else if (totalDeficit === 1) outcome = "HOLD";
  else if (totalDeficit === 0 && input.endReason === "CLEAR_SLOWDOWN") outcome = "HOLD";
  else outcome = "FAIL";

  return {
    ok: true,
    value: { outcome, endReason: input.endReason, plannedReps, effectiveReps, deficits, totalDeficit },
  };
}

export function classifyRef5Outcome(input: Ref5OutcomeInput): Ref5OutcomeRecord {
  const result = validateAndClassifyRef5Outcome(input);
  if (!result.ok) throw new Ref5ValidationError(result.errors);
  return result.value;
}

export interface Ref5WindowExposure {
  eventId: string;
  sessionId: string;
  stream: Ref5Stream;
  outcome: Ref5ComparableOutcome;
}

export interface Ref5MainWindowState {
  exposures: Ref5WindowExposure[];
  volumeFailEventIds: string[];
  completedWindowCount: number;
  lastWindowResult: "INCREASE" | "MAINTAIN" | null;
}

export interface Ref5AuxiliaryWindowState {
  exposures: Ref5WindowExposure[];
  completedWindowCount: number;
  lastWindowResult: "INCREASE" | "MAINTAIN" | null;
}

export interface Ref5FailStreamState {
  consecutiveFails: number;
  lastComparableOutcome: Ref5ComparableOutcome | null;
  lastEventId: string | null;
}

export type Ref5StagnationPhase = "BASELINE" | "PENDING_MICRO" | "REASSESSMENT";

export interface Ref5StagnationDecreaseHistory {
  basisKg: number;
  count: number;
  eventIds: string[];
}

export interface Ref5StagnationState {
  phase: Ref5StagnationPhase;
  consecutiveMaintainWindows: 0 | 1;
  basisKg: number;
  pendingEventId: string | null;
  decreaseHistory: Ref5StagnationDecreaseHistory[];
  structureReview: boolean;
}

export interface Ref5ForcedFailEvent {
  eventId: string;
  completionEventId: string;
  sessionId: string;
  lift: Ref5MainLift;
  stream: Ref5Stream;
  status: "UNCLAIMED" | "CLAIMED" | "EXPIRED";
}

export interface Ref5ForcedMicroToken {
  eventId: string;
  sourceFailEventIds: string[];
  createdByCompletionEventId: string;
}

export interface Ref5PullLockState {
  windowId: string;
  focusTargetTotalKg: number;
  volumeTargetTotalKg: number;
  focusAddedKg: number;
  volumeAddedKg: number;
}

export interface Ref5StartedSessionSummary {
  sessionId: string;
  snapshotId: string;
  startEventId: string;
  actualStartAt: string;
  calendarDate: string;
  timeZone: string;
  sessionType: Ref5SessionType;
  squatPrescription: Ref5SquatPrescription;
  hardStarted: boolean;
}

export interface Ref5CompletedSessionSummary {
  sessionId: string;
  snapshotId: string;
  completionEventId: string;
  actualStartAt: string;
  completedAt: string;
  outcomes: Partial<Record<Ref5Stream, Ref5Outcome>>;
  primaryFailEventIds: string[];
}

export interface Ref5ProgressionChange {
  eventId: string;
  lift: Ref5Lift;
  kind:
    | "INCREASE"
    | "MAINTAIN"
    | "IMMEDIATE_DECREASE"
    | "STAGNATION_DECREASE"
    | "AUXILIARY_CAP_DECREASE"
    | "PULL_RELOCK";
  beforeKg: number;
  afterKg: number;
  causeEventIds: string[];
}

export interface Ref5RuntimeState {
  schemaVersion: typeof REF5_RUNTIME_SCHEMA_VERSION;
  protocolVersion: typeof REF5_PROTOCOL_VERSION;
  revision: number;
  directStandardsKg: Ref5DirectStandardsKg;
  nextFocus: Ref5Focus;
  nextSquatHard: Exclude<Ref5SquatPrescription, "V">;
  startedSessions: Ref5StartedSessionSummary[];
  completedSessions: Ref5CompletedSessionSummary[];
  hardStartTimes: Array<{ sessionId: string; startEventId: string; actualStartAt: string }>;
  mainWindows: Record<Ref5MainLift, Ref5MainWindowState>;
  auxiliaryWindows: Record<Ref5AuxiliaryLift, Ref5AuxiliaryWindowState>;
  failStreams: Record<Ref5Stream, Ref5FailStreamState>;
  stagnation: Record<Ref5MainLift, Ref5StagnationState>;
  forcedMicro: {
    failEvents: Ref5ForcedFailEvent[];
    pending: Ref5ForcedMicroToken | null;
    consumedTokenIds: string[];
  };
  pull: {
    windowSequence: number;
    lock: Ref5PullLockState | null;
  };
  appliedStartEventIds: string[];
  appliedCompletionEventIds: string[];
  appliedRawLogIds: string[];
  progressionChanges: Ref5ProgressionChange[];
}

function emptyFailStreams(): Record<Ref5Stream, Ref5FailStreamState> {
  return Object.fromEntries(
    REF5_STREAMS.map((stream) => [
      stream,
      { consecutiveFails: 0, lastComparableOutcome: null, lastEventId: null },
    ]),
  ) as Record<Ref5Stream, Ref5FailStreamState>;
}

function emptyMainWindow(): Ref5MainWindowState {
  return { exposures: [], volumeFailEventIds: [], completedWindowCount: 0, lastWindowResult: null };
}

function emptyAuxWindow(): Ref5AuxiliaryWindowState {
  return { exposures: [], completedWindowCount: 0, lastWindowResult: null };
}

function initialStagnation(basisKg: number): Ref5StagnationState {
  return {
    phase: "BASELINE",
    consecutiveMaintainWindows: 0,
    basisKg,
    pendingEventId: null,
    decreaseHistory: [],
    structureReview: false,
  };
}

export function createInitialRef5State(
  standards: Ref5DirectStandardsKg = { ...REF5_INITIAL_DIRECT_STANDARDS_KG },
): Ref5RuntimeState {
  const directStandardsKg = { ...standards };
  return {
    schemaVersion: REF5_RUNTIME_SCHEMA_VERSION,
    protocolVersion: REF5_PROTOCOL_VERSION,
    revision: 0,
    directStandardsKg,
    nextFocus: "PULL",
    nextSquatHard: "H3",
    startedSessions: [],
    completedSessions: [],
    hardStartTimes: [],
    mainWindows: { SQ: emptyMainWindow(), BP: emptyMainWindow(), PULL: emptyMainWindow() },
    auxiliaryWindows: { DL: emptyAuxWindow(), OHP: emptyAuxWindow() },
    failStreams: emptyFailStreams(),
    stagnation: {
      SQ: initialStagnation(directStandardsKg.sqH3Kg),
      BP: initialStagnation(directStandardsKg.bpFocusKg),
      PULL: initialStagnation(directStandardsKg.pullFocusTotalKg),
    },
    forcedMicro: { failEvents: [], pending: null, consumedTokenIds: [] },
    pull: { windowSequence: 0, lock: null },
    appliedStartEventIds: [],
    appliedCompletionEventIds: [],
    appliedRawLogIds: [],
    progressionChanges: [],
  };
}

const REF5_V12_REMOVED_STATE_KEYS = new Set([
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
]);

function cloneState(state: Ref5RuntimeState): Ref5RuntimeState {
  return JSON.parse(JSON.stringify(state)) as Ref5RuntimeState;
}

function timestampMs(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Ref5ValidationError([`${label} must be an ISO timestamp`]);
  return parsed;
}

export function ref5CalendarDate(actualStartAt: string, timeZone: string): string {
  const date = new Date(timestampMs(actualStartAt, "actualStartAt"));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch {
    throw new Ref5ValidationError([`invalid IANA timeZone: ${timeZone}`]);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Ref5ValidationError([`could not derive date in ${timeZone}`]);
  return `${year}-${month}-${day}`;
}

export function subtractRef5CalendarDays(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Ref5ValidationError([`invalid calendar date: ${dateKey}`]);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export type Ref5MicroReason =
  | "MANUAL"
  | "CONSECUTIVE_PROGRAM_DAYS"
  | "NORMAL_SESSION_DENSITY"
  | "FORCED_PRIMARY_FAILS"
  | "STAGNATION_SQ"
  | "STAGNATION_BP"
  | "STAGNATION_PULL";

export interface Ref5SessionInput {
  sessionId: string;
  snapshotId: string;
  actualStartAt: string;
  timeZone: string;
  todayBodyweightKg: number;
  recent7DayMeasurementCount: number;
  recent7DayAverageKg: number | null;
  manualMicro: boolean;
}

export interface Ref5SessionDecision {
  sessionType: Ref5SessionType;
  microReasons: Ref5MicroReason[];
  focus: Ref5Focus;
  squatPrescription: Ref5SquatPrescription;
  hard: {
    allowed: boolean;
    lastStartAt: string | null;
    startsIn168Hours: number;
  };
}

export interface Ref5PullPrescriptionMetadata {
  targetTotalKg: number;
  todayBodyweightKg: number;
  recent7DayMeasurementCount: number;
  recent7DayAverageKg: number | null;
  calculationBodyweightKg: number;
  lockWindowId: string;
  lockedAddedKg: number;
  actualTotalKg: number;
}

export interface Ref5PullSessionContext {
  todayBodyweightKg: number;
  recent7DayMeasurementCount: number;
  recent7DayAverageKg: number | null;
  calculationBodyweightKg: number;
  lockWindowId: string;
  lockWasProposed: boolean;
  focus: Ref5PullPrescriptionMetadata;
  volume: Ref5PullPrescriptionMetadata;
}

export interface Ref5PrescriptionSet {
  setNumber: number;
  plannedReps: number;
  /** PULL: added weight; all other lifts: bar/load weight. */
  externalLoadKg: number;
  /** PULL: bodyweight + added weight; all other lifts: same as externalLoadKg. */
  totalLoadKg: number;
}

export type Ref5ExerciseRole = "SQUAT" | "FOCUS" | "VOLUME" | "AUXILIARY";

export interface Ref5ExercisePrescription {
  prescriptionId: string;
  lift: Ref5Lift;
  exerciseName: string;
  role: Ref5ExerciseRole;
  stream: Ref5Stream;
  sets: Ref5PrescriptionSet[];
  /** Canonical direct/derived progression target, total-weight based for PULL. */
  progressionTargetKg: number;
  pull?: Ref5PullPrescriptionMetadata;
}

export interface Ref5SessionSnapshot {
  schemaVersion: typeof REF5_SNAPSHOT_SCHEMA_VERSION;
  protocolVersion: typeof REF5_PROTOCOL_VERSION;
  snapshotId: string;
  sessionId: string;
  runtimeRevision: number;
  actualStartAt: string;
  timeZone: string;
  calendarDate: string;
  startInput: Ref5SessionInput;
  decision: Ref5SessionDecision;
  directStandardsKg: Ref5DirectStandardsKg;
  derivedStandardsKg: Ref5DerivedStandardsKg;
  controlRefsKg: Ref5ControlRefsKg;
  auxiliaryCapsKg: Ref5AuxiliaryCapsKg;
  pullContext: Ref5PullSessionContext;
  exercises: Ref5ExercisePrescription[];
  totalWorkingSets: number;
}

export type Ref5DecodedSessionSnapshot = Ref5SessionSnapshot;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function containsRef5V12RemovedField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRef5V12RemovedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      REF5_V12_REMOVED_STATE_KEYS.has(key) ||
      (key === "role" && child === "CLIMBING_FOCUS_INVALID") ||
      containsRef5V12RemovedField(child),
  );
}

/** Strict v1.2 decoder. Historical v1.1 data was absent at the production cutover. */
export function decodeRef5SessionSnapshot(value: unknown): Ref5SessionSnapshot {
  const candidate = recordValue(value);
  const protocolVersion = String(candidate.protocolVersion ?? "").trim();
  if (protocolVersion !== REF5_PROTOCOL_VERSION) {
    throw new Ref5StaleVersionError(protocolVersion || null);
  }
  if (
    !String(candidate.snapshotId ?? "").trim() ||
    !String(candidate.sessionId ?? "").trim() ||
    !Array.isArray(candidate.exercises)
  ) {
    throw new Ref5ValidationError(["invalid REF5 domain snapshot shape"]);
  }
  if (Number(candidate.schemaVersion) !== REF5_SNAPSHOT_SCHEMA_VERSION) {
    throw new Ref5ValidationError(["unsupported REF5 v1.2 snapshot schema"]);
  }
  if (containsRef5V12RemovedField(candidate)) {
    throw new Ref5StaleVersionError(REF5_LEGACY_PROTOCOL_VERSION);
  }
  return candidate as unknown as Ref5SessionSnapshot;
}

export function decideRef5SessionType(
  state: Ref5RuntimeState,
  input: Pick<Ref5SessionInput, "actualStartAt" | "timeZone" | "manualMicro">,
): { sessionType: Ref5SessionType; microReasons: Ref5MicroReason[]; calendarDate: string } {
  const calendarDate = ref5CalendarDate(input.actualStartAt, input.timeZone);
  const reasons: Ref5MicroReason[] = [];
  if (input.manualMicro) reasons.push("MANUAL");

  const performedDates = new Set(state.startedSessions.map((session) => session.calendarDate));
  if (
    performedDates.has(subtractRef5CalendarDays(calendarDate, 1)) &&
    performedDates.has(subtractRef5CalendarDays(calendarDate, 2))
  ) {
    reasons.push("CONSECUTIVE_PROGRAM_DAYS");
  }

  const previousSixDates = new Set(
    Array.from({ length: 6 }, (_, index) => subtractRef5CalendarDays(calendarDate, index + 1)),
  );
  const previousSixNormalCount = state.startedSessions.filter(
    (session) => session.sessionType === "NORMAL" && previousSixDates.has(session.calendarDate),
  ).length;
  if (previousSixNormalCount >= 3) reasons.push("NORMAL_SESSION_DENSITY");
  if (state.forcedMicro.pending) reasons.push("FORCED_PRIMARY_FAILS");
  for (const lift of REF5_MAIN_LIFTS) {
    if (state.stagnation[lift].phase === "PENDING_MICRO") reasons.push(`STAGNATION_${lift}`);
  }

  return { sessionType: reasons.length > 0 ? "MICRO" : "NORMAL", microReasons: reasons, calendarDate };
}

export function selectRef5SquatPrescription(
  state: Ref5RuntimeState,
  actualStartAt: string,
  sessionType: Ref5SessionType,
): Pick<Ref5SessionDecision, "squatPrescription" | "hard"> {
  const now = timestampMs(actualStartAt, "actualStartAt");
  const prior = state.hardStartTimes
    // A distinct already-started session may have the exact same timestamp.
    // It is prior canonical state and must fail the 48-hour test even though
    // the mathematical 168-hour lookback retains its open upper endpoint.
    .filter((entry) => timestampMs(entry.actualStartAt, "hardStart.actualStartAt") <= now)
    .sort((a, b) => timestampMs(a.actualStartAt, "a") - timestampMs(b.actualStartAt, "b"));
  const last = prior.at(-1) ?? null;
  const elapsedAllowed = last === null || now - timestampMs(last.actualStartAt, "lastHardStart") >= 48 * HOUR_MS;
  const startsIn168Hours = prior.filter((entry) => {
    const hardAt = timestampMs(entry.actualStartAt, "hardStart.actualStartAt");
    return hardAt > now - 168 * HOUR_MS && hardAt < now;
  }).length;
  const hardAllowed = sessionType === "NORMAL" && elapsedAllowed && startsIn168Hours < 2;
  return {
    squatPrescription: hardAllowed ? state.nextSquatHard : "V",
    hard: { allowed: hardAllowed, lastStartAt: last?.actualStartAt ?? null, startsIn168Hours },
  };
}

function validateSessionInput(input: Ref5SessionInput): void {
  const errors: string[] = [];
  if (!input.sessionId.trim()) errors.push("sessionId is required");
  if (!input.snapshotId.trim()) errors.push("snapshotId is required");
  timestampMs(input.actualStartAt, "actualStartAt");
  if (!Number.isFinite(input.todayBodyweightKg) || input.todayBodyweightKg <= 0) {
    errors.push("todayBodyweightKg must be positive");
  }
  if (!Number.isInteger(input.recent7DayMeasurementCount) || input.recent7DayMeasurementCount < 0) {
    errors.push("recent7DayMeasurementCount must be a non-negative integer");
  }
  if (
    input.recent7DayMeasurementCount >= 3 &&
    (!Number.isFinite(input.recent7DayAverageKg) || (input.recent7DayAverageKg ?? 0) <= 0)
  ) {
    errors.push("recent7DayAverageKg is required when at least three measurements are available");
  }
  if (errors.length > 0) throw new Ref5ValidationError(errors);
  // Also validates the IANA zone, including DST-aware zones.
  ref5CalendarDate(input.actualStartAt, input.timeZone);
}

function pullMetadata(
  targetTotalKg: number,
  addedKg: number,
  input: Ref5SessionInput,
  calculationBodyweightKg: number,
  lockWindowId: string,
): Ref5PullPrescriptionMetadata {
  return {
    targetTotalKg,
    todayBodyweightKg: input.todayBodyweightKg,
    recent7DayMeasurementCount: input.recent7DayMeasurementCount,
    recent7DayAverageKg: input.recent7DayAverageKg,
    calculationBodyweightKg,
    lockWindowId,
    lockedAddedKg: addedKg,
    actualTotalKg: cleanKg(input.todayBodyweightKg + addedKg),
  };
}

function derivePullSessionContext(
  state: Ref5RuntimeState,
  input: Ref5SessionInput,
  derived: Ref5DerivedStandardsKg,
): Ref5PullSessionContext {
  const calculationBodyweightKg =
    input.recent7DayMeasurementCount >= 3
      ? (input.recent7DayAverageKg as number)
      : input.todayBodyweightKg;
  const existing = state.pull.lock;
  const existingMatchesTargets =
    existing?.focusTargetTotalKg === state.directStandardsKg.pullFocusTotalKg &&
    existing.volumeTargetTotalKg === derived.pullVolumeTargetTotalKg;
  const windowId = existingMatchesTargets ? existing.windowId : `pull-window-${state.pull.windowSequence + 1}`;
  const focusAddedKg = existingMatchesTargets
    ? existing.focusAddedKg
    : nearestRef5To2p5(Math.max(0, state.directStandardsKg.pullFocusTotalKg - calculationBodyweightKg));
  const volumeAddedKg = existingMatchesTargets
    ? existing.volumeAddedKg
    : nearestRef5To2p5(Math.max(0, derived.pullVolumeTargetTotalKg - calculationBodyweightKg));
  return {
    todayBodyweightKg: input.todayBodyweightKg,
    recent7DayMeasurementCount: input.recent7DayMeasurementCount,
    recent7DayAverageKg: input.recent7DayAverageKg,
    calculationBodyweightKg,
    lockWindowId: windowId,
    lockWasProposed: !existingMatchesTargets,
    focus: pullMetadata(
      state.directStandardsKg.pullFocusTotalKg,
      focusAddedKg,
      input,
      calculationBodyweightKg,
      windowId,
    ),
    volume: pullMetadata(
      derived.pullVolumeTargetTotalKg,
      volumeAddedKg,
      input,
      calculationBodyweightKg,
      windowId,
    ),
  };
}

function prescriptionSets(
  count: number,
  reps: number,
  externalLoadKg: number,
  totalLoadKg = externalLoadKg,
): Ref5PrescriptionSet[] {
  return Array.from({ length: count }, (_, index) => ({
    setNumber: index + 1,
    plannedReps: reps,
    externalLoadKg,
    totalLoadKg,
  }));
}

function exercise(input: {
  snapshotId: string;
  lift: Ref5Lift;
  exerciseName: string;
  role: Ref5ExerciseRole;
  stream: Ref5Stream;
  sets: Ref5PrescriptionSet[];
  progressionTargetKg: number;
  pull?: Ref5PullPrescriptionMetadata;
}): Ref5ExercisePrescription {
  return {
    prescriptionId: `${input.snapshotId}:${input.stream}`,
    lift: input.lift,
    exerciseName: input.exerciseName,
    role: input.role,
    stream: input.stream,
    sets: input.sets,
    progressionTargetKg: input.progressionTargetKg,
    ...(input.pull ? { pull: input.pull } : {}),
  };
}

function squatExercise(
  snapshotId: string,
  prescription: Ref5SquatPrescription,
  sessionType: Ref5SessionType,
  direct: Ref5DirectStandardsKg,
  derived: Ref5DerivedStandardsKg,
): Ref5ExercisePrescription {
  if (prescription === "H3") {
    return exercise({
      snapshotId,
      lift: "SQ",
      exerciseName: "High-Bar Back Squat",
      role: "SQUAT",
      stream: "SQ_H3",
      sets: prescriptionSets(3, 3, direct.sqH3Kg),
      progressionTargetKg: direct.sqH3Kg,
    });
  }
  if (prescription === "H2") {
    return exercise({
      snapshotId,
      lift: "SQ",
      exerciseName: "High-Bar Back Squat",
      role: "SQUAT",
      stream: "SQ_H2",
      sets: prescriptionSets(3, 2, derived.sqH2Kg),
      progressionTargetKg: derived.sqH2Kg,
    });
  }
  return exercise({
    snapshotId,
    lift: "SQ",
    exerciseName: "High-Bar Back Squat",
    role: "SQUAT",
    stream: sessionType === "MICRO" ? "SQ_V_MICRO" : "SQ_V_NORMAL",
    sets: prescriptionSets(sessionType === "MICRO" ? 2 : 3, 5, derived.sqVolumeKg),
    progressionTargetKg: derived.sqVolumeKg,
  });
}

function bpFocusExercise(snapshotId: string, direct: Ref5DirectStandardsKg): Ref5ExercisePrescription {
  return exercise({
    snapshotId,
    lift: "BP",
    exerciseName: "Bench Press",
    role: "FOCUS",
    stream: "BP_FOCUS",
    sets: prescriptionSets(3, 3, direct.bpFocusKg),
    progressionTargetKg: direct.bpFocusKg,
  });
}

function bpVolumeExercise(snapshotId: string, derived: Ref5DerivedStandardsKg): Ref5ExercisePrescription {
  return exercise({
    snapshotId,
    lift: "BP",
    exerciseName: "Bench Press",
    role: "VOLUME",
    stream: "BP_VOLUME",
    sets: prescriptionSets(1, 5, derived.bpVolumeKg),
    progressionTargetKg: derived.bpVolumeKg,
  });
}

function pullExercise(
  snapshotId: string,
  role: "FOCUS" | "VOLUME",
  pull: Ref5PullPrescriptionMetadata,
): Ref5ExercisePrescription {
  const focus = role === "FOCUS";
  return exercise({
    snapshotId,
    lift: "PULL",
    exerciseName: "Weighted Pull-Up",
    role,
    stream: focus ? "PULL_FOCUS" : "PULL_VOLUME",
    sets: prescriptionSets(focus ? 3 : 1, focus ? 3 : 6, pull.lockedAddedKg, pull.actualTotalKg),
    progressionTargetKg: pull.targetTotalKg,
    pull,
  });
}

function auxiliaryExercise(
  snapshotId: string,
  lift: Ref5AuxiliaryLift,
  direct: Ref5DirectStandardsKg,
): Ref5ExercisePrescription {
  const isDeadlift = lift === "DL";
  const weight = isDeadlift ? direct.deadliftKg : direct.ohpKg;
  return exercise({
    snapshotId,
    lift,
    exerciseName: isDeadlift ? "Deadlift" : "Overhead Press",
    role: "AUXILIARY",
    stream: lift,
    sets: prescriptionSets(2, isDeadlift ? 4 : 6, weight),
    progressionTargetKg: weight,
  });
}

export function generateRef5Session(state: Ref5RuntimeState, input: Ref5SessionInput): Ref5SessionSnapshot {
  validateSessionInput(input);
  if (state.protocolVersion !== REF5_PROTOCOL_VERSION) {
    throw new Ref5StaleVersionError(state.protocolVersion);
  }
  if (state.schemaVersion !== REF5_RUNTIME_SCHEMA_VERSION) {
    throw new Ref5ValidationError(["unsupported REF5 v1.2 runtime schema"]);
  }
  if (state.startedSessions.some((session) => session.sessionId === input.sessionId)) {
    throw new Ref5ValidationError([`session ${input.sessionId} has already started`]);
  }

  const typeDecision = decideRef5SessionType(state, input);
  const squatDecision = selectRef5SquatPrescription(state, input.actualStartAt, typeDecision.sessionType);
  const direct = { ...state.directStandardsKg };
  const derived = deriveRef5Standards(direct);
  const pullContext = derivePullSessionContext(state, input, derived);
  const decision: Ref5SessionDecision = {
    sessionType: typeDecision.sessionType,
    microReasons: typeDecision.microReasons,
    focus: state.nextFocus,
    squatPrescription: squatDecision.squatPrescription,
    hard: squatDecision.hard,
  };

  const exercises: Ref5ExercisePrescription[] = [
    squatExercise(input.snapshotId, decision.squatPrescription, decision.sessionType, direct, derived),
  ];
  if (decision.sessionType === "MICRO") {
    exercises.push(bpVolumeExercise(input.snapshotId, derived));
    exercises.push(pullExercise(input.snapshotId, "VOLUME", pullContext.volume));
  } else if (decision.focus === "PULL") {
    exercises.push(pullExercise(input.snapshotId, "FOCUS", pullContext.focus));
    exercises.push(bpVolumeExercise(input.snapshotId, derived));
    exercises.push(auxiliaryExercise(input.snapshotId, "DL", direct));
  } else {
    exercises.push(bpFocusExercise(input.snapshotId, direct));
    exercises.push(pullExercise(input.snapshotId, "VOLUME", pullContext.volume));
    exercises.push(auxiliaryExercise(input.snapshotId, "OHP", direct));
  }

  return {
    schemaVersion: REF5_SNAPSHOT_SCHEMA_VERSION,
    protocolVersion: REF5_PROTOCOL_VERSION,
    snapshotId: input.snapshotId,
    sessionId: input.sessionId,
    runtimeRevision: state.revision,
    actualStartAt: input.actualStartAt,
    timeZone: input.timeZone,
    calendarDate: typeDecision.calendarDate,
    startInput: { ...input },
    decision,
    directStandardsKg: direct,
    derivedStandardsKg: derived,
    controlRefsKg: deriveRef5ControlRefs(direct),
    auxiliaryCapsKg: deriveRef5AuxiliaryCaps(direct),
    pullContext,
    exercises,
    totalWorkingSets: exercises.reduce((sum, item) => sum + item.sets.length, 0),
  };
}

export const previewRef5Session = generateRef5Session;

export interface Ref5FirstSquatStartResult {
  nextState: Ref5RuntimeState;
  applied: boolean;
  startEventId: string;
  consumedForcedMicroTokenId: string | null;
  consumedStagnationLifts: Ref5MainLift[];
  pullLockCommitted: boolean;
}

export function applyRef5FirstSquatStart(
  state: Ref5RuntimeState,
  snapshot: Ref5DecodedSessionSnapshot,
  startEventId: string,
  options: { historicalReplay?: boolean } = {},
): Ref5FirstSquatStartResult {
  if (!startEventId.trim()) throw new Ref5ValidationError(["startEventId is required"]);
  const alreadyStarted = state.startedSessions.find((session) => session.sessionId === snapshot.sessionId);
  if (alreadyStarted) {
    if (alreadyStarted.snapshotId !== snapshot.snapshotId) {
      throw new Ref5ValidationError([`session ${snapshot.sessionId} was started from a different snapshot`]);
    }
    return {
      nextState: state,
      applied: false,
      startEventId: alreadyStarted.startEventId,
      consumedForcedMicroTokenId: null,
      consumedStagnationLifts: [],
      pullLockCommitted: false,
    };
  }
  if (state.appliedStartEventIds.includes(startEventId)) {
    throw new Ref5ValidationError([`start event ${startEventId} belongs to another session`]);
  }
  if (snapshot.runtimeRevision !== state.revision) {
    throw new Ref5ValidationError([
      `stale REF5 snapshot revision ${snapshot.runtimeRevision}; current revision is ${state.revision}`,
    ]);
  }
  const versionsMatch =
    snapshot.protocolVersion === REF5_PROTOCOL_VERSION &&
    snapshot.schemaVersion === REF5_SNAPSHOT_SCHEMA_VERSION &&
    state.protocolVersion === REF5_PROTOCOL_VERSION &&
    state.schemaVersion === REF5_RUNTIME_SCHEMA_VERSION;
  if (!versionsMatch) {
    throw new Ref5StaleVersionError(snapshot.protocolVersion);
  }

  const next = cloneState(state);
  let pullLockCommitted = false;
  if (!next.pull.lock) {
    const canonicalPull = options.historicalReplay
      ? derivePullSessionContext(
          next,
          snapshot.startInput,
          deriveRef5Standards(next.directStandardsKg),
        )
      : snapshot.pullContext;
    next.pull.lock = {
      windowId: canonicalPull.lockWindowId,
      focusTargetTotalKg: canonicalPull.focus.targetTotalKg,
      volumeTargetTotalKg: canonicalPull.volume.targetTotalKg,
      focusAddedKg: canonicalPull.focus.lockedAddedKg,
      volumeAddedKg: canonicalPull.volume.lockedAddedKg,
    };
    next.pull.windowSequence += 1;
    pullLockCommitted = true;
  } else if (
    !options.historicalReplay &&
    next.pull.lock.windowId !== snapshot.pullContext.lockWindowId
  ) {
    throw new Ref5ValidationError(["started snapshot PULL lock conflicts with current runtime state"]);
  }

  const hardStarted =
    snapshot.decision.sessionType === "NORMAL" &&
    (snapshot.decision.squatPrescription === "H3" || snapshot.decision.squatPrescription === "H2");
  next.startedSessions.push({
    sessionId: snapshot.sessionId,
    snapshotId: snapshot.snapshotId,
    startEventId,
    actualStartAt: snapshot.actualStartAt,
    calendarDate: snapshot.calendarDate,
    timeZone: snapshot.timeZone,
    sessionType: snapshot.decision.sessionType,
    squatPrescription: snapshot.decision.squatPrescription,
    hardStarted,
  });
  if (hardStarted) {
    next.hardStartTimes.push({ sessionId: snapshot.sessionId, startEventId, actualStartAt: snapshot.actualStartAt });
  }

  const consumedForcedMicroTokenId = next.forcedMicro.pending?.eventId ?? null;
  if (next.forcedMicro.pending) {
    next.forcedMicro.consumedTokenIds.push(next.forcedMicro.pending.eventId);
    next.forcedMicro.pending = null;
  }
  const consumedStagnationLifts: Ref5MainLift[] = [];
  for (const lift of REF5_MAIN_LIFTS) {
    const stagnation = next.stagnation[lift];
    if (stagnation.phase === "PENDING_MICRO") {
      stagnation.phase = "REASSESSMENT";
      stagnation.pendingEventId = null;
      stagnation.consecutiveMaintainWindows = 0;
      consumedStagnationLifts.push(lift);
    }
  }

  next.appliedStartEventIds.push(startEventId);
  next.revision += 1;
  return {
    nextState: next,
    applied: true,
    startEventId,
    consumedForcedMicroTokenId,
    consumedStagnationLifts,
    pullLockCommitted,
  };
}

export interface Ref5SessionCompletionInput {
  completionEventId: string;
  rawLogId?: string;
  completedAt: string;
  outcomes: Partial<Record<Ref5Stream, Ref5OutcomeInput | Ref5OutcomeRecord>>;
  /**
   * Canonical full-history rebuilds retain the load/stream snapshot that was
   * actually started, even when an edited earlier log changes the reconstructed
   * direct standards. Live saves must leave this false so stale/conflicting
   * started snapshots are rejected.
   */
  historicalReplay?: boolean;
}

export interface Ref5CompletionResult {
  nextState: Ref5RuntimeState;
  applied: boolean;
  outcomes: Partial<Record<Ref5Stream, Ref5OutcomeRecord>>;
  changes: Ref5ProgressionChange[];
}

function isOutcomeRecord(value: Ref5OutcomeInput | Ref5OutcomeRecord): value is Ref5OutcomeRecord {
  return "outcome" in value;
}

function inputFromRecord(record: Ref5OutcomeRecord): Ref5OutcomeInput {
  return {
    endReason: record.endReason,
    sets: record.plannedReps.map((plannedReps, index) => ({
      plannedReps,
      effectiveReps: record.effectiveReps[index] ?? -1,
    })),
  };
}

function normalizeCompletionOutcomes(
  snapshot: Ref5DecodedSessionSnapshot,
  input: Ref5SessionCompletionInput,
): Partial<Record<Ref5Stream, Ref5OutcomeRecord>> {
  const errors: string[] = [];
  const normalized: Partial<Record<Ref5Stream, Ref5OutcomeRecord>> = {};
  const expectedStreams = new Set(snapshot.exercises.map((item) => item.stream));

  for (const item of snapshot.exercises) {
    const supplied = input.outcomes[item.stream];
    if (!supplied) {
      errors.push(`missing outcome for ${item.stream}`);
      continue;
    }
    const raw = isOutcomeRecord(supplied) ? inputFromRecord(supplied) : supplied;
    if (
      isOutcomeRecord(supplied) &&
      (supplied.plannedReps.length !== supplied.effectiveReps.length ||
        supplied.plannedReps.length !== supplied.deficits.length)
    ) {
      errors.push(`${item.stream} outcome record arrays must have identical lengths`);
      continue;
    }
    if (raw.sets.length !== item.sets.length) {
      errors.push(`${item.stream} set count does not match its frozen prescription`);
      continue;
    }
    raw.sets.forEach((set, index) => {
      if (set.plannedReps !== item.sets[index]?.plannedReps) {
        errors.push(`${item.stream} set ${index + 1} planned reps do not match its frozen prescription`);
      }
    });
    const classified = validateAndClassifyRef5Outcome(raw);
    if (!classified.ok) {
      errors.push(...classified.errors.map((error) => `${item.stream}: ${error}`));
      continue;
    }
    if (isOutcomeRecord(supplied) && supplied.outcome !== classified.value.outcome) {
      errors.push(`${item.stream} supplied outcome contradicts its raw repetitions/reason`);
      continue;
    }
    if (
      isOutcomeRecord(supplied) &&
      (supplied.totalDeficit !== classified.value.totalDeficit ||
        supplied.deficits.some((deficit, index) => deficit !== classified.value.deficits[index]))
    ) {
      errors.push(`${item.stream} supplied deficit metadata contradicts its raw repetitions`);
      continue;
    }
    normalized[item.stream] = classified.value;
  }

  for (const stream of REF5_STREAMS) {
    if (input.outcomes[stream] && !expectedStreams.has(stream)) {
      errors.push(`outcome supplied for non-prescribed stream ${stream}`);
    }
  }
  if (errors.length > 0) throw new Ref5ValidationError(errors);
  return normalized;
}

function streamLift(stream: Ref5Stream): Ref5Lift {
  if (stream.startsWith("SQ_")) return "SQ";
  if (stream.startsWith("BP_")) return "BP";
  if (stream.startsWith("PULL_")) return "PULL";
  return stream as Ref5AuxiliaryLift;
}

function directBasisForLift(direct: Ref5DirectStandardsKg, lift: Ref5MainLift): number {
  if (lift === "SQ") return direct.sqH3Kg;
  if (lift === "BP") return direct.bpFocusKg;
  return direct.pullFocusTotalKg;
}

function setDirectBasisForLift(
  direct: Ref5DirectStandardsKg,
  lift: Ref5MainLift,
  value: number,
): void {
  if (lift === "SQ") direct.sqH3Kg = value;
  else if (lift === "BP") direct.bpFocusKg = value;
  else direct.pullFocusTotalKg = value;
}

function sameDirectStandards(a: Ref5DirectStandardsKg, b: Ref5DirectStandardsKg): boolean {
  return (
    a.sqH3Kg === b.sqH3Kg &&
    a.bpFocusKg === b.bpFocusKg &&
    a.pullFocusTotalKg === b.pullFocusTotalKg &&
    a.deadliftKg === b.deadliftKg &&
    a.ohpKg === b.ohpKg
  );
}

function resetFailStream(state: Ref5RuntimeState, stream: Ref5Stream): void {
  state.failStreams[stream] = { consecutiveFails: 0, lastComparableOutcome: null, lastEventId: null };
}

function resetMainLiftAfterDirectChange(
  state: Ref5RuntimeState,
  lift: Ref5MainLift,
  newBasisKg: number,
): void {
  state.mainWindows[lift].exposures = [];
  state.mainWindows[lift].volumeFailEventIds = [];
  const streams =
    lift === "SQ"
      ? (["SQ_H3", "SQ_H2", "SQ_V_NORMAL", "SQ_V_MICRO"] as const)
      : lift === "BP"
        ? (["BP_FOCUS", "BP_VOLUME"] as const)
        : (["PULL_FOCUS", "PULL_VOLUME"] as const);
  for (const stream of streams) resetFailStream(state, stream);
  const previous = state.stagnation[lift];
  state.stagnation[lift] = {
    phase: "BASELINE",
    consecutiveMaintainWindows: 0,
    basisKg: newBasisKg,
    pendingEventId: null,
    decreaseHistory: previous.decreaseHistory,
    structureReview: previous.structureReview,
  };
}

function resetAuxiliaryAfterWeightChange(state: Ref5RuntimeState, lift: Ref5AuxiliaryLift): void {
  state.auxiliaryWindows[lift].exposures = [];
  resetFailStream(state, lift);
}

function compareCompletionSummaries(a: Ref5CompletedSessionSummary, b: Ref5CompletedSessionSummary): number {
  const byTime = timestampMs(a.actualStartAt, "completed.actualStartAt") - timestampMs(b.actualStartAt, "completed.actualStartAt");
  if (byTime !== 0) return byTime;
  return a.sessionId.localeCompare(b.sessionId) || a.completionEventId.localeCompare(b.completionEventId);
}

function updateForcedMicroQueue(state: Ref5RuntimeState, completionEventId: string): void {
  if (state.forcedMicro.pending) return;
  const recent = [...state.completedSessions].sort(compareCompletionSummaries).slice(-2);
  const recentSessionIds = new Set(recent.map((session) => session.sessionId));
  for (const event of state.forcedMicro.failEvents) {
    if (event.status === "UNCLAIMED" && !recentSessionIds.has(event.sessionId)) event.status = "EXPIRED";
  }
  const candidates = state.forcedMicro.failEvents.filter(
    (event) => event.status === "UNCLAIMED" && recentSessionIds.has(event.sessionId),
  );
  if (new Set(candidates.map((event) => event.lift)).size < 2) return;
  const sourceFailEventIds = candidates.map((event) => event.eventId).sort();
  for (const event of candidates) event.status = "CLAIMED";
  state.forcedMicro.pending = {
    eventId: `forced-micro:${sourceFailEventIds.join("+")}`,
    sourceFailEventIds,
    createdByCompletionEventId: completionEventId,
  };
}

function appendProgressionChange(
  state: Ref5RuntimeState,
  changes: Ref5ProgressionChange[],
  change: Ref5ProgressionChange,
): void {
  state.progressionChanges.push(change);
  changes.push(change);
}

function recordStagnationDecrease(
  stagnation: Ref5StagnationState,
  basisKg: number,
  eventId: string,
): void {
  let history = stagnation.decreaseHistory.find((entry) => entry.basisKg === basisKg);
  if (!history) {
    history = { basisKg, count: 0, eventIds: [] };
    stagnation.decreaseHistory.push(history);
  }
  history.count += 1;
  history.eventIds.push(eventId);
  if (history.count >= 2) stagnation.structureReview = true;
}

function advanceMaintainedStagnation(
  stagnation: Ref5StagnationState,
  lift: Ref5MainLift,
  completionEventId: string,
): void {
  if (stagnation.phase !== "BASELINE") return;
  if (stagnation.consecutiveMaintainWindows === 0) {
    stagnation.consecutiveMaintainWindows = 1;
    return;
  }
  stagnation.phase = "PENDING_MICRO";
  stagnation.consecutiveMaintainWindows = 1;
  stagnation.pendingEventId = `stagnation-micro:${lift}:${cleanKg(stagnation.basisKg)}:${completionEventId}`;
}

function ref5OutcomeEventId(completionEventId: string, stream: Ref5Stream): string {
  return `${completionEventId}:${stream}`;
}

interface WindowDecision {
  lift: Ref5MainLift;
  result: "INCREASE" | "MAINTAIN";
  eventId: string;
}

function relockPull(
  state: Ref5RuntimeState,
  snapshot: Ref5DecodedSessionSnapshot,
  changes: Ref5ProgressionChange[],
  causeEventIds: string[],
  resetBothFailStreams: boolean,
): void {
  const before = state.pull.lock;
  const derived = deriveRef5Standards(state.directStandardsKg);
  const calculationBodyweightKg = snapshot.pullContext.calculationBodyweightKg;
  const focusAddedKg = nearestRef5To2p5(
    Math.max(0, state.directStandardsKg.pullFocusTotalKg - calculationBodyweightKg),
  );
  const volumeAddedKg = nearestRef5To2p5(
    Math.max(0, derived.pullVolumeTargetTotalKg - calculationBodyweightKg),
  );
  state.pull.windowSequence += 1;
  state.pull.lock = {
    windowId: `pull-window-${state.pull.windowSequence}`,
    focusTargetTotalKg: state.directStandardsKg.pullFocusTotalKg,
    volumeTargetTotalKg: derived.pullVolumeTargetTotalKg,
    focusAddedKg,
    volumeAddedKg,
  };
  if (resetBothFailStreams || before?.focusAddedKg !== focusAddedKg) resetFailStream(state, "PULL_FOCUS");
  if (resetBothFailStreams || before?.volumeAddedKg !== volumeAddedKg) resetFailStream(state, "PULL_VOLUME");
  const eventId = `pull-relock:${state.pull.lock.windowId}:${causeEventIds.join("+")}`;
  appendProgressionChange(state, changes, {
    eventId,
    lift: "PULL",
    kind: "PULL_RELOCK",
    beforeKg: before?.focusAddedKg ?? focusAddedKg,
    afterKg: focusAddedKg,
    causeEventIds,
  });
}

/**
 * Applies one closed session. The session must first have passed through
 * applyRef5FirstSquatStart; retries are exactly-once by completionEventId and
 * sessionId. The function never mutates its arguments.
 */
export function reduceRef5Completion(
  state: Ref5RuntimeState,
  snapshot: Ref5DecodedSessionSnapshot,
  input: Ref5SessionCompletionInput,
): Ref5CompletionResult {
  if (snapshot.protocolVersion !== state.protocolVersion) {
    throw new Ref5StaleVersionError(snapshot.protocolVersion);
  }
  if (!input.completionEventId.trim()) throw new Ref5ValidationError(["completionEventId is required"]);
  timestampMs(input.completedAt, "completedAt");
  if (timestampMs(input.completedAt, "completedAt") < timestampMs(snapshot.actualStartAt, "actualStartAt")) {
    throw new Ref5ValidationError(["completedAt cannot precede actualStartAt"]);
  }
  const existing = state.completedSessions.find((session) => session.sessionId === snapshot.sessionId);
  if (existing) {
    if (existing.snapshotId !== snapshot.snapshotId || existing.completionEventId !== input.completionEventId) {
      throw new Ref5ValidationError([`session ${snapshot.sessionId} was completed by a different event`]);
    }
    return { nextState: state, applied: false, outcomes: {}, changes: [] };
  }
  if (state.appliedCompletionEventIds.includes(input.completionEventId)) {
    throw new Ref5ValidationError([`completion event ${input.completionEventId} belongs to another session`]);
  }
  const started = state.startedSessions.find((session) => session.sessionId === snapshot.sessionId);
  if (!started || started.snapshotId !== snapshot.snapshotId) {
    throw new Ref5ValidationError(["REF5 completion requires the matching first-SQ-start event"]);
  }
  if (
    !input.historicalReplay &&
    !sameDirectStandards(snapshot.directStandardsKg, state.directStandardsKg)
  ) {
    throw new Ref5ValidationError(["started REF5 snapshot conflicts with canonical progression state; replay is required"]);
  }
  if (input.rawLogId && state.appliedRawLogIds.includes(input.rawLogId)) {
    throw new Ref5ValidationError([`raw log ${input.rawLogId} has already been applied by another event`]);
  }
  const latestCompleted = [...state.completedSessions].sort(compareCompletionSummaries).at(-1);
  if (
    latestCompleted &&
    compareCompletionSummaries(
      {
        sessionId: snapshot.sessionId,
        snapshotId: snapshot.snapshotId,
        completionEventId: input.completionEventId,
        actualStartAt: snapshot.actualStartAt,
        completedAt: input.completedAt,
        outcomes: {},
        primaryFailEventIds: [],
      },
      latestCompleted,
    ) < 0
  ) {
    throw new Ref5ValidationError(["backdated REF5 completion requires a full replay"]);
  }

  const outcomes = normalizeCompletionOutcomes(snapshot, input);
  const next = cloneState(state);
  const changes: Ref5ProgressionChange[] = [];
  const eventFor = (stream: Ref5Stream) => ref5OutcomeEventId(input.completionEventId, stream);

  // Queue and H3/H2 alternation are completion semantics. A hard INVALID stays
  // in density history (recorded at START) but does not alternate.
  if (snapshot.decision.sessionType === "NORMAL") {
    const focusStream: Ref5Stream = snapshot.decision.focus === "PULL" ? "PULL_FOCUS" : "BP_FOCUS";
    if (outcomes[focusStream]?.outcome !== "INVALID") {
      next.nextFocus = snapshot.decision.focus === "PULL" ? "BP" : "PULL";
    }
  }
  const squatStream = snapshot.exercises.find((item) => item.lift === "SQ")?.stream;
  if (
    (squatStream === "SQ_H3" || squatStream === "SQ_H2") &&
    outcomes[squatStream]?.outcome !== "INVALID"
  ) {
    next.nextSquatHard = squatStream === "SQ_H3" ? "H2" : "H3";
  }

  const immediateCauses: Partial<Record<Ref5Lift, string[]>> = {};
  for (const item of snapshot.exercises) {
    const record = outcomes[item.stream];
    if (!record || record.outcome === "INVALID") continue;
    const streamState = next.failStreams[item.stream];
    const eventId = eventFor(item.stream);
    if (record.outcome === "FAIL") {
      streamState.consecutiveFails += 1;
      if (streamState.consecutiveFails >= 2) {
        const lift = streamLift(item.stream);
        (immediateCauses[lift] ??= []).push(eventId);
      }
    } else {
      streamState.consecutiveFails = 0;
    }
    streamState.lastComparableOutcome = record.outcome;
    streamState.lastEventId = eventId;

    const exposure: Ref5WindowExposure = {
      eventId,
      sessionId: snapshot.sessionId,
      stream: item.stream,
      outcome: record.outcome,
    };
    if (item.stream === "SQ_V_NORMAL" || item.stream === "SQ_V_MICRO") {
      if (record.outcome === "FAIL") next.mainWindows.SQ.volumeFailEventIds.push(eventId);
    } else if (item.stream === "BP_VOLUME") {
      if (record.outcome === "FAIL") next.mainWindows.BP.volumeFailEventIds.push(eventId);
    } else if (item.stream === "PULL_VOLUME") {
      if (record.outcome === "FAIL") next.mainWindows.PULL.volumeFailEventIds.push(eventId);
    } else if (
      snapshot.decision.sessionType === "NORMAL" &&
      (item.stream === "SQ_H3" || item.stream === "SQ_H2")
    ) {
      next.mainWindows.SQ.exposures.push(exposure);
    } else if (snapshot.decision.sessionType === "NORMAL" && item.stream === "BP_FOCUS") {
      next.mainWindows.BP.exposures.push(exposure);
    } else if (
      snapshot.decision.sessionType === "NORMAL" &&
      item.stream === "PULL_FOCUS"
    ) {
      next.mainWindows.PULL.exposures.push(exposure);
    }
    if (snapshot.decision.sessionType === "NORMAL" && (item.stream === "DL" || item.stream === "OHP")) {
      next.auxiliaryWindows[item.stream].exposures.push(exposure);
    }
  }

  const windowDecisions: Partial<Record<Ref5MainLift, WindowDecision>> = {};
  const mainThreshold: Record<Ref5MainLift, number> = { SQ: 6, BP: 4, PULL: 4 };
  for (const lift of REF5_MAIN_LIFTS) {
    const window = next.mainWindows[lift];
    if (window.exposures.length < mainThreshold[lift]) continue;
    const failCount = window.exposures.filter((entry) => entry.outcome === "FAIL").length;
    const holdCount = window.exposures.filter((entry) => entry.outcome === "HOLD").length;
    const result =
      failCount === 0 && holdCount <= 1 && window.volumeFailEventIds.length === 0
        ? "INCREASE"
        : "MAINTAIN";
    window.completedWindowCount += 1;
    window.lastWindowResult = result;
    windowDecisions[lift] = { lift, result, eventId: `window:${lift}:${input.completionEventId}` };
    window.exposures = [];
    window.volumeFailEventIds = [];
  }

  const pullWindowCompleted = Boolean(windowDecisions.PULL);
  const mainChanged: Ref5MainLift[] = [];
  for (const lift of REF5_MAIN_LIFTS) {
    const beforeKg = directBasisForLift(next.directStandardsKg, lift);
    const immediate = immediateCauses[lift] ?? [];
    const window = windowDecisions[lift];
    const stagnationDecrease = window?.result === "MAINTAIN" && next.stagnation[lift].phase === "REASSESSMENT";
    let afterKg = beforeKg;
    if (immediate.length > 0 || stagnationDecrease) afterKg = cleanKg(beforeKg - 2.5);
    else if (window?.result === "INCREASE") afterKg = cleanKg(beforeKg + 2.5);

    if (stagnationDecrease && window) {
      recordStagnationDecrease(next.stagnation[lift], beforeKg, window.eventId);
    }
    if (afterKg !== beforeKg) {
      setDirectBasisForLift(next.directStandardsKg, lift, afterKg);
      mainChanged.push(lift);
      if (immediate.length > 0) {
        appendProgressionChange(next, changes, {
          eventId: `immediate-decrease:${lift}:${input.completionEventId}`,
          lift,
          kind: "IMMEDIATE_DECREASE",
          beforeKg,
          afterKg,
          causeEventIds: immediate,
        });
      }
      if (stagnationDecrease && window) {
        appendProgressionChange(next, changes, {
          eventId: `stagnation-decrease:${lift}:${input.completionEventId}`,
          lift,
          kind: "STAGNATION_DECREASE",
          beforeKg,
          afterKg,
          causeEventIds: [window.eventId],
        });
      }
      if (immediate.length === 0 && !stagnationDecrease && window?.result === "INCREASE") {
        appendProgressionChange(next, changes, {
          eventId: `increase:${lift}:${input.completionEventId}`,
          lift,
          kind: "INCREASE",
          beforeKg,
          afterKg,
          causeEventIds: [window.eventId],
        });
      }
      resetMainLiftAfterDirectChange(next, lift, afterKg);
    } else if (window?.result === "MAINTAIN") {
      advanceMaintainedStagnation(next.stagnation[lift], lift, input.completionEventId);
      appendProgressionChange(next, changes, {
        eventId: `maintain:${lift}:${input.completionEventId}`,
        lift,
        kind: "MAINTAIN",
        beforeKg,
        afterKg,
        causeEventIds: [window.eventId],
      });
    }
  }

  // Auxiliary own candidates are evaluated only after all new main REFs/caps
  // exist. An increase is all-or-nothing; a cap may force as many 2.5 steps as
  // needed, while an own -2.5 and the first cap step overlap.
  for (const lift of ["DL", "OHP"] as const) {
    const window = next.auxiliaryWindows[lift];
    const completedWindow = window.exposures.length >= 4;
    const allPass = completedWindow && window.exposures.every((entry) => entry.outcome === "PASS");
    if (completedWindow) {
      window.completedWindowCount += 1;
      window.exposures = [];
    }
    const key = lift === "DL" ? "deadliftKg" : "ohpKg";
    const beforeKg = next.directStandardsKg[key];
    const immediate = immediateCauses[lift] ?? [];
    let ownCandidateKg = immediate.length > 0 ? cleanKg(beforeKg - 2.5) : beforeKg;
    let ownWindowResult: "INCREASE" | "MAINTAIN" | null = completedWindow ? "MAINTAIN" : null;
    if (immediate.length === 0 && allPass) {
      const increaseCandidate = cleanKg(beforeKg + 2.5);
      if (ref5AuxiliaryCandidateIsWithinCap(lift, increaseCandidate, next.directStandardsKg)) {
        ownCandidateKg = increaseCandidate;
        ownWindowResult = "INCREASE";
      }
    }
    const afterKg = constrainRef5AuxiliaryCandidate(lift, ownCandidateKg, next.directStandardsKg);
    const capConstrainedCurrent = constrainRef5AuxiliaryCandidate(lift, beforeKg, next.directStandardsKg);
    const capForced = capConstrainedCurrent < beforeKg;
    if (completedWindow) window.lastWindowResult = ownWindowResult;
    if (afterKg !== beforeKg) {
      next.directStandardsKg[key] = afterKg;
      if (immediate.length > 0) {
        appendProgressionChange(next, changes, {
          eventId: `immediate-decrease:${lift}:${input.completionEventId}`,
          lift,
          kind: "IMMEDIATE_DECREASE",
          beforeKg,
          afterKg,
          causeEventIds: immediate,
        });
      } else if (ownWindowResult === "INCREASE") {
        appendProgressionChange(next, changes, {
          eventId: `increase:${lift}:${input.completionEventId}`,
          lift,
          kind: "INCREASE",
          beforeKg,
          afterKg,
          causeEventIds: [`window:${lift}:${input.completionEventId}`],
        });
      }
      if (capForced) {
        appendProgressionChange(next, changes, {
          eventId: `cap-decrease:${lift}:${input.completionEventId}`,
          lift,
          kind: "AUXILIARY_CAP_DECREASE",
          beforeKg,
          afterKg,
          causeEventIds: mainChanged.map((mainLift) => `main-change:${mainLift}:${input.completionEventId}`),
        });
      }
      resetAuxiliaryAfterWeightChange(next, lift);
    } else if (completedWindow) {
      appendProgressionChange(next, changes, {
        eventId: `maintain:${lift}:${input.completionEventId}`,
        lift,
        kind: "MAINTAIN",
        beforeKg,
        afterKg,
        causeEventIds: [`window:${lift}:${input.completionEventId}`],
      });
    }
  }

  // A changed PULL target resets both streams/stagnation through the main
  // reset above and immediately establishes the next lock. A merely completed
  // four-focus window also starts a new lock, but resets only streams whose
  // added load actually changed and preserves stagnation progress.
  if (mainChanged.includes("PULL")) {
    relockPull(next, snapshot, changes, [`direct-change:PULL:${input.completionEventId}`], true);
  } else if (pullWindowCompleted) {
    relockPull(next, snapshot, changes, [`window:PULL:${input.completionEventId}`], false);
  }

  const primaryFailEventIds: string[] = [];
  for (const item of snapshot.exercises) {
    if (!REF5_MAIN_LIFTS.includes(item.lift as Ref5MainLift) || outcomes[item.stream]?.outcome !== "FAIL") continue;
    const failEventId = `${eventFor(item.stream)}:FAIL`;
    primaryFailEventIds.push(failEventId);
    next.forcedMicro.failEvents.push({
      eventId: failEventId,
      completionEventId: input.completionEventId,
      sessionId: snapshot.sessionId,
      lift: item.lift as Ref5MainLift,
      stream: item.stream,
      status: "UNCLAIMED",
    });
  }
  next.completedSessions.push({
    sessionId: snapshot.sessionId,
    snapshotId: snapshot.snapshotId,
    completionEventId: input.completionEventId,
    actualStartAt: snapshot.actualStartAt,
    completedAt: input.completedAt,
    outcomes: Object.fromEntries(
      Object.entries(outcomes).map(([stream, record]) => [stream, record?.outcome]),
    ) as Partial<Record<Ref5Stream, Ref5Outcome>>,
    primaryFailEventIds,
  });
  next.completedSessions.sort(compareCompletionSummaries);
  updateForcedMicroQueue(next, input.completionEventId);

  next.appliedCompletionEventIds.push(input.completionEventId);
  if (input.rawLogId && !next.appliedRawLogIds.includes(input.rawLogId)) next.appliedRawLogIds.push(input.rawLogId);
  next.revision += 1;
  return { nextState: next, applied: true, outcomes, changes };
}

export interface Ref5RawLogEvent {
  idempotencyKey: string;
  logId: string;
  sourceRevision?: number;
  stableKey?: string;
  deleted?: boolean;
  sessionId: string;
  snapshotId?: string;
  actualStartAt: string;
  completedAt: string;
  timeZone: string;
  todayBodyweightKg: number;
  recent7DayMeasurementCount: number;
  recent7DayAverageKg: number | null;
  manualMicro: boolean;
  outcomes: Partial<Record<Ref5Stream, Ref5OutcomeInput | Ref5OutcomeRecord>>;
}

export interface Ref5ReplaySessionResult {
  event: Ref5RawLogEvent;
  snapshot: Ref5SessionSnapshot;
  startApplied: boolean;
  completionApplied: boolean;
}

export interface Ref5ReplayResult {
  state: Ref5RuntimeState;
  sessions: Ref5ReplaySessionResult[];
  appliedIdempotencyKeys: string[];
  skippedDuplicateKeys: string[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function chooseCanonicalRawEvent(a: Ref5RawLogEvent, b: Ref5RawLogEvent): Ref5RawLogEvent {
  const revisionA = a.sourceRevision ?? 0;
  const revisionB = b.sourceRevision ?? 0;
  if (revisionA !== revisionB) return revisionA > revisionB ? a : b;
  const keyA = `${a.stableKey ?? a.logId}\u0000${canonicalJson(a)}`;
  const keyB = `${b.stableKey ?? b.logId}\u0000${canonicalJson(b)}`;
  return keyA.localeCompare(keyB) >= 0 ? a : b;
}

/**
 * Full deterministic rebuild for inserts, edits, tombstones and retries.
 * Events are canonicalized by idempotency key/revision and then ordered by the
 * actual start instant plus a stable secondary key. No completion/save time is
 * used for progression order.
 */
export function replayRef5RawLogs(
  events: readonly Ref5RawLogEvent[],
  options: { initialState?: Ref5RuntimeState } = {},
): Ref5ReplayResult {
  const byIdempotencyKey = new Map<string, Ref5RawLogEvent>();
  const skippedDuplicateKeys: string[] = [];
  for (const event of events) {
    if (!event.idempotencyKey.trim()) throw new Ref5ValidationError(["raw event idempotencyKey is required"]);
    const previous = byIdempotencyKey.get(event.idempotencyKey);
    if (previous) {
      skippedDuplicateKeys.push(event.idempotencyKey);
      byIdempotencyKey.set(event.idempotencyKey, chooseCanonicalRawEvent(previous, event));
    } else {
      byIdempotencyKey.set(event.idempotencyKey, event);
    }
  }
  skippedDuplicateKeys.sort();
  const canonical = [...byIdempotencyKey.values()]
    .filter((event) => !event.deleted)
    .sort((a, b) => {
      const byStart = timestampMs(a.actualStartAt, "raw.actualStartAt") - timestampMs(b.actualStartAt, "raw.actualStartAt");
      if (byStart !== 0) return byStart;
      return (a.stableKey ?? a.logId ?? a.idempotencyKey).localeCompare(
        b.stableKey ?? b.logId ?? b.idempotencyKey,
      );
    });

  let state = options.initialState ? cloneState(options.initialState) : createInitialRef5State();
  const sessions: Ref5ReplaySessionResult[] = [];
  const appliedIdempotencyKeys: string[] = [];
  for (const event of canonical) {
    const snapshot = generateRef5Session(state, {
      sessionId: event.sessionId,
      snapshotId: event.snapshotId ?? `${event.sessionId}:snapshot`,
      actualStartAt: event.actualStartAt,
      timeZone: event.timeZone,
      todayBodyweightKg: event.todayBodyweightKg,
      recent7DayMeasurementCount: event.recent7DayMeasurementCount,
      recent7DayAverageKg: event.recent7DayAverageKg,
      manualMicro: event.manualMicro,
    });
    const start = applyRef5FirstSquatStart(state, snapshot, `${event.idempotencyKey}:START`);
    state = start.nextState;
    const completion = reduceRef5Completion(state, snapshot, {
      completionEventId: `${event.idempotencyKey}:COMPLETE`,
      rawLogId: event.logId,
      completedAt: event.completedAt,
      outcomes: event.outcomes,
    });
    state = completion.nextState;
    sessions.push({
      event,
      snapshot,
      startApplied: start.applied,
      completionApplied: completion.applied,
    });
    appliedIdempotencyKeys.push(event.idempotencyKey);
  }
  return { state, sessions, appliedIdempotencyKeys, skippedDuplicateKeys };
}
