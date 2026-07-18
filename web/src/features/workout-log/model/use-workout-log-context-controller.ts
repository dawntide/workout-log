"use client";
import { errorMessage } from "@/lib/error-message";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { resolveWorkoutLogBootstrap } from "@/features/workout-log/model/bootstrap";
import {
  loadWorkoutContextData,
  type LoadWorkoutContextInput,
  type Ref5StartRequiredWorkoutContextResult,
} from "@/features/workout-log/model/context-loader";
import {
  readWorkoutLogQueryContext,
  type WorkoutLogQueryContext,
} from "@/lib/workout-record/query-context";
import type {
  WorkoutLogPlanItem,
} from "@/features/workout-log/model/types";
import {
  createWorkoutRecordDraft,
  prepareWorkoutRecordDraftForEntry,
  type GeneratedSessionLike,
  type WorkoutRecordDraft,
} from "@/entities/workout-record";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import type { WorkoutPreferences } from "@/lib/settings/workout-preferences";

type UseWorkoutLogContextControllerInput = {
  initialPlans?: WorkoutLogPlanItem[];
  initialSettings?: import("@/lib/settings/workout-preferences").SettingsSnapshot | null;
  initialContext?: WorkoutLogInitialContext | null;
  query: WorkoutLogQueryContext;
  setQuery: Dispatch<SetStateAction<WorkoutLogQueryContext>>;
  selectedPlanId: string;
  setSelectedPlanId: Dispatch<SetStateAction<string>>;
  locale: "ko" | "en";
  browserTimezone: string;
  applyWeightRulesToDraft: (
    sourceDraft: WorkoutRecordDraft,
    preferences: WorkoutPreferences,
  ) => WorkoutRecordDraft;
  hasRestoredDraft: () => boolean;
  registerReloadDraftContext: (fn: (() => Promise<void>) | null) => void;
  onNoPlanDetected: () => Promise<void>;
  onBootstrapOpenAddSheet: () => void;
};

import { useSetAtom, useAtomValue } from "jotai";
import { draftAtom, programEntryStateAtom, workflowStateAtom, saveErrorAtom, recentLogItemsAtom, lastSessionAtom, workoutPreferencesAtom } from "../store/workout-log-atoms";
import type { WorkoutLogInitialContext } from "@/server/services/workout-log/get-workout-log-page-bootstrap";

function ref5ResumeMessage(locale: "ko" | "en") {
  return locale === "ko"
    ? "미완료 REF5 세션을 이어서 불러왔습니다. 이 세션을 저장한 뒤 새 세션을 시작할 수 있습니다."
    : "Resumed your unfinished REF5 session. Save it before starting another session.";
}

export function useWorkoutLogContextController({
  initialPlans,
  initialSettings,
  initialContext,
  query,
  setQuery,
  selectedPlanId,
  setSelectedPlanId,
  locale,
  browserTimezone,
  applyWeightRulesToDraft,
  hasRestoredDraft,
  registerReloadDraftContext,
  onNoPlanDetected,
  onBootstrapOpenAddSheet,
}: UseWorkoutLogContextControllerInput) {
  const setDraft = useSetAtom(draftAtom);
  const setProgramEntryState = useSetAtom(programEntryStateAtom);
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const setSaveError = useSetAtom(saveErrorAtom);
  const setRecentLogItems = useSetAtom(recentLogItemsAtom);
  const setLastSession = useSetAtom(lastSessionAtom);
  const setWorkoutPreferences = useSetAtom(workoutPreferencesAtom);
  
  const [plans, setPlans] = useState<WorkoutLogPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [plansLoadKey, setPlansLoadKey] = useState("workout-record:init");
  const [error, setError] = useState<string | null>(null);
  // "blocked" 컨텍스트(예: 자동 진행 플랜에서 이후 기록이 있는 과거 날짜)는
  // 로드 실패(error)가 아니라 정책 안내다. error 와 분리해 에러 페이지 대신
  // 안내 배너로 표시한다.
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [ref5ResumeNotice, setRef5ResumeNotice] = useState<string | null>(null);
  const [ref5StartContext, setRef5StartContext] =
    useState<Ref5StartRequiredWorkoutContextResult | null>(null);
  
  const workoutPreferences = useAtomValue(workoutPreferencesAtom);
  const recentLogItems = useAtomValue(recentLogItemsAtom);
  const lastSession = useAtomValue(lastSessionAtom);

  const selectedPlan = useMemo(
    () => plans.find((entry) => entry.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const contextHasLoadedRef = useRef(false);

  const markResumedRef5Session = useCallback(
    (input: { planId: string; dateKey: string; sessionId: string }) => {
      setRef5ResumeNotice(ref5ResumeMessage(locale));
      const url = new URL(window.location.href);
      url.searchParams.set("planId", input.planId);
      url.searchParams.set("date", input.dateKey);
      url.searchParams.set("sessionId", input.sessionId);
      url.searchParams.delete("logId");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
      setQuery((previous) => ({
        ...previous,
        planId: input.planId,
        date: input.dateKey,
        hasExplicitDate: true,
        logId: null,
        sessionId: input.sessionId,
      }));
    },
    [locale, setQuery],
  );

  const loadWorkoutContext = useCallback(
    async (input: LoadWorkoutContextInput & { isRefresh?: boolean }) => {
      try {
        if (!contextHasLoadedRef.current && !input.isRefresh) {
          setLoading(true);
        }
        setError(null);
        setBlockedMessage(null);
        setRef5ResumeNotice(null);
        // Prevent a stale REF5 start action from surviving plan/date changes
        // while the next context request is in flight.
        setRef5StartContext(null);
        setSaveError(null);

        const result = await loadWorkoutContextData(input, {
          browserTimezone,
          locale,
          applyWeightRulesToDraft,
        });

        if (result.kind === "blocked") {
          setDraft(null);
          setProgramEntryState({});
          setLastSession(null);
          setRef5StartContext(null);
          setBlockedMessage(result.message);
          setWorkflowState("idle");
          return;
        }

        if (result.kind === "ref5-start-required") {
          setSelectedPlanId(result.selectedPlanId);
          setDraft(null);
          setProgramEntryState({});
          setRecentLogItems(result.recentLogItems);
          setLastSession(result.lastSession);
          setRef5StartContext(result);
          setWorkflowState("idle");
          contextHasLoadedRef.current = true;
          return;
        }

        setRef5StartContext(null);
        setSelectedPlanId(result.selectedPlanId);

        if (!hasRestoredDraft()) {
          setDraft(result.draft);
          setProgramEntryState(result.programEntryState);
        }

        setRecentLogItems(result.recentLogItems);
        setLastSession(result.lastSession);
        if (result.resumedRef5SessionId) {
          markResumedRef5Session({
            planId: result.selectedPlanId,
            sessionId: result.resumedRef5SessionId!,
            dateKey: result.draft.session.sessionDate,
          });
        }
        setWorkflowState((prev) => (hasRestoredDraft() ? prev : "idle"));
        contextHasLoadedRef.current = true;
      } catch (e) {
        setDraft(null);
        setProgramEntryState({});
        setLastSession(null);
        setRef5StartContext(null);
        setError(
          errorMessage(e) ??
            (locale === "ko"
              ? "운동기록 화면 데이터를 불러오지 못했습니다."
              : "Could not load the workout log screen."),
        );
      } finally {
        setLoading(false);
      }
    },
    // setLastSession, setRecentLogItems, setWorkoutPreferences 는 useSetAtom 의
    // 안정적 reference 이므로 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      applyWeightRulesToDraft,
      browserTimezone,
      hasRestoredDraft,
      locale,
      markResumedRef5Session,
      setDraft,
      setProgramEntryState,
      setSaveError,
      setSelectedPlanId,
      setWorkflowState,
    ],
  );

  useEffect(() => {
    registerReloadDraftContext(async () => {
      const plan = selectedPlan;
      const prefs = workoutPreferences;
      const currentQuery = query;
      const resolvedPlanId = plan?.id ?? currentQuery.planId ?? "";
      const resolvedPlanName = plan?.name ?? (locale === "ko" ? "프로그램 미선택" : "No Program Selected");
      if (!resolvedPlanId) return;
      await loadWorkoutContext({
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        dateKey: currentQuery.date,
        preferences: prefs,
        planAutoProgression: plan?.params?.autoProgression === true,
        planSchedule: plan?.params?.schedule,
        planParams: plan?.params ?? null,
        generatedSessionId: currentQuery.sessionId,
        isRefresh: true,
      });
    });
    return () => {
      registerReloadDraftContext(null);
    };
  }, [selectedPlan, workoutPreferences, query, loadWorkoutContext, locale, registerReloadDraftContext]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const nextQuery = readWorkoutLogQueryContext();
      setQuery(nextQuery);
      setPlansLoadKey(
        `workout-record:${nextQuery.date}:${nextQuery.planId ?? ""}:${nextQuery.logId ?? ""}:${nextQuery.sessionId ?? ""}:${Date.now()}`,
      );
      setLoading(true);
      setError(null);
      setBlockedMessage(null);
      setRef5ResumeNotice(null);

      try {
        const bootstrap = await resolveWorkoutLogBootstrap({
          query: nextQuery,
          initialPlans,
          initialSettings,
          locale,
        });
        if (cancelled) return;

        setWorkoutPreferences(bootstrap.preferences);

        if (bootstrap.kind === "no-plan") {
          setSelectedPlanId("");
          setDraft(null);
          setProgramEntryState({});
          setLastSession(null);
          setRef5StartContext(null);
          setWorkflowState("idle");
          setSaveError(null);
          setLoading(false);
          await onNoPlanDetected();
          return;
        }

        setPlans(bootstrap.plans);
        setSelectedPlanId(bootstrap.loadInput.planId);

        // ── SSR initialContext 검증 후 사용 (API 호출 제거) ──────────────
        const expectedMatchKey = `${bootstrap.loadInput.planId}:${bootstrap.loadInput.dateKey}:${bootstrap.loadInput.logId ?? ""}:${bootstrap.loadInput.generatedSessionId ?? ""}`;
        const ssrContext = initialContext?.matchKey === expectedMatchKey ? initialContext : null;

        if (ssrContext) {
          // SSR 데이터로 즉시 렌더링 — 클라이언트 API 호출 없음
          if (ssrContext.kind === "blocked") {
            setDraft(null);
            setProgramEntryState({});
            setLastSession(null);
            setRef5StartContext(null);
            setBlockedMessage(ssrContext.message);
            setWorkflowState("idle");
          } else if (ssrContext.kind === "ref5-start-required") {
            setSelectedPlanId(ssrContext.selectedPlanId);
            setDraft(null);
            setProgramEntryState({});
            setRecentLogItems(ssrContext.recentLogItems);
            setLastSession(ssrContext.lastSession);
            setRef5StartContext(ssrContext);
            setWorkflowState("idle");
            contextHasLoadedRef.current = true;
          } else {
            setRef5StartContext(null);
            setSelectedPlanId(ssrContext.selectedPlanId);
            if (!hasRestoredDraft()) {
              setDraft(ssrContext.draft);
              setProgramEntryState(ssrContext.programEntryState);
            }
            setRecentLogItems(ssrContext.recentLogItems);
            setLastSession(ssrContext.lastSession);
            if (ssrContext.resumedRef5SessionId) {
              markResumedRef5Session({
                planId: ssrContext.selectedPlanId,
                sessionId: ssrContext.resumedRef5SessionId!,
                dateKey: ssrContext.draft.session.sessionDate,
              });
            }
            setWorkflowState((prev) => (hasRestoredDraft() ? prev : "idle"));
            contextHasLoadedRef.current = true;
          }
          setLoading(false);
        } else {
          // SSR 미스(타임존 불일치 등) → 클라이언트 폴백
          await loadWorkoutContext(bootstrap.loadInput);
        }

        if (bootstrap.openAdd) {
          onBootstrapOpenAddSheet();
        }
      } catch (e) {
        if (!cancelled) {
          setDraft(null);
          setProgramEntryState({});
          setRef5StartContext(null);
          setError(
            errorMessage(e) ??
              (locale === "ko" ? "플랜 목록을 불러오지 못했습니다." : "Could not load the plans list."),
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // setLastSession, setRecentLogItems, setWorkoutPreferences 는 useSetAtom 안정 reference,
    // hasRestoredDraft 는 ref-stable callback. 의도적으로 deps 에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialPlans,
    initialSettings,
    initialContext,
    loadWorkoutContext,
    locale,
    markResumedRef5Session,
    onBootstrapOpenAddSheet,
    onNoPlanDetected,
    setDraft,
    setProgramEntryState,
    setQuery,
    setSelectedPlanId,
    setSaveError,
    setWorkflowState,
  ]);

  const handlePlanChange = useCallback(
    async (planId: string) => {
      if (query.logId || query.sessionId) return;
      const plan = plans.find((entry) => entry.id === planId);
      if (!plan) return;
      setSelectedPlanId(plan.id);
      await loadWorkoutContext({
        planId: plan.id,
        planName: plan.name,
        dateKey: query.date,
        preferences: workoutPreferences,
        planAutoProgression: plan.params?.autoProgression === true,
        planSchedule: plan.params?.schedule,
        planParams: plan.params ?? null,
      });
    },
    [plans, loadWorkoutContext, query.date, query.logId, query.sessionId, setSelectedPlanId, workoutPreferences],
  );

  const retryCurrentContextLoad = useCallback(() => {
    const resolvedPlanId = selectedPlan?.id ?? query.planId ?? "";
    const resolvedPlanName = selectedPlan?.name ?? (locale === "ko" ? "프로그램 미선택" : "No Program Selected");
    if (query.logId || query.sessionId) {
      void loadWorkoutContext({
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        dateKey: query.hasExplicitDate ? query.date : "",
        preferences: workoutPreferences,
        planAutoProgression: selectedPlan?.params?.autoProgression === true,
        planSchedule: selectedPlan?.params?.schedule,
        planParams: selectedPlan?.params ?? null,
        logId: query.logId,
        generatedSessionId: query.sessionId,
      });
      return;
    }
    if (resolvedPlanId) {
      void loadWorkoutContext({
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        dateKey: query.date,
        preferences: workoutPreferences,
        planAutoProgression: selectedPlan?.params?.autoProgression === true,
        planSchedule: selectedPlan?.params?.schedule,
        planParams: selectedPlan?.params ?? null,
      });
    }
  }, [loadWorkoutContext, locale, query, selectedPlan, workoutPreferences]);

  const isPlansSettled = useQuerySettled(plansLoadKey, loading);
  const noPlan = isPlansSettled && !error && plans.length === 0 && !query.logId && !query.sessionId;

  const hydrateRef5GeneratedSession = useCallback(
    (session: GeneratedSessionLike, options?: { resumed?: boolean }) => {
      const context = ref5StartContext;
      if (!context) {
        throw new Error(
          locale === "ko"
            ? "REF5 시작 컨텍스트가 만료되었습니다."
            : "The REF5 start context has expired.",
        );
      }

      const prepared = prepareWorkoutRecordDraftForEntry(
        createWorkoutRecordDraft(session, context.planName, {
          sessionDate: context.dateKey,
          timezone: browserTimezone,
          locale,
        }),
      );
      setSelectedPlanId(context.selectedPlanId);
      setDraft(prepared.draft);
      setProgramEntryState(prepared.programEntryState);
      setRef5StartContext(null);
      setBlockedMessage(null);
      setRef5ResumeNotice(
        options?.resumed ? ref5ResumeMessage(locale) : null,
      );
      setWorkflowState("idle");
      contextHasLoadedRef.current = true;
      if (typeof session.id === "string" && session.id.trim()) {
        const url = new URL(window.location.href);
        url.searchParams.set("planId", context.planId);
        url.searchParams.set("date", prepared.draft.session.sessionDate);
        url.searchParams.set("sessionId", session.id);
        url.searchParams.delete("logId");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
        setQuery((previous) => ({
          ...previous,
          planId: context.planId,
          date: prepared.draft.session.sessionDate,
          hasExplicitDate: true,
          logId: null,
          sessionId: session.id!,
        }));
      }
    },
    [
      browserTimezone,
      locale,
      ref5StartContext,
      setDraft,
      setProgramEntryState,
      setQuery,
      setSelectedPlanId,
      setWorkflowState,
    ],
  );

  return {
    query,
    plans,
    selectedPlanId,
    recentLogItems,
    lastSession,
    loading,
    error,
    workoutPreferences,
    selectedPlan,
    noPlan,
    blockedMessage,
    ref5ResumeNotice,
    ref5StartContext,
    hydrateRef5GeneratedSession,
    handlePlanChange,
    retryCurrentContextLoad,
  };
}
