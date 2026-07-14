import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import {
  generatedSession,
  plan,
} from "@workout/core/db/schema";
import {
  deriveRef5StateBeforeStart,
  rebuildRef5ProgressionForPlan,
} from "@workout/core/progression/ref5-auto-progression";
import {
  REF5_IDENTIFIERS,
  REF5_PROTOCOL_VERSION,
  Ref5ValidationError,
  applyRef5FirstSquatStart,
  generateRef5Session,
  type Ref5RuntimeState,
  type Ref5SessionInput,
  type Ref5SessionSnapshot,
} from "./ref5";
import { acquireActiveAccountMutationLock } from "@workout/core/auth/account-lifecycle";

export const REF5_ENGINE_VERSION = 511;

export type Ref5GenerateRequest = {
  actualStartAt: string;
  todayBodyweightKg: number;
  manualMicro: boolean;
  climbingWithin48h: boolean;
  startEventId: string;
  omitPullVolume?: boolean;
};

export type Ref5PlanGenerationInput = {
  userId: string;
  planId: string;
  timezone?: string;
  ref5?: Ref5GenerateRequest;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function isRef5PlanParams(value: unknown): boolean {
  const params = toRecord(value);
  return (
    String(params.programFamily ?? "").trim().toLowerCase() === "ref5" ||
    Object.keys(toRecord(params.ref5)).length > 0
  );
}

function assertTimezone(value: string): string {
  const timezone = value.trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    throw new Ref5ValidationError(["Invalid REF5 plan timezone"]);
  }
}

export function normalizeRef5GenerationRequest(
  input: Ref5PlanGenerationInput,
  planParams: unknown,
): Ref5GenerateRequest & { actualStartAt: string; timezone: string } {
  if (!input.ref5) throw new Ref5ValidationError(["REF5 session input is required"]);
  const parsedStart = new Date(input.ref5.actualStartAt);
  if (Number.isNaN(parsedStart.getTime())) {
    throw new Ref5ValidationError(["Invalid REF5 actual start time"]);
  }
  const bodyweightKg = Number(input.ref5.todayBodyweightKg);
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0 || bodyweightKg > 500) {
    throw new Ref5ValidationError(["Invalid REF5 bodyweight"]);
  }
  const startEventId = String(input.ref5.startEventId ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(startEventId)) {
    throw new Ref5ValidationError(["Invalid REF5 start event ID"]);
  }
  const params = toRecord(planParams);
  const timezone = assertTimezone(
    // Calendar-density rules are always evaluated in the immutable plan
    // timezone; a browser/display timezone must not change the prescription.
    String(params.timezone ?? "UTC").trim() || "UTC",
  );
  return {
    actualStartAt: parsedStart.toISOString(),
    todayBodyweightKg: Math.round(bodyweightKg * 100) / 100,
    manualMicro: input.ref5.manualMicro === true,
    climbingWithin48h: input.ref5.climbingWithin48h === true,
    startEventId,
    omitPullVolume: input.ref5.omitPullVolume === true,
    timezone,
  };
}

function ref5SessionKey(actualStartAt: string, startEventId: string): string {
  return `REF5:${actualStartAt}:${startEventId}`;
}

async function assertRef5StableTieAppend(input: {
  tx: any;
  planId: string;
  actualStartAt: string;
  sessionKey: string;
}) {
  const equalTimestampRows = await input.tx
    .select({ sessionKey: generatedSession.sessionKey })
    .from(generatedSession)
    .where(
      and(
        eq(generatedSession.planId, input.planId),
        eq(generatedSession.scheduledAt, new Date(input.actualStartAt)),
      ),
    )
    .orderBy(asc(generatedSession.sessionKey));
  // Equal instants are valid, but a new stable key may only append to the tie.
  // Inserting before a frozen equal-time snapshot would change its decision.
  if (equalTimestampRows.some((row: { sessionKey: string }) => row.sessionKey >= input.sessionKey)) {
    throw new Ref5ValidationError([
      "REF5 cannot insert an equal-time session before an already frozen stable key",
    ]);
  }
}

function readDomainSnapshot(snapshot: unknown): Ref5SessionSnapshot | null {
  const root = toRecord(snapshot);
  const ref5 = toRecord(root.ref5);
  const candidate = toRecord(ref5.domainSnapshot ?? ref5.snapshot ?? root.ref5Snapshot);
  if (
    String(candidate.protocolVersion ?? "") !== REF5_PROTOCOL_VERSION ||
    !String(candidate.snapshotId ?? "").trim()
  ) {
    return null;
  }
  return candidate as unknown as Ref5SessionSnapshot;
}

type RecentBodyweight = { count: number; averageKg: number | null };

async function readRecentBodyweight(
  tx: any,
  planId: string,
  actualStartAt: string,
  todayBodyweightKg: number,
): Promise<RecentBodyweight> {
  const upper = new Date(actualStartAt);
  const lower = new Date(upper.getTime() - 7 * 86_400_000);
  const rows = await tx
    .select({ snapshot: generatedSession.snapshot })
    .from(generatedSession)
    .where(
      and(
        eq(generatedSession.planId, planId),
        gte(generatedSession.scheduledAt, lower),
        lte(generatedSession.scheduledAt, upper),
      ),
    )
    .orderBy(asc(generatedSession.scheduledAt), asc(generatedSession.sessionKey));

  const measurements: number[] = [];
  for (const row of rows) {
    const domain = readDomainSnapshot(row.snapshot);
    const value = Number(domain?.startInput?.todayBodyweightKg);
    if (Number.isFinite(value) && value > 0) measurements.push(value);
  }
  // Today's explicit measurement participates in the 2/3 boundary.
  measurements.push(todayBodyweightKg);
  const averageKg =
    measurements.length > 0
      ? measurements.reduce((sum, value) => sum + value, 0) / measurements.length
      : null;
  return { count: measurements.length, averageKg };
}

function targetForLift(lift: string): "SQUAT" | "BENCH" | "PULL" | "DEADLIFT" | "OHP" {
  if (lift === "SQ") return "SQUAT";
  if (lift === "BP") return "BENCH";
  if (lift === "DL") return "DEADLIFT";
  return lift === "PULL" ? "PULL" : "OHP";
}

function toGeneratedSnapshot(input: {
  planId: string;
  planName: string;
  sessionKey: string;
  domain: Ref5SessionSnapshot;
  startEventId: string;
  runtimeRevisionAfter: number;
}) {
  const domain = input.domain;
  return {
    schemaVersion: 4,
    protocolVersion: REF5_PROTOCOL_VERSION,
    sessionKey: input.sessionKey,
    sessionDate: domain.calendarDate,
    timezone: domain.timeZone,
    actualStartAt: domain.actualStartAt,
    sessionType: domain.decision.sessionType,
    totalWorkingSets: domain.totalWorkingSets,
    plan: { id: input.planId, type: "SINGLE", name: input.planName },
    program: {
      slug: REF5_IDENTIFIERS.slug,
      name: REF5_IDENTIFIERS.displayName,
      type: "LOGIC",
      version: 1,
      kind: REF5_IDENTIFIERS.kind,
      family: REF5_IDENTIFIERS.family,
      protocolVersion: REF5_PROTOCOL_VERSION,
    },
    ref5: {
      protocolVersion: REF5_PROTOCOL_VERSION,
      snapshotId: domain.snapshotId,
      sessionId: domain.sessionId,
      actualStartAt: domain.actualStartAt,
      timezone: domain.timeZone,
      startEventId: input.startEventId,
      runtimeRevisionBefore: domain.runtimeRevision,
      runtimeRevisionAfter: input.runtimeRevisionAfter,
      decision: domain.decision,
      directStandardsKg: domain.directStandardsKg,
      derivedStandardsKg: domain.derivedStandardsKg,
      controlRefsKg: domain.controlRefsKg,
      auxiliaryCapsKg: domain.auxiliaryCapsKg,
      pullContext: domain.pullContext,
      omittedPrescriptions: domain.exercises
        .filter((exercise) => exercise.omitted)
        .map((exercise) => ({
          prescriptionId: exercise.prescriptionId,
          exerciseName: exercise.exerciseName,
          lift: exercise.lift,
          role: exercise.role,
          stream: exercise.stream,
          outcome: "INVALID" as const,
          reason: "EXTERNAL" as const,
          pull: exercise.pull ?? null,
        })),
      domainSnapshot: domain,
    },
    exercises: domain.exercises
      .filter((exercise) => !exercise.omitted)
      .map((exercise, exerciseIndex) => ({
        exerciseName: exercise.exerciseName,
        role: "MAIN" as const,
        rowType: "AUTO" as const,
        order: exerciseIndex,
        progressionTarget: targetForLift(exercise.lift),
        ref5: {
          protocolVersion: REF5_PROTOCOL_VERSION,
          snapshotId: domain.snapshotId,
          sessionId: domain.sessionId,
          prescriptionId: exercise.prescriptionId,
          lift: exercise.lift,
          role: exercise.role,
          stream: exercise.stream,
          progressionTargetKg: exercise.progressionTargetKg,
          omitted: false,
          pull: exercise.pull ?? null,
        },
        sets: exercise.sets.map((set) => ({
          reps: set.plannedReps,
          targetWeightKg: set.externalLoadKg,
          // Keep domain-native names alongside the generic workout snapshot fields;
          // the start preview must show PULL added load and today's actual total.
          plannedReps: set.plannedReps,
          externalLoadKg: set.externalLoadKg,
          totalLoadKg: set.totalLoadKg,
          note:
            exercise.lift === "PULL"
              ? `Total ${set.totalLoadKg} kg · added ${set.externalLoadKg} kg`
              : undefined,
          meta: {
            ref5: {
              protocolVersion: REF5_PROTOCOL_VERSION,
              snapshotId: domain.snapshotId,
              sessionId: domain.sessionId,
              prescriptionId: exercise.prescriptionId,
              stream: exercise.stream,
              role: exercise.role,
              setNumber: set.setNumber,
              plannedReps: set.plannedReps,
              externalLoadKg: set.externalLoadKg,
              totalLoadKg: set.totalLoadKg,
              pull: exercise.pull ?? null,
            },
          },
        })),
      })),
  };
}

async function calculateSnapshot(input: {
  tx: any;
  planRow: typeof plan.$inferSelect;
  runtimeState: Ref5RuntimeState;
  request: Ref5GenerateRequest & { actualStartAt: string; timezone: string };
}) {
  const recent = await readRecentBodyweight(
    input.tx,
    input.planRow.id,
    input.request.actualStartAt,
    input.request.todayBodyweightKg,
  );
  const sessionKey = ref5SessionKey(input.request.actualStartAt, input.request.startEventId);
  const domainInput: Ref5SessionInput = {
    sessionId: sessionKey,
    snapshotId: `${input.request.startEventId}:snapshot`,
    actualStartAt: input.request.actualStartAt,
    timeZone: input.request.timezone,
    todayBodyweightKg: input.request.todayBodyweightKg,
    recent7DayMeasurementCount: recent.count,
    recent7DayAverageKg: recent.averageKg,
    manualMicro: input.request.manualMicro,
    climbingWithin48h: input.request.climbingWithin48h,
    omitPullVolume: input.request.omitPullVolume,
  };
  const domain = generateRef5Session(input.runtimeState, domainInput);
  const start = applyRef5FirstSquatStart(
    input.runtimeState,
    domain,
    input.request.startEventId,
  );
  return { sessionKey, domain, start, recent };
}

export async function buildRef5PlanSession(
  input: Ref5PlanGenerationInput,
  persist: boolean,
) {
  if (!persist) {
    const planRows = await db.select().from(plan).where(eq(plan.id, input.planId)).limit(1);
    const planRow = planRows[0];
    if (!planRow) throw new Error("Plan not found");
    if (planRow.userId !== input.userId) throw new Error("Forbidden");
    if (!isRef5PlanParams(planRow.params)) throw new Error("Plan is not REF5");
    const request = normalizeRef5GenerationRequest(input, planRow.params);
    const sessionKey = ref5SessionKey(request.actualStartAt, request.startEventId);
    await assertRef5StableTieAppend({
      tx: db,
      planId: input.planId,
      actualStartAt: request.actualStartAt,
      sessionKey,
    });
    const historical = await deriveRef5StateBeforeStart({
      tx: db,
      userId: input.userId,
      planId: input.planId,
      actualStartAt: request.actualStartAt,
      sessionKey,
      // Preview is deliberately lock-free and write-free. Persist rechecks under
      // the per-plan transaction lock before freezing the snapshot.
      lockAlreadyHeld: true,
    });
    const calculated = await calculateSnapshot({
      tx: db,
      planRow,
      runtimeState: historical.state,
      request,
    });
    return {
      snapshot: toGeneratedSnapshot({
        planId: planRow.id,
        planName: planRow.name,
        sessionKey: calculated.sessionKey,
        domain: calculated.domain,
        startEventId: request.startEventId,
        runtimeRevisionAfter: calculated.start.nextState.revision,
      }),
    };
  }

  return db.transaction(async (tx) => {
    await acquireActiveAccountMutationLock(tx, input.userId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.planId}))`);
    const planRows = await tx.select().from(plan).where(eq(plan.id, input.planId)).limit(1);
    const planRow = planRows[0];
    if (!planRow) throw new Error("Plan not found");
    if (planRow.userId !== input.userId) throw new Error("Forbidden");
    if (!isRef5PlanParams(planRow.params)) throw new Error("Plan is not REF5");
    const request = normalizeRef5GenerationRequest(input, planRow.params);
    const sessionKey = ref5SessionKey(request.actualStartAt, request.startEventId);
    const existingRows = await tx
      .select()
      .from(generatedSession)
      .where(
        and(
          eq(generatedSession.planId, planRow.id),
          eq(generatedSession.sessionKey, sessionKey),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      const existingRef5 = toRecord(toRecord(existing.snapshot).ref5);
      const existingDomain = readDomainSnapshot(existing.snapshot);
      if (
        String(existingRef5.startEventId ?? "") !== request.startEventId ||
        existingDomain?.actualStartAt !== request.actualStartAt ||
        existingDomain?.timeZone !== request.timezone ||
        Number(existingDomain?.startInput?.todayBodyweightKg) !== request.todayBodyweightKg ||
        existingDomain?.startInput?.manualMicro !== request.manualMicro ||
        existingDomain?.startInput?.climbingWithin48h !== request.climbingWithin48h ||
        (existingDomain?.startInput?.omitPullVolume === true) !== (request.omitPullVolume === true)
      ) {
        throw new Ref5ValidationError(["REF5 start retry contradicts the immutable snapshot"]);
      }
      return existing;
    }

    await assertRef5StableTieAppend({
      tx,
      planId: planRow.id,
      actualStartAt: request.actualStartAt,
      sessionKey,
    });

    const reusedStartEventRows = await tx
      .select({ id: generatedSession.id })
      .from(generatedSession)
      .where(
        and(
          eq(generatedSession.planId, planRow.id),
          sql`${generatedSession.snapshot} -> 'ref5' ->> 'startEventId' = ${request.startEventId}`,
        ),
      )
      .limit(1);
    if (reusedStartEventRows[0]) {
      throw new Ref5ValidationError([
        "REF5 start event ID is already bound to another immutable session",
      ]);
    }

    const historical = await deriveRef5StateBeforeStart({
      tx,
      userId: input.userId,
      planId: planRow.id,
      actualStartAt: request.actualStartAt,
      sessionKey,
      lockAlreadyHeld: true,
    });
    const calculated = await calculateSnapshot({
      tx,
      planRow,
      runtimeState: historical.state,
      request,
    });
    if (!calculated.start.applied) {
      throw new Ref5ValidationError(["REF5 first-squat start event could not be applied"]);
    }
    const snapshot = toGeneratedSnapshot({
      planId: planRow.id,
      planName: planRow.name,
      sessionKey: calculated.sessionKey,
      domain: calculated.domain,
      startEventId: request.startEventId,
      runtimeRevisionAfter: calculated.start.nextState.revision,
    });
    const [saved] = await tx
      .insert(generatedSession)
      .values({
        planId: planRow.id,
        userId: input.userId,
        sessionKey: calculated.sessionKey,
        scheduledAt: new Date(request.actualStartAt),
        snapshot,
      })
      .onConflictDoNothing({
        target: [generatedSession.planId, generatedSession.sessionKey],
      })
      .returning();
    if (!saved) throw new Ref5ValidationError(["REF5 session start conflicted unexpectedly"]);

    await rebuildRef5ProgressionForPlan({
      tx,
      userId: input.userId,
      planId: planRow.id,
      lockAlreadyHeld: true,
    });

    return saved;
  });
}

export function extractRef5DomainSnapshot(snapshot: unknown) {
  return readDomainSnapshot(snapshot);
}
