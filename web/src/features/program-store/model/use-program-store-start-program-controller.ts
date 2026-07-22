"use client";
import { errorMessage } from "@/lib/error-message";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost, isAbortError } from "@/lib/api";
import { ACTIVE_PLAN_SETTING_KEY } from "@workout/core/active-plan";
import {
  ASYMPTOTE_HYBRID_TM_PERCENT,
  extractOneRmTargetsFromTemplate,
  isAsymptoteTemplate,
  isOperatorTemplate,
  isRef5Template,
  resolveProgramFamily,
  type OneRmTarget,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import {
  deriveRef5AuxiliaryCaps,
  deriveRef5ControlRefs,
  validateRef5StartConfig,
  type Ref5DirectStandardsKg,
  type Ref5Lift,
  type Ref5StartConfig,
} from "@workout/core/program-engine/ref5";
import {
  deriveRef5StartCalibration,
  REF5_START_CALIBRATION_LIFTS,
  type Ref5CalibrationE1rmKg,
  type Ref5StartCalibration,
  type Ref5StartRecommendation,
  type Ref5StartRecommendationItem,
} from "@workout/core/program-engine/ref5-start-calibration";
import type { PlanItem } from "./types";
import { formatProgramDisplayName } from "./view";

export type OneRmRecommendation = {
  sourceExerciseName: string;
  latestE1rmKg: number;
  bestE1rmKg: number;
  recommendedKg: number;
  latestDate: string;
};

/**
 * 같은 프로그램의 플랜이 이미 있을 때 "시작"의 의미.
 * - CONTINUE: 기존 플랜으로 이동만 한다(무게·주차 그대로). 서버 호출 없음.
 * - NEW: 새 플랜을 만든다. 기존 플랜의 기록·진행은 그대로 보존된다.
 * 예전에는 기존 플랜의 params를 덮어썼는데, runtime state가 params보다 우선이라
 * 입력한 1RM이 처방에 반영되지 않는 "시작했는데 안 바뀜" 상태가 됐다.
 */
export type StartRestartMode = "CONTINUE" | "NEW";

export type ExistingPlanProgress = {
  lastPerformedAt: string | null;
  targets: Array<{ label: string; workKg: number }>;
};

export type StartProgramDraft = {
  mode: "ONE_RM" | "REF5";
  template: ProgramTemplate;
  expectedPlanType: "SINGLE" | "MANUAL";
  existingPlanId: string | null;
  existingPlanName: string | null;
  restartMode: StartRestartMode;
  existingProgress: ExistingPlanProgress | null;
  existingProgressStatus: "idle" | "loading" | "ready" | "failed";
  /** CONTINUE에서 보여줄 기존 플랜의 REF5 시작 기준(읽기 전용). */
  ref5ExistingConfig: Ref5StartConfig | null;
  /** NEW에서 쓸 템플릿 기본 REF5 시작 기준. */
  ref5TemplateConfig: Ref5StartConfig | null;
  timezone: string;
  today: string;
  tmPercent: number;
  targets: OneRmTarget[];
  oneRmInputs: Record<string, string>;
  recommendations: Record<string, OneRmRecommendation>;
  recommendationStatus: "idle" | "loading" | "ready" | "failed";
  recommendationMessage: string | null;
  ref5Config: Ref5StartConfig | null;
  ref5SetupMode: "E1RM" | "DIRECT";
  ref5E1rmInputs: Ref5CalibrationE1rmKg;
  ref5Calibration: Ref5StartCalibration | null;
  ref5RecommendationItems: Partial<Record<Ref5Lift, Ref5StartRecommendationItem>>;
};

export type Ref5StartField = keyof Ref5DirectStandardsKg;

export type PrStatsResponse = {
  items?: Array<{
    exerciseName: string;
    best?: { e1rm?: number; date?: string } | null;
    latest?: { e1rm?: number; date?: string } | null;
  }>;
};

export type Ref5StartRecommendationResponse = Ref5StartRecommendation & {
  recordedAt?: string;
};

const EMPTY_REF5_E1RM_INPUTS: Ref5CalibrationE1rmKg = Object.freeze({
  SQ: 0,
  BP: 0,
  PULL: 0,
  DL: 0,
  OHP: 0,
});

function todayKeyInTimezone(timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((entry) => entry.type === "year")?.value ?? "1970";
  const m = parts.find((entry) => entry.type === "month")?.value ?? "01";
  const d = parts.find((entry) => entry.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function roundToNearest2p5(value: number) {
  return Math.round(value / 2.5) * 2.5;
}

function roundToNearest0p5(value: number) {
  return Math.round(value * 2) / 2;
}

function parsePositiveNumber(input: string) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

const PROGRESSION_TARGET_LABELS: Record<string, { ko: string; en: string }> = {
  SQUAT: { ko: "스쿼트", en: "Squat" },
  BENCH: { ko: "벤치 프레스", en: "Bench Press" },
  DEADLIFT: { ko: "데드리프트", en: "Deadlift" },
  OHP: { ko: "오버헤드 프레스", en: "Overhead Press" },
  PULL: { ko: "풀업", en: "Pull-Up" },
};

type ProgressionStateResponse = {
  state?: {
    targets?: Record<string, { progressionTarget?: unknown; workKg?: unknown }>;
  } | null;
};

/** progression-state의 runtime targets → 표시용 "현재 작업 중량" 목록(리프트별 1행). */
export function readCurrentWorkKgTargets(
  response: ProgressionStateResponse | null,
  locale: "ko" | "en",
): Array<{ label: string; workKg: number }> {
  const targets = response?.state?.targets;
  if (!targets || typeof targets !== "object") return [];
  const out: Array<{ label: string; workKg: number }> = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(targets)) {
    const workKg = Number((value as { workKg?: unknown })?.workKg);
    if (!Number.isFinite(workKg) || workKg <= 0) continue;
    const target = String((value as { progressionTarget?: unknown })?.progressionTarget ?? key)
      .trim()
      .toUpperCase();
    if (seen.has(target)) continue;
    seen.add(target);
    out.push({
      label: PROGRESSION_TARGET_LABELS[target]?.[locale] ?? target,
      workKg,
    });
  }
  return out;
}

/**
 * 방금 시작한 플랜을 활성 플랜으로 표시한다. 홈·기록·캘린더가 모두 이 값을 먼저 보므로,
 * 새 플랜을 시작한 뒤 홈이 옛 플랜을 계속 가리키던 문제가 여기서 끊긴다.
 * 저장 실패는 치명적이지 않다(기존 휴리스틱으로 폴백) — 시작 자체를 막지 않는다.
 */
async function markPlanActive(planId: string) {
  try {
    await apiPatch(
      "/api/settings",
      { key: ACTIVE_PLAN_SETTING_KEY, value: planId },
      { invalidateCachePrefixes: ["/api/settings", "/api/home"] },
    );
  } catch {
    // 무시: 활성 플랜은 편의 기능이고, 실패해도 URL의 planId로 진입은 정상 동작한다.
  }
}

/** 같은 이름의 플랜이 이미 있으면 뒤에 번호를 붙여 목록에서 구분되게 한다. */
export function uniquePlanName(baseName: string, plans: Array<{ name: string }>) {
  const taken = new Set(plans.map((plan) => plan.name.trim()));
  if (!taken.has(baseName)) return baseName;
  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const candidate = `${baseName} ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}

export function readRef5StartConfigFromTemplate(
  template: ProgramTemplate,
): Ref5StartConfig | null {
  if (!isRef5Template(template)) return null;
  const raw = template.latestVersion?.defaults?.ref5 as
    | Partial<Ref5StartConfig>
    | null
    | undefined;
  const starts = raw?.startingValuesKg;
  if (
    raw?.schemaVersion !== 2 ||
    raw?.protocolVersion !== "1.2" ||
    !starts
  ) {
    return null;
  }
  const validated = validateRef5StartConfig(starts);
  return validated.ok ? validated.value : null;
}

export function readRef5StartConfigFromPlanParams(params: unknown): Ref5StartConfig | null {
  const root = params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
  const nested = root.ref5 && typeof root.ref5 === "object" && !Array.isArray(root.ref5)
    ? (root.ref5 as Record<string, unknown>)
    : {};
  const validated = validateRef5StartConfig(nested.startingValuesKg);
  return validated.ok ? validated.value : null;
}

export function ref5StartConfigValidationMessage(
  config: Ref5StartConfig,
  locale: "ko" | "en",
): string | null {
  const result = validateRef5StartConfig(config.startingValuesKg);
  if (result.ok) return null;
  const starts = config.startingValuesKg;
  const caps = deriveRef5AuxiliaryCaps(starts);
  if (starts.deadliftKg > caps.deadliftMaxKg) {
    return locale === "ko"
      ? `DL 시작 중량은 현재 SQ 기준 상한 ${caps.deadliftMaxKg}kg 이하여야 합니다.`
      : `DL must not exceed the ${caps.deadliftMaxKg} kg cap derived from SQ.`;
  }
  if (starts.ohpKg > caps.ohpMaxKg) {
    return locale === "ko"
      ? `OHP 시작 중량은 현재 BP 기준 상한 ${caps.ohpMaxKg}kg 이하여야 합니다.`
      : `OHP must not exceed the ${caps.ohpMaxKg} kg cap derived from BP.`;
  }
  return locale === "ko"
    ? "각 시작 중량은 2.5~500kg 범위에서 2.5kg 단위로 입력하세요."
    : "Enter each starting load on the 2.5 kg grid from 2.5 to 500 kg.";
}

export function ref5E1rmValidationMessage(
  inputs: Ref5CalibrationE1rmKg,
  locale: "ko" | "en",
): string | null {
  const missing = REF5_START_CALIBRATION_LIFTS.filter((lift) => {
    const value = Number(inputs[lift]);
    return !Number.isFinite(value) || value <= 0;
  });
  if (missing.length > 0) {
    return locale === "ko"
      ? `다섯 종목의 추정 1RM(e1RM)을 입력하세요. 미입력: ${missing.join(" · ")}`
      : `Enter a baseline e1RM for all five lifts. Missing: ${missing.join(" · ")}`;
  }
  const result = deriveRef5StartCalibration(inputs);
  if (result.ok) return null;
  return locale === "ko"
    ? "e1RM에서 계산한 시작 처방이 REF5 허용 범위를 벗어났습니다. 값을 확인하세요."
    : "The starting prescription derived from e1RM is outside the REF5 limits.";
}

export function shouldLoadOneRmRecommendations(template: ProgramTemplate) {
  return !isRef5Template(template);
}

type OneRmStatsRequest = (
  path: string,
  options: { signal: AbortSignal },
) => Promise<PrStatsResponse>;

type Ref5StartRecommendationRequest = (
  path: string,
  options: { signal: AbortSignal },
) => Promise<Ref5StartRecommendationResponse>;

/** The network boundary used by the actual start flow, guarded inside the boundary. */
export async function requestOneRmStatsForProgramStart(
  template: ProgramTemplate,
  signal: AbortSignal,
  request: OneRmStatsRequest = (path, options) =>
    apiGet<PrStatsResponse>(path, options),
) {
  if (!shouldLoadOneRmRecommendations(template)) return null;
  return request("/api/stats/prs?days=3650&limit=100", { signal });
}

export async function requestRef5StartRecommendation(
  signal: AbortSignal,
  request: Ref5StartRecommendationRequest = (path, options) =>
    apiGet<Ref5StartRecommendationResponse>(path, options),
) {
  return request("/api/stats/ref5-start-recommendation", { signal });
}

export function buildRef5StartPlanParams(input: {
  timezone: string;
  today: string;
  config: Ref5StartConfig;
}) {
  const validated = validateRef5StartConfig(input.config.startingValuesKg);
  if (!validated.ok) throw new Error(validated.errors.join("; "));
  return {
    timezone: input.timezone,
    startDate: input.today,
    autoProgression: true,
    programFamily: "ref5",
    protocolVersion: validated.value.protocolVersion,
    ref5: validated.value,
  };
}

function normalizeExerciseLookupKey(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function targetRecommendationNames(target: OneRmTarget) {
  const fromLabel = normalizeExerciseLookupKey(target.label);
  const fromKey = normalizeExerciseLookupKey(
    target.key.replace(/^EX_/, "").replace(/_/g, " "),
  );
  const key = String(target.key).trim().toUpperCase();

  const candidates = new Set<string>([fromLabel, fromKey].filter(Boolean));

  if (key.startsWith("EX_")) {
    return Array.from(candidates).map(normalizeExerciseLookupKey).filter(Boolean);
  }

  if (key === "SQUAT") {
    [
      "high-bar back squat",
      "high bar back squat",
      "back squat",
      "squat",
      "하이바 스쿼트",
      "스쿼트",
    ].forEach((name) => candidates.add(name));
  } else if (key === "BENCH") {
    ["bench press", "bench", "벤치프레스", "벤치"].forEach((name) =>
      candidates.add(name),
    );
  } else if (key === "DEADLIFT") {
    ["deadlift", "데드리프트"].forEach((name) => candidates.add(name));
  } else if (key === "OHP") {
    [
      "overhead press",
      "ohp",
      "press",
      "military press",
      "shoulder press",
      "밀리터리 프레스",
    ].forEach((name) => candidates.add(name));
  } else if (key === "PULL") {
    [
      "barbell row",
      "row",
      "pull-up",
      "pull up",
      "lat pulldown",
      "pulldown",
      "풀업",
      "로우",
    ].forEach((name) => candidates.add(name));
  }

  return Array.from(candidates).map(normalizeExerciseLookupKey).filter(Boolean);
}

function scoreNameMatch(targetName: string, exerciseName: string) {
  if (!targetName || !exerciseName) return 0;
  if (exerciseName === targetName) return 100;
  if (exerciseName.startsWith(targetName) || exerciseName.endsWith(targetName)) {
    return 90;
  }
  if (exerciseName.includes(targetName)) return 75;
  if (targetName.includes(exerciseName)) return 65;
  return 0;
}

function buildOneRmRecommendations(
  targets: OneRmTarget[],
  statsItems: PrStatsResponse["items"],
): Record<string, OneRmRecommendation> {
  const items = Array.isArray(statsItems) ? statsItems : [];
  const out: Record<string, OneRmRecommendation> = {};

  for (const target of targets) {
    const candidates = targetRecommendationNames(target);
    let bestCandidate:
      | {
          score: number;
          latestDateMs: number;
          latestE1rm: number;
          item: NonNullable<PrStatsResponse["items"]>[number];
        }
      | null = null;

    for (const item of items) {
      const name = normalizeExerciseLookupKey(item.exerciseName ?? "");
      if (!name) continue;

      let nameScore = 0;
      for (const candidate of candidates) {
        nameScore = Math.max(nameScore, scoreNameMatch(candidate, name));
      }
      if (nameScore <= 0) continue;

      const latestE1rm = Number(item.latest?.e1rm ?? item.best?.e1rm ?? 0);
      if (!Number.isFinite(latestE1rm) || latestE1rm <= 0) continue;
      const latestDateRaw = String(item.latest?.date ?? item.best?.date ?? "");
      const latestDateMs = Number.isFinite(Date.parse(latestDateRaw))
        ? Date.parse(latestDateRaw)
        : 0;

      const current = {
        score: nameScore,
        latestDateMs,
        latestE1rm,
        item,
      };
      if (
        !bestCandidate ||
        current.score > bestCandidate.score ||
        (current.score === bestCandidate.score &&
          current.latestDateMs > bestCandidate.latestDateMs) ||
        (current.score === bestCandidate.score &&
          current.latestDateMs === bestCandidate.latestDateMs &&
          current.latestE1rm > bestCandidate.latestE1rm)
      ) {
        bestCandidate = current;
      }
    }

    if (!bestCandidate) continue;

    const latestE1rmKg = Number(
      bestCandidate.item.latest?.e1rm ?? bestCandidate.item.best?.e1rm ?? 0,
    );
    const bestE1rmKg = Number(bestCandidate.item.best?.e1rm ?? latestE1rmKg);
    if (!Number.isFinite(latestE1rmKg) || latestE1rmKg <= 0) continue;
    if (!Number.isFinite(bestE1rmKg) || bestE1rmKg <= 0) continue;

    out[target.key] = {
      sourceExerciseName: String(bestCandidate.item.exerciseName ?? target.label),
      latestE1rmKg: Math.round(latestE1rmKg * 10) / 10,
      bestE1rmKg: Math.round(bestE1rmKg * 10) / 10,
      recommendedKg: Math.max(1, roundToNearest0p5(latestE1rmKg)),
      latestDate: String(
        bestCandidate.item.latest?.date ?? bestCandidate.item.best?.date ?? "",
      ),
    };
  }

  return out;
}

function readOneRmFromPlanParams(
  params: unknown,
  key: string,
  tmPercent: number,
  fallbackKey?: string | null,
) {
  const lookupKeys = [key, fallbackKey].filter((value): value is string =>
    Boolean(String(value ?? "").trim()),
  );

  const source = (params ?? {}) as {
    oneRepMaxKg?: Record<string, unknown>;
    trainingMaxKg?: Record<string, unknown>;
  };
  for (const lookupKey of lookupKeys) {
    const oneRmRaw = Number(source.oneRepMaxKg?.[lookupKey]);
    if (Number.isFinite(oneRmRaw) && oneRmRaw > 0) return oneRmRaw;
  }

  if (tmPercent > 0) {
    for (const lookupKey of lookupKeys) {
      const tmRaw = Number(source.trainingMaxKg?.[lookupKey]);
      if (Number.isFinite(tmRaw) && tmRaw > 0) {
        return Math.round((tmRaw / tmPercent) * 100) / 100;
      }
    }
  }

  return null;
}

function defaultStartPlanParamsFromTemplate(template: ProgramTemplate) {
  const params: Record<string, unknown> = {};
  const definition = template.latestVersion?.definition as
    | {
        kind?: unknown;
        sessions?: Array<{ key?: unknown }>;
        schedule?: { sessionsPerWeek?: unknown };
      }
    | undefined;
  const scheduleDef = definition?.schedule;
  const sessionsPerWeek = Number(scheduleDef?.sessionsPerWeek);

  if (Number.isFinite(sessionsPerWeek) && sessionsPerWeek > 0) {
    params.sessionsPerWeek = Math.max(1, Math.floor(sessionsPerWeek));
  }

  if (String(template.slug).trim().toLowerCase() === "operator") {
    params.schedule = ["D1", "D2", "D3"];
  } else if (String(definition?.kind ?? "").trim().toLowerCase() === "manual") {
    const manualKeys = (Array.isArray(definition?.sessions)
      ? definition.sessions
      : []
    )
      .map((session) => String(session?.key ?? "").trim())
      .filter(Boolean);

    if (manualKeys.length > 0) {
      params.schedule = manualKeys;
      params.sessionsPerWeek = manualKeys.length;
    }
  }

  // 한계2: gzclp·texas·greyskull·SS·StrongLifts·operator는 신규 시작/재시작부터 정석 모델(v2)을 적용한다.
  // gzclp=tier별 stage 강등(5×3→6×2→10×1)+T3 AMRAP, texas=주간 모델(I 강도일이 V/R을 I×0.9/0.8로
  // 파생), greyskull=메인 마지막 세트 AMRAP 자기조절(≥10 더블 프로그레션, <5 2연속 시 디로드),
  // SS/StrongLifts=고정 reps 미달을 실패로 감지(reps-only plannedRef로 setWasCompleted가 검증),
  // operator=블록 완주(W6D3) reps 미달을 실패로 감지해 블록 증량을 차단(TB 공식: W6 수행 기준 평가).
  // forward-only — 기존 플랜은 params에 progressionModel이 없어 그대로 단순 LP를 유지하므로 체감 변화가 없다.
  const progressionFamily = resolveProgramFamily(template);
  if (
    progressionFamily === "gzclp" ||
    progressionFamily === "texas-method" ||
    progressionFamily === "greyskull-lp" ||
    progressionFamily === "starting-strength-lp" ||
    progressionFamily === "stronglifts-5x5" ||
    progressionFamily === "operator" ||
    // PPL·PHUL도 "처방 reps 미달=실패"라야 한다. PPL은 메인 5회, PHUL은 레인지 상단(5회)을
    // 전 세트 채워야 증량하는 규칙이라, 검증이 없으면 1회만 해도 증량된다.
    progressionFamily === "reddit-ppl" ||
    progressionFamily === "phul"
  ) {
    params.progressionModel = "v2";
  }

  return params;
}

function resolveStartTmPercent(template: ProgramTemplate) {
  const tmPercentRaw = Number(template.latestVersion?.defaults?.tmPercent);
  // 하이브리드: 앱의 asymptote는 Async 레이어가 얹힌 엔진이라 시작 TM을 0.87로 잡는다(원본 0.83보다
  // 덜 보수적). 저장된 defaults.tmPercent(0.83)를 의도적으로 오버라이드.
  if (isAsymptoteTemplate(template)) {
    return ASYMPTOTE_HYBRID_TM_PERCENT;
  }
  if (isOperatorTemplate(template)) {
    if (
      !Number.isFinite(tmPercentRaw) ||
      tmPercentRaw <= 0 ||
      tmPercentRaw >= 1
    ) {
      return 0.9;
    }
  }
  return Number.isFinite(tmPercentRaw) && tmPercentRaw > 0 ? tmPercentRaw : 1;
}

function replaceAbortController(ref: { current: AbortController | null }) {
  ref.current?.abort();
  const controller = new AbortController();
  ref.current = controller;
  return controller;
}

type UseProgramStoreStartProgramControllerInput = {
  locale: "ko" | "en";
  plans: PlanItem[];
  loadStore: (options?: { isRefresh?: boolean }) => void | Promise<void>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  onStarted: (planId: string, date: string) => void;
};

export function useProgramStoreStartProgramController({
  locale,
  plans,
  loadStore,
  setError,
  setNotice,
  setSaving,
  onStarted,
}: UseProgramStoreStartProgramControllerInput) {
  const [startProgramDraft, setStartProgramDraft] =
    useState<StartProgramDraft | null>(null);
  const startRecommendationControllerRef = useRef<AbortController | null>(null);

  const loadOneRmRecommendations = useCallback(
    async (template: ProgramTemplate, targets: OneRmTarget[]) => {
      const templateId = template.id;
      const controller = replaceAbortController(startRecommendationControllerRef);

      try {
        const response = await requestOneRmStatsForProgramStart(
          template,
          controller.signal,
        );
        if (!response) return;
        if (startRecommendationControllerRef.current !== controller) return;

        const recommendations = buildOneRmRecommendations(targets, response.items);
        setStartProgramDraft((prev) => {
          if (!prev || prev.template.id !== templateId) return prev;

          const hasAnyRecommendation = Object.keys(recommendations).length > 0;
          const oneRmInputs = { ...prev.oneRmInputs };

          for (const target of prev.targets) {
            const recommendation = recommendations[target.key];
            if (recommendation && oneRmInputs[target.key] === "50") {
              oneRmInputs[target.key] = String(recommendation.recommendedKg);
            }
          }

          return {
            ...prev,
            recommendations,
            oneRmInputs,
            recommendationStatus: "ready",
            recommendationMessage: hasAnyRecommendation
              ? locale === "ko"
                ? "추천값을 찾았습니다. 필요하면 종목별로 추천값 적용을 눌러 반영하세요."
                : "Recommendations are ready. Apply them to each lift if needed."
              : locale === "ko"
                ? "적용 가능한 1RM 추천값이 없습니다."
                : "No 1RM recommendations are available yet.",
          };
        });
      } catch (error) {
        if (
          isAbortError(error) ||
          startRecommendationControllerRef.current !== controller
        ) {
          return;
        }
        setStartProgramDraft((prev) => {
          if (!prev || prev.template.id !== templateId) return prev;
          return {
            ...prev,
            recommendationStatus: "failed",
            recommendationMessage:
              errorMessage(error) ??
              (locale === "ko"
                ? "1RM 추천값을 불러오지 못했습니다."
                : "Could not load 1RM recommendations."),
          };
        });
      } finally {
        if (startRecommendationControllerRef.current === controller) {
          startRecommendationControllerRef.current = null;
        }
      }
    },
    [locale],
  );

  const loadRef5Recommendations = useCallback(
    async (template: ProgramTemplate) => {
      const templateId = template.id;
      const controller = replaceAbortController(startRecommendationControllerRef);

      try {
        const response = await requestRef5StartRecommendation(controller.signal);
        if (startRecommendationControllerRef.current !== controller) return;

        setStartProgramDraft((prev) => {
          if (!prev || prev.template.id !== templateId || prev.mode !== "REF5") {
            return prev;
          }
          const ref5E1rmInputs = { ...prev.ref5E1rmInputs };
          const ref5RecommendationItems: StartProgramDraft["ref5RecommendationItems"] = {};
          for (const item of response.items) {
            ref5RecommendationItems[item.lift] = item;
            if (ref5E1rmInputs[item.lift] <= 0) {
              ref5E1rmInputs[item.lift] = item.e1rmKg;
            }
          }
          const calibration = deriveRef5StartCalibration(ref5E1rmInputs);
          const matched = response.items.length;

          return {
            ...prev,
            ref5E1rmInputs,
            ref5RecommendationItems,
            ref5Calibration: calibration.ok ? calibration.value : null,
            ref5Config:
              calibration.ok && prev.ref5SetupMode === "E1RM"
                ? calibration.value.startConfig
                : prev.ref5Config,
            recommendationStatus: "ready",
            recommendationMessage:
              matched === REF5_START_CALIBRATION_LIFTS.length
                ? locale === "ko"
                  ? "최근 8주 1–10회 기록에서 다섯 종목의 최고 e1RM을 자동 입력했습니다."
                  : "Loaded all five lifts from the best 1–10 rep records in the last 8 weeks."
                : matched > 0
                  ? locale === "ko"
                    ? `최근 기록 ${matched}/5종목을 찾았습니다. 나머지 종목은 추정 1RM(e1RM)을 직접 입력하세요.`
                    : `Found recent records for ${matched}/5 lifts. Enter the remaining baseline e1RMs.`
                  : locale === "ko"
                    ? "최근 8주에 사용할 수 있는 1–10회 기록이 없습니다. 추정 1RM(e1RM)을 직접 입력하세요."
                    : "No eligible 1–10 rep records were found in the last 8 weeks. Enter baseline e1RMs.",
          };
        });
      } catch (error) {
        if (
          isAbortError(error) ||
          startRecommendationControllerRef.current !== controller
        ) {
          return;
        }
        setStartProgramDraft((prev) => {
          if (!prev || prev.template.id !== templateId || prev.mode !== "REF5") {
            return prev;
          }
          return {
            ...prev,
            recommendationStatus: "failed",
            recommendationMessage:
              errorMessage(error) ??
              (locale === "ko"
                ? "최근 e1RM 기록을 불러오지 못했습니다. 직접 입력은 계속 사용할 수 있습니다."
                : "Could not load recent e1RM records. Manual entry is still available."),
          };
        });
      } finally {
        if (startRecommendationControllerRef.current === controller) {
          startRecommendationControllerRef.current = null;
        }
      }
    },
    [locale],
  );

  useEffect(() => {
    if (startProgramDraft) return;
    startRecommendationControllerRef.current?.abort();
    startRecommendationControllerRef.current = null;
  }, [startProgramDraft]);

  useEffect(() => {
    return () => {
      startRecommendationControllerRef.current?.abort();
    };
  }, []);

  const closeStartProgramDraft = useCallback(() => {
    setStartProgramDraft(null);
  }, []);

  const loadExistingProgress = useCallback(
    async (planId: string, lastPerformedAt: string | null) => {
      try {
        const response = await apiGet<ProgressionStateResponse>(
          `/api/plans/${encodeURIComponent(planId)}/progression-state`,
        );
        setStartProgramDraft((prev) => {
          if (!prev || prev.existingPlanId !== planId) return prev;
          return {
            ...prev,
            existingProgress: {
              lastPerformedAt,
              targets: readCurrentWorkKgTargets(response, locale),
            },
            existingProgressStatus: "ready",
          };
        });
      } catch {
        // 진행 요약은 부가 정보다 — 실패해도 이어서 하기/새로 시작 선택은 계속 가능.
        setStartProgramDraft((prev) => {
          if (!prev || prev.existingPlanId !== planId) return prev;
          return { ...prev, existingProgressStatus: "failed" };
        });
      }
    },
    [locale],
  );

  /**
   * 이어서 하기 ↔ 새로 시작 전환. NEW로 처음 전환할 때만 추천값을 불러오고,
   * REF5 시작 기준도 (기존 플랜 값 ↔ 템플릿 기본값)으로 함께 갈아끼운다.
   */
  const updateRestartMode = useCallback(
    (mode: StartRestartMode) => {
      const current = startProgramDraft;
      if (!current || current.restartMode === mode) return;

      if (mode === "CONTINUE") {
        setStartProgramDraft((prev) =>
          prev
            ? {
                ...prev,
                restartMode: mode,
                ref5Config: prev.ref5ExistingConfig ?? prev.ref5Config,
                ref5SetupMode: "DIRECT",
              }
            : prev,
        );
        return;
      }

      const shouldLoadRecommendations = current.recommendationStatus === "idle";
      setStartProgramDraft((prev) =>
        prev
          ? {
              ...prev,
              restartMode: mode,
              ref5Config: prev.ref5TemplateConfig ?? prev.ref5Config,
              ref5SetupMode: prev.mode === "REF5" ? "E1RM" : prev.ref5SetupMode,
              ref5Calibration: null,
              recommendationStatus: shouldLoadRecommendations
                ? "loading"
                : prev.recommendationStatus,
            }
          : prev,
      );

      if (!shouldLoadRecommendations) return;
      if (current.mode === "REF5") {
        void loadRef5Recommendations(current.template);
      } else {
        void loadOneRmRecommendations(current.template, current.targets);
      }
    },
    [loadOneRmRecommendations, loadRef5Recommendations, startProgramDraft],
  );

  const openStartProgramDraft = useCallback(
    (template: ProgramTemplate) => {
      if (!template.latestVersion) {
        setError(
          locale === "ko"
            ? "선택한 프로그램의 버전 정보가 없습니다."
            : "The selected program has no version data.",
        );
        return;
      }

      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const today = todayKeyInTimezone(timezone);
      const expectedPlanType = template.type === "MANUAL" ? "MANUAL" : "SINGLE";
      const existing =
        plans.find(
          (plan) =>
            plan.rootProgramVersionId === template.latestVersion?.id &&
            plan.type === expectedPlanType,
        ) ?? null;
      const ref5 = isRef5Template(template);
      const ref5TemplateConfig = ref5 ? readRef5StartConfigFromTemplate(template) : null;
      const ref5ExistingConfig =
        ref5 && existing ? readRef5StartConfigFromPlanParams(existing.params) : null;
      // 기존 플랜이 있으면 기본은 "이어서 하기" — 새 플랜 생성은 명시적 선택일 때만.
      const restartMode: StartRestartMode = existing ? "CONTINUE" : "NEW";
      const ref5Config = ref5 ? (ref5ExistingConfig ?? ref5TemplateConfig) : null;
      if (ref5 && !ref5Config) {
        setError(
          locale === "ko"
            ? "REF5 시작 기준을 불러오지 못했습니다."
            : "The REF5 starting-load configuration is unavailable.",
        );
        return;
      }

      const tmPercent = ref5 ? 0 : resolveStartTmPercent(template);
      const targets = ref5 ? [] : extractOneRmTargetsFromTemplate(template);
      const oneRmInputs: Record<string, string> = {};

      for (const target of targets) {
        const preset = existing
          ? readOneRmFromPlanParams(
              existing.params,
              target.key,
              tmPercent,
              target.fallbackKey,
            )
          : null;
        oneRmInputs[target.key] = preset !== null ? String(preset) : "50";
      }

      setStartProgramDraft({
        mode: ref5 ? "REF5" : "ONE_RM",
        template,
        expectedPlanType,
        existingPlanId: existing?.id ?? null,
        existingPlanName: existing?.name ?? null,
        restartMode,
        existingProgress: null,
        existingProgressStatus: existing ? "loading" : "idle",
        ref5ExistingConfig,
        ref5TemplateConfig,
        timezone,
        today,
        tmPercent,
        targets,
        oneRmInputs,
        recommendations: {},
        recommendationStatus: existing ? "idle" : "loading",
        recommendationMessage: null,
        ref5Config,
        ref5SetupMode: ref5 && !existing ? "E1RM" : "DIRECT",
        ref5E1rmInputs: { ...EMPTY_REF5_E1RM_INPUTS },
        ref5Calibration: null,
        ref5RecommendationItems: {},
      });
      setError(null);

      if (existing) {
        // "이어서 하기"가 무엇을 이어가는지 보여주려면 params가 아니라 runtime state를
        // 읽어야 한다 — 진행된 무게는 params.trainingMaxKg가 아니라 여기에 있다.
        void loadExistingProgress(existing.id, existing.lastPerformedAt ?? null);
      } else if (ref5) {
        void loadRef5Recommendations(template);
      } else {
        void loadOneRmRecommendations(template, targets);
      }
    },
    [
      loadExistingProgress,
      loadOneRmRecommendations,
      loadRef5Recommendations,
      locale,
      plans,
      setError,
    ],
  );

  const updateOneRmInput = useCallback((targetKey: string, value: number) => {
    setStartProgramDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        oneRmInputs: {
          ...prev.oneRmInputs,
          [targetKey]: String(value),
        },
      };
    });
  }, []);

  const updateRef5StartingValue = useCallback(
    (field: Ref5StartField, value: number) => {
      setStartProgramDraft((prev) => {
        if (!prev?.ref5Config || prev.restartMode !== "NEW") return prev;
        const startingValuesKg = {
          ...prev.ref5Config.startingValuesKg,
          [field]: value,
        };
        return {
          ...prev,
          ref5Calibration: null,
          ref5Config: {
            ...prev.ref5Config,
            startingValuesKg,
            controlRefsKg: deriveRef5ControlRefs(startingValuesKg),
          },
        };
      });
    },
    [],
  );

  const updateRef5SetupMode = useCallback((mode: "E1RM" | "DIRECT") => {
    setStartProgramDraft((prev) => {
      if (!prev || prev.mode !== "REF5" || prev.restartMode !== "NEW") return prev;
      if (mode === "DIRECT") return { ...prev, ref5SetupMode: mode };
      const calibration = deriveRef5StartCalibration(prev.ref5E1rmInputs);
      return {
        ...prev,
        ref5SetupMode: mode,
        ref5Calibration: calibration.ok ? calibration.value : null,
        ref5Config: calibration.ok ? calibration.value.startConfig : prev.ref5Config,
      };
    });
  }, []);

  const updateRef5E1rmInput = useCallback((lift: Ref5Lift, value: number) => {
    setStartProgramDraft((prev) => {
      if (!prev || prev.mode !== "REF5" || prev.restartMode !== "NEW") return prev;
      const ref5E1rmInputs = {
        ...prev.ref5E1rmInputs,
        [lift]: Math.round(value * 10) / 10,
      };
      const calibration = deriveRef5StartCalibration(ref5E1rmInputs);
      return {
        ...prev,
        ref5E1rmInputs,
        ref5Calibration: calibration.ok ? calibration.value : null,
        ref5Config: calibration.ok ? calibration.value.startConfig : prev.ref5Config,
      };
    });
  }, []);

  const applyRecommendation = useCallback((targetKey: string) => {
    setStartProgramDraft((prev) => {
      if (!prev) return prev;
      const recommendation = prev.recommendations[targetKey];
      if (!recommendation) return prev;
      return {
        ...prev,
        oneRmInputs: {
          ...prev.oneRmInputs,
          [targetKey]: String(recommendation.recommendedKg),
        },
      };
    });
  }, []);

  const submitStartProgram = useCallback(async () => {
    if (!startProgramDraft) return;

    // 이어서 하기: 기존 플랜은 무게·주차를 그대로 들고 있으므로 진행 상태는 건드리지 않고
    // "지금 이 플랜으로 한다"는 선택만 기록한 뒤 이동한다.
    if (startProgramDraft.restartMode === "CONTINUE" && startProgramDraft.existingPlanId) {
      const planId = startProgramDraft.existingPlanId;
      const date = startProgramDraft.today;
      await markPlanActive(planId);
      setStartProgramDraft(null);
      onStarted(planId, date);
      return;
    }

    const isRef5Start = startProgramDraft.mode === "REF5";
    const ref5ValidationMessage = isRef5Start
      ? startProgramDraft.ref5SetupMode === "E1RM"
        ? ref5E1rmValidationMessage(startProgramDraft.ref5E1rmInputs, locale)
        : startProgramDraft.ref5Config
          ? ref5StartConfigValidationMessage(startProgramDraft.ref5Config, locale)
          : locale === "ko"
            ? "REF5 시작 설정이 올바르지 않습니다."
            : "The REF5 start configuration is invalid."
      : null;
    if (ref5ValidationMessage) {
      setError(ref5ValidationMessage);
      return;
    }
    const ref5PlanParams =
      isRef5Start && startProgramDraft.ref5Config
        ? buildRef5StartPlanParams({
            timezone: startProgramDraft.timezone,
            today: startProgramDraft.today,
            config: startProgramDraft.ref5Config,
          })
        : null;
    if (isRef5Start && !ref5PlanParams) {
      setError(
        locale === "ko"
          ? "REF5 시작 설정이 올바르지 않습니다."
          : "The REF5 start configuration is invalid.",
      );
      return;
    }

    const oneRepMaxKg: Record<string, number> = {};
    const trainingMaxKg: Record<string, number> = {};
    if (!isRef5Start) {
      for (const target of startProgramDraft.targets) {
        const parsed = parsePositiveNumber(
          startProgramDraft.oneRmInputs[target.key] ?? "",
        );
        if (parsed === null) {
          setError(
            locale === "ko"
              ? `${target.label} 1RM을 kg 기준으로 입력하세요.`
              : `Enter ${target.label} 1RM in kg.`,
          );
          return;
        }

        oneRepMaxKg[target.key] = parsed;
        trainingMaxKg[target.key] = roundToNearest2p5(
          parsed * startProgramDraft.tmPercent,
        );

        const fallbackKey = String(target.fallbackKey ?? "").trim().toUpperCase();
        if (fallbackKey && oneRepMaxKg[fallbackKey] === undefined) {
          oneRepMaxKg[fallbackKey] = parsed;
          trainingMaxKg[fallbackKey] = trainingMaxKg[target.key]!;
        }
      }
    }

    try {
      setSaving(true);
      setNotice(null);

      // 새로 시작은 언제나 새 플랜을 만든다. 기존 플랜의 params를 덮어쓰던 예전 경로는
      // runtime state가 살아남아 새 1RM이 무시됐고, REF5는 params가 immutable이라
      // 아무 변화도 없었다. 새 플랜이면 runtime state가 비어 입력값이 그대로 첫 처방이 된다.
      const defaultPlanParams = isRef5Start
        ? {}
        : defaultStartPlanParamsFromTemplate(startProgramDraft.template);
      const nextPlanParams = ref5PlanParams ?? {
        ...defaultPlanParams,
        startDate: startProgramDraft.today,
        timezone: startProgramDraft.timezone,
        sessionKeyMode: "DATE",
        oneRepMaxKg,
        trainingMaxKg,
      };

      const baseName =
        locale === "ko"
          ? `${formatProgramDisplayName(startProgramDraft.template.name)} 프로그램`
          : `${formatProgramDisplayName(startProgramDraft.template.name)} Program`;
      const created = await apiPost<{ plan: PlanItem }>("/api/plans", {
        name: uniquePlanName(baseName, plans),
        type: startProgramDraft.expectedPlanType,
        rootProgramVersionId: startProgramDraft.template.latestVersion!.id,
        params: nextPlanParams,
      });
      const targetPlanId = created.plan.id;

      if (!targetPlanId) {
        throw new Error(
          locale === "ko"
            ? "플랜 생성 결과가 올바르지 않습니다."
            : "The plan create result was invalid.",
        );
      }

      await markPlanActive(targetPlanId);
      void loadStore({ isRefresh: true });
      setStartProgramDraft(null);
      onStarted(targetPlanId, startProgramDraft.today);
    } catch (error) {
      setError(
        errorMessage(error) ??
          (locale === "ko"
            ? "프로그램을 시작하지 못했습니다."
            : "Could not start the program."),
      );
    } finally {
      setSaving(false);
    }
  }, [
    loadStore,
    locale,
    onStarted,
    plans,
    setError,
    setNotice,
    setSaving,
    startProgramDraft,
  ]);

  return {
    startProgramDraft,
    closeStartProgramDraft,
    openStartProgramDraft,
    updateRestartMode,
    updateOneRmInput,
    updateRef5StartingValue,
    updateRef5SetupMode,
    updateRef5E1rmInput,
    applyRecommendation,
    submitStartProgram,
  };
}
