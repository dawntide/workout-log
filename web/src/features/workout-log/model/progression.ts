import { apiGet } from "@/shared/api";
import { mapExerciseNameToTarget as mapExerciseNameToProgressionTarget } from "@workout/core/strength-engine/target-mapping";
import type {
  WorkoutExerciseViewModel,
  WorkoutProgramExerciseEntryStateMap,
} from "@/entities/workout-record";
import type {
  FailureProtocolDecision,
  FailureProtocolMode,
  FailureProtocolResult,
  FailureProtocolTarget,
} from "@/components/ui/failure-protocol-sheet";

export type ProgressionTargetStateSnapshot = {
  workKg: number;
  failureStreak: number;
  successStreak: number;
};

export type ProgressionRuntimeStateSnapshot = {
  cycle: number;
  week: number;
  day: number;
  targets: Record<string, ProgressionTargetStateSnapshot>;
};

export type FailedProgressionExercise = {
  exerciseName: string;
  target: string;
};

export type ProgressionProtocolMode = "block-completion" | "greyskull-reset";

type ProgressionProgram =
  | "operator"
  | "greyskull-lp"
  | "starting-strength-lp"
  | "stronglifts-5x5"
  | "texas-method"
  | "gzclp"
  | "wendler-531"
  | "asymptote"
  | null;

export type ProgressionEffectiveRule = {
  progressionTarget: string;
  increaseKg: number;
  decreaseKg: number | null;
  resetFactor: number;
  defaultIncreaseKg: number;
  defaultResetFactor: number;
};

type ProgressionStateResponse = {
  program: ProgressionProgram;
  state: ProgressionRuntimeStateSnapshot | null;
  effectiveRules?: Record<string, ProgressionEffectiveRule>;
};

function snapTo2p5(value: number) {
  return Math.max(0, Math.round(value / 2.5) * 2.5);
}

function computeResetKgFromRule(workKg: number, rule: ProgressionEffectiveRule | undefined, fallbackFactor: number): number {
  if (rule?.decreaseKg !== null && rule?.decreaseKg !== undefined) {
    return snapTo2p5(workKg - rule.decreaseKg);
  }
  const factor = rule?.resetFactor ?? fallbackFactor;
  return snapTo2p5(workKg * factor);
}

function resolveIncreaseKgFromRule(key: string, rule: ProgressionEffectiveRule | undefined, lowerDefault: number, upperDefault: number): number {
  if (rule?.increaseKg !== undefined) return rule.increaseKg;
  return key === "DEADLIFT" || key === "SQUAT" ? lowerDefault : upperDefault;
}

export function detectFailedProgressionExercises(
  visibleExercises: WorkoutExerciseViewModel[],
  programEntryState: WorkoutProgramExerciseEntryStateMap,
): FailedProgressionExercise[] {
  const seen = new Set<string>();
  const failed: FailedProgressionExercise[] = [];
  for (const exercise of visibleExercises) {
    if (exercise.source !== "PROGRAM") continue;
    const entryState = programEntryState[exercise.id];
    if (!entryState) continue;
    const hasFail = exercise.set.repsPerSet.some((_, i) => {
      const actual = Number(entryState.repsInputs[i]?.trim() ?? "");
      const planned = entryState.plannedRepsPerSet[i];
      return Number.isFinite(actual) && actual > 0 && typeof planned === "number" && planned > 0 && actual < planned;
    });
    if (!hasFail) continue;
    const target = mapExerciseNameToProgressionTarget(exercise.exerciseName);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    failed.push({ exerciseName: exercise.exerciseName, target });
  }
  return failed;
}

function progressionTargetLabel(target: string, locale: "ko" | "en"): string {
  const labels =
    locale === "ko"
      ? { SQUAT: "스쿼트", BENCH: "벤치프레스", DEADLIFT: "데드리프트", OHP: "오버헤드프레스", PULL: "풀" }
      : { SQUAT: "Squat", BENCH: "Bench Press", DEADLIFT: "Deadlift", OHP: "Overhead Press", PULL: "Pull" };
  return labels[target as keyof typeof labels] ?? target;
}

function decideRecommendedMode(failureStreak: number): FailureProtocolMode {
  if (failureStreak >= 2) return "reset";
  if (failureStreak >= 1) return "hold";
  return "increase";
}

function buildReasonLabel(
  failureStreak: number,
  successStreak: number,
  locale: "ko" | "en",
): string {
  if (failureStreak >= 2) {
    return locale === "ko"
      ? `${failureStreak}회 연속 실패`
      : `${failureStreak} consecutive failures`;
  }
  if (failureStreak >= 1) {
    return locale === "ko" ? "직전 사이클 실패" : "Previous cycle failed";
  }
  if (successStreak >= 1) {
    return locale === "ko"
      ? `${successStreak}회 연속 성공`
      : `${successStreak} consecutive successes`;
  }
  return locale === "ko" ? "이전 사이클 성공" : "Previous cycle succeeded";
}

function buildBlockCompletionDescription(
  variant: "operator" | "wendler-531",
  locale: "ko" | "en",
): string {
  if (variant === "operator") {
    return locale === "ko"
      ? "6주 블록을 완료했습니다.\n다음 사이클에 적용할 무게를 선택하세요."
      : "You completed the 6-week block.\nChoose the working weights to apply to the next cycle.";
  }
  return locale === "ko"
    ? "4주 사이클을 완료했습니다.\n다음 사이클에 적용할 트레이닝 맥스를 선택하세요."
    : "You completed the 4-week cycle.\nChoose the training max to apply to the next cycle.";
}

function buildResetProtocolDescription(locale: "ko" | "en"): string {
  return locale === "ko"
    ? "연속 실패 기준에 도달했습니다.\n운동별로 다음 사이클 무게를 조정하세요."
    : "Consecutive failure threshold reached.\nAdjust the next-cycle weight per exercise.";
}

function buildBlockCompletionTargets(
  state: ProgressionRuntimeStateSnapshot | null,
  effectiveRules: Record<string, ProgressionEffectiveRule> | undefined,
  fallbackResetFactor: number,
  locale: "ko" | "en",
): FailureProtocolTarget[] {
  if (!state) return [];
  const targets: FailureProtocolTarget[] = [];
  for (const [key, t] of Object.entries(state.targets)) {
    if (t.workKg <= 0) continue;
    const rule = effectiveRules?.[key];
    const recommendedIncreaseKg = resolveIncreaseKgFromRule(key, rule, 5, 2.5);
    const recommendedResetKg = computeResetKgFromRule(t.workKg, rule, fallbackResetFactor);
    const recommendedMode = decideRecommendedMode(t.failureStreak);
    targets.push({
      key,
      label: progressionTargetLabel(key, locale),
      currentWorkKg: snapTo2p5(t.workKg),
      recommendedIncreaseKg,
      recommendedResetKg,
      recommendedMode,
      reasonLabel: buildReasonLabel(t.failureStreak, t.successStreak, locale),
    });
  }
  return targets;
}

function buildResetProtocolTargets(
  failures: FailedProgressionExercise[],
  state: ProgressionRuntimeStateSnapshot | null,
  effectiveRules: Record<string, ProgressionEffectiveRule> | undefined,
  fallbackResetFactor: number,
  locale: "ko" | "en",
): FailureProtocolTarget[] {
  const targets: FailureProtocolTarget[] = [];
  for (const f of failures) {
    const targetState = state?.targets[f.target];
    if (!targetState || targetState.workKg <= 0) continue;
    const rule = effectiveRules?.[f.target];
    const recommendedIncreaseKg = resolveIncreaseKgFromRule(f.target, rule, 5, 2.5);
    const recommendedResetKg = computeResetKgFromRule(targetState.workKg, rule, fallbackResetFactor);
    targets.push({
      key: f.target,
      label: f.exerciseName || progressionTargetLabel(f.target, locale),
      currentWorkKg: snapTo2p5(targetState.workKg),
      recommendedIncreaseKg,
      recommendedResetKg,
      recommendedMode: "reset",
      reasonLabel: buildReasonLabel(targetState.failureStreak, targetState.successStreak, locale),
    });
  }
  return targets;
}

export type ResolvedProgressionOverride = {
  cancelled: boolean;
  decisions: Record<string, FailureProtocolDecision> | null;
};

export async function resolveWorkoutLogProgressionOverride({
  selectedPlanId,
  autoProgressionEnabled,
  sessionWeek,
  sessionDay,
  visibleExercises,
  programEntryState,
  locale,
  requestChoice,
}: {
  selectedPlanId: string | null | undefined;
  autoProgressionEnabled: boolean;
  sessionWeek: number | null;
  sessionDay: number | null;
  visibleExercises: WorkoutExerciseViewModel[];
  programEntryState: WorkoutProgramExerciseEntryStateMap;
  locale: "ko" | "en";
  requestChoice: (input: {
    title: string;
    description: string;
    mode: ProgressionProtocolMode;
    targets: FailureProtocolTarget[];
  }) => Promise<FailureProtocolResult>;
}): Promise<ResolvedProgressionOverride> {
  // REF5 owns PASS/HOLD/FAIL/INVALID and its exact ±2.5 kg decisions. The generic
  // failure-protocol sheet would double-apply an unrelated LP/block policy.
  if (visibleExercises.some((exercise) => Boolean(exercise.ref5))) {
    return { cancelled: false, decisions: null };
  }
  if (!selectedPlanId || !autoProgressionEnabled) {
    return { cancelled: false, decisions: null };
  }

  const isOperatorBlockEnd = sessionWeek === 6 && sessionDay === 3;
  const is531BlockEnd = sessionWeek === 4 && sessionDay === 4;
  const failures = detectFailedProgressionExercises(visibleExercises, programEntryState);
  const shouldCheck = isOperatorBlockEnd || is531BlockEnd || failures.length > 0;
  if (!shouldCheck) {
    return { cancelled: false, decisions: null };
  }

  try {
    const progressionData = await apiGet<ProgressionStateResponse>(
      `/api/plans/${encodeURIComponent(selectedPlanId)}/progression-state`,
    );

    if (progressionData.program === "operator" && isOperatorBlockEnd) {
      // TB 공식 reset = 현재 TM의 90%(10% 감량). effectiveRules.resetFactor 부재 시 폴백.
      const targets = buildBlockCompletionTargets(progressionData.state, progressionData.effectiveRules, 0.9, locale);
      if (targets.length === 0) {
        return { cancelled: false, decisions: null };
      }
      const result = await requestChoice({
        title: locale === "ko" ? "블록 완료 - 무게 설정" : "Block Complete - Set Weights",
        description: buildBlockCompletionDescription("operator", locale),
        mode: "block-completion",
        targets,
      });
      if (result.choice === "cancel") {
        return { cancelled: true, decisions: null };
      }
      return { cancelled: false, decisions: result.decisions };
    }

    if (progressionData.program === "wendler-531" && is531BlockEnd) {
      const targets = buildBlockCompletionTargets(progressionData.state, progressionData.effectiveRules, 0.9, locale);
      if (targets.length === 0) {
        return { cancelled: false, decisions: null };
      }
      const result = await requestChoice({
        title: locale === "ko" ? "4주 사이클 완료 - TM 설정" : "4-Week Cycle Complete - Set TMs",
        description: buildBlockCompletionDescription("wendler-531", locale),
        mode: "block-completion",
        targets,
      });
      if (result.choice === "cancel") {
        return { cancelled: true, decisions: null };
      }
      return { cancelled: false, decisions: result.decisions };
    }

    if (progressionData.program !== null && progressionData.program !== "operator" && failures.length > 0) {
      const fallbackResetFactor = progressionData.program === "gzclp" ? 0.85 : 0.9;
      const resetFailures = failures.filter(
        (f) => (progressionData.state?.targets[f.target]?.failureStreak ?? 0) >= 2,
      );
      if (resetFailures.length > 0) {
        const targets = buildResetProtocolTargets(
          resetFailures,
          progressionData.state,
          progressionData.effectiveRules,
          fallbackResetFactor,
          locale,
        );
        if (targets.length === 0) {
          return { cancelled: false, decisions: null };
        }
        const result = await requestChoice({
          title: locale === "ko" ? "연속 실패 기준 도달" : "Consecutive Failure Threshold Reached",
          description: buildResetProtocolDescription(locale),
          mode: "greyskull-reset",
          targets,
        });
        if (result.choice === "cancel") {
          return { cancelled: true, decisions: null };
        }
        return { cancelled: false, decisions: result.decisions };
      }
    }
  } catch {
    return { cancelled: false, decisions: null };
  }

  return { cancelled: false, decisions: null };
}
