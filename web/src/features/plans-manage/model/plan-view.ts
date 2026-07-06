// plans-manage 순수 모델 — 화면(app/plans/manage/plans-manage-content.tsx)에서 추출.
// 전부 프레임워크-무관 순수 함수/타입(감사 2026-07 §5.4-4 god-component 분해 1단계:
// "로직의 features/*/model 이동부터"). 데이터 로딩/뮤테이션 훅 추출은 후속.
import type { PlanForManage } from "@/server/services/plans/get-plans-for-manage";
import { selectDisplayStrengthBaselineKeys } from "@workout/core/program-store/model";

export type Plan = PlanForManage;
export type StrengthBaselineDraft = Record<string, { oneRepMaxKg: number; trainingMaxKg: number }>;

export type IncrementDraftEntry = {
  increaseKg: number;
  decreaseKg: number;
  defaultIncreaseKg: number;
  defaultResetFactor: number;
  workKg: number;
};
export type IncrementDraft = Record<string, IncrementDraftEntry>;

export type TargetLastEvent = {
  lastDeltaKg: number | null;
  lastEventType: "INCREASE" | "HOLD" | "RESET" | null;
};

export type ProgressionStateApiResponse = {
  program: string | null;
  state: {
    cycle: number;
    week: number;
    day: number;
    targets: Record<string, { workKg: number; progressionTarget?: string; failureStreak: number; successStreak: number }>;
  } | null;
  effectiveRules?: Record<
    string,
    {
      progressionTarget: string;
      increaseKg: number;
      decreaseKg: number | null;
      resetFactor: number;
      defaultIncreaseKg: number;
      defaultResetFactor: number;
    }
  >;
  targetsLastEvent?: Record<string, TargetLastEvent>;
};

export const TARGET_LABELS: Record<string, string> = {
  SQUAT: "Squat",
  BENCH: "Bench",
  DEADLIFT: "Deadlift",
  OHP: "OHP",
  PULL: "Pull",
};

export const TARGET_PRIORITY = ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"];
export const RECENT_THRESHOLD_DAYS = 7;

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function readPositiveNumberMap(value: unknown) {
  const source = toRecord(value);
  const next: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.trim().toUpperCase();
    const parsed = Number(rawValue);
    if (!key || !Number.isFinite(parsed) || parsed <= 0) continue;
    next[key] = Math.round(parsed * 100) / 100;
  }
  return next;
}

export function createStrengthBaselineDraft(params: unknown): StrengthBaselineDraft {
  const source = toRecord(params);
  const oneRepMaxKg = readPositiveNumberMap(source.oneRepMaxKg);
  const trainingMaxKg = readPositiveNumberMap(source.trainingMaxKg);
  const allKeys = Array.from(new Set([...Object.keys(oneRepMaxKg), ...Object.keys(trainingMaxKg)]));
  // per-exercise(EX_) 키와 짝을 이루는 family canonical 키(예: EX_BENCH_PRESS ↔ BENCH)는
  // 같은 운동의 중복 행이므로 표시에서 접는다. baseline 값 자체는 저장 시 fallbackKey로 동기화해 보존.
  const keys = selectDisplayStrengthBaselineKeys(allKeys).sort();

  const next: StrengthBaselineDraft = {};
  for (const key of keys) {
    next[key] = {
      oneRepMaxKg: oneRepMaxKg[key] ?? 0,
      trainingMaxKg: trainingMaxKg[key] ?? 0,
    };
  }
  return next;
}

export function targetLabelFromKey(key: string) {
  if (TARGET_LABELS[key]) return TARGET_LABELS[key];
  if (key.startsWith("EX_")) {
    return key
      .slice(3)
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }
  return key;
}

export function shortTargetLabel(key: string) {
  if (key === "DEADLIFT") return "DL";
  if (TARGET_LABELS[key]) return TARGET_LABELS[key];
  return targetLabelFromKey(key);
}

/**
 * 자동 진행 타깃 키를 맨몸 운동 감지용 이름으로 매핑.
 * 카드 라벨("Pull")은 isBodyweightExerciseName과 매칭되지 않으므로 키로 판별한다.
 * PULL → Pull-Up, EX_PULL_UP → "Pull Up" (둘 다 매칭됨).
 */
export function bodyweightExerciseNameForTargetKey(key: string): string {
  if (key === "PULL") return "Pull-Up";
  return targetLabelFromKey(key);
}

export function formatKg(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function planWithPatchedFields(prevPlan: Plan, updatedPlan: Plan): Plan {
  return {
    ...prevPlan,
    ...updatedPlan,
    baseProgramName: updatedPlan.baseProgramName ?? prevPlan.baseProgramName,
    lastPerformedAt: updatedPlan.lastPerformedAt ?? prevPlan.lastPerformedAt,
  };
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function formatRelativeDays(days: number | null, locale: "ko" | "en") {
  if (days === null) return null;
  if (days <= 0) return locale === "ko" ? "오늘" : "Today";
  if (days === 1) return locale === "ko" ? "어제" : "Yesterday";
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return locale === "ko" ? `${w}주 전` : `${w}w ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return locale === "ko" ? `${m}개월 전` : `${m}mo ago`;
  }
  const y = Math.floor(days / 365);
  return locale === "ko" ? `${y}년 전` : `${y}y ago`;
}

export function normalizeSearchText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function planTypeChipTone(type: Plan["type"]) {
  if (type === "COMPOSITE") return "info" as const;
  if (type === "MANUAL") return "neutral" as const;
  return "accent" as const;
}

export function planTypeLabel(type: Plan["type"], locale: "ko" | "en") {
  if (type === "COMPOSITE") return locale === "ko" ? "복합" : "Composite";
  if (type === "MANUAL") return locale === "ko" ? "수동" : "Manual";
  return locale === "ko" ? "프로그램" : "Program";
}

// terminal TermBadge 톤 매핑(paper V2Chip 톤과 의미 정렬): 복합=cyan(info)·수동=dim·프로그램=amber(accent).
export function planTypeTermTone(type: Plan["type"]): "info" | "accent" | "dim" {
  if (type === "COMPOSITE") return "info";
  if (type === "MANUAL") return "dim";
  return "accent";
}

// terminal 배지에 쓸 짧은 대문자 토큰(paper의 한/영 라벨 대신 [PROGRAM]/[MANUAL]/[COMPOSITE]).
export function planTypeTermLabel(type: Plan["type"]): string {
  if (type === "COMPOSITE") return "COMPOSITE";
  if (type === "MANUAL") return "MANUAL";
  return "PROGRAM";
}
