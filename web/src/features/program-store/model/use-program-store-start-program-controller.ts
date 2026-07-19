"use client";
import { errorMessage } from "@/lib/error-message";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost, isAbortError } from "@/lib/api";
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

export type StartProgramDraft = {
  mode: "ONE_RM" | "REF5";
  template: ProgramTemplate;
  expectedPlanType: "SINGLE" | "MANUAL";
  existingPlanId: string | null;
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
    progressionFamily === "operator"
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
      const ref5Config = ref5
        ? existing
          ? readRef5StartConfigFromPlanParams(existing.params)
          : readRef5StartConfigFromTemplate(template)
        : null;
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

      if (!existing) {
        if (ref5) {
          void loadRef5Recommendations(template);
        } else {
          void loadOneRmRecommendations(template, targets);
        }
      }
    },
    [loadOneRmRecommendations, loadRef5Recommendations, locale, plans, setError],
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
        if (!prev?.ref5Config || prev.existingPlanId) return prev;
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
      if (!prev || prev.mode !== "REF5" || prev.existingPlanId) return prev;
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
      if (!prev || prev.mode !== "REF5" || prev.existingPlanId) return prev;
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

    const isRef5Start = startProgramDraft.mode === "REF5";
    const ref5ValidationMessage = isRef5Start
      ? startProgramDraft.ref5SetupMode === "E1RM" && !startProgramDraft.existingPlanId
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

      const existing = startProgramDraft.existingPlanId
        ? plans.find((plan) => plan.id === startProgramDraft.existingPlanId) ??
          null
        : null;

      let targetPlanId = startProgramDraft.existingPlanId;
      const defaultPlanParams = isRef5Start
        ? {}
        : defaultStartPlanParamsFromTemplate(startProgramDraft.template);
      const nextPlanParams = ref5PlanParams ?? {
        ...(existing?.params ?? {}),
        ...defaultPlanParams,
        startDate: startProgramDraft.today,
        timezone: startProgramDraft.timezone,
        sessionKeyMode: "DATE",
        oneRepMaxKg,
        trainingMaxKg,
      };

      if (existing && targetPlanId) {
        if (!isRef5Start) {
          await apiPatch<{ plan: PlanItem }>(
            `/api/plans/${encodeURIComponent(targetPlanId)}`,
            {
              params: nextPlanParams,
            },
          );
        }
      } else {
        const created = await apiPost<{ plan: PlanItem }>("/api/plans", {
          name:
            locale === "ko"
              ? `${formatProgramDisplayName(startProgramDraft.template.name)} 프로그램`
              : `${formatProgramDisplayName(startProgramDraft.template.name)} Program`,
          type: startProgramDraft.expectedPlanType,
          rootProgramVersionId: startProgramDraft.template.latestVersion!.id,
          params: nextPlanParams,
        });
        targetPlanId = created.plan.id;
      }

      if (!targetPlanId) {
        throw new Error(
          locale === "ko"
            ? "플랜 생성/갱신 결과가 올바르지 않습니다."
            : "The plan create/update result was invalid.",
        );
      }

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
    updateOneRmInput,
    updateRef5StartingValue,
    updateRef5SetupMode,
    updateRef5E1rmInput,
    applyRecommendation,
    submitStartProgram,
  };
}
