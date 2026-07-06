"use client";
import { errorMessage } from "@/lib/error-message";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import type {
  CalendarPlan,
  CalendarRecentGeneratedSession,
  CalendarWorkoutLogForDate,
  CalendarWorkoutLogSummary,
} from "./types";

function normalizeSearchText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

type UseCalendarDataControllerInput = {
  locale: "ko" | "en";
  timezone: string;
  selectedDate: string;
  planQuery: string;
  initialPlans?: CalendarPlan[];
  initialSessions?: CalendarRecentGeneratedSession[];
  initialLogs?: CalendarWorkoutLogSummary[];
};

export function useCalendarDataController({
  locale,
  timezone,
  selectedDate,
  planQuery,
  initialPlans,
  initialSessions,
  initialLogs,
}: UseCalendarDataControllerInput) {
  const [plans, setPlans] = useState<CalendarPlan[]>(initialPlans ?? []);
  const [planId, setPlanId] = useState(() => initialPlans?.[0]?.id ?? "");
  const [recentSessions, setRecentSessions] = useState<CalendarRecentGeneratedSession[]>(
    initialSessions ?? [],
  );
  const [allPlanLogs, setAllPlanLogs] = useState<CalendarWorkoutLogSummary[]>(
    initialLogs ?? [],
  );
  const [selectedLog, setSelectedLog] = useState<CalendarWorkoutLogForDate | null>(
    null,
  );
  const [selectedLogKey, setSelectedLogKey] = useState("");
  const [selectedLogLoading, setSelectedLogLoading] = useState(false);
  const [completedLogKey, setCompletedLogKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialPlans == null);

  const plansLoadedRef = useRef(initialPlans != null);
  const logFetchCacheRef = useRef<Set<string>>(new Set());
  const initialPlanId = initialPlans?.[0]?.id ?? "";
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => {
    logFetchCacheRef.current.clear();
    setRefreshTick((t) => t + 1);
  }, []);

  // 낙관적 업데이트: 날짜 이동 — API 응답 전에 UI 즉시 반영
  const applyOptimisticDateMove = useCallback((
    logId: string,
    newDate: string,
    newPerformedAt: string,
  ) => {
    setAllPlanLogs((prev) => {
      const updated = prev.map((log) =>
        log.id === logId ? { ...log, performedAt: newPerformedAt } : log,
      );
      // allPlanLogs는 최신순 정렬 유지
      return updated.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
    });
    setSelectedLog((prev) =>
      prev?.id === logId ? { ...prev, performedAt: newPerformedAt } : prev,
    );
    // selectedLogKey를 새 날짜 키로 갱신 → currentSelectedLog가 새 날짜에서 resolve
    const newKey = `${planId}|${newDate}`;
    setSelectedLogKey(newKey);
    setCompletedLogKey(newKey);
  }, [planId]);

  // 낙관적 업데이트: 삭제 — API 응답 전에 UI 즉시 반영
  const applyOptimisticDelete = useCallback((logId: string) => {
    setAllPlanLogs((prev) => prev.filter((log) => log.id !== logId));
    setSelectedLog(null);
  }, []);

  const currentLogKey = planId ? `${planId}|${selectedDate}` : "";
  const currentSelectedLog = selectedLogKey === currentLogKey ? selectedLog : null;

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === planId) ?? null,
    [planId, plans],
  );
  const orderedPlans = useMemo(() => {
    if (!selectedPlan) return plans;
    return [selectedPlan, ...plans.filter((plan) => plan.id !== selectedPlan.id)];
  }, [plans, selectedPlan]);
  const filteredPlans = useMemo(() => {
    const normalizedQuery = planQuery.trim().toLowerCase();
    if (!normalizedQuery) return orderedPlans;
    return orderedPlans.filter((plan) =>
      normalizeSearchText(plan.name, plan.type).includes(normalizedQuery),
    );
  }, [orderedPlans, planQuery]);

  useEffect(() => {
    if (initialPlans != null && refreshTick === 0) return;
    let cancelled = false;

    (async () => {
      try {
        if (!plansLoadedRef.current) setLoading(true);
        const response = await apiGet<{ items: CalendarPlan[] }>("/api/plans");
        if (cancelled) return;
        plansLoadedRef.current = true;
        setPlans(response.items);
        setPlanId((currentPlanId) => {
          if (
            currentPlanId &&
            response.items.some((plan) => plan.id === currentPlanId)
          ) {
            return currentPlanId;
          }
          return response.items[0]?.id ?? "";
        });
      } catch (error) {
        if (!cancelled) {
          setError(
            errorMessage(error) ??
              (locale === "ko"
                ? "플랜을 불러오지 못했습니다."
                : "Could not load plans."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPlans, locale, refreshTick]);

  useEffect(() => {
    if (!planId) {
      setRecentSessions([]);
      return;
    }
    if (initialSessions != null && planId === initialPlanId && refreshTick === 0) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("planId", planId);
        searchParams.set("limit", "200");
        const response = await apiGet<{ items: CalendarRecentGeneratedSession[] }>(
          `/api/generated-sessions?${searchParams.toString()}`,
        );
        if (!cancelled) setRecentSessions(response.items);
      } catch (error) {
        if (!cancelled) {
          setError(
            errorMessage(error) ??
              (locale === "ko"
                ? "세션을 불러오지 못했습니다."
                : "Could not load sessions."),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialPlanId, initialSessions, locale, planId, refreshTick]);

  useEffect(() => {
    if (!planId) {
      setSelectedLog(null);
      setSelectedLogKey("");
      setCompletedLogKey("");
      setSelectedLogLoading(false);
      return;
    }

    let cancelled = false;
    const fetchKey = `${planId}|${selectedDate}`;

    (async () => {
      try {
        if (!logFetchCacheRef.current.has(fetchKey)) setSelectedLogLoading(true);
        setError(null);
        const searchParams = new URLSearchParams();
        searchParams.set("planId", planId);
        searchParams.set("date", selectedDate);
        searchParams.set("timezone", timezone);
        searchParams.set("limit", "1");
        searchParams.set("includeGeneratedSession", "0");
        searchParams.set("includeProgression", "0");
        const response = await apiGet<{ items: CalendarWorkoutLogForDate[] }>(
          `/api/logs?${searchParams.toString()}`,
        );
        if (cancelled) return;
        logFetchCacheRef.current.add(fetchKey);
        setSelectedLog(response.items[0] ?? null);
        setSelectedLogKey(fetchKey);
        setCompletedLogKey(fetchKey);
      } catch (error) {
        if (!cancelled) {
          setSelectedLog(null);
          setSelectedLogKey(fetchKey);
          setCompletedLogKey(fetchKey);
          setError(
            errorMessage(error) ??
              (locale === "ko"
                ? "운동기록을 불러오지 못했습니다."
                : "Could not load workout logs."),
          );
        }
      } finally {
        if (!cancelled) setSelectedLogLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, planId, refreshTick, selectedDate, timezone]);

  useEffect(() => {
    if (!planId) {
      setAllPlanLogs([]);
      return;
    }
    if (initialLogs != null && planId === initialPlanId && refreshTick === 0) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const searchParams = new URLSearchParams();
        searchParams.set("planId", planId);
        searchParams.set("limit", "200");
        searchParams.set("includeSets", "0");
        searchParams.set("includeGeneratedSession", "0");
        searchParams.set("includeProgression", "0");
        const response = await apiGet<{ items: CalendarWorkoutLogSummary[] }>(
          `/api/logs?${searchParams.toString()}`,
        );
        if (!cancelled) setAllPlanLogs(response.items);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [initialLogs, initialPlanId, planId, refreshTick]);

  return {
    plans,
    planId,
    setPlanId,
    recentSessions,
    allPlanLogs,
    selectedLog,
    currentSelectedLog,
    selectedLogLoading,
    completedLogKey,
    error,
    setError,
    loading,
    selectedPlan,
    filteredPlans,
    refresh,
    applyOptimisticDateMove,
    applyOptimisticDelete,
  };
}
