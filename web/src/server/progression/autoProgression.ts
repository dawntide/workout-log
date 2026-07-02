import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import {
  plan as planTable,
  planProgressEvent,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
  workoutSet,
} from "@/server/db/schema";
import {
  LoggedSetInput,
  ProgressionEventType,
  ProgressionProgram,
  ProgressionRuntimeState,
  reduceProgressionState,
  resolveAutoProgressionProgram,
} from "./reducer";

const AUTO_PROGRESSION_ENGINE_VERSION = 1;

export type ProgressionTargetDecisionMode = "hold" | "increase" | "reset";

export type ProgressionTargetDecision = {
  mode: ProgressionTargetDecisionMode;
  workKg: number;
};

type ApplyAutoProgressionInput = {
  tx: any;
  userId: string;
  planId: string | null | undefined;
  logId: string;
  sets: unknown[];
  mode?: "upsert" | "replay";
  progressionTargetDecisions?: Record<string, ProgressionTargetDecision> | null;
};

function snapTo2p5(value: number) {
  return Math.max(0, Math.round(value / 2.5) * 2.5);
}

function readDecision(
  decisions: Record<string, ProgressionTargetDecision> | null | undefined,
  key: string,
  target: string,
): ProgressionTargetDecision | null {
  if (!decisions) return null;
  const byKey = decisions[key];
  if (byKey && Number.isFinite(byKey.workKg) && byKey.workKg >= 0) {
    return { mode: byKey.mode, workKg: snapTo2p5(byKey.workKg) };
  }
  const byTarget = decisions[target];
  if (byTarget && Number.isFinite(byTarget.workKg) && byTarget.workKg >= 0) {
    return { mode: byTarget.mode, workKg: snapTo2p5(byTarget.workKg) };
  }
  return null;
}

function pickAggregateEventType(
  decisions: Record<string, ProgressionTargetDecision>,
): "INCREASE" | "HOLD" | "RESET" {
  const counts = { increase: 0, hold: 0, reset: 0 };
  for (const d of Object.values(decisions)) {
    counts[d.mode] += 1;
  }
  // 다수결 → 동률이면 보수적 우선순위: reset > hold > increase
  const max = Math.max(counts.increase, counts.hold, counts.reset);
  if (counts.reset === max) return "RESET";
  if (counts.hold === max) return "HOLD";
  return "INCREASE";
}

// 저장된 progress_event.meta.targetDecisionsOverride를 사용자 결정 맵으로 복원.
// rebuild/replay가 과거 이벤트를 재계산할 때, 그 로그에서 사용자가 직접 고른
// 증감량 결정을 잃지 않도록 영속화된 결정을 다시 읽어 온다.
export function readStoredDecisionsFromMeta(
  meta: unknown,
): Record<string, ProgressionTargetDecision> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).targetDecisionsOverride;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, ProgressionTargetDecision> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const trimmedKey = String(key).trim();
    if (!trimmedKey || !value || typeof value !== "object") continue;
    const entry = value as { mode?: unknown; workKg?: unknown };
    const mode =
      entry.mode === "hold" || entry.mode === "increase" || entry.mode === "reset"
        ? entry.mode
        : null;
    if (!mode) continue;
    const workKg = typeof entry.workKg === "number" ? entry.workKg : Number(entry.workKg);
    if (!Number.isFinite(workKg) || workKg < 0) continue;
    out[trimmedKey] = { mode, workKg: snapTo2p5(workKg) };
  }
  return Object.keys(out).length > 0 ? out : null;
}

type AppliedProgression = {
  nextState: ProgressionRuntimeState;
  eventType: ProgressionEventType;
  reason: string;
  appliedDecisions: Record<string, ProgressionTargetDecision>;
};

// reducer가 계산한 기본 진행 결과 위에, 사용자가 운동별로 고른 절대 workKg 결정을
// 덮어쓴다. 키가 매칭되는 타겟만 override하고 그 외는 reducer 기본값을 유지한다.
// decisions가 없거나 매칭이 하나도 없으면 reducer 결과를 그대로 돌려준다.
export function applyTargetDecisionsToReduced(
  reduced: ReturnType<typeof reduceProgressionState>,
  decisions: Record<string, ProgressionTargetDecision> | null,
): AppliedProgression {
  const appliedDecisions: Record<string, ProgressionTargetDecision> = {};
  if (!decisions) {
    return {
      nextState: reduced.nextState,
      eventType: reduced.eventType,
      reason: reduced.reason,
      appliedDecisions,
    };
  }

  const nextTargets = { ...reduced.nextState.targets };
  for (const key of Object.keys(nextTargets)) {
    const target = nextTargets[key];
    if (!target) continue;
    const decision = readDecision(decisions, key, target.progressionTarget);
    if (!decision) continue;
    nextTargets[key] = {
      ...target,
      workKg: decision.workKg,
      successStreak: 0,
      failureStreak: 0,
    };
    appliedDecisions[key] = decision;
  }

  if (Object.keys(appliedDecisions).length === 0) {
    return {
      nextState: reduced.nextState,
      eventType: reduced.eventType,
      reason: reduced.reason,
      appliedDecisions,
    };
  }

  const eventType = pickAggregateEventType(appliedDecisions);
  return {
    nextState: { ...reduced.nextState, targets: nextTargets },
    eventType,
    reason: `override:per-target:${eventType.toLowerCase()}`,
    appliedDecisions,
  };
}

// progress_event.meta 합성 — reducer 기본 meta + (있으면) 사용자 override 결정.
export function buildProgressionEventMeta(
  reduced: ReturnType<typeof reduceProgressionState>,
  appliedDecisions: Record<string, ProgressionTargetDecision>,
) {
  return {
    ...toProgressionEventMeta(reduced),
    ...(Object.keys(appliedDecisions).length > 0
      ? { targetDecisionsOverride: appliedDecisions }
      : {}),
  };
}

type ResolvedAutoProgressionContext =
  | {
      ok: true;
      planId: string;
      userId: string;
      params: Record<string, unknown>;
      templateSlug: string;
      progressionProgram: ProgressionProgram;
    }
  | {
      ok: false;
      reason:
        | "skip:no-plan"
        | "skip:forbidden-plan"
        | "skip:disabled"
        | "skip:no-root-program"
        | "skip:version-missing"
        | "skip:template-missing"
        | "skip:unsupported-program";
    };

function toLoggedSetRows(sets: unknown[]): LoggedSetInput[] {
  const out: LoggedSetInput[] = [];
  for (const raw of sets) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const exerciseName = String(item.exerciseName ?? "").trim();
    if (!exerciseName) continue;
    out.push({
      exerciseName,
      reps: typeof item.reps === "number" ? item.reps : Number(item.reps ?? 0),
      weightKg:
        typeof item.weightKg === "number" ? item.weightKg : Number(item.weightKg ?? 0),
      isExtra: Boolean(item.isExtra ?? false),
      meta: (item.meta ?? {}) as Record<string, unknown>,
    });
  }
  return out;
}

async function resolveAutoProgressionContext(input: {
  tx: any;
  userId: string;
  planId: string | null | undefined;
}): Promise<ResolvedAutoProgressionContext> {
  const planId = input.planId?.trim();
  if (!planId) return { ok: false, reason: "skip:no-plan" };

  const planRows = await input.tx
    .select({
      id: planTable.id,
      userId: planTable.userId,
      params: planTable.params,
      rootProgramVersionId: planTable.rootProgramVersionId,
    })
    .from(planTable)
    .where(eq(planTable.id, planId))
    .limit(1);
  const plan = planRows[0];
  if (!plan || plan.userId !== input.userId) {
    return { ok: false, reason: "skip:forbidden-plan" };
  }

  const params = (plan.params ?? {}) as Record<string, unknown>;
  if (params.autoProgression !== true) return { ok: false, reason: "skip:disabled" };
  if (!plan.rootProgramVersionId) return { ok: false, reason: "skip:no-root-program" };

  const versionRows = await input.tx
    .select({
      id: programVersion.id,
      templateId: programVersion.templateId,
      definition: programVersion.definition,
    })
    .from(programVersion)
    .where(eq(programVersion.id, plan.rootProgramVersionId))
    .limit(1);
  const version = versionRows[0];
  if (!version) return { ok: false, reason: "skip:version-missing" };

  const templateRows = await input.tx
    .select({
      id: programTemplate.id,
      slug: programTemplate.slug,
    })
    .from(programTemplate)
    .where(eq(programTemplate.id, version.templateId))
    .limit(1);
  const template = templateRows[0];
  if (!template) return { ok: false, reason: "skip:template-missing" };

  const progressionProgram = resolveAutoProgressionProgram(template.slug, version.definition);
  if (!progressionProgram) return { ok: false, reason: "skip:unsupported-program" };

  return {
    ok: true,
    planId,
    userId: input.userId,
    params,
    templateSlug: template.slug,
    progressionProgram,
  };
}

async function upsertAutoProgressionRuntimeState(input: {
  tx: any;
  planId: string;
  userId: string;
  nextState: unknown;
}) {
  await input.tx
    .insert(planRuntimeState)
    .values({
      planId: input.planId,
      userId: input.userId,
      engineVersion: AUTO_PROGRESSION_ENGINE_VERSION,
      state: input.nextState,
    })
    .onConflictDoUpdate({
      target: planRuntimeState.planId,
      set: {
        userId: input.userId,
        engineVersion: AUTO_PROGRESSION_ENGINE_VERSION,
        state: input.nextState,
        updatedAt: new Date(),
      },
    });
}

function toProgressionEventMeta(reduced: ReturnType<typeof reduceProgressionState>) {
  return {
    didAdvanceSession: reduced.didAdvanceSession,
    targetDecisions: reduced.targetDecisions,
    outcomes: reduced.outcomes,
    engineVersion: AUTO_PROGRESSION_ENGINE_VERSION,
  };
}

export async function applyAutoProgressionFromLog(input: ApplyAutoProgressionInput) {
  const mode = input.mode ?? "upsert";
  const context = await resolveAutoProgressionContext({
    tx: input.tx,
    userId: input.userId,
    planId: input.planId,
  });
  if (!context.ok) return { applied: false, reason: context.reason };
  const resolved = context;

  const logRows = await input.tx
    .select({
      id: workoutLog.id,
      performedAt: workoutLog.performedAt,
    })
    .from(workoutLog)
    .where(eq(workoutLog.id, input.logId))
    .limit(1);
  const currentLog = logRows[0];
  if (!currentLog) return { applied: false, reason: "skip:log-missing" as const };

  async function applySingleFromState(
    beforeState: Record<string, unknown>,
    decisions: Record<string, ProgressionTargetDecision> | null,
  ) {
    const reduced = reduceProgressionState({
      program: resolved.progressionProgram,
      previousState: beforeState,
      planParams: resolved.params,
      sets: toLoggedSetRows(input.sets),
      logId: input.logId,
    });

    // 사용자가 sheet에서 운동별로 결정한 mode + 절대 workKg를 reducer 결과 위에 덮어쓴다.
    const applied = applyTargetDecisionsToReduced(reduced, decisions);

    await input.tx.insert(planProgressEvent).values({
      planId: resolved.planId,
      logId: input.logId,
      userId: input.userId,
      eventType: applied.eventType,
      programSlug: resolved.templateSlug,
      reason: applied.reason,
      beforeState,
      afterState: applied.nextState,
      meta: buildProgressionEventMeta(reduced, applied.appliedDecisions),
    });
    await upsertAutoProgressionRuntimeState({
      tx: input.tx,
      planId: resolved.planId,
      userId: input.userId,
      nextState: applied.nextState,
    });
    return {
      ...reduced,
      nextState: applied.nextState,
      eventType: applied.eventType,
      reason: applied.reason,
    };
  }

  const existingEventRows = await input.tx
    .select({
      id: planProgressEvent.id,
      beforeState: planProgressEvent.beforeState,
      afterState: planProgressEvent.afterState,
      meta: planProgressEvent.meta,
    })
    .from(planProgressEvent)
    .where(
      and(
        eq(planProgressEvent.planId, resolved.planId),
        eq(planProgressEvent.logId, input.logId),
        eq(planProgressEvent.programSlug, resolved.templateSlug),
      ),
    )
    .limit(1);
  const existingEvent = existingEventRows[0] ?? null;

  if (mode !== "replay") {
    if (existingEvent) return { applied: false, reason: "skip:already-applied" as const };

    const runtimeRows = await input.tx
      .select({
        id: planRuntimeState.id,
        state: planRuntimeState.state,
      })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, resolved.planId))
      .limit(1);
    const runtime = runtimeRows[0] ?? null;
    const beforeState = (runtime?.state ?? {}) as Record<string, unknown>;
    const reduced = await applySingleFromState(beforeState, input.progressionTargetDecisions ?? null);
    return {
      applied: true,
      reason: reduced.reason,
      eventType: reduced.eventType,
      programSlug: resolved.templateSlug,
    };
  }

  if (!existingEvent) {
    const runtimeRows = await input.tx
      .select({
        id: planRuntimeState.id,
        state: planRuntimeState.state,
      })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, resolved.planId))
      .limit(1);
    const runtime = runtimeRows[0] ?? null;
    const beforeState = (runtime?.state ?? {}) as Record<string, unknown>;
    const reduced = await applySingleFromState(beforeState, input.progressionTargetDecisions ?? null);
    return {
      applied: true,
      reason: reduced.reason,
      eventType: reduced.eventType,
      programSlug: resolved.templateSlug,
    };
  }

  // 현재 수정 중인 로그: 새로 전달된 결정이 있으면 그것을, 없으면 기존에 저장된
  // 사용자 결정을 보존해 재적용한다 (수정만으로 사용자 선택이 사라지지 않도록).
  const replayFirstDecisions =
    input.progressionTargetDecisions ?? readStoredDecisionsFromMeta(existingEvent.meta);
  const replayFirstReduced = reduceProgressionState({
    program: resolved.progressionProgram,
    previousState: existingEvent.beforeState ?? {},
    planParams: resolved.params,
    sets: toLoggedSetRows(input.sets),
    logId: input.logId,
  });
  const replayFirst = applyTargetDecisionsToReduced(replayFirstReduced, replayFirstDecisions);
  await input.tx
    .update(planProgressEvent)
    .set({
      eventType: replayFirst.eventType,
      reason: replayFirst.reason,
      beforeState: existingEvent.beforeState ?? {},
      afterState: replayFirst.nextState,
      meta: buildProgressionEventMeta(replayFirstReduced, replayFirst.appliedDecisions),
    })
    .where(eq(planProgressEvent.id, existingEvent.id));

  let runningState = replayFirst.nextState;
  const laterEventRows = await input.tx
    .select({
      eventId: planProgressEvent.id,
      logId: planProgressEvent.logId,
      meta: planProgressEvent.meta,
      performedAt: workoutLog.performedAt,
    })
    .from(planProgressEvent)
    .innerJoin(workoutLog, eq(planProgressEvent.logId, workoutLog.id))
    .where(
      and(
        eq(planProgressEvent.planId, resolved.planId),
        eq(planProgressEvent.programSlug, resolved.templateSlug),
        or(
          gt(workoutLog.performedAt, currentLog.performedAt),
          and(eq(workoutLog.performedAt, currentLog.performedAt), gt(workoutLog.id, currentLog.id)),
        ),
      ),
    )
    .orderBy(asc(workoutLog.performedAt), asc(workoutLog.id));

  for (const row of laterEventRows) {
    const logId = row.logId;
    if (!logId) continue;

    const laterSets = await input.tx
      .select({
        exerciseName: workoutSet.exerciseName,
        reps: workoutSet.reps,
        weightKg: workoutSet.weightKg,
        isExtra: workoutSet.isExtra,
        meta: workoutSet.meta,
      })
      .from(workoutSet)
      .where(eq(workoutSet.logId, logId))
      .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id));

    const reduced = reduceProgressionState({
      program: resolved.progressionProgram,
      previousState: runningState,
      planParams: resolved.params,
      sets: toLoggedSetRows(laterSets),
      logId,
    });
    // 이 로그에 저장돼 있던 사용자 결정을 복원해 재적용.
    const applied = applyTargetDecisionsToReduced(reduced, readStoredDecisionsFromMeta(row.meta));

    const beforeReplayState = runningState;
    runningState = applied.nextState;
    await input.tx
      .update(planProgressEvent)
      .set({
        eventType: applied.eventType,
        reason: applied.reason,
        beforeState: beforeReplayState,
        afterState: runningState,
        meta: buildProgressionEventMeta(reduced, applied.appliedDecisions),
      })
      .where(eq(planProgressEvent.id, row.eventId));
  }

  await upsertAutoProgressionRuntimeState({
    tx: input.tx,
    planId: resolved.planId,
    userId: input.userId,
    nextState: runningState,
  });
  return {
    applied: true,
    reason: "replay:updated",
    eventType: replayFirst.eventType,
    programSlug: resolved.templateSlug,
  };
}

export async function rebuildAutoProgressionForPlan(input: {
  tx: any;
  userId: string;
  planId: string | null | undefined;
}) {
  const context = await resolveAutoProgressionContext(input);
  if (!context.ok) return { applied: false, reason: context.reason };
  const resolved = context;

  const remainingLogs = await input.tx
    .select({
      id: workoutLog.id,
      performedAt: workoutLog.performedAt,
    })
    .from(workoutLog)
    .where(eq(workoutLog.planId, resolved.planId))
    .orderBy(asc(workoutLog.performedAt), asc(workoutLog.id));

  // 기존 이벤트를 지우기 전에, 각 로그에서 사용자가 직접 고른 증감량 결정을 수집한다.
  // 재계산 후 같은 로그에 다시 적용해 사용자 선택이 rebuild로 사라지지 않게 한다.
  const priorEventRows = await input.tx
    .select({
      logId: planProgressEvent.logId,
      meta: planProgressEvent.meta,
    })
    .from(planProgressEvent)
    .where(eq(planProgressEvent.planId, resolved.planId));
  const decisionsByLogId = new Map<string, Record<string, ProgressionTargetDecision>>();
  for (const row of priorEventRows) {
    if (!row.logId) continue;
    const stored = readStoredDecisionsFromMeta(row.meta);
    if (stored) decisionsByLogId.set(row.logId, stored);
  }

  await input.tx.delete(planProgressEvent).where(eq(planProgressEvent.planId, resolved.planId));

  if (remainingLogs.length === 0) {
    await input.tx.delete(planRuntimeState).where(eq(planRuntimeState.planId, resolved.planId));
    return {
      applied: true,
      reason: "rebuild:cleared" as const,
      programSlug: resolved.templateSlug,
      rebuiltLogCount: 0,
    };
  }

  const logIds = remainingLogs.map((log: { id: string }) => log.id);
  const setRows = await input.tx
    .select({
      logId: workoutSet.logId,
      exerciseName: workoutSet.exerciseName,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      isExtra: workoutSet.isExtra,
      meta: workoutSet.meta,
      sortOrder: workoutSet.sortOrder,
      setNumber: workoutSet.setNumber,
      id: workoutSet.id,
    })
    .from(workoutSet)
    .where(inArray(workoutSet.logId, logIds))
    .orderBy(asc(workoutSet.logId), asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id));

  const setsByLogId = new Map<string, typeof setRows>();
  for (const row of setRows) {
    const list = setsByLogId.get(row.logId) ?? [];
    list.push(row);
    setsByLogId.set(row.logId, list);
  }

  // 상태 fold는 순차(각 iteration이 이전 runningState에 의존)라 병렬 불가하나,
  // INSERT는 배열에 모아 마지막에 단일 multi-row insert로 배치 → O(n) 왕복을 1회로.
  // beforeState/afterState는 push 시점 값을 structuredClone으로 고정해, 원본이 각
  // insert 시점에 직렬화하던 것과 정확히 동일(이후 상태 변이와 무관하게 안전).
  let runningState: Record<string, unknown> = {};
  const eventRows: Array<typeof planProgressEvent.$inferInsert> = [];
  for (const log of remainingLogs) {
    const reduced = reduceProgressionState({
      program: resolved.progressionProgram,
      previousState: runningState,
      planParams: resolved.params,
      sets: toLoggedSetRows(setsByLogId.get(log.id) ?? []),
      logId: log.id,
    });
    // 이 로그에 저장돼 있던 사용자 결정을 복원해 재적용.
    const applied = applyTargetDecisionsToReduced(reduced, decisionsByLogId.get(log.id) ?? null);

    eventRows.push({
      planId: resolved.planId,
      logId: log.id,
      userId: input.userId,
      eventType: applied.eventType,
      programSlug: resolved.templateSlug,
      reason: applied.reason,
      beforeState: structuredClone(runningState),
      afterState: structuredClone(applied.nextState),
      meta: buildProgressionEventMeta(reduced, applied.appliedDecisions),
    });

    runningState = applied.nextState;
  }

  if (eventRows.length > 0) {
    await input.tx.insert(planProgressEvent).values(eventRows);
  }

  await upsertAutoProgressionRuntimeState({
    tx: input.tx,
    planId: resolved.planId,
    userId: input.userId,
    nextState: runningState,
  });

  return {
    applied: true,
    reason: "rebuild:updated" as const,
    programSlug: resolved.templateSlug,
    rebuiltLogCount: remainingLogs.length,
  };
}

export type ManualRuntimeAdjustment = { workKg: number };

// 사용자가 자동 진행 플랜의 "현재 TM(runtime workKg)"을 직접 보정한다(부상/디로드 등).
// 핵심 제약: planRuntimeState를 직접 UPDATE하면 과거 로그 수정으로 rebuild가 돌 때
// 덮어써지고, null-logId 이벤트를 심으면 rebuild가 그 이벤트를 삭제한다. 그래서
// runtime을 만든 "가장 최근(performedAt desc, id desc) 실 로그 이벤트"의
// meta.targetDecisionsOverride에 보정을 머지한다. 그러면 rebuild/replay가 그 logId를
// 재생할 때 readStoredDecisionsFromMeta로 복원해 보정이 보존된다(PR #360 메커니즘과 정합).
export async function applyManualRuntimeAdjustment(input: {
  tx: any;
  userId: string;
  planId: string | null | undefined;
  adjustments: Record<string, ManualRuntimeAdjustment>;
}) {
  const context = await resolveAutoProgressionContext({
    tx: input.tx,
    userId: input.userId,
    planId: input.planId,
  });
  if (!context.ok) return { applied: false as const, reason: context.reason };
  const resolved = context;

  // 입력 정규화: 2.5kg 스냅, 유효값(finite·≥0)만.
  const requested: Record<string, ProgressionTargetDecision> = {};
  for (const [rawKey, value] of Object.entries(input.adjustments ?? {})) {
    const key = String(rawKey).trim();
    const workKg = typeof value?.workKg === "number" ? value.workKg : Number(value?.workKg);
    if (!key || !Number.isFinite(workKg) || workKg < 0) continue;
    requested[key] = { mode: "hold", workKg: snapTo2p5(workKg) };
  }
  if (Object.keys(requested).length === 0) {
    return { applied: false as const, reason: "skip:no-adjustments" as const };
  }

  // runtime을 만든 가장 최근 실 로그 이벤트(= afterState가 현재 runtime).
  const latestRows = await input.tx
    .select({
      eventId: planProgressEvent.id,
      logId: planProgressEvent.logId,
      beforeState: planProgressEvent.beforeState,
      meta: planProgressEvent.meta,
    })
    .from(planProgressEvent)
    .innerJoin(workoutLog, eq(planProgressEvent.logId, workoutLog.id))
    .where(
      and(
        eq(planProgressEvent.planId, resolved.planId),
        eq(planProgressEvent.programSlug, resolved.templateSlug),
      ),
    )
    .orderBy(desc(workoutLog.performedAt), desc(workoutLog.id))
    .limit(1);
  const latest = latestRows[0] ?? null;
  if (!latest || !latest.logId) {
    return { applied: false as const, reason: "skip:no-applied-log" as const };
  }

  // 대상 로그의 세트로 reducer 결과를 재현한 뒤, (기존 override + 신규 보정)을 머지해 적용.
  const setRows = await input.tx
    .select({
      exerciseName: workoutSet.exerciseName,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      isExtra: workoutSet.isExtra,
      meta: workoutSet.meta,
    })
    .from(workoutSet)
    .where(eq(workoutSet.logId, latest.logId))
    .orderBy(asc(workoutSet.sortOrder), asc(workoutSet.setNumber), asc(workoutSet.id));

  const reduced = reduceProgressionState({
    program: resolved.progressionProgram,
    previousState: latest.beforeState ?? {},
    planParams: resolved.params,
    sets: toLoggedSetRows(setRows),
    logId: latest.logId,
  });

  // mode는 표시/eventType 용도 — 보정값과 현재값 비교로 결정(보존 정확성은 workKg 절대세팅에 의존).
  const decisions: Record<string, ProgressionTargetDecision> = {
    ...(readStoredDecisionsFromMeta(latest.meta) ?? {}),
  };
  for (const [key, d] of Object.entries(requested)) {
    const current = reduced.nextState.targets[key]?.workKg ?? 0;
    const mode: ProgressionTargetDecisionMode =
      d.workKg > current ? "increase" : d.workKg < current ? "reset" : "hold";
    decisions[key] = { mode, workKg: d.workKg };
  }

  const applied = applyTargetDecisionsToReduced(reduced, decisions);

  await input.tx
    .update(planProgressEvent)
    .set({
      eventType: applied.eventType,
      reason: "manual:tm-adjustment",
      beforeState: latest.beforeState ?? {},
      afterState: applied.nextState,
      meta: buildProgressionEventMeta(reduced, applied.appliedDecisions),
    })
    .where(eq(planProgressEvent.id, latest.eventId));

  await upsertAutoProgressionRuntimeState({
    tx: input.tx,
    planId: resolved.planId,
    userId: input.userId,
    nextState: applied.nextState,
  });

  return {
    applied: true as const,
    reason: "manual:tm-adjustment" as const,
    state: applied.nextState,
    programSlug: resolved.templateSlug,
  };
}
