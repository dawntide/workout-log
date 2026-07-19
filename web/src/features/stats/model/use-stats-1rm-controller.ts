"use client";
import { errorMessage } from "@/lib/error-message";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { apiGet } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { selectDefaultStatsExercise } from "@workout/core/stats/default-exercise";
import type {
  BaseFilterOption,
  E1RMResponse,
  ExerciseOption,
  ExercisesResponse,
  PlanOption,
  PlansResponse,
  RangeFilter,
  RangePreset,
  SheetType,
} from "./stats-1rm-types";
import {
  dateDaysAgoDateOnly,
  deriveRangeFilterFromStats,
  toDateOnly,
  toDefaultRange,
  toQuery,
  withSearchText,
} from "./stats-1rm-utils";

type UseStats1RMControllerInput = {
  locale: "ko" | "en";
  refreshTick: number;
  initialExercises?: BaseFilterOption[];
  initialPlans?: BaseFilterOption[];
  initialStats?: E1RMResponse | null;
  initialSelectedExerciseId?: string | null;
  initialSelectedPlanId?: string;
};

export function useStats1RMController({
  locale,
  refreshTick,
  initialExercises,
  initialPlans,
  initialStats,
  initialSelectedExerciseId,
  initialSelectedPlanId = "",
}: UseStats1RMControllerInput) {
  const initialRangeFilter = useMemo(
    () => (initialStats ? deriveRangeFilterFromStats(initialStats) : toDefaultRange()),
    [initialStats],
  );
  const initialExerciseOptions = useMemo(
    () => withSearchText(initialExercises ?? []),
    [initialExercises],
  );
  const initialPlanOptions = useMemo(
    () => withSearchText(initialPlans ?? []),
    [initialPlans],
  );
  const hasInitialOptions =
    initialExercises !== undefined && initialPlans !== undefined;

  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [optionsLoading, setOptionsLoading] = useState(!hasInitialOptions);
  const optionsHasLoadedRef = useRef(hasInitialOptions);
  const [optionsLoadKey, setOptionsLoadKey] = useState(
    hasInitialOptions ? "stats-1rm:options:hydrated" : "stats-1rm:options:init",
  );
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dataHasLoadedRef = useRef(Boolean(initialStats));
  const [dataLoadKey, setDataLoadKey] = useState<string | null>(
    initialStats ? "stats-1rm:data:hydrated" : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [internalRefreshTick, setInternalRefreshTick] = useState(0);
  const [exercises, setExercises] = useState<ExerciseOption[]>(initialExerciseOptions);
  const [plans, setPlans] = useState<PlanOption[]>(initialPlanOptions);
  const fallbackInitialExerciseId = selectDefaultStatsExercise(
    initialExerciseOptions.map((exercise) => ({
      ...exercise,
      lastPerformedAt: null,
    })),
  )?.id ?? null;
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    initialSelectedExerciseId ?? fallbackInitialExerciseId,
  );
  const [selectedPlanId, setSelectedPlanId] = useState(initialSelectedPlanId);
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>(initialRangeFilter);
  const [rangeDraft, setRangeDraft] = useState<RangeFilter>(initialRangeFilter);
  const [rangeDraftError, setRangeDraftError] = useState<string | null>(null);
  const [stats, setStats] = useState<E1RMResponse | null>(initialStats ?? null);
  const [activePointIndex, setActivePointIndex] = useState(
    initialStats?.series.length ? initialStats.series.length - 1 : 0,
  );
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [programQuery, setProgramQuery] = useState("");
  const deferredExerciseQuery = useDeferredValue(exerciseQuery);
  const deferredProgramQuery = useDeferredValue(programQuery);
  const [isFilterPending, startFilterTransition] = useTransition();
  const [isRangePending, startRangeTransition] = useTransition();

  const activeDataQueryKey = useMemo(() => {
    if (!selectedExerciseId) return null;
    return [
      selectedExerciseId,
      selectedPlanId || "",
      rangeFilter.preset,
      rangeFilter.from,
      rangeFilter.to,
      refreshTick,
      internalRefreshTick,
    ].join("|");
  }, [
    internalRefreshTick,
    rangeFilter.from,
    rangeFilter.preset,
    rangeFilter.to,
    refreshTick,
    selectedExerciseId,
    selectedPlanId,
  ]);
  const hydratedDataQueryKeyRef = useRef<string | null>(
    initialStats ? activeDataQueryKey : null,
  );
  const isOptionsSettled = useQuerySettled(optionsLoadKey, optionsLoading);
  const isDataSettled = useQuerySettled(dataLoadKey, loading);

  const loadFilterOptions = useCallback(async () => {
    try {
      if (optionsHasLoadedRef.current) return;
      if (!optionsHasLoadedRef.current) setOptionsLoading(true);
      setOptionsLoadKey(`stats-1rm:options:${Date.now()}`);
      setOptionsError(null);

      const [exerciseRes, planRes] = await Promise.all([
        apiGet<ExercisesResponse>("/api/exercises?limit=200"),
        apiGet<PlansResponse>("/api/plans"),
      ]);
      const nextExercises = withSearchText(exerciseRes.items ?? []);
      const nextPlans = withSearchText(planRes.items ?? []);

      setExercises(nextExercises);
      setPlans(nextPlans);
      setSelectedExerciseId((prev) => {
        if (prev) {
          const matchedExercise = nextExercises.find(
            (entry) => entry.id === prev || entry.searchText === prev.trim().toLowerCase(),
          );
          if (matchedExercise) return matchedExercise.id;
        }
        return selectDefaultStatsExercise(
          nextExercises.map((exercise) => ({
            ...exercise,
            lastPerformedAt: null,
          })),
        )?.id ?? null;
      });
      setSelectedPlanId((prev) =>
        prev && nextPlans.some((entry) => entry.id === prev) ? prev : "",
      );
      optionsHasLoadedRef.current = true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setOptionsError(
        errorMessage(e) ??
          (locale === "ko"
            ? "필터 옵션을 불러오지 못했습니다."
            : "Could not load filter options."),
      );
    } finally {
      setOptionsLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    if (activeSheet !== "range") return;
    setRangeDraft(rangeFilter);
    setRangeDraftError(null);
  }, [activeSheet, rangeFilter]);

  useEffect(() => {
    if (activeSheet !== "exercise") setExerciseQuery("");
    if (activeSheet !== "program") setProgramQuery("");
  }, [activeSheet]);

  useEffect(() => {
    if (!selectedExerciseId || !activeDataQueryKey) {
      setStats(null);
      setDataLoadKey(null);
      return;
    }

    if (
      hydratedDataQueryKeyRef.current === activeDataQueryKey &&
      dataHasLoadedRef.current
    ) {
      hydratedDataQueryKeyRef.current = null;
      setDataLoadKey(`stats-1rm:data:hydrated:${activeDataQueryKey}`);
      return;
    }

    let cancelled = false;
    const nextLoadKey = `stats-1rm:data:${activeDataQueryKey}:${Date.now()}`;
    const controller = new AbortController();

    (async () => {
      try {
        if (!dataHasLoadedRef.current) setLoading(true);
        setDataLoadKey(nextLoadKey);
        setError(null);

        const path = `/api/stats/e1rm?${toQuery({
          exerciseId: selectedExerciseId,
          planId: selectedPlanId || undefined,
          days: rangeFilter.preset === "CUSTOM" ? undefined : rangeFilter.preset,
          from: rangeFilter.preset === "CUSTOM" ? rangeFilter.from : undefined,
          to: rangeFilter.preset === "CUSTOM" ? rangeFilter.to : undefined,
        })}`;

        const response = await apiGet<E1RMResponse>(path, {
          signal: controller.signal,
        });
        if (cancelled) return;
        setStats(response);
        setActivePointIndex(response.series.length > 0 ? response.series.length - 1 : 0);
        dataHasLoadedRef.current = true;
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(
          errorMessage(e) ??
            (locale === "ko"
              ? "1RM 데이터를 불러오지 못했습니다."
              : "Could not load 1RM data."),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeDataQueryKey, locale, rangeFilter, selectedExerciseId, selectedPlanId]);

  const applyRangeDraft = useCallback(() => {
    if (rangeDraft.preset === "CUSTOM") {
      if (!rangeDraft.from || !rangeDraft.to) {
        setRangeDraftError(
          locale === "ko"
            ? "시작일과 종료일을 모두 입력하세요."
            : "Enter both a start date and end date.",
        );
        return;
      }
      if (rangeDraft.from > rangeDraft.to) {
        setRangeDraftError(
          locale === "ko"
            ? "시작일이 종료일보다 늦을 수 없습니다."
            : "The start date cannot be later than the end date.",
        );
        return;
      }
      startRangeTransition(() => {
        setRangeFilter(rangeDraft);
        setActiveSheet(null);
      });
      return;
    }

    const nextPreset = rangeDraft.preset;
    const nextRange: RangeFilter = {
      preset: nextPreset,
      from: dateDaysAgoDateOnly(nextPreset),
      to: toDateOnly(new Date()),
    };
    startRangeTransition(() => {
      setRangeFilter(nextRange);
      setActiveSheet(null);
    });
  }, [locale, rangeDraft]);

  const canApplyRangeDraft =
    rangeDraft.preset !== "CUSTOM" ||
    (Boolean(rangeDraft.from) &&
      Boolean(rangeDraft.to) &&
      rangeDraft.from <= rangeDraft.to);

  const filteredExerciseOptions = useMemo(() => {
    const q = deferredExerciseQuery.trim().toLowerCase();
    return exercises
      .filter((exercise) => !q || exercise.searchText.includes(q))
      .map((exercise) => ({
        key: exercise.id,
        label: exercise.name,
        active: exercise.id === selectedExerciseId,
        ariaCurrent: exercise.id === selectedExerciseId,
        onSelect: () => {
          startFilterTransition(() => {
            setSelectedExerciseId(exercise.id);
            setActiveSheet(null);
          });
        },
      }));
  }, [deferredExerciseQuery, exercises, selectedExerciseId]);

  const filteredProgramOptions = useMemo(() => {
    const q = deferredProgramQuery.trim().toLowerCase();
    const allLabel = locale === "ko" ? "전체 플랜" : "All Plans";
    const allOption = {
      key: "__all__",
      label: allLabel,
      active: selectedPlanId === "",
      ariaCurrent: selectedPlanId === "",
      onSelect: () => {
        startFilterTransition(() => {
          setSelectedPlanId("");
          setActiveSheet(null);
        });
      },
    };
    const planOptions = plans
      .filter((plan) => !q || plan.searchText.includes(q))
      .map((plan) => ({
        key: plan.id,
        label: plan.name,
        active: plan.id === selectedPlanId,
        ariaCurrent: plan.id === selectedPlanId,
        onSelect: () => {
          startFilterTransition(() => {
            setSelectedPlanId(plan.id);
            setActiveSheet(null);
          });
        },
      }));
    if (q && !allLabel.toLowerCase().includes(q)) return planOptions;
    return [allOption, ...planOptions];
  }, [deferredProgramQuery, locale, plans, selectedPlanId]);

  const selectedExercise = useMemo(
    () => exercises.find((entry) => entry.id === selectedExerciseId) ?? null,
    [exercises, selectedExerciseId],
  );
  const selectedProgramLabel = useMemo(() => {
    if (!selectedPlanId) return locale === "ko" ? "전체 플랜" : "All Plans";
    return (
      plans.find((entry) => entry.id === selectedPlanId)?.name ??
      (locale === "ko" ? "선택된 플랜" : "Selected Plan")
    );
  }, [locale, plans, selectedPlanId]);

  const series = stats?.series ?? [];
  const showNoExerciseState =
    isOptionsSettled && !optionsError && exercises.length === 0;
  const showDataEmptyState =
    isDataSettled && !error && !showNoExerciseState && series.length === 0;
  const isControlPending = isFilterPending || isRangePending;

  function setPresetRange(preset: Exclude<RangePreset, "CUSTOM">) {
    startRangeTransition(() => {
      setRangeFilter({
        preset,
        from: dateDaysAgoDateOnly(preset),
        to: toDateOnly(new Date()),
      });
    });
  }

  return {
    activeSheet,
    setActiveSheet,
    optionsLoading,
    optionsError,
    loading,
    error,
    loadFilterOptions,
    retryDataLoad: () => setInternalRefreshTick((prev) => prev + 1),
    exercises,
    plans,
    selectedExerciseId,
    selectedExercise,
    selectedPlanId,
    selectedProgramLabel,
    rangeFilter,
    rangeDraft,
    setRangeDraft,
    rangeDraftError,
    setRangeDraftError,
    stats,
    activePointIndex,
    setActivePointIndex,
    exerciseQuery,
    setExerciseQuery,
    programQuery,
    setProgramQuery,
    isFilterPending,
    isRangePending,
    isControlPending,
    filteredExerciseOptions,
    filteredProgramOptions,
    showNoExerciseState,
    showDataEmptyState,
    applyRangeDraft,
    canApplyRangeDraft,
    setPresetRange,
    startFilterTransition,
    setSelectedExerciseId,
    setSelectedPlanId,
    selectedSeries: series,
  };
}
