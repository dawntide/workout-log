import { resolveLoggedTotalLoadKg } from "@/lib/bodyweight-load";
import { mapExerciseNameToTarget as mapExerciseToTarget } from "@/lib/strength-engine/target-mapping";
import {
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
  deriveAsymptoteAuxTms,
} from "@/server/program-engine/asymptote";

export type ProgressionProgram =
  | "operator"
  | "greyskull-lp"
  | "starting-strength-lp"
  | "stronglifts-5x5"
  | "texas-method"
  | "gzclp"
  | "wendler-531"
  | "asymptote";

export type ProgressionEventType = "INCREASE" | "HOLD" | "RESET" | "ADVANCE_WEEK";

export type ProgressionTarget = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

export type LoggedSetInput = {
  exerciseName: string;
  reps?: number | null;
  weightKg?: number | null;
  isExtra?: boolean;
  meta?: Record<string, unknown>;
};

export type TargetRuntimeState = {
  progressionTarget: ProgressionTarget;
  workKg: number;
  successStreak: number;
  failureStreak: number;
  amrapReps?: number | null;
  stage?: number; // gzclp tier별 stage 인덱스(0=5×3 → 1=6×2 → 2=10×1). PR-D에서 전환 로직.
};

export type IncrementOverride = {
  increaseKg?: number;
  decreaseKg?: number;
};

export type IncrementOverrideMap = {
  increaseKg?: Record<string, number>;
  decreaseKg?: Record<string, number>;
};

export type ProgressionRuntimeState = {
  cycle: number;
  week: number;
  day: number;
  targets: Record<string, TargetRuntimeState>;
  lastAppliedLogId: string | null;
  lightBlockMode?: boolean;
};

type TargetOutcome = {
  progressionKey: string;
  progressionTarget: ProgressionTarget;
  displayTarget: string;
  total: number;
  successful: number;
  averageWeightKg: number | null;
};

export type TargetDecision = {
  key?: string;
  target: string;
  progressionTarget?: ProgressionTarget;
  outcome: "SUCCESS" | "FAIL";
  eventType: "INCREASE" | "HOLD" | "RESET";
  reason: string;
  before: TargetRuntimeState;
  after: TargetRuntimeState;
};

export type ReduceProgressionResult = {
  nextState: ProgressionRuntimeState;
  eventType: ProgressionEventType;
  reason: string;
  didAdvanceSession: boolean;
  targetDecisions: TargetDecision[];
  outcomes: Record<string, TargetOutcome>;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveRounded2p5(value: number) {
  return Math.max(0, Math.round(value / 2.5) * 2.5);
}

function parsePlannedReps(meta: Record<string, unknown> | undefined) {
  const raw = (meta?.plannedRef as Record<string, unknown> | undefined)?.reps;
  const reps = toFiniteNumber(raw);
  return reps !== null && reps > 0 ? Math.floor(reps) : null;
}

function setWasCompleted(set: LoggedSetInput) {
  const meta = (set.meta ?? {}) as Record<string, unknown>;
  const completed = meta.completed;
  if (completed === true) return true;
  const reps = toFiniteNumber(set.reps);
  if (reps === null || reps <= 0) return false;
  const plannedReps = parsePlannedReps(meta);
  if (plannedReps === null) return true;
  return reps >= plannedReps;
}

function parseProgressionTarget(value: unknown): ProgressionTarget | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SQUAT" || normalized === "BENCH" || normalized === "DEADLIFT" || normalized === "OHP" || normalized === "PULL") {
    return normalized;
  }
  return null;
}

function readPlannedRef(meta: Record<string, unknown> | undefined) {
  const plannedRef = meta?.plannedRef;
  if (!plannedRef || typeof plannedRef !== "object" || Array.isArray(plannedRef)) return {};
  return plannedRef as Record<string, unknown>;
}

function progressionIdentityForSet(set: LoggedSetInput): {
  key: string;
  progressionTarget: ProgressionTarget;
  displayTarget: string;
} | null {
  const plannedRef = readPlannedRef(set.meta);
  const progressionTarget =
    parseProgressionTarget(plannedRef.progressionTarget) ??
    mapExerciseToTarget(set.exerciseName);
  if (!progressionTarget) return null;

  const keyRaw = String(plannedRef.progressionKey ?? "").trim();
  const displayRaw = String(plannedRef.progressionLabel ?? plannedRef.exerciseName ?? set.exerciseName ?? "").trim();

  return {
    key: keyRaw || progressionTarget,
    progressionTarget,
    displayTarget: displayRaw || progressionTarget,
  };
}

export type RulesForResult = {
  increaseEverySuccesses: number;
  failResetThreshold: number;
  increaseKg: number;
  resetFactor: number;
  defaultIncreaseKg: number;
  decreaseKg: number | null;
};

export function rulesFor(
  program: ProgressionProgram,
  target: string,
  override?: IncrementOverride,
): RulesForResult {
  let defaults: {
    increaseEverySuccesses: number;
    failResetThreshold: number;
    increaseKg: number;
    resetFactor: number;
  };

  if (program === "operator") {
    // Tactical Barbell Operator 공식 룰: 블록 완주 시 상체(BENCH/PULL) +5lb(≈2.5kg),
    // 하체(SQUAT/DEADLIFT) +10lb(≈5kg).
    defaults = {
      increaseEverySuccesses: 3,
      failResetThreshold: 2,
      increaseKg: target === "DEADLIFT" || target === "SQUAT" ? 5 : 2.5,
      resetFactor: 0.95,
    };
  } else if (program === "wendler-531") {
    // 짐 웬들러 5/3/1: 4주 사이클, 상체+2.5kg / 하체+5kg, 10% 감소 딜로드
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: 3,
      increaseKg: target === "DEADLIFT" || target === "SQUAT" ? 5 : 2.5,
      resetFactor: 0.9,
    };
  } else if (program === "gzclp") {
    // T1 기준: 3회 연속 실패 시 15% 감소
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: 3,
      increaseKg: target === "DEADLIFT" ? 5 : 2.5,
      resetFactor: 0.85,
    };
  } else if (program === "texas-method") {
    // 주간 3세션(볼륨/회복/강도) 중 3회 연속 강도일 실패 시 10% 감소
    defaults = {
      increaseEverySuccesses: 3,
      failResetThreshold: 3,
      increaseKg: target === "DEADLIFT" ? 5 : 2.5,
      resetFactor: 0.9,
    };
  } else if (program === "asymptote") {
    // Asymptote Protocol: 블록 종료 시 AMRAP 결과로만 TM 변동 (±2.5/유지/-5).
    // rulesFor는 override(수동) 경로의 안전 디폴트로만 사용된다.
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: 3,
      increaseKg: 2.5,
      resetFactor: 0.95,
    };
  } else {
    // greyskull-lp, starting-strength-lp, stronglifts-5x5:
    // 매 세션 증량, 3회 연속 실패 시 10% 감소
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: 3,
      increaseKg: target === "DEADLIFT" ? 5 : 2.5,
      resetFactor: 0.9,
    };
  }

  const increaseKg =
    override?.increaseKg !== undefined && Number.isFinite(override.increaseKg)
      ? toPositiveRounded2p5(override.increaseKg)
      : defaults.increaseKg;
  const decreaseKg =
    override?.decreaseKg !== undefined && Number.isFinite(override.decreaseKg)
      ? toPositiveRounded2p5(override.decreaseKg)
      : null;

  return {
    increaseEverySuccesses: defaults.increaseEverySuccesses,
    failResetThreshold: defaults.failResetThreshold,
    increaseKg,
    resetFactor: defaults.resetFactor,
    defaultIncreaseKg: defaults.increaseKg,
    decreaseKg,
  };
}

export function readIncrementOverride(
  planParams: unknown,
  progressionKey: string,
  progressionTarget: string,
): IncrementOverride | undefined {
  if (!planParams || typeof planParams !== "object") return undefined;
  const overrides = (planParams as { incrementOverrides?: IncrementOverrideMap })
    .incrementOverrides;
  if (!overrides || typeof overrides !== "object") return undefined;

  const inc = overrides.increaseKg;
  const dec = overrides.decreaseKg;
  const increaseKg =
    inc && (inc[progressionKey] ?? inc[progressionTarget]);
  const decreaseKg =
    dec && (dec[progressionKey] ?? dec[progressionTarget]);

  if (increaseKg === undefined && decreaseKg === undefined) return undefined;
  const result: IncrementOverride = {};
  if (increaseKg !== undefined) result.increaseKg = Number(increaseKg);
  if (decreaseKg !== undefined) result.decreaseKg = Number(decreaseKg);
  return result;
}

export function targetsFor(program: ProgressionProgram): ProgressionTarget[] {
  if (program === "operator") return ["SQUAT", "BENCH", "DEADLIFT", "PULL"];
  if (program === "wendler-531") return ["SQUAT", "BENCH", "OHP", "DEADLIFT"];
  if (program === "asymptote") return ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"];
  return ["SQUAT", "BENCH", "OHP", "DEADLIFT", "PULL"];
}

// 고정 family target 집합이 아니라 슬롯/운동별 동적 진행 키를 쓰는 프로그램.
// operator(per-exercise EX_ 키), gzclp(per-tier 슬롯), texas-method(per-요일 슬롯)가 여기 속한다.
// 이들은 같은 운동이라도 슬롯마다 독립된 workKg로 LP 진행한다.
// asymptote/531은 블록 기반이라 고정 family target을 쓴다(여기 포함되지 않음).
export function usesDynamicProgressionKeys(program: ProgressionProgram): boolean {
  return (
    program === "operator" || program === "gzclp" || program === "texas-method"
  );
}

function initTargetState(progressionTarget: ProgressionTarget, initialWorkKg: number): TargetRuntimeState {
  return {
    progressionTarget,
    workKg: toPositiveRounded2p5(Math.max(0, initialWorkKg)),
    successStreak: 0,
    failureStreak: 0,
  };
}

function readTrainingMaxForKey(planParams: unknown, key: string, progressionTarget: ProgressionTarget) {
  const params = (planParams ?? {}) as { trainingMaxKg?: Record<string, unknown> };
  const tm = params.trainingMaxKg ?? {};
  return toFiniteNumber(tm[key]) ?? toFiniteNumber(tm[progressionTarget]) ?? 0;
}

function deriveInitialState(input: {
  previousState: unknown;
  planParams: unknown;
  outcomes: Map<string, TargetOutcome>;
  program: ProgressionProgram;
}): ProgressionRuntimeState {
  const prev = (input.previousState ?? {}) as Partial<ProgressionRuntimeState>;
  const previousTargets = prev.targets ?? {};
  const keys =
    usesDynamicProgressionKeys(input.program)
      ? Array.from(new Set([...Object.keys(previousTargets), ...Array.from(input.outcomes.keys())]))
      : targetsFor(input.program);

  const baseTargets: Record<string, TargetRuntimeState> = {};
  for (const key of keys) {
    const prevTarget = previousTargets[key];
    if (prevTarget && typeof prevTarget === "object") {
      const workKg = toFiniteNumber((prevTarget as TargetRuntimeState).workKg) ?? 0;
      const successStreak = Math.max(0, Math.floor(toFiniteNumber((prevTarget as TargetRuntimeState).successStreak) ?? 0));
      const failureStreak = Math.max(0, Math.floor(toFiniteNumber((prevTarget as TargetRuntimeState).failureStreak) ?? 0));
      const progressionTarget =
        parseProgressionTarget((prevTarget as Partial<TargetRuntimeState>).progressionTarget) ??
        input.outcomes.get(key)?.progressionTarget ??
        parseProgressionTarget(key) ??
        "SQUAT";
      const amrapRepsRaw = toFiniteNumber((prevTarget as Partial<TargetRuntimeState>).amrapReps);
      const stageRaw = toFiniteNumber((prevTarget as Partial<TargetRuntimeState>).stage);
      const next: TargetRuntimeState = {
        progressionTarget,
        workKg: toPositiveRounded2p5(workKg),
        successStreak,
        failureStreak,
      };
      if (amrapRepsRaw !== null && amrapRepsRaw >= 0) {
        next.amrapReps = Math.floor(amrapRepsRaw);
      }
      // stage(gzclp 강등 단계)는 명시 복원이 필수 — 이 리터럴은 스프레드가 아니라 명시 필드만
      // 재구성하므로, 빠뜨리면 DB엔 저장되나 다음 reduce에서 유실되는 silent-drop이 된다.
      if (stageRaw !== null && stageRaw >= 0) {
        next.stage = Math.floor(stageRaw);
      }
      baseTargets[key] = next;
      continue;
    }

    const progressionTarget =
      input.outcomes.get(key)?.progressionTarget ??
      parseProgressionTarget(key) ??
      "SQUAT";
    const fromPlan = readTrainingMaxForKey(input.planParams, key, progressionTarget);
    const fromOutcome = input.outcomes.get(key)?.averageWeightKg ?? 0;
    baseTargets[key] = initTargetState(progressionTarget, fromPlan > 0 ? fromPlan : fromOutcome);
  }

  const cycle = Math.max(1, Math.floor(toFiniteNumber(prev.cycle) ?? 1));
  const week = Math.max(1, Math.floor(toFiniteNumber(prev.week) ?? 1));
  const day = Math.max(1, Math.floor(toFiniteNumber(prev.day) ?? 1));

  return {
    cycle,
    week,
    day,
    targets: baseTargets,
    lastAppliedLogId: typeof prev.lastAppliedLogId === "string" ? prev.lastAppliedLogId : null,
    lightBlockMode: prev.lightBlockMode === true ? true : undefined,
  };
}

function summarizeEventType(decisions: TargetDecision[], didAdvanceSession: boolean): ProgressionEventType {
  if (decisions.some((decision) => decision.eventType === "RESET")) return "RESET";
  if (decisions.some((decision) => decision.eventType === "INCREASE")) return "INCREASE";
  if (didAdvanceSession) return "ADVANCE_WEEK";
  return "HOLD";
}

function asDefinitionRecord(definition: unknown): Record<string, unknown> {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) return {};
  return definition as Record<string, unknown>;
}

export function resolveAutoProgressionProgram(programSlug: string, definition?: unknown): ProgressionProgram | null {
  const slug = String(programSlug).trim().toLowerCase();
  const def = asDefinitionRecord(definition);
  const kind = String(def.kind ?? "").trim().toLowerCase();
  const family = String(def.programFamily ?? "").trim().toLowerCase();

  if (slug === "operator") return "operator";
  if (slug === "greyskull-lp") return "greyskull-lp";
  if (slug === "starting-strength-lp") return "starting-strength-lp";
  if (slug === "stronglifts-5x5") return "stronglifts-5x5";
  if (slug === "texas-method") return "texas-method";
  if (slug === "gzclp") return "gzclp";
  if (slug === "wendler-531" || slug === "wendler-531-fsl" || slug === "wendler-531-bbb") return "wendler-531";
  if (slug === "asymptote-protocol" || slug === "asymptote") return "asymptote";
  if (kind === "operator" || family === "operator" || def.operatorStyle === true) return "operator";
  if (kind === "greyskull-lp" || family === "greyskull-lp") return "greyskull-lp";
  if (kind === "starting-strength-lp" || family === "starting-strength-lp") return "starting-strength-lp";
  if (kind === "stronglifts-5x5" || family === "stronglifts-5x5") return "stronglifts-5x5";
  if (kind === "texas-method" || family === "texas-method") return "texas-method";
  if (kind === "gzclp" || family === "gzclp") return "gzclp";
  if (kind === "531" || family === "wendler-531") return "wendler-531";
  if (kind === "asymptote" || family === "asymptote") return "asymptote";
  return null;
}

export function extractTrainingMaxOverridesFromState(state: unknown): Record<string, number> {
  const runtime = (state ?? {}) as Partial<ProgressionRuntimeState>;
  const targets = runtime.targets ?? {};
  const out: Record<string, number> = {};

  for (const [key, targetState] of Object.entries(targets)) {
    const workKg = toFiniteNumber((targetState as TargetRuntimeState)?.workKg);
    if (workKg === null || workKg <= 0) continue;
    out[key] = toPositiveRounded2p5(workKg);
  }

  return out;
}

export function collectTargetOutcomes(sets: LoggedSetInput[]): Map<string, TargetOutcome> {
  const acc = new Map<
    string,
    {
      progressionKey: string;
      progressionTarget: ProgressionTarget;
      displayTarget: string;
      total: number;
      successful: number;
      weightSum: number;
      weightCount: number;
    }
  >();

  for (const set of sets) {
    if (set.isExtra) continue;
    const identity = progressionIdentityForSet(set);
    if (!identity) continue;
    const outcome = acc.get(identity.key) ?? {
      progressionKey: identity.key,
      progressionTarget: identity.progressionTarget,
      displayTarget: identity.displayTarget,
      total: 0,
      successful: 0,
      weightSum: 0,
      weightCount: 0,
    };
    outcome.total += 1;
    if (setWasCompleted(set)) {
      outcome.successful += 1;
    }

    const weight = resolveLoggedTotalLoadKg({
      exerciseName: set.exerciseName,
      weightKg: set.weightKg,
      meta: set.meta,
    });
    if (weight !== null && weight > 0) {
      outcome.weightSum += weight;
      outcome.weightCount += 1;
    }

    acc.set(identity.key, outcome);
  }

  const out = new Map<string, TargetOutcome>();
  for (const [key, value] of acc.entries()) {
    out.set(key, {
      progressionKey: value.progressionKey,
      progressionTarget: value.progressionTarget,
      displayTarget: value.displayTarget,
      total: value.total,
      successful: value.successful,
      averageWeightKg:
        value.weightCount > 0 ? toPositiveRounded2p5(value.weightSum / value.weightCount) : null,
    });
  }
  return out;
}

// Asymptote AMRAP 위치: 사이클 3(=week 3)에서만, 메인 리프트 마지막 세트.
// 대상 리프트는 ASYMPTOTE_AMRAP_TARGETS_BY_SESSION을 사용한다 — asymptote.ts의
// ASYMPTOTE_SESSIONS(단일 진실원)에서 파생되므로 generator와 drift 불가(audit §3.7).

function collectAsymptoteAmrapReps(
  sets: LoggedSetInput[],
  prevWeek: number,
  prevDay: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (prevWeek !== 3) return out;
  const amrapKeys = ASYMPTOTE_AMRAP_TARGETS_BY_SESSION[prevDay];
  if (!amrapKeys || amrapKeys.length === 0) return out;

  const setsByKey = new Map<string, LoggedSetInput[]>();
  for (const set of sets) {
    if (set.isExtra) continue;
    const identity = progressionIdentityForSet(set);
    if (!identity) continue;
    const list = setsByKey.get(identity.key) ?? [];
    list.push(set);
    setsByKey.set(identity.key, list);
  }

  for (const key of amrapKeys) {
    const list = setsByKey.get(key);
    if (!list || list.length === 0) continue;
    const lastSet = list[list.length - 1]!;
    const reps = toFiniteNumber(lastSet.reps);
    if (reps === null) continue;
    // 0 렙은 "수행했으나 실패"로 기록 (≤2 분기에서 -5 + light 트리거).
    out.set(key, Math.max(0, Math.floor(reps)));
  }
  return out;
}

export function reduceProgressionState(input: {
  program: ProgressionProgram;
  previousState: unknown;
  planParams: unknown;
  sets: LoggedSetInput[];
  logId: string;
}): ReduceProgressionResult {
  const outcomes = collectTargetOutcomes(input.sets);
  const state = deriveInitialState({
    previousState: input.previousState,
    planParams: input.planParams,
    outcomes,
    program: input.program,
  });
  const keysToProcess =
    usesDynamicProgressionKeys(input.program)
      ? Array.from(new Set([...Object.keys(state.targets), ...Array.from(outcomes.keys())]))
      : targetsFor(input.program);
  const decisions: TargetDecision[] = [];
  const amrapRepsByKey =
    input.program === "asymptote"
      ? collectAsymptoteAmrapReps(input.sets, state.week, state.day)
      : null;

  for (const key of keysToProcess) {
    const outcome = outcomes.get(key);
    const progressionTarget =
      outcome?.progressionTarget ??
      parseProgressionTarget(state.targets[key]?.progressionTarget) ??
      parseProgressionTarget(key);
    if (!progressionTarget) continue;

    const before = state.targets[key] ?? initTargetState(progressionTarget, 0);
    if (!outcome || outcome.total < 1) continue;

    const success = outcome.successful === outcome.total;
    const next: TargetRuntimeState = { ...before, progressionTarget };
    let eventType: "INCREASE" | "HOLD" | "RESET" = "HOLD";
    let reason = "hold:no-data";

    if (next.workKg <= 0 && (outcome.averageWeightKg ?? 0) > 0) {
      next.workKg = outcome.averageWeightKg ?? 0;
    }

    if (input.program === "operator" || input.program === "wendler-531" || input.program === "asymptote") {
      // 블록 기반 프로그램: LP 진행 로직 없이 스트릭만 누적.
      // 단, 다음 세션에서 회복하면 failure 스트릭이 리셋되도록 LP 경로와 동일하게
      // 반대편 스트릭을 0으로 만든다 — 블록 중간에 한 세트만 실패해도
      // 끝까지 failureStreak이 남아 블록 완료 후 자동 증량을 막던 문제 방지.
      if (success) {
        next.successStreak += 1;
        next.failureStreak = 0;
        reason = "hold:block-success";
      } else {
        next.failureStreak += 1;
        next.successStreak = 0;
        reason = "hold:block-failure";
      }

      // Asymptote: 사이클 3 AMRAP 세트의 실측 렙수를 누적해 블록 종료 시 TM 변동에 사용.
      // 0 렙은 "수행했으나 실패"로 보존 (≤2 분기에서 -5 + light 트리거).
      if (input.program === "asymptote" && amrapRepsByKey) {
        const amrapReps = amrapRepsByKey.get(key);
        if (typeof amrapReps === "number" && amrapReps >= 0) {
          next.amrapReps = amrapReps;
        }
      }

      state.targets[key] = next;
      decisions.push({
        key,
        target: outcome.displayTarget,
        progressionTarget,
        outcome: success ? "SUCCESS" : "FAIL",
        eventType,
        reason,
        before,
        after: next,
      });
      continue;
    }

    const rule = rulesFor(
      input.program,
      progressionTarget,
      readIncrementOverride(input.planParams, key, progressionTarget),
    );
    if (success) {
      next.successStreak += 1;
      next.failureStreak = 0;
      reason = "hold:success-streak";
      if (next.successStreak >= rule.increaseEverySuccesses) {
        next.workKg = toPositiveRounded2p5(next.workKg + rule.increaseKg);
        next.successStreak = 0;
        eventType = "INCREASE";
        reason = `increase:+${rule.increaseKg}kg`;
      }
    } else {
      next.failureStreak += 1;
      next.successStreak = 0;
      reason = "hold:failure-streak";
      if (next.failureStreak >= rule.failResetThreshold) {
        if (rule.decreaseKg !== null) {
          next.workKg = toPositiveRounded2p5(next.workKg - rule.decreaseKg);
          reason = `reset:-${rule.decreaseKg}kg`;
        } else {
          next.workKg = toPositiveRounded2p5(next.workKg * rule.resetFactor);
          reason = `reset:*${rule.resetFactor}`;
        }
        next.failureStreak = 0;
        eventType = "RESET";
      }
    }

    state.targets[key] = next;
    decisions.push({
      key,
      target: outcome.displayTarget,
      progressionTarget,
      outcome: success ? "SUCCESS" : "FAIL",
      eventType,
      reason,
      before,
      after: next,
    });
  }

  let didAdvanceSession = false;
  if (input.program === "operator") {
    const loggedTargets = Array.from(outcomes.keys()).filter((key) => outcomes.get(key)?.total);
    const completedBlock = state.week === 6 && state.day === 3;

    if (loggedTargets.length > 0) {
      state.day += 1;
      if (state.day > 3) {
        state.day = 1;
        state.week += 1;
        if (state.week > 6) {
          state.week = 1;
          state.cycle += 1;
        }
      }
      didAdvanceSession = true;
    }

    if (completedBlock && loggedTargets.length > 0) {
      const targetEntries = Object.entries(state.targets);
      const hadBlockFailure = targetEntries.some(([, targetState]) => (targetState?.failureStreak ?? 0) > 0);
      if (!hadBlockFailure) {
        for (const [key, currentTargetState] of targetEntries) {
          const progressionTarget = parseProgressionTarget(currentTargetState?.progressionTarget) ?? parseProgressionTarget(key);
          if (!progressionTarget) continue;
          const before = state.targets[key] ?? initTargetState(progressionTarget, 0);
          if (before.workKg <= 0) {
            state.targets[key] = {
              ...before,
              successStreak: 0,
              failureStreak: 0,
            };
            continue;
          }
          const increaseKg = rulesFor(
            input.program,
            progressionTarget,
            readIncrementOverride(input.planParams, key, progressionTarget),
          ).increaseKg;
          const after: TargetRuntimeState = {
            progressionTarget,
            workKg: toPositiveRounded2p5(before.workKg + increaseKg),
            successStreak: 0,
            failureStreak: 0,
          };
          state.targets[key] = after;

          const decisionLabel = outcomes.get(key)?.displayTarget ?? key;
          const index = decisions.findIndex((decision) => decision.key === key);
          const updatedDecision: TargetDecision = {
            key,
            target: decisionLabel,
            progressionTarget,
            outcome: index >= 0 ? decisions[index]!.outcome : "SUCCESS",
            eventType: "INCREASE",
            reason: `increase:+${increaseKg}kg`,
            before,
            after,
          };
          if (index >= 0) {
            decisions[index] = updatedDecision;
          } else {
            decisions.push(updatedDecision);
          }
        }
      } else {
        for (const [key, current] of Object.entries(state.targets)) {
          state.targets[key] = {
            ...current,
            successStreak: 0,
            failureStreak: 0,
          };
        }
      }
    }
  }

  // Wendler 5/3/1: 4주×4일 블록 사이클
  if (input.program === "wendler-531") {
    const loggedTargets = Array.from(outcomes.keys()).filter((key) => outcomes.get(key)?.total);
    const completedBlock = state.week === 4 && state.day === 4;

    if (loggedTargets.length > 0) {
      state.day += 1;
      if (state.day > 4) {
        state.day = 1;
        state.week += 1;
        if (state.week > 4) {
          state.week = 1;
          state.cycle += 1;
        }
      }
      didAdvanceSession = true;
    }

    if (completedBlock && loggedTargets.length > 0) {
      const targetEntries = Object.entries(state.targets);
      const hadBlockFailure = targetEntries.some(([, targetState]) => (targetState?.failureStreak ?? 0) > 0);
      if (!hadBlockFailure) {
        for (const [key, currentTargetState] of targetEntries) {
          const progressionTarget = parseProgressionTarget(currentTargetState?.progressionTarget) ?? parseProgressionTarget(key);
          if (!progressionTarget) continue;
          const before = state.targets[key] ?? initTargetState(progressionTarget, 0);
          if (before.workKg <= 0) {
            state.targets[key] = { ...before, successStreak: 0, failureStreak: 0 };
            continue;
          }
          const increaseKg = rulesFor(
            "wendler-531",
            progressionTarget,
            readIncrementOverride(input.planParams, key, progressionTarget),
          ).increaseKg;
          const after: TargetRuntimeState = {
            progressionTarget,
            workKg: toPositiveRounded2p5(before.workKg + increaseKg),
            successStreak: 0,
            failureStreak: 0,
          };
          state.targets[key] = after;

          const decisionLabel = outcomes.get(key)?.displayTarget ?? key;
          const index = decisions.findIndex((d) => d.key === key);
          const updatedDecision: TargetDecision = {
            key,
            target: decisionLabel,
            progressionTarget,
            outcome: index >= 0 ? decisions[index]!.outcome : "SUCCESS",
            eventType: "INCREASE",
            reason: `increase:+${increaseKg}kg`,
            before,
            after,
          };
          if (index >= 0) {
            decisions[index] = updatedDecision;
          } else {
            decisions.push(updatedDecision);
          }
        }
      } else {
        for (const [key, current] of Object.entries(state.targets)) {
          state.targets[key] = { ...current, successStreak: 0, failureStreak: 0 };
        }
      }
    }
  }

  // Asymptote Protocol: 4 사이클 × 3 세션 (A/B/C) 블록.
  // TM 변동은 사이클 3 AMRAP 결과로만 결정. 보조(DL/OHP)는 메인에서 자동 도출.
  if (input.program === "asymptote") {
    const loggedTargets = Array.from(outcomes.keys()).filter((key) => outcomes.get(key)?.total);
    const completedBlock = state.week === 4 && state.day === 3;

    if (loggedTargets.length > 0) {
      state.day += 1;
      if (state.day > 3) {
        state.day = 1;
        state.week += 1;
        if (state.week > 4) {
          state.week = 1;
          state.cycle += 1;
        }
      }
      didAdvanceSession = true;
    }

    if (completedBlock && loggedTargets.length > 0) {
      let triggerLight = false;

      const upsertDecision = (params: {
        key: string;
        progressionTarget: ProgressionTarget;
        before: TargetRuntimeState;
        after: TargetRuntimeState;
        eventType: "INCREASE" | "HOLD" | "RESET";
        outcomeLabel: "SUCCESS" | "FAIL";
        reason: string;
      }) => {
        const decisionLabel = outcomes.get(params.key)?.displayTarget ?? params.key;
        const index = decisions.findIndex((d) => d.key === params.key);
        const updatedDecision: TargetDecision = {
          key: params.key,
          target: decisionLabel,
          progressionTarget: params.progressionTarget,
          outcome: params.outcomeLabel,
          eventType: params.eventType,
          reason: params.reason,
          before: params.before,
          after: params.after,
        };
        if (index >= 0) decisions[index] = updatedDecision;
        else decisions.push(updatedDecision);
      };

      // 1) 메인 3개 (SQ/BP/PULL) TM 변동: AMRAP 렙수 기반.
      // 주의: AMRAP 분기는 incrementOverrides의 영향을 받지 않는다 (프로토콜 정합성 — ±2.5/-5 고정).
      // 사용자 커스텀 증/감량은 수동 override 경로(autoProgression의 increase/reset)에서만 적용된다.
      for (const [key, current] of Object.entries(state.targets)) {
        const progressionTarget =
          parseProgressionTarget(current?.progressionTarget) ?? parseProgressionTarget(key);
        if (!progressionTarget) continue;
        if (progressionTarget === "DEADLIFT" || progressionTarget === "OHP") continue;

        const before = state.targets[key]!;
        const amrapReps = toFiniteNumber(before.amrapReps);

        let delta = 0;
        let outcomeLabel: "SUCCESS" | "FAIL" = "SUCCESS";
        let eventType: "INCREASE" | "HOLD" | "RESET" = "HOLD";
        let amrapReason = "hold:amrap-missing";

        if (amrapReps !== null && amrapReps >= 0) {
          if (amrapReps >= 8) {
            delta = 2.5;
            eventType = "INCREASE";
            amrapReason = `increase:amrap-${amrapReps}reps:+2.5kg`;
          } else if (amrapReps >= 5) {
            delta = 0;
            eventType = "HOLD";
            amrapReason = `hold:amrap-${amrapReps}reps`;
          } else if (amrapReps >= 3) {
            delta = -2.5;
            outcomeLabel = "FAIL";
            eventType = "RESET";
            amrapReason = `reset:amrap-${amrapReps}reps:-2.5kg`;
          } else {
            // 0, 1, 2 렙: -5 kg + 다음 블록 light
            delta = -5;
            outcomeLabel = "FAIL";
            eventType = "RESET";
            triggerLight = true;
            amrapReason = `reset:amrap-${amrapReps}reps:-5kg+light`;
          }
        }

        const newWorkKg =
          before.workKg > 0 ? toPositiveRounded2p5(before.workKg + delta) : before.workKg;
        const after: TargetRuntimeState = {
          progressionTarget,
          workKg: newWorkKg,
          successStreak: 0,
          failureStreak: 0,
          amrapReps: null,
        };
        state.targets[key] = after;

        upsertDecision({
          key,
          progressionTarget,
          before,
          after,
          eventType,
          outcomeLabel,
          reason: amrapReason,
        });
      }

      // 2) 보조 도출: DL = SQ TM, OHP = floor(BP TM × 0.5 / 2.5) × 2.5
      //    파생 수학은 deriveAsymptoteAuxTms(단일 진실원)에 위임, round 래핑은 유지(audit §3.6).
      const newSqTm = state.targets["SQUAT"]?.workKg ?? 0;
      const newBpTm = state.targets["BENCH"]?.workKg ?? 0;
      const auxTms = deriveAsymptoteAuxTms(newSqTm, newBpTm);
      for (const [key, current] of Object.entries(state.targets)) {
        const progressionTarget =
          parseProgressionTarget(current?.progressionTarget) ?? parseProgressionTarget(key);
        if (progressionTarget !== "DEADLIFT" && progressionTarget !== "OHP") continue;

        const before = state.targets[key]!;
        const derived =
          progressionTarget === "DEADLIFT"
            ? toPositiveRounded2p5(auxTms.dlTmKg)
            : toPositiveRounded2p5(auxTms.ohpTmKg);
        const after: TargetRuntimeState = {
          progressionTarget,
          workKg: derived,
          successStreak: 0,
          failureStreak: 0,
          amrapReps: null,
        };
        state.targets[key] = after;

        if (derived === before.workKg) continue;
        const eventType: "INCREASE" | "HOLD" | "RESET" =
          derived > before.workKg ? "INCREASE" : "RESET";
        const reason =
          progressionTarget === "DEADLIFT"
            ? `derived:dl=sq:${derived}kg`
            : `derived:ohp=bp*0.5:${derived}kg`;
        upsertDecision({
          key,
          progressionTarget,
          before,
          after,
          eventType,
          outcomeLabel: derived >= before.workKg ? "SUCCESS" : "FAIL",
          reason,
        });
      }

      state.lightBlockMode = triggerLight;
    }
  }

  state.lastAppliedLogId = input.logId;

  const eventType = summarizeEventType(decisions, didAdvanceSession);
  const reason =
    eventType === "INCREASE" || eventType === "RESET"
      ? decisions.find((decision) => decision.eventType === eventType)?.reason ?? eventType.toLowerCase()
      : didAdvanceSession
        ? "advance:session"
        : eventType.toLowerCase();
  const outcomeObject = Object.fromEntries(outcomes.entries());

  return {
    nextState: state,
    eventType,
    reason,
    didAdvanceSession,
    targetDecisions: decisions,
    outcomes: outcomeObject,
  };
}
