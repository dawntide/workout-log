import { and, desc, eq } from "drizzle-orm";
import type { ProgressionSummaryPayload, ProgressionTargetDecisionPayload } from "@workout/core/progression/summary";
import { planProgressEvent } from "@/server/db/schema";

type ProgressionEventRow = {
  id: string;
  eventType: string;
  programSlug: string;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  meta: unknown;
  createdAt: Date;
};

type ApplyResultLike = {
  applied?: unknown;
  reason?: unknown;
  eventType?: unknown;
  programSlug?: unknown;
} | null;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTargetDecision(value: unknown): ProgressionTargetDecisionPayload | null {
  const raw = asRecord(value);
  const target = String(raw.target ?? "").trim();
  if (!target) return null;
  const outcome = String(raw.outcome ?? "").toUpperCase() === "FAIL" ? "FAIL" : "SUCCESS";
  const eventTypeRaw = String(raw.eventType ?? "").toUpperCase();
  const eventType = eventTypeRaw === "INCREASE" || eventTypeRaw === "RESET" || eventTypeRaw === "HOLD" ? eventTypeRaw : "HOLD";
  const reason = String(raw.reason ?? "").trim() || "unknown";
  const before = asRecord(raw.before);
  const after = asRecord(raw.after);
  const beforeWorkKg = toFiniteNumber(before.workKg);
  const afterWorkKg = toFiniteNumber(after.workKg);
  const deltaWorkKg =
    beforeWorkKg === null || afterWorkKg === null ? null : Number((afterWorkKg - beforeWorkKg).toFixed(2));

  return {
    target,
    outcome,
    eventType,
    reason,
    beforeWorkKg,
    afterWorkKg,
    deltaWorkKg,
  };
}

function toEventPayload(row: ProgressionEventRow | null) {
  if (!row) return null;
  const meta = asRecord(row.meta);
  const targetDecisionsRaw = Array.isArray(meta.targetDecisions) ? meta.targetDecisions : [];
  const targetDecisions = targetDecisionsRaw
    .map((decision) => toTargetDecision(decision))
    .filter((decision): decision is ProgressionTargetDecisionPayload => Boolean(decision));

  return {
    id: row.id,
    eventType: row.eventType,
    programSlug: row.programSlug,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    didAdvanceSession: meta.didAdvanceSession === true,
    targetDecisions,
    beforeState: asRecord(row.beforeState),
    afterState: asRecord(row.afterState),
  };
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export async function readProgressEventByLog(input: {
  tx: any;
  planId: string | null | undefined;
  logId: string;
}) {
  const planId = typeof input.planId === "string" ? input.planId.trim() : "";
  if (!planId) return null;
  const rows = await input.tx
    .select({
      id: planProgressEvent.id,
      eventType: planProgressEvent.eventType,
      programSlug: planProgressEvent.programSlug,
      reason: planProgressEvent.reason,
      beforeState: planProgressEvent.beforeState,
      afterState: planProgressEvent.afterState,
      meta: planProgressEvent.meta,
      createdAt: planProgressEvent.createdAt,
    })
    .from(planProgressEvent)
    .where(and(eq(planProgressEvent.planId, planId), eq(planProgressEvent.logId, input.logId)))
    .orderBy(desc(planProgressEvent.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export function buildProgressionSummary(input: {
  mode: "upsert" | "replay";
  applyResult?: ApplyResultLike;
  eventRow?: ProgressionEventRow | null;
}): ProgressionSummaryPayload {
  const applyResult = input.applyResult ?? null;
  const event = toEventPayload(input.eventRow ?? null);
  const appliedFromResult = pickBoolean((applyResult as Record<string, unknown> | null)?.applied);
  const reasonFromResult = pickString((applyResult as Record<string, unknown> | null)?.reason);
  const eventTypeFromResult = pickString((applyResult as Record<string, unknown> | null)?.eventType);
  const programSlugFromResult = pickString((applyResult as Record<string, unknown> | null)?.programSlug);
  const replayApplied = input.mode === "replay" && reasonFromResult === "replay:updated";

  return {
    mode: input.mode,
    applied: appliedFromResult ?? Boolean(event),
    replayApplied,
    reason: reasonFromResult ?? event?.reason ?? null,
    eventType: eventTypeFromResult ?? event?.eventType ?? null,
    programSlug: programSlugFromResult ?? event?.programSlug ?? null,
    event,
  };
}
