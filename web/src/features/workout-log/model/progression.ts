import { apiGet } from "@/shared/api";
import type {
  WorkoutExerciseViewModel,
  WorkoutProgramExerciseEntryStateMap,
} from "@/entities/workout-record";

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
export type ProgressionProtocolChoice = "cancel" | "hold" | "reset" | "increase";

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

function mapExerciseNameToProgressionTarget(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (n.includes("squat")) return "SQUAT";
  if (n.includes("bench")) return "BENCH";
  if (n.includes("deadlift")) return "DEADLIFT";
  if (n.includes("overhead press") || n === "ohp" || n.includes("shoulder press")) return "OHP";
  if (n.includes("row") || n.includes("pull-up") || n.includes("pull up") || n.includes("pulldown")) return "PULL";
  return null;
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

function formatResetCopy(workKg: number, resetKg: number, rule: ProgressionEffectiveRule | undefined, locale: "ko" | "en", fallbackFactor: number): string {
  if (rule?.decreaseKg !== null && rule?.decreaseKg !== undefined) {
    return locale === "ko" ? `감소(-${rule.decreaseKg}kg) → ${resetKg}kg` : `Reduce (-${rule.decreaseKg}kg) -> ${resetKg}kg`;
  }
  const factor = rule?.resetFactor ?? fallbackFactor;
  const pct = Math.round((1 - factor) * 100);
  return locale === "ko" ? `감소(${pct}%) → ${resetKg}kg` : `Reduce (${pct}%) -> ${resetKg}kg`;
}

function buildOperatorBlockCompletionMessage(
  state: ProgressionRuntimeStateSnapshot | null,
  effectiveRules: Record<string, ProgressionEffectiveRule> | undefined,
  locale: "ko" | "en",
): string {
  const lines: string[] =
    locale === "ko"
      ? ["6주 블록을 완료했습니다.", "다음 사이클에 적용할 무게를 선택하세요.", ""]
      : ["You completed the 6-week block.", "Choose the working weights to apply to the next cycle.", ""];
  if (state) {
    const hadFailure = Object.values(state.targets).some((t) => t.failureStreak > 0);
    if (hadFailure) {
      lines.push(locale === "ko" ? "이번 블록에서 실패가 있었습니다." : "There were failed sets in this block.");
      lines.push("");
    }
    for (const [key, t] of Object.entries(state.targets)) {
      if (t.workKg <= 0) continue;
      const label = progressionTargetLabel(key, locale);
      const rule = effectiveRules?.[key];
      const increaseKg = resolveIncreaseKgFromRule(key, rule, 5, 2.5);
      const resetKg = computeResetKgFromRule(t.workKg, rule, 0.95);
      const resetCopy = formatResetCopy(t.workKg, resetKg, rule, locale, 0.95);
      lines.push(`• ${label}: ${t.workKg}kg`);
      lines.push(
        locale === "ko"
          ? `  증량(+${increaseKg}kg) → ${t.workKg + increaseKg}kg / 유지 → ${t.workKg}kg / ${resetCopy}`
          : `  Increase (+${increaseKg}kg) -> ${t.workKg + increaseKg}kg / Keep -> ${t.workKg}kg / ${resetCopy}`,
      );
    }
  }
  return lines.join("\n");
}

function build531BlockCompletionMessage(
  state: ProgressionRuntimeStateSnapshot | null,
  effectiveRules: Record<string, ProgressionEffectiveRule> | undefined,
  locale: "ko" | "en",
): string {
  const lines: string[] =
    locale === "ko"
      ? ["4주 사이클을 완료했습니다.", "다음 사이클에 적용할 트레이닝 맥스를 선택하세요.", ""]
      : ["You completed the 4-week cycle.", "Choose the training max to apply to the next cycle.", ""];
  if (state) {
    const hadFailure = Object.values(state.targets).some((t) => t.failureStreak > 0);
    if (hadFailure) {
      lines.push(locale === "ko" ? "이번 사이클에서 실패한 세트가 있었습니다." : "There were failed sets in this cycle.");
      lines.push("");
    }
    for (const [key, t] of Object.entries(state.targets)) {
      if (t.workKg <= 0) continue;
      const label = progressionTargetLabel(key, locale);
      const rule = effectiveRules?.[key];
      const increaseKg = resolveIncreaseKgFromRule(key, rule, 5, 2.5);
      const resetKg = computeResetKgFromRule(t.workKg, rule, 0.9);
      const resetCopy = formatResetCopy(t.workKg, resetKg, rule, locale, 0.9);
      lines.push(`• ${label}: ${t.workKg}kg`);
      lines.push(
        locale === "ko"
          ? `  증량(+${increaseKg}kg) → ${t.workKg + increaseKg}kg / 유지 → ${t.workKg}kg / ${resetCopy}`
          : `  Increase (+${increaseKg}kg) -> ${t.workKg + increaseKg}kg / Keep -> ${t.workKg}kg / ${resetCopy}`,
      );
    }
  }
  return lines.join("\n");
}

function buildResetProtocolMessage(
  failures: FailedProgressionExercise[],
  state: ProgressionRuntimeStateSnapshot | null,
  effectiveRules: Record<string, ProgressionEffectiveRule> | undefined,
  fallbackResetFactor: number,
  locale: "ko" | "en",
): string {
  const lines: string[] = [locale === "ko" ? "3회 연속 실패 기준에 도달했습니다." : "Three consecutive failures were reached.", ""];
  for (const f of failures) {
    const workKg = state?.targets[f.target]?.workKg ?? null;
    if (workKg !== null) {
      const rule = effectiveRules?.[f.target];
      const resetKg = computeResetKgFromRule(workKg, rule, fallbackResetFactor);
      const increaseKg = resolveIncreaseKgFromRule(f.target, rule, 5, 2.5);
      const resetCopy = formatResetCopy(workKg, resetKg, rule, locale, fallbackResetFactor);
      lines.push(`• ${f.exerciseName}: ${workKg}kg`);
      lines.push(
        locale === "ko"
          ? `  ${resetCopy} / 유지 → ${workKg}kg / 증량(+${increaseKg}kg) → ${workKg + increaseKg}kg`
          : `  ${resetCopy} / Keep -> ${workKg}kg / Increase (+${increaseKg}kg) -> ${workKg + increaseKg}kg`,
      );
    } else {
      lines.push(`• ${f.exerciseName}`);
    }
  }
  return lines.join("\n");
}

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
  sessionWeek: number;
  sessionDay: number;
  visibleExercises: WorkoutExerciseViewModel[];
  programEntryState: WorkoutProgramExerciseEntryStateMap;
  locale: "ko" | "en";
  requestChoice: (input: {
    title: string;
    message: string;
    mode: ProgressionProtocolMode;
  }) => Promise<ProgressionProtocolChoice>;
}): Promise<{
  cancelled: boolean;
  override: "hold" | "increase" | "reset" | null;
}> {
  if (!selectedPlanId || !autoProgressionEnabled) {
    return { cancelled: false, override: null };
  }

  const isOperatorBlockEnd = sessionWeek === 6 && sessionDay === 3;
  const is531BlockEnd = sessionWeek === 4 && sessionDay === 4;
  const failures = detectFailedProgressionExercises(visibleExercises, programEntryState);
  const shouldCheck = isOperatorBlockEnd || is531BlockEnd || failures.length > 0;
  if (!shouldCheck) {
    return { cancelled: false, override: null };
  }

  try {
    const progressionData = await apiGet<ProgressionStateResponse>(
      `/api/plans/${encodeURIComponent(selectedPlanId)}/progression-state`,
    );

    if (progressionData.program === "operator" && isOperatorBlockEnd) {
      const choice = await requestChoice({
        title: locale === "ko" ? "블록 완료 - 무게 설정" : "Block Complete - Set Weights",
        message: buildOperatorBlockCompletionMessage(progressionData.state, progressionData.effectiveRules, locale),
        mode: "block-completion",
      });
      if (choice === "cancel") {
        return { cancelled: true, override: null };
      }
      return {
        cancelled: false,
        override: choice === "increase" ? "increase" : choice === "hold" ? "hold" : choice === "reset" ? "reset" : null,
      };
    }

    if (progressionData.program === "wendler-531" && is531BlockEnd) {
      const choice = await requestChoice({
        title: locale === "ko" ? "4주 사이클 완료 - TM 설정" : "4-Week Cycle Complete - Set TMs",
        message: build531BlockCompletionMessage(progressionData.state, progressionData.effectiveRules, locale),
        mode: "block-completion",
      });
      if (choice === "cancel") {
        return { cancelled: true, override: null };
      }
      return {
        cancelled: false,
        override: choice === "increase" ? "increase" : choice === "hold" ? "hold" : choice === "reset" ? "reset" : null,
      };
    }

    if (progressionData.program !== null && progressionData.program !== "operator" && failures.length > 0) {
      const fallbackResetFactor = progressionData.program === "gzclp" ? 0.85 : 0.9;
      const resetFailures = failures.filter(
        (f) => (progressionData.state?.targets[f.target]?.failureStreak ?? 0) >= 2,
      );
      if (resetFailures.length > 0) {
        const choice = await requestChoice({
          title: locale === "ko" ? "연속 실패 기준 도달" : "Consecutive Failure Threshold Reached",
          message: buildResetProtocolMessage(resetFailures, progressionData.state, progressionData.effectiveRules, fallbackResetFactor, locale),
          mode: "greyskull-reset",
        });
        if (choice === "cancel") {
          return { cancelled: true, override: null };
        }
        return {
          cancelled: false,
          override: choice === "hold" ? "hold" : choice === "increase" ? "increase" : null,
        };
      }
    }
  } catch {
    return { cancelled: false, override: null };
  }

  return { cancelled: false, override: null };
}
