import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  generatedSession,
  plan,
  planProgressEvent,
  planRuntimeState,
  workoutLog,
  workoutSet,
} from "@workout/core/db/schema";
import {
  REF5_IDENTIFIERS,
  REF5_LEGACY_PROTOCOL_VERSION,
  REF5_PROTOCOL_VERSION,
  REF5_RUNTIME_SCHEMA_VERSION,
  Ref5StaleVersionError,
  applyRef5FirstSquatStart,
  createInitialRef5State,
  decodeRef5SessionSnapshot,
  reduceRef5Completion,
  replayRef5RawLogs,
  validateAndClassifyRef5Outcome,
  type Ref5DecodedSessionSnapshot,
  type Ref5EndReason,
  type Ref5OutcomeRecord,
  type Ref5RawLogEvent,
  type Ref5RuntimeState,
  type Ref5ProtocolVersion,
} from "@workout/core/program-engine/ref5";

/** Kept numeric-compatible with the generation adapter without importing it. */
// Preserve the original 511 identifier while active v1.2 writes use 512.
export const REF5_PROGRESSION_ENGINE_VERSION = 511;
export const REF5_PROGRESSION_ENGINE_VERSION_V12 = 512;

const REF5_END_REASONS = new Set<Ref5EndReason>([
  "NORMAL",
  "CLEAR_SLOWDOWN",
  "FORCE_OR_TECHNIQUE",
  "SAFETY",
  "EXTERNAL",
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

const REF5_V12_REMOVED_INPUT_KEYS = new Set([
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

function containsRemovedRef5V12Input(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRemovedRef5V12Input);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      REF5_V12_REMOVED_INPUT_KEYS.has(key) ||
      (key === "role" && child === "CLIMBING_FOCUS_INVALID") ||
      containsRemovedRef5V12Input(child),
  );
}

function readRef5DomainSnapshot(snapshot: unknown): Ref5DecodedSessionSnapshot | null {
  const root = asRecord(snapshot);
  const ref5 = asRecord(root.ref5);
  const candidate = asRecord(ref5.domainSnapshot ?? ref5.snapshot ?? root.ref5Snapshot);
  const looksRef5 =
    String(asRecord(root.program).slug ?? "") === REF5_IDENTIFIERS.slug ||
    Object.keys(ref5).length > 0 ||
    Object.keys(candidate).length > 0;
  if (!looksRef5) return null;
  return decodeRef5SessionSnapshot(candidate);
}

export function isRef5PlanParameters(value: unknown): boolean {
  const params = asRecord(value);
  return (
    String(params.programFamily ?? "").trim().toLowerCase() === "ref5" ||
    String(params.protocolVersion ?? "").trim() === REF5_PROTOCOL_VERSION ||
    Object.keys(asRecord(params.ref5)).length > 0
  );
}

export function readRef5PlanProtocolVersion(value: unknown): Ref5ProtocolVersion | null {
  const params = asRecord(value);
  const nested = asRecord(params.ref5);
  const explicit = String(params.protocolVersion ?? nested.protocolVersion ?? "").trim();
  return explicit === REF5_PROTOCOL_VERSION ? REF5_PROTOCOL_VERSION : null;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000_001;
}

function readTerminationReason(value: unknown): Ref5EndReason | null {
  const normalized = String(value ?? "").trim().toUpperCase() as Ref5EndReason;
  return REF5_END_REASONS.has(normalized) ? normalized : null;
}

function readSubmittedRef5Meta(rawSet: Record<string, unknown>) {
  const meta = asRecord(rawSet.meta);
  const ref5 = asRecord(meta.ref5);
  const prescription = asRecord(ref5.prescription);
  return { meta, ref5, prescription };
}

function submittedPrescriptionId(rawSet: Record<string, unknown>): string | null {
  const { ref5, prescription } = readSubmittedRef5Meta(rawSet);
  return nonEmptyString(prescription.prescriptionId) ?? nonEmptyString(ref5.prescriptionId);
}

export type Ref5CanonicalWorkoutSet = {
  exerciseId: null;
  exerciseName: string;
  sortOrder: number;
  setNumber: number;
  reps: number;
  weightKg: number;
  rpe: 0;
  isExtra: false;
  meta: Record<string, unknown>;
};

export type Ref5CanonicalExerciseOutcome = {
  prescriptionId: string;
  lift: Ref5DecodedSessionSnapshot["exercises"][number]["lift"];
  stream: Ref5DecodedSessionSnapshot["exercises"][number]["stream"];
  role: Ref5DecodedSessionSnapshot["exercises"][number]["role"];
  terminationReason: Ref5EndReason;
  outcome: Ref5OutcomeRecord;
};

export type Ref5CanonicalCompletion = {
  protocolVersion: Ref5ProtocolVersion;
  snapshotId: string;
  sessionId: string;
  startEventId: string;
  completionEventId: string;
  actualStartAt: string;
  completedAt: string;
  fingerprint: string;
  sets: Ref5CanonicalWorkoutSet[];
  exerciseOutcomes: Ref5CanonicalExerciseOutcome[];
};

export class Ref5LogValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "Ref5LogValidationError";
    this.errors = errors;
  }
}

export function isRef5GeneratedSessionSnapshot(snapshot: unknown): boolean {
  return readRef5DomainSnapshot(snapshot) !== null;
}

export function readRef5GeneratedSessionProtocolVersion(
  snapshot: unknown,
): Ref5ProtocolVersion | null {
  return readRef5DomainSnapshot(snapshot)?.protocolVersion ?? null;
}

function readStartEventId(generatedSnapshot: unknown): string | null {
  const root = asRecord(generatedSnapshot);
  const ref5 = asRecord(root.ref5);
  return nonEmptyString(ref5.startEventId);
}

function assertRef5PerformedAt(
  performedAt: Date,
  domainSnapshot: Ref5DecodedSessionSnapshot,
): void {
  const expected = Date.parse(domainSnapshot.actualStartAt);
  if (!Number.isFinite(expected) || performedAt.getTime() !== expected) {
    throw new Ref5LogValidationError([
      `REF5 performedAt must equal immutable actualStartAt ${domainSnapshot.actualStartAt}`,
    ]);
  }
}

function readRequiredStringConsistency(input: {
  values: Array<string | null>;
  field: string;
  expected?: string | null;
}): string | null {
  if (input.values.some((value) => value === null)) {
    throw new Ref5LogValidationError([`REF5 ${input.field} is required on every set`]);
  }
  const distinct = new Set(input.values as string[]);
  if (distinct.size !== 1) {
    throw new Ref5LogValidationError([`REF5 ${input.field} must be identical on every set`]);
  }
  const value = (input.values[0] as string | undefined) ?? null;
  if (input.expected !== undefined && value !== input.expected) {
    throw new Ref5LogValidationError([
      `REF5 ${input.field} contradicts the immutable generated snapshot`,
    ]);
  }
  return value;
}

/**
 * A deterministic identity for an attempted completion. Server timestamps and
 * cosmetic metadata are intentionally excluded, so a network retry compares
 * equal while a changed rep or termination reason does not.
 */
export function buildRef5CompletionFingerprint(input: {
  protocolVersion?: Ref5ProtocolVersion;
  snapshotId: string;
  sessionId: string;
  completionEventId: string;
  exerciseOutcomes: Ref5CanonicalExerciseOutcome[];
}): string {
  return JSON.stringify({
    protocolVersion: input.protocolVersion ?? REF5_PROTOCOL_VERSION,
    snapshotId: input.snapshotId,
    sessionId: input.sessionId,
    completionEventId: input.completionEventId,
    exercises: input.exerciseOutcomes.map((item) => ({
      prescriptionId: item.prescriptionId,
      stream: item.stream,
      terminationReason: item.terminationReason,
      plannedReps: item.outcome.plannedReps,
      effectiveReps: item.outcome.effectiveReps,
    })),
  });
}

/**
 * Rebuilds every persisted value from the immutable generated-session domain
 * snapshot. Client weights, names, ordering, RPE and progression metadata are
 * never authoritative.
 */
export function canonicalizeRef5WorkoutLog(input: {
  generatedSnapshot: unknown;
  performedAt: Date;
  sets: unknown[];
  completedAt?: string;
}): Ref5CanonicalCompletion {
  const domainSnapshot = readRef5DomainSnapshot(input.generatedSnapshot);
  if (!domainSnapshot) {
    throw new Ref5LogValidationError(["Generated session is not a supported REF5 snapshot"]);
  }
  assertRef5PerformedAt(input.performedAt, domainSnapshot);
  const startEventId = readStartEventId(input.generatedSnapshot);
  if (!startEventId) {
    throw new Ref5LogValidationError(["REF5 generated snapshot has no startEventId"]);
  }
  const generatedRef5 = asRecord(asRecord(input.generatedSnapshot).ref5);
  const runtimeRevisionBefore =
    integer(generatedRef5.runtimeRevisionBefore) ?? domainSnapshot.runtimeRevision;
  const runtimeRevisionAfter =
    integer(generatedRef5.runtimeRevisionAfter) ?? runtimeRevisionBefore + 1;

  const rows = Array.isArray(input.sets)
    ? input.sets.map((value) => asRecord(value))
    : [];
  const prescribed = domainSnapshot.exercises;
  const expectedSetCount = prescribed.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const errors: string[] = [];
  if (rows.length !== expectedSetCount) {
    errors.push(`REF5 requires exactly ${expectedSetCount} prescribed sets; received ${rows.length}`);
  }

  const expectedIds = new Set(prescribed.map((exercise) => exercise.prescriptionId));
  const byPrescriptionAndSet = new Map<string, Record<string, unknown>>();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const prescriptionId = submittedPrescriptionId(row);
    const setNumber = integer(row.setNumber);
    if (!prescriptionId) {
      errors.push(`sets[${rowIndex}] is missing REF5 prescriptionId`);
      continue;
    }
    if (!expectedIds.has(prescriptionId)) {
      errors.push(`sets[${rowIndex}] does not belong to this REF5 snapshot`);
      continue;
    }
    if (setNumber === null || setNumber < 1) {
      errors.push(`sets[${rowIndex}].setNumber must be a positive integer`);
      continue;
    }
    const key = `${prescriptionId}\u0000${setNumber}`;
    if (byPrescriptionAndSet.has(key)) {
      errors.push(`duplicate REF5 set ${prescriptionId} #${setNumber}`);
      continue;
    }
    byPrescriptionAndSet.set(key, row);
  }

  const completionIds: Array<string | null> = [];
  const submittedStartIds: Array<string | null> = [];
  const submittedActualStarts: Array<string | null> = [];
  const exerciseOutcomes: Ref5CanonicalExerciseOutcome[] = [];
  const canonicalSets: Ref5CanonicalWorkoutSet[] = [];

  for (let exerciseIndex = 0; exerciseIndex < prescribed.length; exerciseIndex += 1) {
    const exercise = prescribed[exerciseIndex]!;
    const actualSets: Array<{ plannedReps: number; effectiveReps: number }> = [];
    const terminationReasons: Ref5EndReason[] = [];
    const exerciseRows: Array<{
      row: Record<string, unknown>;
      planned: (typeof exercise.sets)[number];
      actualReps: number;
      terminationReason: Ref5EndReason;
    }> = [];

    for (const plannedSet of exercise.sets) {
      const key = `${exercise.prescriptionId}\u0000${plannedSet.setNumber}`;
      const row = byPrescriptionAndSet.get(key);
      if (!row) {
        errors.push(`missing REF5 set ${exercise.prescriptionId} #${plannedSet.setNumber}`);
        continue;
      }
      const submittedName = nonEmptyString(row.exerciseName);
      if (submittedName !== exercise.exerciseName) {
        errors.push(`REF5 exercise name contradicts ${exercise.prescriptionId}`);
      }
      if (row.isExtra === true) {
        errors.push(`REF5 prescribed sets cannot be marked extra`);
      }
      const actualReps = integer(row.reps);
      if (actualReps === null || actualReps < 0 || actualReps > plannedSet.plannedReps) {
        errors.push(
          `REF5 ${exercise.prescriptionId} set ${plannedSet.setNumber} reps must be an integer from 0 to ${plannedSet.plannedReps}`,
        );
        continue;
      }
      const submittedWeight = finiteNumber(row.weightKg);
      if (submittedWeight !== null && !sameNumber(submittedWeight, plannedSet.externalLoadKg)) {
        errors.push(`REF5 weight contradicts ${exercise.prescriptionId} set ${plannedSet.setNumber}`);
      }
      const { ref5 } = readSubmittedRef5Meta(row);
      const submittedPrescription = asRecord(ref5.prescription);
      if (
        domainSnapshot.protocolVersion === REF5_PROTOCOL_VERSION &&
        containsRemovedRef5V12Input(row)
      ) {
        throw new Ref5StaleVersionError(REF5_LEGACY_PROTOCOL_VERSION);
      }
      if (ref5.protocolVersion !== domainSnapshot.protocolVersion) {
        errors.push(`REF5 protocolVersion is required for ${exercise.prescriptionId}`);
      }
      const submittedSnapshotId = nonEmptyString(submittedPrescription.snapshotId);
      if (submittedSnapshotId && submittedSnapshotId !== domainSnapshot.snapshotId) {
        errors.push(`REF5 snapshotId contradicts ${exercise.prescriptionId}`);
      }
      const submittedSessionId = nonEmptyString(submittedPrescription.sessionId);
      if (submittedSessionId && submittedSessionId !== domainSnapshot.sessionId) {
        errors.push(`REF5 sessionId contradicts ${exercise.prescriptionId}`);
      }
      const submittedRevisionBefore = integer(ref5.runtimeRevisionBefore);
      if (
        submittedRevisionBefore !== null &&
        submittedRevisionBefore !== runtimeRevisionBefore
      ) {
        errors.push(`REF5 runtimeRevisionBefore contradicts ${exercise.prescriptionId}`);
      }
      const submittedRevisionAfter = integer(ref5.runtimeRevisionAfter);
      if (
        submittedRevisionAfter !== null &&
        submittedRevisionAfter !== runtimeRevisionAfter
      ) {
        errors.push(`REF5 runtimeRevisionAfter contradicts ${exercise.prescriptionId}`);
      }
      const terminationReason = readTerminationReason(ref5.terminationReason);
      if (!terminationReason) {
        errors.push(`REF5 terminationReason is required for ${exercise.prescriptionId}`);
        continue;
      }
      const submittedPlannedReps = integer(ref5.plannedReps);
      if (submittedPlannedReps !== null && submittedPlannedReps !== plannedSet.plannedReps) {
        errors.push(`REF5 plannedReps contradicts ${exercise.prescriptionId} set ${plannedSet.setNumber}`);
      }
      const submittedActualReps = integer(ref5.actualReps);
      if (submittedActualReps !== null && submittedActualReps !== actualReps) {
        errors.push(`REF5 actualReps contradicts ${exercise.prescriptionId} set ${plannedSet.setNumber}`);
      }

      completionIds.push(nonEmptyString(ref5.completionEventId));
      submittedStartIds.push(nonEmptyString(ref5.startEventId));
      submittedActualStarts.push(nonEmptyString(ref5.actualStartAt));
      terminationReasons.push(terminationReason);
      actualSets.push({ plannedReps: plannedSet.plannedReps, effectiveReps: actualReps });
      exerciseRows.push({ row, planned: plannedSet, actualReps, terminationReason });
    }

    if (new Set(terminationReasons).size > 1) {
      errors.push(`REF5 terminationReason must be the same for every set of ${exercise.prescriptionId}`);
      continue;
    }
    if (actualSets.length !== exercise.sets.length || terminationReasons.length === 0) continue;
    const terminationReason = terminationReasons[0]!;
    const classified = validateAndClassifyRef5Outcome({
      sets: actualSets,
      endReason: terminationReason,
    });
    if (!classified.ok) {
      errors.push(...classified.errors.map((error) => `${exercise.prescriptionId}: ${error}`));
      continue;
    }
    exerciseOutcomes.push({
      prescriptionId: exercise.prescriptionId,
      lift: exercise.lift,
      stream: exercise.stream,
      role: exercise.role,
      terminationReason,
      outcome: classified.value,
    });

    for (const item of exerciseRows) {
      const originalMeta = cloneJson(asRecord(item.row.meta));
      const pullLoadMeta =
        exercise.lift === "PULL"
          ? {
              bodyweightKg: exercise.pull?.todayBodyweightKg ?? domainSnapshot.startInput.todayBodyweightKg,
              externalLoadKg: item.planned.externalLoadKg,
              totalLoadKg: item.planned.totalLoadKg,
            }
          : {};
      canonicalSets.push({
        exerciseId: null,
        exerciseName: exercise.exerciseName,
        sortOrder: exerciseIndex,
        setNumber: item.planned.setNumber,
        reps: item.actualReps,
        weightKg: item.planned.externalLoadKg,
        rpe: 0,
        isExtra: false,
        meta: {
          ...originalMeta,
          ...pullLoadMeta,
          ref5: {
            protocolVersion: domainSnapshot.protocolVersion,
            snapshotId: domainSnapshot.snapshotId,
            sessionId: domainSnapshot.sessionId,
            prescriptionId: exercise.prescriptionId,
            lift: exercise.lift,
            stream: exercise.stream,
            role: exercise.role,
            setNumber: item.planned.setNumber,
            plannedReps: item.planned.plannedReps,
            actualReps: item.actualReps,
            externalLoadKg: item.planned.externalLoadKg,
            totalLoadKg: item.planned.totalLoadKg,
            progressionTargetKg: exercise.progressionTargetKg,
            terminationReason: item.terminationReason,
            actualStartAt: domainSnapshot.actualStartAt,
            startEventId,
            runtimeRevisionBefore,
            runtimeRevisionAfter,
            // Full immutable prescription and PULL lock/calculation context.
            prescription: cloneJson(exercise),
            pull: exercise.pull ? cloneJson(exercise.pull) : null,
          },
        },
      });
    }
  }

  if (errors.length > 0) throw new Ref5LogValidationError(errors);
  const completionEventId = readRequiredStringConsistency({
    values: completionIds,
    field: "completionEventId",
  });
  readRequiredStringConsistency({
    values: submittedStartIds,
    field: "startEventId",
    expected: startEventId,
  });
  readRequiredStringConsistency({
    values: submittedActualStarts,
    field: "actualStartAt",
    expected: domainSnapshot.actualStartAt,
  });
  if (!completionEventId) {
    throw new Ref5LogValidationError(["REF5 completionEventId is required"]);
  }
  if (completionEventId === startEventId) {
    throw new Ref5LogValidationError(["REF5 completionEventId must differ from startEventId"]);
  }
  if (exerciseOutcomes.length !== domainSnapshot.exercises.length) {
    throw new Ref5LogValidationError(["Every REF5 exercise needs one outcome"]);
  }

  const completedAtRaw = input.completedAt ?? new Date().toISOString();
  const completedAtDate = new Date(completedAtRaw);
  if (Number.isNaN(completedAtDate.getTime())) {
    throw new Ref5LogValidationError(["REF5 completedAt must be a valid timestamp"]);
  }
  const completedAt = completedAtDate.toISOString();
  const fingerprint = buildRef5CompletionFingerprint({
    protocolVersion: domainSnapshot.protocolVersion,
    snapshotId: domainSnapshot.snapshotId,
    sessionId: domainSnapshot.sessionId,
    completionEventId,
    exerciseOutcomes,
  });
  for (const set of canonicalSets) {
    const ref5 = asRecord(set.meta.ref5);
    set.meta.ref5 = { ...ref5, completionEventId, completedAt, completionFingerprint: fingerprint };
  }

  return {
    protocolVersion: domainSnapshot.protocolVersion,
    snapshotId: domainSnapshot.snapshotId,
    sessionId: domainSnapshot.sessionId,
    startEventId,
    completionEventId,
    actualStartAt: domainSnapshot.actualStartAt,
    completedAt,
    fingerprint,
    sets: canonicalSets,
    exerciseOutcomes,
  };
}

export function readRef5CompletionFingerprintFromSets(sets: unknown[]): string | null {
  for (const raw of sets) {
    const { ref5 } = readSubmittedRef5Meta(asRecord(raw));
    const fingerprint = nonEmptyString(ref5.completionFingerprint);
    if (fingerprint) return fingerprint;
  }
  return null;
}

export function readRef5CompletedAtFromSets(sets: unknown[]): string | null {
  for (const raw of sets) {
    const { ref5 } = readSubmittedRef5Meta(asRecord(raw));
    const value = nonEmptyString(ref5.completedAt);
    if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return null;
}

export function readRef5CompletionEventIdFromSets(sets: unknown[]): string | null {
  for (const raw of sets) {
    const { ref5 } = readSubmittedRef5Meta(asRecord(raw));
    const value = nonEmptyString(ref5.completionEventId);
    if (value) return value;
  }
  return null;
}

export function replayRef5CanonicalRawLogs(
  events: readonly Ref5RawLogEvent[],
  options: { initialState?: Ref5RuntimeState } = {},
) {
  return replayRef5RawLogs(events, options);
}

export async function acquireRef5PlanLock(tx: any, planId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${planId}))`);
}

type Ref5ReplaySessionRow = {
  id: string;
  sessionKey: string;
  snapshot: unknown;
  domain: Ref5DecodedSessionSnapshot;
  startEventId: string;
};

function compareReplaySessions(left: Ref5ReplaySessionRow, right: Ref5ReplaySessionRow): number {
  const byTime = Date.parse(left.domain.actualStartAt) - Date.parse(right.domain.actualStartAt);
  return byTime || left.sessionKey.localeCompare(right.sessionKey) || left.id.localeCompare(right.id);
}

function outcomesByStream(completion: Ref5CanonicalCompletion) {
  return Object.fromEntries(
    completion.exerciseOutcomes.map((exercise) => [exercise.stream, exercise.outcome]),
  );
}

export function probeRef5CanonicalCompletionAtStartTuple(input: {
  generatedSnapshot: unknown;
  priorState: unknown;
  completion: Ref5CanonicalCompletion;
  rawLogId?: string;
}) {
  const snapshot = readRef5DomainSnapshot(input.generatedSnapshot);
  const state = decodeRef5RuntimeState(input.priorState);
  if (!snapshot || !state) {
    throw new Ref5LogValidationError(["REF5 tuple-local state/snapshot is unavailable"]);
  }
  const startEventId = readStartEventId(input.generatedSnapshot);
  if (!startEventId) {
    throw new Ref5LogValidationError(["REF5 generated snapshot has no startEventId"]);
  }
  const replaySnapshot: Ref5DecodedSessionSnapshot = {
    ...cloneJson(snapshot),
    runtimeRevision: state.revision,
  };
  const started = applyRef5FirstSquatStart(
    state,
    replaySnapshot,
    startEventId,
    { historicalReplay: true },
  );
  if (!started.applied) {
    throw new Ref5LogValidationError(["REF5 tuple-local START was already applied"]);
  }
  return {
    snapshot: replaySnapshot,
    started,
    reduced: reduceRef5Completion(started.nextState, replaySnapshot, {
      completionEventId: input.completion.completionEventId,
      rawLogId: input.rawLogId,
      completedAt: input.completion.completedAt,
      outcomes: outcomesByStream(input.completion),
      historicalReplay: true,
    }),
  };
}

function aggregateRef5EventType(changes: Array<{ kind: string }>): string {
  if (changes.some((change) => change.kind.includes("DECREASE"))) return "REF5_DECREASE";
  if (changes.some((change) => change.kind === "INCREASE")) return "REF5_INCREASE";
  if (changes.some((change) => change.kind === "MAINTAIN")) return "REF5_HOLD";
  return "REF5_COMPLETE";
}

/** Strict v1.2 runtime decoder. v1.1 and protocol-less state are stale. */
export function decodeRef5RuntimeState(value: unknown): Ref5RuntimeState | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  const protocolVersion = String(record.protocolVersion ?? "").trim();
  if (protocolVersion !== REF5_PROTOCOL_VERSION) {
    throw new Ref5StaleVersionError(protocolVersion || null);
  }
  if (
    Number(record.schemaVersion) !== REF5_RUNTIME_SCHEMA_VERSION ||
    !Number.isInteger(record.revision)
  ) {
    throw new Ref5LogValidationError(["REF5 runtime protocol/schema version is unsupported"]);
  }
  return record as unknown as Ref5RuntimeState;
}

type Ref5ReplayLogRow = {
  id: string;
  generatedSessionId: string | null;
  performedAt: Date;
};

type Ref5ReplaySetRow = {
  id: string;
  logId: string;
  exerciseName: string;
  sortOrder: number;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  isExtra: boolean;
  meta: unknown;
};

type Ref5ReplaySource = {
  sessions: Ref5ReplaySessionRow[];
  logs: Ref5ReplayLogRow[];
  logBySessionId: Map<string, Ref5ReplayLogRow>;
  setsByLogId: Map<string, Ref5ReplaySetRow[]>;
};

type Ref5ReplayFold = {
  state: Ref5RuntimeState;
  auditRows: Array<typeof planProgressEvent.$inferInsert>;
  completedGeneratedSessionIds: string[];
};

type Ref5ReplayPlanContext = {
  id: string;
  userId: string;
  protocolVersion: Ref5ProtocolVersion;
};

async function resolveRef5ReplayPlan(
  tx: any,
  userId: string,
  planId: string,
): Promise<Ref5ReplayPlanContext | "skip:forbidden-plan" | "skip:not-ref5"> {
  const rows = await tx
    .select({ id: plan.id, userId: plan.userId, params: plan.params })
    .from(plan)
    .where(eq(plan.id, planId))
    .limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return "skip:forbidden-plan" as const;
  if (!isRef5PlanParameters(row.params)) return "skip:not-ref5" as const;
  const protocolVersion = readRef5PlanProtocolVersion(row.params);
  if (!protocolVersion) {
    const params = asRecord(row.params);
    throw new Ref5StaleVersionError(
      params.protocolVersion ?? asRecord(params.ref5).protocolVersion,
    );
  }
  return { id: row.id, userId: row.userId, protocolVersion };
}

async function loadRef5ReplaySource(input: {
  tx: any;
  planId: string;
  before?: { actualStartAt: string; sessionKey: string };
}): Promise<Ref5ReplaySource> {
  const generatedRows = await input.tx
    .select({
      id: generatedSession.id,
      sessionKey: generatedSession.sessionKey,
      snapshot: generatedSession.snapshot,
    })
    .from(generatedSession)
    .where(eq(generatedSession.planId, input.planId));
  const allSessions: Ref5ReplaySessionRow[] = [];
  for (const row of generatedRows) {
    const domain = readRef5DomainSnapshot(row.snapshot);
    if (!domain) {
      throw new Ref5LogValidationError([
        `REF5 generated session ${row.id} has an unrecognized or unmarked snapshot`,
      ]);
    }
    const startEventId = readStartEventId(row.snapshot);
    if (!startEventId) {
      throw new Ref5LogValidationError([
        `REF5 generated session ${row.id} is missing its immutable startEventId`,
      ]);
    }
    allSessions.push({ ...row, domain, startEventId });
  }
  allSessions.sort(compareReplaySessions);
  const allSessionIds = allSessions.map((session) => session.id);
  const allLogs: Ref5ReplayLogRow[] = allSessionIds.length
    ? await input.tx
        .select({
          id: workoutLog.id,
          generatedSessionId: workoutLog.generatedSessionId,
          performedAt: workoutLog.performedAt,
        })
        .from(workoutLog)
        .where(inArray(workoutLog.generatedSessionId, allSessionIds))
        .orderBy(asc(workoutLog.performedAt), asc(workoutLog.id))
    : [];
  const allLogBySessionId = new Map<string, Ref5ReplayLogRow>();
  for (const log of allLogs) {
    if (!log.generatedSessionId) continue;
    if (allLogBySessionId.has(log.generatedSessionId)) {
      throw new Ref5LogValidationError([
        `REF5 generated session ${log.generatedSessionId} has duplicate workout logs`,
      ]);
    }
    allLogBySessionId.set(log.generatedSessionId, log);
  }
  const [startRows, runtimeRows] = await Promise.all([
    input.tx
      .select({ meta: planProgressEvent.meta })
      .from(planProgressEvent)
      .where(
        and(
          eq(planProgressEvent.planId, input.planId),
          eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
          eq(planProgressEvent.eventType, "REF5_START"),
        ),
      ),
    input.tx
      .select({ state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, input.planId))
      .limit(1),
  ]);
  const appliedStartEventIds = new Set<string>();
  for (const row of startRows) {
    const startEventId = nonEmptyString(asRecord(row.meta).startEventId);
    if (startEventId) appliedStartEventIds.add(startEventId);
  }
  const decodedRuntime = decodeRef5RuntimeState(runtimeRows[0]?.state);
  const runtimeApplied = decodedRuntime?.appliedStartEventIds;
  if (Array.isArray(runtimeApplied)) {
    for (const value of runtimeApplied) {
      const startEventId = nonEmptyString(value);
      if (startEventId) appliedStartEventIds.add(startEventId);
    }
  }
  const sessions = allSessions.filter((session) => {
    const ref5 = asRecord(asRecord(session.snapshot).ref5);
    const explicitV12Commit =
      session.domain.protocolVersion === REF5_PROTOCOL_VERSION && ref5.startCommitted === true;
    return (
      explicitV12Commit ||
      appliedStartEventIds.has(session.startEventId) ||
      allLogBySessionId.has(session.id)
    );
  });
  const selected = input.before
    ? sessions.filter((session) => {
        const byTime = Date.parse(session.domain.actualStartAt) - Date.parse(input.before!.actualStartAt);
        return byTime < 0 || (byTime === 0 && session.sessionKey.localeCompare(input.before!.sessionKey) < 0);
      })
    : sessions;

  const selectedIds = new Set(selected.map((session) => session.id));
  const logs = allLogs.filter(
    (log) => log.generatedSessionId && selectedIds.has(log.generatedSessionId),
  );
  const logBySessionId = new Map<string, Ref5ReplayLogRow>();
  for (const log of logs) {
    if (!log.generatedSessionId) continue;
    logBySessionId.set(log.generatedSessionId, log);
  }

  const logIds = logs.map((log) => log.id);
  const storedSets: Ref5ReplaySetRow[] = logIds.length
    ? await input.tx
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
        .where(inArray(workoutSet.logId, logIds))
        .orderBy(
          asc(workoutSet.logId),
          asc(workoutSet.sortOrder),
          asc(workoutSet.setNumber),
          asc(workoutSet.id),
        )
    : [];
  const setsByLogId = new Map<string, Ref5ReplaySetRow[]>();
  for (const set of storedSets) {
    const list = setsByLogId.get(set.logId) ?? [];
    list.push(set);
    setsByLogId.set(set.logId, list);
  }
  return { sessions: selected, logs, logBySessionId, setsByLogId };
}

function foldRef5ReplaySource(input: {
  userId: string;
  planId: string;
  planProtocolVersion: Ref5ProtocolVersion;
  source: Ref5ReplaySource;
}): Ref5ReplayFold {
  let runningState = createInitialRef5State();
  const auditRows: Array<typeof planProgressEvent.$inferInsert> = [];
  const completedGeneratedSessionIds: string[] = [];
  for (const session of input.source.sessions) {
    const beforeStart = runningState;
    const replaySnapshot: Ref5DecodedSessionSnapshot = {
      ...cloneJson(session.domain),
      runtimeRevision: runningState.revision,
    };
    const started = applyRef5FirstSquatStart(
      runningState,
      replaySnapshot,
      session.startEventId,
      { historicalReplay: true },
    );
    if (!started.applied) {
      throw new Ref5LogValidationError([
        `REF5 start ${session.startEventId} was duplicated during canonical replay`,
      ]);
    }
    runningState = started.nextState;
    auditRows.push({
      planId: input.planId,
      logId: null,
      userId: input.userId,
      eventType: "REF5_START",
      programSlug: REF5_IDENTIFIERS.slug,
      reason: replaySnapshot.decision.sessionType,
      beforeState: cloneJson(beforeStart),
      afterState: cloneJson(runningState),
      meta: {
        protocolVersion: replaySnapshot.protocolVersion,
        engineVersion: REF5_PROGRESSION_ENGINE_VERSION_V12,
        startEventId: session.startEventId,
        snapshotId: replaySnapshot.snapshotId,
        sessionId: replaySnapshot.sessionId,
        actualStartAt: replaySnapshot.actualStartAt,
        stableKey: session.sessionKey,
        decision: cloneJson(replaySnapshot.decision),
      },
      createdAt: new Date(replaySnapshot.actualStartAt),
    });

    const log = input.source.logBySessionId.get(session.id);
    if (!log) continue;
    const persistedSets = input.source.setsByLogId.get(log.id) ?? [];
    const completedAt = readRef5CompletedAtFromSets(persistedSets);
    if (!completedAt) {
      throw new Ref5LogValidationError([`REF5 log ${log.id} is missing its immutable completedAt`]);
    }
    const completion = canonicalizeRef5WorkoutLog({
      generatedSnapshot: session.snapshot,
      performedAt: log.performedAt,
      sets: persistedSets,
      completedAt,
    });
    const beforeCompletion = runningState;
    const reduced = reduceRef5Completion(runningState, replaySnapshot, {
      completionEventId: completion.completionEventId,
      rawLogId: log.id,
      completedAt: completion.completedAt,
      outcomes: outcomesByStream(completion),
      historicalReplay: true,
    });
    if (!reduced.applied) {
      throw new Ref5LogValidationError([
        `REF5 completion ${completion.completionEventId} was duplicated during canonical replay`,
      ]);
    }
    runningState = reduced.nextState;
    completedGeneratedSessionIds.push(session.id);
    auditRows.push({
      planId: input.planId,
      logId: log.id,
      userId: input.userId,
      eventType: aggregateRef5EventType(reduced.changes),
      programSlug: REF5_IDENTIFIERS.slug,
      reason: "ref5:canonical-replay",
      beforeState: cloneJson(beforeCompletion),
      afterState: cloneJson(runningState),
      meta: {
        protocolVersion: replaySnapshot.protocolVersion,
        engineVersion: REF5_PROGRESSION_ENGINE_VERSION_V12,
        startEventId: completion.startEventId,
        completionEventId: completion.completionEventId,
        completionFingerprint: completion.fingerprint,
        snapshotId: completion.snapshotId,
        sessionId: completion.sessionId,
        actualStartAt: completion.actualStartAt,
        completedAt: completion.completedAt,
        stableKey: session.sessionKey,
        outcomes: cloneJson(outcomesByStream(completion)),
        changes: cloneJson(reduced.changes),
      },
      createdAt: new Date(completion.completedAt),
    });
  }
  if (runningState.protocolVersion !== input.planProtocolVersion) {
    throw new Ref5LogValidationError([
      `REF5 replay ended at ${runningState.protocolVersion}, but plan expects ${input.planProtocolVersion}`,
    ]);
  }
  return { state: runningState, auditRows, completedGeneratedSessionIds };
}

function ref5AuditIdentity(input: {
  eventType: string;
  meta: unknown;
}): string {
  const meta = asRecord(input.meta);
  return [
    String(meta.protocolVersion ?? ""),
    input.eventType,
    String(meta.stableKey ?? ""),
    String(meta.startEventId ?? ""),
    String(meta.completionEventId ?? ""),
    String(meta.completionFingerprint ?? ""),
  ].join("\u0000");
}

/** Append-only audit persistence for v1.2 canonical replay. */
async function appendMissingRef5AuditRows(input: {
  tx: any;
  planId: string;
  rows: Array<typeof planProgressEvent.$inferInsert>;
}) {
  const existing = await input.tx
    .select({
      id: planProgressEvent.id,
      logId: planProgressEvent.logId,
      eventType: planProgressEvent.eventType,
      meta: planProgressEvent.meta,
    })
    .from(planProgressEvent)
    .where(
      and(
        eq(planProgressEvent.planId, input.planId),
        eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
      ),
    );
  const identities = new Set(
    existing.map((row: { eventType: string; meta: unknown }) => ref5AuditIdentity(row)),
  );
  const occupiedLogIds = new Set(
    existing
      .map((row: { logId: string | null }) => row.logId)
      .filter((value: string | null): value is string => Boolean(value)),
  );
  const inserts: Array<typeof planProgressEvent.$inferInsert> = [];
  for (const desired of input.rows) {
    const identity = ref5AuditIdentity({ eventType: desired.eventType, meta: desired.meta });
    if (identities.has(identity)) continue;
    let row = desired;
    if (desired.logId && occupiedLogIds.has(desired.logId)) {
      const meta = asRecord(desired.meta);
      row = {
        ...desired,
        logId: null,
        eventType: "REF5_REPLAY_CHECKPOINT",
        reason: "ref5:append-only-replay",
        meta: {
          ...cloneJson(meta),
          stableKey: `replay:${createHash("sha256").update(identity).digest("hex")}`,
          supersedesLogId: desired.logId,
        },
        createdAt: new Date(),
      };
    }
    const rowIdentity = ref5AuditIdentity({ eventType: row.eventType, meta: row.meta });
    if (identities.has(rowIdentity)) continue;
    inserts.push(row);
    identities.add(rowIdentity);
    if (row.logId) occupiedLogIds.add(row.logId);
  }
  if (inserts.length > 0) await input.tx.insert(planProgressEvent).values(inserts);
  return inserts.length;
}

/** Read-only historical state immediately before the target ordering tuple. */
export async function deriveRef5StateBeforeStart(input: {
  tx: any;
  userId: string;
  planId: string;
  actualStartAt: string;
  sessionKey: string;
  lockAlreadyHeld?: boolean;
}) {
  const parsedStart = Date.parse(input.actualStartAt);
  if (!Number.isFinite(parsedStart) || !input.sessionKey.trim()) {
    throw new Ref5LogValidationError(["A valid REF5 start tuple is required"]);
  }
  if (!input.lockAlreadyHeld) await acquireRef5PlanLock(input.tx, input.planId);
  const planContext = await resolveRef5ReplayPlan(input.tx, input.userId, input.planId);
  if (typeof planContext === "string") throw new Ref5LogValidationError([planContext]);
  const source = await loadRef5ReplaySource({
    tx: input.tx,
    planId: input.planId,
    before: { actualStartAt: new Date(parsedStart).toISOString(), sessionKey: input.sessionKey },
  });
  const folded = foldRef5ReplaySource({
    userId: input.userId,
    planId: input.planId,
    planProtocolVersion: planContext.protocolVersion,
    source,
  });
  return {
    state: folded.state,
    replayedSessionCount: source.sessions.length,
    replayedLogCount: source.logs.length,
  };
}

/**
 * Canonical DB replay. Frozen prescriptions are retained, while their revision
 * is rebound to the running revision because it is an optimistic live-start
 * guard, not part of the historical ordering key.
 */
export async function rebuildRef5ProgressionForPlan(input: {
  tx: any;
  userId: string;
  planId: string | null | undefined;
  lockAlreadyHeld?: boolean;
}) {
  const planId = typeof input.planId === "string" ? input.planId.trim() : "";
  if (!planId) return { applied: false as const, reason: "skip:no-plan" as const };
  if (!input.lockAlreadyHeld) await acquireRef5PlanLock(input.tx, planId);
  const planContext = await resolveRef5ReplayPlan(input.tx, input.userId, planId);
  if (typeof planContext === "string") return { applied: false as const, reason: planContext };

  const source = await loadRef5ReplaySource({ tx: input.tx, planId });
  const folded = foldRef5ReplaySource({
    userId: input.userId,
    planId,
    planProtocolVersion: planContext.protocolVersion,
    source,
  });
  const appendedAuditEventCount = await appendMissingRef5AuditRows({
    tx: input.tx,
    planId,
    rows: folded.auditRows,
  });
  const runtimeRows = await input.tx
    .select({ id: planRuntimeState.id, state: planRuntimeState.state })
    .from(planRuntimeState)
    .where(eq(planRuntimeState.planId, planId))
    .limit(1);
  const runtimeRow = runtimeRows[0];
  if (runtimeRow) {
    const expectedRevision = Number(asRecord(runtimeRow.state).revision);
    if (!Number.isInteger(expectedRevision)) {
      throw new Ref5LogValidationError(["REF5 runtime revision is missing; CAS rebuild aborted"]);
    }
    const updated = await input.tx
      .update(planRuntimeState)
      .set({
        userId: input.userId,
        engineVersion: REF5_PROGRESSION_ENGINE_VERSION_V12,
        state: folded.state,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planRuntimeState.planId, planId),
          sql`(${planRuntimeState.state} ->> 'revision')::integer = ${expectedRevision}`,
        ),
      )
      .returning({ id: planRuntimeState.id });
    if (!updated[0]) {
      throw new Ref5LogValidationError(["REF5 runtime revision changed during CAS rebuild"]);
    }
  } else {
    const inserted = await input.tx
      .insert(planRuntimeState)
      .values({
        planId,
        userId: input.userId,
        engineVersion: REF5_PROGRESSION_ENGINE_VERSION_V12,
        state: folded.state,
      })
      .onConflictDoNothing({ target: planRuntimeState.planId })
      .returning({ id: planRuntimeState.id });
    if (!inserted[0]) {
      throw new Ref5LogValidationError(["REF5 runtime was concurrently initialized"]);
    }
  }

  const sessionIds = source.sessions.map((session) => session.id);
  if (sessionIds.length > 0) {
    await input.tx
      .update(generatedSession)
      .set({ status: "PLANNED", updatedAt: new Date() })
      .where(inArray(generatedSession.id, sessionIds));
  }
  if (folded.completedGeneratedSessionIds.length > 0) {
    await input.tx
      .update(generatedSession)
      .set({ status: "DONE", updatedAt: new Date() })
      .where(inArray(generatedSession.id, folded.completedGeneratedSessionIds));
  }
  return {
    applied: true as const,
    reason: source.sessions.length > 0 ? ("rebuild:updated" as const) : ("rebuild:initial" as const),
    eventType: "REF5_REPLAY",
    programSlug: REF5_IDENTIFIERS.slug,
    rebuiltSessionCount: source.sessions.length,
    rebuiltLogCount: source.logs.length,
    appendedAuditEventCount,
    state: folded.state,
  };
}
