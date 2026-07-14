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
};

export type Ref5StartConfig = {
  schemaVersion: number;
  protocolVersion: string;
  startingValuesKg: {
    sqH3Kg: number;
    bpFocusKg: number;
    pullFocusTotalKg: number;
    deadliftKg: number;
    ohpKg: number;
  };
  controlRefsKg: {
    sqKg: number;
    bpKg: number;
    pullTotalKg: number;
    deadliftKg: number;
    ohpKg: number;
  };
};

export type PrStatsResponse = {
  items?: Array<{
    exerciseName: string;
    best?: { e1rm?: number; date?: string } | null;
    latest?: { e1rm?: number; date?: string } | null;
  }>;
};

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

function isPositiveFinite(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) > 0;
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
  const refs = raw?.controlRefsKg;
  if (
    raw?.schemaVersion !== 2 ||
    raw?.protocolVersion !== "1.2" ||
    !starts ||
    !refs ||
    ![
      starts.sqH3Kg,
      starts.bpFocusKg,
      starts.pullFocusTotalKg,
      starts.deadliftKg,
      starts.ohpKg,
      refs.sqKg,
      refs.bpKg,
      refs.pullTotalKg,
      refs.deadliftKg,
      refs.ohpKg,
    ].every(isPositiveFinite)
  ) {
    return null;
  }

  return {
    schemaVersion: 2,
    protocolVersion: "1.2",
    startingValuesKg: { ...starts } as Ref5StartConfig["startingValuesKg"],
    controlRefsKg: { ...refs } as Ref5StartConfig["controlRefsKg"],
  };
}

export function shouldLoadOneRmRecommendations(template: ProgramTemplate) {
  return !isRef5Template(template);
}

type OneRmStatsRequest = (
  path: string,
  options: { signal: AbortSignal },
) => Promise<PrStatsResponse>;

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

export function buildRef5StartPlanParams(input: {
  timezone: string;
  today: string;
  config: Ref5StartConfig;
}) {
  return {
    timezone: input.timezone,
    startDate: input.today,
    autoProgression: true,
    programFamily: "ref5",
    protocolVersion: input.config.protocolVersion,
    ref5: {
      schemaVersion: input.config.schemaVersion,
      protocolVersion: input.config.protocolVersion,
      startingValuesKg: { ...input.config.startingValuesKg },
      controlRefsKg: { ...input.config.controlRefsKg },
    },
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
    ["back squat", "squat", "스쿼트"].forEach((name) => candidates.add(name));
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
  const oneRmRecommendationControllerRef = useRef<AbortController | null>(null);

  const loadOneRmRecommendations = useCallback(
    async (template: ProgramTemplate, targets: OneRmTarget[]) => {
      const templateId = template.id;
      const controller = replaceAbortController(oneRmRecommendationControllerRef);

      try {
        const response = await requestOneRmStatsForProgramStart(
          template,
          controller.signal,
        );
        if (!response) return;
        if (oneRmRecommendationControllerRef.current !== controller) return;

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
          oneRmRecommendationControllerRef.current !== controller
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
        if (oneRmRecommendationControllerRef.current === controller) {
          oneRmRecommendationControllerRef.current = null;
        }
      }
    },
    [locale],
  );

  useEffect(() => {
    if (startProgramDraft) return;
    oneRmRecommendationControllerRef.current?.abort();
    oneRmRecommendationControllerRef.current = null;
  }, [startProgramDraft]);

  useEffect(() => {
    return () => {
      oneRmRecommendationControllerRef.current?.abort();
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
      const ref5Config = ref5 ? readRef5StartConfigFromTemplate(template) : null;
      if (ref5 && !ref5Config) {
        setError(
          locale === "ko"
            ? "REF5 v1.1 고정 시작 설정을 불러오지 못했습니다."
            : "The fixed REF5 v1.1 start configuration is unavailable.",
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
        recommendationStatus: ref5 ? "idle" : "loading",
        recommendationMessage: null,
        ref5Config,
      });
      setError(null);

      void loadOneRmRecommendations(template, targets);
    },
    [loadOneRmRecommendations, locale, plans, setError],
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
          ? "REF5 v1.1 시작 설정이 올바르지 않습니다."
          : "The REF5 v1.1 start configuration is invalid.",
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
    applyRecommendation,
    submitStartProgram,
  };
}
