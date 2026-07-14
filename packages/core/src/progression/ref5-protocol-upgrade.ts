import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { acquireActiveAccountMutationLock } from "@workout/core/auth/account-lifecycle";
import { db } from "@workout/core/db/client";
import {
  generatedSession,
  plan,
  planProgressEvent,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
} from "@workout/core/db/schema";
import {
  REF5_IDENTIFIERS,
  REF5_LEGACY_PROTOCOL_VERSION,
  REF5_LEGACY_RUNTIME_SCHEMA_VERSION,
  REF5_PROGRAM_VERSION,
  REF5_PROTOCOL_VERSION,
  REF5_RUNTIME_SCHEMA_VERSION,
  createInitialRef5LegacyV11State,
  generateRef5Session,
  upgradeRef5RuntimeStateV11ToV12,
  type Ref5ProtocolUpgradeMetadata,
  type Ref5RuntimeState,
} from "@workout/core/program-engine/ref5";
import {
  extractRef5DomainSnapshot,
  ref5SessionKey,
  toRef5GeneratedSnapshot,
} from "@workout/core/program-engine/ref5-integration";
import {
  REF5_LEGACY_PROGRESSION_ENGINE_VERSION,
  REF5_PROGRESSION_ENGINE_VERSION_V12,
  acquireRef5PlanLock,
  decodeRef5RuntimeState,
  isRef5PlanParameters,
  readRef5PlanProtocolVersion,
  rebuildRef5ProgressionForPlan,
} from "./ref5-auto-progression";

type Ref5UpgradeBlocker =
  | "started-v1.1-session-incomplete"
  | "missing-v1.2-program-version"
  | "missing-or-unverified-protocol-version"
  | "invalid-or-unmarked-v1.1-snapshot"
  | "missing-or-invalid-runtime-revision"
  | "unsupported-runtime-version";

export type Ref5PlanUpgradeInspection = {
  planId: string;
  active: boolean;
  protocolVersion: string | null;
  generatedV11Count: number;
  startEffectV11Count: number;
  noStartEffectV11Count: number;
  completedV11Count: number;
  startedIncompleteV11Count: number;
  progressEventV11Count: number;
  blocker: Ref5UpgradeBlocker | null;
};

export type Ref5ProtocolUpgradeReport = {
  dryRun: boolean;
  programVersions: { v11: number; v12: number };
  totals: {
    plans: number;
    targetPlans: number;
    blockedPlans: number;
    generatedV11: number;
    startEffectsV11: number;
    noStartEffectsV11: number;
    completedV11: number;
    startedIncompleteV11: number;
    progressEventsV11: number;
    upgradedPlans: number;
    replacementSessions: number;
  };
  plans: Ref5PlanUpgradeInspection[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

const REMOVED_KEYS = new Set([
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

function cloneWithoutRemovedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneWithoutRemovedFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REMOVED_KEYS.has(key))
      .map(([key, child]) => [key, cloneWithoutRemovedFields(child)]),
  );
}

function upgradedPlanParams(
  params: unknown,
  metadata: Ref5ProtocolUpgradeMetadata,
): Record<string, unknown> {
  const next = cloneWithoutRemovedFields(params) as Record<string, unknown>;
  const ref5 = asRecord(next.ref5);
  next.programFamily = REF5_IDENTIFIERS.family;
  next.protocolVersion = REF5_PROTOCOL_VERSION;
  next.ref5 = {
    ...ref5,
    schemaVersion: REF5_RUNTIME_SCHEMA_VERSION,
    protocolVersion: REF5_PROTOCOL_VERSION,
    protocolUpgrade: { ...metadata },
  };
  return next;
}

function runtimeStartIds(value: unknown): Set<string> {
  const ids = asRecord(value).appliedStartEventIds;
  return new Set(
    Array.isArray(ids)
      ? ids.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
      : [],
  );
}

function snapshotStartEventId(value: unknown): string | null {
  const id = String(asRecord(asRecord(value).ref5).startEventId ?? "").trim();
  return id || null;
}

async function findRef5ProgramVersions(dbi: any) {
  const rows = await dbi
    .select({ id: programVersion.id, version: programVersion.version, definition: programVersion.definition })
    .from(programVersion)
    .innerJoin(programTemplate, eq(programVersion.templateId, programTemplate.id))
    .where(eq(programTemplate.slug, REF5_IDENTIFIERS.slug))
    .orderBy(asc(programVersion.version));
  const v11 = rows.filter(
    (row: { definition: unknown }) =>
      String(asRecord(row.definition).protocolVersion ?? "") === REF5_LEGACY_PROTOCOL_VERSION,
  );
  const v12 = rows.filter(
    (row: { definition: unknown }) =>
      String(asRecord(row.definition).protocolVersion ?? "") === REF5_PROTOCOL_VERSION,
  );
  return { rows, v11, v12, current: v12.find((row: { version: number }) => row.version === REF5_PROGRAM_VERSION) ?? v12.at(-1) ?? null };
}

async function loadCandidatePlans(
  dbi: any,
  ref5VersionIds: string[],
  planIds?: readonly string[],
) {
  const paramsMatch = or(
    sql`lower(coalesce(${plan.params} ->> 'programFamily', '')) = 'ref5'`,
    sql`jsonb_typeof(${plan.params} -> 'ref5') = 'object'`,
  );
  const rows = await dbi
    .select({
      id: plan.id,
      userId: plan.userId,
      name: plan.name,
      params: plan.params,
      isArchived: plan.isArchived,
      rootProgramVersionId: plan.rootProgramVersionId,
    })
    .from(plan)
    .where(
      ref5VersionIds.length > 0
        ? or(paramsMatch, inArray(plan.rootProgramVersionId, ref5VersionIds))
        : paramsMatch,
    );
  const knownVersions = new Set(ref5VersionIds);
  const targetIds = planIds ? new Set(planIds) : null;
  return rows.filter(
    (row: { id: string; params: unknown; rootProgramVersionId: string | null }) =>
      (!targetIds || targetIds.has(row.id)) &&
      (isRef5PlanParameters(row.params) ||
        Boolean(row.rootProgramVersionId && knownVersions.has(row.rootProgramVersionId))),
  );
}

async function inspectPlan(dbi: any, row: any, hasV12: boolean): Promise<Ref5PlanUpgradeInspection> {
  const [sessions, startRows, runtimeRows, progressRows] = await Promise.all([
    dbi
      .select({ id: generatedSession.id, snapshot: generatedSession.snapshot })
      .from(generatedSession)
      .where(eq(generatedSession.planId, row.id)),
    dbi
      .select({ meta: planProgressEvent.meta })
      .from(planProgressEvent)
      .where(
        and(
          eq(planProgressEvent.planId, row.id),
          eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
          eq(planProgressEvent.eventType, "REF5_START"),
        ),
      ),
    dbi
      .select({ state: planRuntimeState.state, engineVersion: planRuntimeState.engineVersion })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, row.id))
      .limit(1),
    dbi
      .select({ meta: planProgressEvent.meta })
      .from(planProgressEvent)
      .where(
        and(
          eq(planProgressEvent.planId, row.id),
          eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
        ),
      ),
  ]);
  let hasInvalidRef5Snapshot = false;
  const v11Sessions = sessions.filter((session: { snapshot: unknown }) => {
    try {
      const domain = extractRef5DomainSnapshot(session.snapshot);
      if (!domain) {
        hasInvalidRef5Snapshot = true;
        return false;
      }
      return domain.protocolVersion === REF5_LEGACY_PROTOCOL_VERSION;
    } catch {
      hasInvalidRef5Snapshot = true;
      return false;
    }
  });
  const v11Ids = v11Sessions.map((session: { id: string }) => session.id);
  const logs = v11Ids.length
    ? await dbi
        .select({ generatedSessionId: workoutLog.generatedSessionId })
        .from(workoutLog)
        .where(inArray(workoutLog.generatedSessionId, v11Ids))
    : [];
  const loggedSessionIds = new Set(
    logs
      .map((log: { generatedSessionId: string | null }) => log.generatedSessionId)
      .filter((id: string | null): id is string => Boolean(id)),
  );
  const startIds = runtimeStartIds(runtimeRows[0]?.state);
  for (const startRow of startRows) {
    const id = String(asRecord(startRow.meta).startEventId ?? "").trim();
    if (id) startIds.add(id);
  }
  let startEffectV11Count = 0;
  let completedV11Count = 0;
  let startedIncompleteV11Count = 0;
  for (const session of v11Sessions) {
    const startId = snapshotStartEventId(session.snapshot);
    const completed = loggedSessionIds.has(session.id);
    const started = completed || Boolean(startId && startIds.has(startId));
    if (started) startEffectV11Count += 1;
    if (completed) completedV11Count += 1;
    if (started && !completed) startedIncompleteV11Count += 1;
  }
  const protocolVersion = readRef5PlanProtocolVersion(row.params);
  let blocker: Ref5UpgradeBlocker | null = null;
  if (hasInvalidRef5Snapshot) blocker = "invalid-or-unmarked-v1.1-snapshot";
  else if (!protocolVersion) blocker = "missing-or-unverified-protocol-version";
  else if (!hasV12) blocker = "missing-v1.2-program-version";
  else if (startedIncompleteV11Count > 0) blocker = "started-v1.1-session-incomplete";
  if (!blocker && protocolVersion === REF5_LEGACY_PROTOCOL_VERSION && runtimeRows[0]) {
    try {
      const runtime = decodeRef5RuntimeState(runtimeRows[0].state);
      if (
        !runtime ||
        runtime.protocolVersion !== REF5_LEGACY_PROTOCOL_VERSION ||
        runtime.schemaVersion !== REF5_LEGACY_RUNTIME_SCHEMA_VERSION ||
        runtimeRows[0].engineVersion !== REF5_LEGACY_PROGRESSION_ENGINE_VERSION
      ) {
        blocker = "unsupported-runtime-version";
      }
    } catch {
      blocker = "missing-or-invalid-runtime-revision";
    }
  }
  const progressEventV11Count = progressRows.filter(
    (event: { meta: unknown }) =>
      String(asRecord(event.meta).protocolVersion ?? "") === REF5_LEGACY_PROTOCOL_VERSION,
  ).length;
  return {
    planId: row.id,
    active: !row.isArchived,
    protocolVersion,
    generatedV11Count: v11Sessions.length,
    startEffectV11Count,
    noStartEffectV11Count: v11Sessions.length - startEffectV11Count,
    completedV11Count,
    startedIncompleteV11Count,
    progressEventV11Count,
    blocker,
  };
}

function emptyTotals(): Ref5ProtocolUpgradeReport["totals"] {
  return {
    plans: 0,
    targetPlans: 0,
    blockedPlans: 0,
    generatedV11: 0,
    startEffectsV11: 0,
    noStartEffectsV11: 0,
    completedV11: 0,
    startedIncompleteV11: 0,
    progressEventsV11: 0,
    upgradedPlans: 0,
    replacementSessions: 0,
  };
}

function aggregateReport(
  dryRun: boolean,
  versions: { v11: unknown[]; v12: unknown[] },
  plans: Ref5PlanUpgradeInspection[],
): Ref5ProtocolUpgradeReport {
  const totals = emptyTotals();
  totals.plans = plans.length;
  for (const item of plans) {
    const target = item.active && item.protocolVersion === REF5_LEGACY_PROTOCOL_VERSION;
    if (target) totals.targetPlans += 1;
    if (item.active && item.blocker) totals.blockedPlans += 1;
    totals.generatedV11 += item.generatedV11Count;
    totals.startEffectsV11 += item.startEffectV11Count;
    totals.noStartEffectsV11 += item.noStartEffectV11Count;
    totals.completedV11 += item.completedV11Count;
    totals.startedIncompleteV11 += item.startedIncompleteV11Count;
    totals.progressEventsV11 += item.progressEventV11Count;
  }
  return {
    dryRun,
    programVersions: { v11: versions.v11.length, v12: versions.v12.length },
    totals,
    plans,
  };
}

export async function inspectRef5ProtocolUpgrade(
  dbi: any = db,
  options: { planIds?: readonly string[] } = {},
): Promise<Ref5ProtocolUpgradeReport> {
  const versions = await findRef5ProgramVersions(dbi);
  const candidates = await loadCandidatePlans(
    dbi,
    versions.rows.map((row: { id: string }) => row.id),
    options.planIds,
  );
  const plans = await Promise.all(
    candidates.map((row: any) => inspectPlan(dbi, row, Boolean(versions.current))),
  );
  return aggregateReport(true, versions, plans);
}

function replacementStartAt(original: string, transitionedAt: string, index: number): string {
  const originalMs = Date.parse(original);
  const boundaryMs = Date.parse(transitionedAt) + index + 1;
  return new Date(Math.max(Number.isFinite(originalMs) ? originalMs : 0, boundaryMs)).toISOString();
}

async function applyPlanUpgrade(input: {
  planId: string;
  transitionedAt: string;
  currentProgramVersionId: string;
}) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(plan).where(eq(plan.id, input.planId)).limit(1);
    const planRow = rows[0];
    if (!planRow || planRow.isArchived) return { upgraded: false, replacements: 0 };
    await acquireActiveAccountMutationLock(tx, planRow.userId);
    await acquireRef5PlanLock(tx, planRow.id);
    const protocolVersion = readRef5PlanProtocolVersion(planRow.params);
    if (protocolVersion === REF5_PROTOCOL_VERSION) return { upgraded: false, replacements: 0 };
    if (protocolVersion !== REF5_LEGACY_PROTOCOL_VERSION) {
      throw new Error(`REF5 plan ${planRow.id} has unsupported protocolVersion`);
    }
    const inspection = await inspectPlan(tx, planRow, true);
    if (inspection.startedIncompleteV11Count > 0) {
      throw new Error(`REF5 plan ${planRow.id} has a started incomplete v1.1 session`);
    }
    const stableKey = `ref5-protocol-upgrade:${planRow.id}:1.1:1.2`;
    const existingUpgrade = await tx
      .select({ id: planProgressEvent.id })
      .from(planProgressEvent)
      .where(
        and(
          eq(planProgressEvent.planId, planRow.id),
          eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
          eq(planProgressEvent.eventType, "REF5_PROTOCOL_UPGRADE"),
          sql`${planProgressEvent.meta} ->> 'stableKey' = ${stableKey}`,
        ),
      )
      .limit(1);
    if (existingUpgrade[0]) return { upgraded: false, replacements: 0 };

    let runtimeRows = await tx
      .select({ id: planRuntimeState.id, state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, planRow.id))
      .limit(1);
    if (!runtimeRows[0] && inspection.startEffectV11Count > 0) {
      await rebuildRef5ProgressionForPlan({
        tx,
        userId: planRow.userId,
        planId: planRow.id,
        lockAlreadyHeld: true,
      });
      runtimeRows = await tx
        .select({ id: planRuntimeState.id, state: planRuntimeState.state })
        .from(planRuntimeState)
        .where(eq(planRuntimeState.planId, planRow.id))
        .limit(1);
    }
    const priorState = runtimeRows[0]
      ? (cloneJson(runtimeRows[0].state) as Ref5RuntimeState)
      : createInitialRef5LegacyV11State();
    if (
      priorState.protocolVersion !== REF5_LEGACY_PROTOCOL_VERSION ||
      priorState.schemaVersion !== REF5_LEGACY_RUNTIME_SCHEMA_VERSION ||
      !Number.isInteger(priorState.revision)
    ) {
      throw new Error(`REF5 plan ${planRow.id} has an unsupported runtime version`);
    }
    const metadata: Ref5ProtocolUpgradeMetadata = {
      stableKey,
      fromProtocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
      toProtocolVersion: REF5_PROTOCOL_VERSION,
      transitionedAt: input.transitionedAt,
    };
    const upgradedState = upgradeRef5RuntimeStateV11ToV12(priorState, metadata);

    if (runtimeRows[0]) {
      const updated = await tx
        .update(planRuntimeState)
        .set({
          engineVersion: REF5_PROGRESSION_ENGINE_VERSION_V12,
          state: upgradedState,
          updatedAt: new Date(input.transitionedAt),
        })
        .where(
          and(
            eq(planRuntimeState.id, runtimeRows[0].id),
            sql`(${planRuntimeState.state} ->> 'revision')::integer = ${priorState.revision}`,
            eq(planRuntimeState.engineVersion, REF5_LEGACY_PROGRESSION_ENGINE_VERSION),
          ),
        )
        .returning({ id: planRuntimeState.id });
      if (!updated[0]) throw new Error(`REF5 plan ${planRow.id} runtime CAS failed`);
    } else {
      const inserted = await tx
        .insert(planRuntimeState)
        .values({
          planId: planRow.id,
          userId: planRow.userId,
          engineVersion: REF5_PROGRESSION_ENGINE_VERSION_V12,
          state: upgradedState,
        })
        .onConflictDoNothing({ target: planRuntimeState.planId })
        .returning({ id: planRuntimeState.id });
      if (!inserted[0]) throw new Error(`REF5 plan ${planRow.id} runtime initialization CAS failed`);
    }

    await tx.insert(planProgressEvent).values({
      planId: planRow.id,
      logId: null,
      userId: planRow.userId,
      eventType: "REF5_PROTOCOL_UPGRADE",
      programSlug: REF5_IDENTIFIERS.slug,
      reason: "protocol:1.1->1.2",
      beforeState: priorState,
      afterState: upgradedState,
      meta: {
        ...metadata,
        engineVersionBefore: REF5_LEGACY_PROGRESSION_ENGINE_VERSION,
        engineVersionAfter: REF5_PROGRESSION_ENGINE_VERSION_V12,
        revisionBefore: priorState.revision,
        revisionAfter: upgradedState.revision,
      },
      createdAt: new Date(input.transitionedAt),
    });

    const updatedPlan = await tx
      .update(plan)
      .set({
        rootProgramVersionId: input.currentProgramVersionId,
        params: upgradedPlanParams(planRow.params, metadata),
        updatedAt: new Date(input.transitionedAt),
      })
      .where(
        and(
          eq(plan.id, planRow.id),
          sql`${plan.rootProgramVersionId} is not distinct from ${planRow.rootProgramVersionId}`,
          sql`${plan.params} = ${JSON.stringify(planRow.params)}::jsonb`,
        ),
      )
      .returning({ id: plan.id });
    if (!updatedPlan[0]) throw new Error(`REF5 plan ${planRow.id} version/params CAS failed`);

    const sessionRows = await tx
      .select({ id: generatedSession.id, snapshot: generatedSession.snapshot })
      .from(generatedSession)
      .where(eq(generatedSession.planId, planRow.id));
    const legacySessions = sessionRows.flatMap((session) => {
      const domain = extractRef5DomainSnapshot(session.snapshot);
      return domain?.protocolVersion === REF5_LEGACY_PROTOCOL_VERSION
        ? [{ ...session, domain }]
        : [];
    });
    const legacySessionIds = legacySessions.map((session) => session.id);
    const [persistedStartRows, persistedLogs] = await Promise.all([
      tx
        .select({ meta: planProgressEvent.meta })
        .from(planProgressEvent)
        .where(
          and(
            eq(planProgressEvent.planId, planRow.id),
            eq(planProgressEvent.programSlug, REF5_IDENTIFIERS.slug),
            eq(planProgressEvent.eventType, "REF5_START"),
          ),
        ),
      legacySessionIds.length > 0
        ? tx
            .select({ generatedSessionId: workoutLog.generatedSessionId })
            .from(workoutLog)
            .where(inArray(workoutLog.generatedSessionId, legacySessionIds))
        : Promise.resolve([]),
    ]);
    const startIds = runtimeStartIds(priorState);
    for (const startRow of persistedStartRows) {
      const startId = String(asRecord(startRow.meta).startEventId ?? "").trim();
      if (startId) startIds.add(startId);
    }
    const loggedSessionIds = new Set(
      persistedLogs
        .map((row: { generatedSessionId: string | null }) => row.generatedSessionId)
        .filter((id: string | null): id is string => Boolean(id)),
    );
    const legacyUnstarted = legacySessions.filter((session) => {
      const startId = snapshotStartEventId(session.snapshot);
      return !loggedSessionIds.has(session.id) && (!startId || !startIds.has(startId));
    });
    const legacyIds = legacyUnstarted.map((session) => session.id);
    if (legacyIds.length > 0) {
      await tx
        .update(generatedSession)
        .set({ status: "SKIPPED", updatedAt: new Date(input.transitionedAt) })
        .where(inArray(generatedSession.id, legacyIds));
    }
    let replacements = 0;
    for (let index = 0; index < legacyUnstarted.length; index += 1) {
      const old = legacyUnstarted[index]!;
      const legacy = old.domain;
      const actualStartAt = replacementStartAt(legacy.actualStartAt, input.transitionedAt, index);
      const startEventId = `upgrade-${old.id}`;
      const sessionKey = ref5SessionKey(actualStartAt, startEventId);
      const domain = generateRef5Session(upgradedState, {
        sessionId: sessionKey,
        snapshotId: `${startEventId}:snapshot`,
        actualStartAt,
        timeZone: legacy.timeZone,
        todayBodyweightKg: legacy.startInput.todayBodyweightKg,
        recent7DayMeasurementCount: legacy.startInput.recent7DayMeasurementCount,
        recent7DayAverageKg: legacy.startInput.recent7DayAverageKg,
        manualMicro: legacy.startInput.manualMicro,
      });
      const snapshot = toRef5GeneratedSnapshot({
        planId: planRow.id,
        planName: planRow.name,
        sessionKey,
        domain,
        startEventId,
        runtimeRevisionAfter: upgradedState.revision + 1,
        startCommitted: false,
      });
      const inserted = await tx
        .insert(generatedSession)
        .values({
          planId: planRow.id,
          userId: planRow.userId,
          sessionKey,
          scheduledAt: new Date(actualStartAt),
          status: "PLANNED",
          snapshot,
        })
        .onConflictDoNothing({
          target: [generatedSession.planId, generatedSession.sessionKey],
        })
        .returning({ id: generatedSession.id });
      if (inserted[0]) replacements += 1;
    }
    return { upgraded: true, replacements };
  });
}

export async function upgradeRef5PlansToV12(input: {
  dryRun?: boolean;
  transitionedAt?: string;
  planIds?: readonly string[];
} = {}): Promise<Ref5ProtocolUpgradeReport> {
  const initial = await inspectRef5ProtocolUpgrade(db, { planIds: input.planIds });
  if (input.dryRun !== false) return initial;
  const versions = await findRef5ProgramVersions(db);
  if (!versions.current) return initial;
  const transitionedAt = input.transitionedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(transitionedAt))) throw new Error("Invalid REF5 transition timestamp");
  for (const item of initial.plans) {
    if (
      !item.active ||
      item.protocolVersion !== REF5_LEGACY_PROTOCOL_VERSION ||
      item.blocker
    ) {
      continue;
    }
    const result = await applyPlanUpgrade({
      planId: item.planId,
      transitionedAt,
      currentProgramVersionId: versions.current.id,
    });
    if (result.upgraded) initial.totals.upgradedPlans += 1;
    initial.totals.replacementSessions += result.replacements;
  }
  initial.dryRun = false;
  return initial;
}
