import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import { mapExerciseNameToTarget as mapExerciseToTarget } from "@workout/core/strength-engine/target-mapping";
import {
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
  deriveAsymptoteAuxTms,
} from "../program-engine/asymptote";
import {
  MADCOW_FAIL_RESET_THRESHOLD,
  MADCOW_RESET_FACTOR,
  MADCOW_WEEKLY_INCREASE_KG,
} from "../program-store/madcow-blueprint";
import {
  NSUNS_FAIL_RESET_THRESHOLD,
  NSUNS_RESET_FACTOR,
  nsunsTmIncreaseKg,
} from "../program-store/nsuns-blueprint";

export type ProgressionProgram =
  | "operator"
  | "greyskull-lp"
  | "starting-strength-lp"
  | "stronglifts-5x5"
  | "texas-method"
  | "gzclp"
  | "wendler-531"
  | "asymptote"
  | "madcow-5x5"
  | "nsuns-lp"
  | "reddit-ppl"
  | "phul";

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
  amrapReps?: number; // gzclp T3: amrap 세트 실측 reps(마지막값). undefined면 비-amrap 슬롯.
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
  // 처방에는 포함되지만 진행 판정의 기준이 아닌 세트. 예: Texas v2의 볼륨일/회복일은
  // 강도일(I) 작업중량에서 파생될 뿐, 자체 성공으로 I 중량을 올리면 안 된다.
  if (set.meta?.progressionExcluded === true) return null;

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
    // 하체(SQUAT/DEADLIFT) +10lb(≈5kg). 정체로 재구축 시 현재 TM의 90%로 리셋(공식 포럼).
    defaults = {
      increaseEverySuccesses: 3,
      failResetThreshold: 2,
      increaseKg: target === "DEADLIFT" || target === "SQUAT" ? 5 : 2.5,
      resetFactor: 0.9,
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
    // Cody Lefever GZCLP 공식 룰: T1/T2 증량은 하체(SQUAT/DEADLIFT) +10lb(≈5kg),
    // 상체(BENCH/OHP) +5lb(≈2.5kg)/세션. 마지막 stage 소진 후 실패에만 새 5RM의 85%로 리셋.
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: 3,
      increaseKg: target === "DEADLIFT" || target === "SQUAT" ? 5 : 2.5,
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
  } else if (program === "madcow-5x5") {
    // Madcow 5x5: 주 1회(금요일 PR 트리플, 수요일 OHP/DL 탑세트) 도달 → 전 리프트 +2.5kg 고정.
    // 원전은 "탑세트 약 2.5%"인데 앱 그리드가 2.5kg라 퍼센트 누적이 경량 리프트에서 반올림에
    // 흡수된다(45×1.025=46.1→45, 영구 정체). 2.5kg 고정이 스쿼트 원전(주 5lb≈2.27kg)에 가장
    // 가까운 그리드 근사다. 2주 연속 실패 시 ×0.9 디로드 후 재램프(원전 규칙).
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: MADCOW_FAIL_RESET_THRESHOLD,
      increaseKg: MADCOW_WEEKLY_INCREASE_KG,
      resetFactor: MADCOW_RESET_FACTOR,
    };
  } else if (program === "nsuns-lp") {
    // nSuns LP: T1은 95%×1+ AMRAP 실측 reps로 증가폭이 갈리므로(전용 분기) 여기 값은 T2(보조)
    // 슬롯의 LP에 쓰인다 — 완수 시 하체 +5 / 상체 +2.5.
    defaults = {
      increaseEverySuccesses: 1,
      failResetThreshold: 3,
      increaseKg: target === "DEADLIFT" || target === "SQUAT" ? 5 : 2.5,
      resetFactor: NSUNS_RESET_FACTOR,
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
    // greyskull-lp, starting-strength-lp, stronglifts-5x5, reddit-ppl, phul:
    // 매 세션 증량, 3회 연속 실패 시 10% 감소.
    // reddit-ppl 원전(세션당 상체 5lb·데드 10lb, 3연속 실패 시 -10%)과 정확히 같은 규칙이고,
    // phul은 "레인지 상단 달성 시 증량"이라 처방 reps를 상단(파워데이 5회)으로 두어 같은 규칙에 태운다.
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
    program === "operator" ||
    program === "gzclp" ||
    program === "texas-method" ||
    // madcow/nsuns는 운동별(EX_) 슬롯 키를 쓴다 — 고정 family target 집합이 아니다.
    program === "madcow-5x5" ||
    program === "nsuns-lp"
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

// 정석 stage/주간 모델(v2) 옵트인 플래그. 기존 플랜은 부재로 기존 LP 유지(forward-only) →
// 진행 중 유저의 rep 스킴이 갑자기 바뀌는 체감 변화·rebuild 과거 오염 방지.
// Operator 계열(TB Operator/Fighter/Zulu)의 주당 세션 수. 블록(6주) 완주 판정과 요일 롤오버에 쓴다.
// 미설정/이상값은 3(Operator 기본)으로 떨어져 기존 플랜의 진행이 바뀌지 않는다.
function readOperatorSessionsPerWeek(planParams: unknown): number {
  const raw = toFiniteNumber((planParams as { sessionsPerWeek?: unknown } | null)?.sessionsPerWeek);
  if (raw === null) return 3;
  const normalized = Math.floor(raw);
  return normalized >= 1 && normalized <= 7 ? normalized : 3;
}

function isProgressionModelV2(planParams: unknown): boolean {
  return (planParams as { progressionModel?: unknown } | null | undefined)?.progressionModel === "v2";
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
  if (slug === "madcow-5x5") return "madcow-5x5";
  if (slug === "nsuns-lp-5day") return "nsuns-lp";
  if (slug === "reddit-ppl-6day") return "reddit-ppl";
  if (slug === "phul") return "phul";
  if (kind === "operator" || family === "operator" || def.operatorStyle === true) return "operator";
  if (kind === "greyskull-lp" || family === "greyskull-lp") return "greyskull-lp";
  if (kind === "starting-strength-lp" || family === "starting-strength-lp") return "starting-strength-lp";
  if (kind === "stronglifts-5x5" || family === "stronglifts-5x5") return "stronglifts-5x5";
  if (kind === "texas-method" || family === "texas-method") return "texas-method";
  if (kind === "gzclp" || family === "gzclp") return "gzclp";
  if (kind === "531" || family === "wendler-531") return "wendler-531";
  if (kind === "asymptote" || family === "asymptote") return "asymptote";
  if (kind === "madcow-5x5" || family === "madcow-5x5") return "madcow-5x5";
  if (kind === "nsuns-lp" || family === "nsuns-lp") return "nsuns-lp";
  if (kind === "reddit-ppl" || family === "reddit-ppl") return "reddit-ppl";
  if (kind === "phul" || family === "phul") return "phul";
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

// reducer state의 슬롯별 stage(gzclp 강등 단계)를 처방 params로 흘리는 맵.
// extractTrainingMaxOverridesFromState의 짝 — 처방이 stage별 세트 스킴(6×2/10×1 등)을 도출한다.
// stage 0/미설정은 기본 스킴(저장 세트)이므로 맵에서 생략한다.
export function extractStageOverridesFromState(state: unknown): Record<string, number> {
  const runtime = (state ?? {}) as Partial<ProgressionRuntimeState>;
  const targets = runtime.targets ?? {};
  const out: Record<string, number> = {};

  for (const [key, targetState] of Object.entries(targets)) {
    const stage = toFiniteNumber((targetState as TargetRuntimeState)?.stage);
    if (stage === null || stage <= 0) continue;
    out[key] = Math.floor(stage);
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
      amrapReps?: number;
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

    // amrap 세트의 실측 reps를 보존 — 마지막값. gzclp T3는 plannedRef.amrap(슬롯형)로,
    // greyskull(v2) 같은 uniform LP는 plannedRef 없이 meta.amrap만 스탬프되므로 둘 다 인정한다.
    const amrapPlanned = readPlannedRef(set.meta);
    const isAmrapSet =
      amrapPlanned.amrap === true ||
      (set.meta as Record<string, unknown> | undefined)?.amrap === true;
    if (isAmrapSet) {
      const amrapReps = toFiniteNumber(set.reps);
      if (amrapReps !== null && amrapReps >= 0) outcome.amrapReps = Math.floor(amrapReps);
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
      amrapReps: value.amrapReps,
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
  // F1(v0.5.1): 조기 디로드 점프가 발동하면 어떤 드라이버의 렙 급감 때문이었는지 기록한다.
  // 판정에는 쓰지 않는다 — 결과 reason(plan_progress_event)으로만 흘러 UI 배너의 근거가 된다.
  let earlyDeloadRegressed: ProgressionTarget[] | null = null;
  // 공통 피드백 레이어: operator·531 블록 완주가 실패 누적으로 증량 동결될 때 어떤 리프트
  // 때문이었는지 기록한다(기존 완전 무기록 — 조기 디로드와 같은 유형). 판정에는 쓰지 않는다.
  let blockFreezeFailed: string[] | null = null;
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

    // gzclp 정석 stage 머신 (v2 옵트인). T1/T2는 실패 시 무게를 유지한 채 rep 스킴을 강등
    // (5×3 → 6×2 → 10×1, stage 0→1→2)하고, stage 소진(2) 후의 실패에만 무게를 리셋한다.
    // T3(amrap 슬롯)는 마지막 세트 실측 reps ≥ 25일 때만 증량. tier(T1/T2) 구분은 reducer엔
    // 불필요 — 두 tier의 전이가 동일하고, 차이는 처방의 stage별 세트뿐(D2).
    if (input.program === "gzclp" && isProgressionModelV2(input.planParams)) {
      const gzRule = rulesFor(
        input.program,
        progressionTarget,
        readIncrementOverride(input.planParams, key, progressionTarget),
      );
      if (typeof outcome.amrapReps === "number") {
        // T3 AMRAP: 마지막 세트 ≥ 25 → 증량, 아니면 유지
        if (outcome.amrapReps >= 25) {
          next.workKg = toPositiveRounded2p5(next.workKg + gzRule.increaseKg);
          eventType = "INCREASE";
          reason = `increase:amrap>=25:+${gzRule.increaseKg}kg`;
        } else {
          reason = "hold:amrap<25";
        }
        next.successStreak = 0;
        next.failureStreak = 0;
      } else if (success) {
        // T1/T2 stage 클리어 → 증량 + stage 0 복귀
        next.workKg = toPositiveRounded2p5(next.workKg + gzRule.increaseKg);
        next.stage = 0;
        next.successStreak = 0;
        next.failureStreak = 0;
        eventType = "INCREASE";
        reason = `increase:stage-clear:+${gzRule.increaseKg}kg`;
      } else {
        // T1/T2 실패 → rep 스킴 강등(stage++). stage 2 소진 후 실패에만 무게 리셋.
        const curStage = Math.max(0, Math.floor(next.stage ?? 0));
        if (curStage < 2) {
          next.stage = curStage + 1;
          eventType = "HOLD";
          reason = `stage-down:${curStage}->${curStage + 1}`;
        } else {
          next.workKg = toPositiveRounded2p5(next.workKg * gzRule.resetFactor);
          next.stage = 0;
          eventType = "RESET";
          reason = `reset:stage-exhausted:*${gzRule.resetFactor}`;
        }
        next.successStreak = 0;
        next.failureStreak = 0;
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

    // 한계2 texas 주간 모델(v2 옵트인). 처방이 V/R(볼륨·회복일) 슬롯엔 progressionKey를 흘리지
    // 않아(reducer 미도달) 여기엔 I(강도일) 슬롯만 도달한다. I day 성공 → 즉시 증량(매주 1회),
    // 실패 누적 → reset(×resetFactor). V/R 무게는 처방이 I workKg×계수(0.9/0.8)로 파생하므로
    // reducer는 I만 굴린다(슬롯 독립 LP 대신 I가 주간 전체를 끄는 단일 기준).
    if (input.program === "texas-method" && isProgressionModelV2(input.planParams)) {
      const txRule = rulesFor(
        input.program,
        progressionTarget,
        readIncrementOverride(input.planParams, key, progressionTarget),
      );
      if (success) {
        next.workKg = toPositiveRounded2p5(next.workKg + txRule.increaseKg);
        next.successStreak = 0;
        next.failureStreak = 0;
        eventType = "INCREASE";
        reason = `increase:weekly:+${txRule.increaseKg}kg`;
      } else {
        next.failureStreak += 1;
        next.successStreak = 0;
        reason = "hold:intensity-fail";
        if (next.failureStreak >= txRule.failResetThreshold) {
          next.workKg = toPositiveRounded2p5(next.workKg * txRule.resetFactor);
          next.failureStreak = 0;
          eventType = "RESET";
          reason = `reset:intensity-fail:*${txRule.resetFactor}`;
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

    // nSuns LP. 한 운동의 TM을 여러 요일이 공유하므로 처방이 driver 슬롯에만 progressionKey를
    // 흘린다(비-driver는 skipProgression) — 여기 도달하는 건 리프트당 주 1회다.
    //  · T1: 95%×1+ 세트의 실측 reps가 TM 증가폭을 정한다(2~3→+2.5, 4~5→+5, 6+→+7.5).
    //    0~1회는 무게가 과하다는 신호라 증량 없이 홀드하고, 2회 연속이면 ×0.9로 재빌드한다.
    //  · T2(보조 전용 리프트): AMRAP이 없으므로 전 세트 완수 기준 LP(하체 +5 / 상체 +2.5).
    if (input.program === "nsuns-lp") {
      const nsRule = rulesFor(
        input.program,
        progressionTarget,
        readIncrementOverride(input.planParams, key, progressionTarget),
      );
      const amrapReps = toFiniteNumber(outcome.amrapReps);

      if (amrapReps !== null) {
        const increaseKg = nsunsTmIncreaseKg(amrapReps);
        if (increaseKg > 0) {
          next.workKg = toPositiveRounded2p5(next.workKg + increaseKg);
          next.successStreak += 1;
          next.failureStreak = 0;
          eventType = "INCREASE";
          reason = `increase:amrap-${amrapReps}reps:+${increaseKg}kg`;
        } else {
          next.failureStreak += 1;
          next.successStreak = 0;
          reason = `hold:amrap-${amrapReps}reps`;
          if (next.failureStreak >= NSUNS_FAIL_RESET_THRESHOLD) {
            next.workKg = toPositiveRounded2p5(next.workKg * NSUNS_RESET_FACTOR);
            next.failureStreak = 0;
            eventType = "RESET";
            reason = `reset:amrap-stall:*${NSUNS_RESET_FACTOR}`;
          }
        }
      } else if (success) {
        next.workKg = toPositiveRounded2p5(next.workKg + nsRule.increaseKg);
        next.successStreak += 1;
        next.failureStreak = 0;
        eventType = "INCREASE";
        reason = `increase:t2:+${nsRule.increaseKg}kg`;
      } else {
        next.failureStreak += 1;
        next.successStreak = 0;
        reason = "hold:t2-failure";
        if (next.failureStreak >= nsRule.failResetThreshold) {
          next.workKg = toPositiveRounded2p5(next.workKg * nsRule.resetFactor);
          next.failureStreak = 0;
          eventType = "RESET";
          reason = `reset:t2-fail:*${nsRule.resetFactor}`;
        }
      }

      state.targets[key] = next;
      decisions.push({
        key,
        target: outcome.displayTarget,
        progressionTarget,
        outcome: eventType === "INCREASE" ? "SUCCESS" : "FAIL",
        reason,
        eventType,
        before,
        after: next,
      });
      continue;
    }

    // Greyskull LP 정석(v2 옵트인). 메인 리프트 마지막 세트가 AMRAP(5+)이며, 그 실측 reps가
    // 진행을 자기조절한다: ≥10이면 더블 프로그레션(증량 2배, Phrak's), ≥5이면 단일 증량,
    // <5(실패)는 2회 연속 시 디로드(×resetFactor=0.9). 같은 무게의 work set과 AMRAP을 함께 쓰므로
    // "AMRAP≥5 ⟺ 전 세트 성공"으로 단순화한다. AMRAP 세트가 없으면(레거시/누락) 기본 success로 폴백.
    if (input.program === "greyskull-lp" && isProgressionModelV2(input.planParams)) {
      const gsRule = rulesFor(
        input.program,
        progressionTarget,
        readIncrementOverride(input.planParams, key, progressionTarget),
      );
      const amrapReps = toFiniteNumber(outcome.amrapReps);
      const GREYSKULL_AMRAP_MIN = 5;
      const GREYSKULL_DOUBLE_AT = 10;
      const passed = amrapReps !== null ? amrapReps >= GREYSKULL_AMRAP_MIN : success;

      if (passed) {
        const isDouble = amrapReps !== null && amrapReps >= GREYSKULL_DOUBLE_AT;
        const inc = isDouble ? gsRule.increaseKg * 2 : gsRule.increaseKg;
        next.workKg = toPositiveRounded2p5(next.workKg + inc);
        next.successStreak += 1;
        next.failureStreak = 0;
        eventType = "INCREASE";
        reason = isDouble
          ? `increase:amrap-${amrapReps}reps:double:+${inc}kg`
          : amrapReps !== null
            ? `increase:amrap-${amrapReps}reps:single:+${inc}kg`
            : `increase:+${inc}kg`;
      } else {
        next.failureStreak += 1;
        next.successStreak = 0;
        reason = "hold:failure-streak";
        // Phrak's: 2회 연속 실패 시 디로드.
        if (next.failureStreak >= 2) {
          if (gsRule.decreaseKg !== null) {
            next.workKg = toPositiveRounded2p5(next.workKg - gsRule.decreaseKg);
            reason = `reset:-${gsRule.decreaseKg}kg`;
          } else {
            next.workKg = toPositiveRounded2p5(next.workKg * gsRule.resetFactor);
            reason = `reset:*${gsRule.resetFactor}`;
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
        outcome: passed ? "SUCCESS" : "FAIL",
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

  // 세션 템플릿이 순환하는 선형 프로그램. 이들은 target 판정과 별개로 실제 프로그램 세트를
  // 저장하면 다음 템플릿으로 이동해야 한다. 특히 Texas V/R처럼 progressionExcluded인 날과
  // 0렙 실패 세션도 수행한 세션이므로 순환에 포함한다.
  const rotatingSessionCount =
    input.program === "starting-strength-lp" ||
    input.program === "stronglifts-5x5" ||
    input.program === "greyskull-lp"
      ? 2
      : input.program === "texas-method" || input.program === "madcow-5x5"
        ? 3
        : input.program === "gzclp"
          ? 4
          : input.program === "nsuns-lp"
            ? 5
            : input.program === "reddit-ppl"
              ? 6
              : input.program === "phul"
                ? 4
                : null;
  const hasLoggedProgramSet = input.sets.some((set) => {
    if (set.isExtra) return false;
    const reps = toFiniteNumber(set.reps);
    return Boolean(String(set.exerciseName ?? "").trim()) && reps !== null && reps >= 0;
  });

  if (rotatingSessionCount !== null && hasLoggedProgramSet) {
    state.day += 1;
    if (state.day > rotatingSessionCount) {
      state.day = 1;
      state.week += 1;
    }
    didAdvanceSession = true;
  }

  if (input.program === "operator") {
    const loggedTargets = Array.from(outcomes.keys()).filter((key) => outcomes.get(key)?.total);
    // Tactical Barbell 템플릿별 주당 세션 수(Operator 3 / Fighter 2 / Zulu 4). reducer는 프로그램
    // 정의를 못 보므로 시작 시 정의의 schedule.sessionsPerWeek에서 흘러온 planParams 값을 읽는다.
    // 값이 없으면 3 — 기존 Operator 플랜은 이 필드가 없어도 동작이 그대로다.
    const sessionsPerWeek = readOperatorSessionsPerWeek(input.planParams);
    const completedBlock = state.week === 6 && state.day === sessionsPerWeek;

    if (loggedTargets.length > 0) {
      state.day += 1;
      if (state.day > sessionsPerWeek) {
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
        // 기록만: 동결의 원인 리프트(failureStreak>0)를 리셋 전에 수집 — 판정(동결) 자체는 불변.
        blockFreezeFailed = targetEntries
          .filter(([, targetState]) => (targetState?.failureStreak ?? 0) > 0)
          .map(([key, targetState]) => String(targetState?.progressionTarget ?? key));
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
        // 기록만: operator와 동일 — 동결 원인 리프트를 리셋 전에 수집(판정 불변).
        blockFreezeFailed = targetEntries
          .filter(([, targetState]) => (targetState?.failureStreak ?? 0) > 0)
          .map(([key, targetState]) => String(targetState?.progressionTarget ?? key));
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

    // 하이브리드 트리거 조기 디로드 (asymptote-async-hybrid.md §3.3):
    // 드라이버(SQ/BP/PULL) 중 2개 이상이 최근 노출에서 그라인딩으로 렙 급감(failureStreak ≥ 2)이면
    // 빌드 사이클(week 1~3) 중에 즉시 디로드 사이클(week 4)로 점프해 누적 피로를 끊는다. 고정
    // 사이클4(바닥 보험)는 유지하되 트리거가 그것을 앞당기는 천장 역할. 정상 진행(streak 0)엔 미발동.
    if (!completedBlock && loggedTargets.length > 0 && state.week >= 1 && state.week < 4) {
      const drivers: ProgressionTarget[] = ["SQUAT", "BENCH", "PULL"];
      const regressed = drivers.filter((d) => (state.targets[d]?.failureStreak ?? 0) >= 2);
      if (regressed.length >= 2) {
        // 디로드 사이클 선두로 점프. 블록은 week4/day3에서 평소대로 완료(TM 유지)된다.
        state.week = 4;
        state.day = 1;
        earlyDeloadRegressed = regressed;
      }
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
      : earlyDeloadRegressed
        ? `deload:trigger:regressed=${earlyDeloadRegressed.join(",")}`
        : blockFreezeFailed && blockFreezeFailed.length > 0
          ? `freeze:block:failed=${blockFreezeFailed.join(",")}`
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
