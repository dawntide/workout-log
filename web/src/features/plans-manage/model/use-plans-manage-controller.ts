"use client";
import { errorMessage } from "@/lib/error-message";

// plans-manage 컨트롤러 훅 — 화면 컴포넌트(app/plans/manage/plans-manage-content.tsx)에서
// 상태·파생·데이터 로딩·뮤테이션 전부를 추출(god-component 분해 2단계, 감사 §5.4-4).
// 뷰는 이 훅의 반환 bag을 구조분해해 렌더만 담당한다(로직 무변경 이동).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { useBodyweightKg } from "@/lib/settings/use-bodyweight";
import { isRef5PlanParams } from "@/lib/workout-record/ref5-plan";
import { bodyweightAddedSuffix } from "@workout/core/bodyweight-load";
import { familyFallbackKeyForBaselineKey } from "@workout/core/program-store/model";
import type { Ref5Status } from "@workout/core/program-engine/ref5-status";

import {
  RECENT_THRESHOLD_DAYS,
  TARGET_PRIORITY,
  bodyweightExerciseNameForTargetKey,
  createStrengthBaselineDraft,
  daysSince,
  formatRelativeDays,
  normalizeSearchText,
  planTypeTermLabel,
  planTypeTermTone,
  planWithPatchedFields,
  shortTargetLabel,
  targetLabelFromKey,
  toRecord,
  type IncrementDraft,
  type Plan,
  type ProgressionStateApiResponse,
  type StrengthBaselineDraft,
  type TargetLastEvent,
} from "./plan-view";

export function usePlansManageController({ initialPlans }: { initialPlans: Plan[] }) {
  const { locale } = useLocale();
  const localeKey: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const bodyweightKg = useBodyweightKg();
  const { alert, confirm } = useAppDialog();

  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [loading, setLoading] = useState(false);
  const [loadKey, setLoadKey] = useState("plans-manage:load:init");
  const [error, setError] = useState<string | null>(null);
  const [refreshTick] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<"ALL" | "RECENT" | "IDLE">("ALL");
  const storeHasLoadedRef = useRef(initialPlans.length > 0);

  const [managePlanId, setManagePlanId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [strengthDraft, setStrengthDraft] = useState<StrengthBaselineDraft>({});
  const [incrementDraft, setIncrementDraft] = useState<IncrementDraft>({});
  const [incrementLoading, setIncrementLoading] = useState(false);
  const [progressPosition, setProgressPosition] = useState<{
    cycle: number;
    week: number;
    day: number;
  } | null>(null);
  const [lastEvents, setLastEvents] = useState<Record<string, TargetLastEvent>>({});
  const [ref5Status, setRef5Status] = useState<Ref5Status | null>(null);
  // v0.5.1 F4: 라이트 블록(회복) 진행 중 배지 — progression-state의 lightBlockMode 파생.
  const [lightBlockActive, setLightBlockActive] = useState(false);
  const [showStartingBaseline, setShowStartingBaseline] = useState(false);
  const [showIncrementSettings, setShowIncrementSettings] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDraft, setAdjustDraft] = useState<Record<string, number>>({});
  const [adjusting, setAdjusting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const managedPlan = useMemo(
    () => plans.find((item) => item.id === managePlanId) ?? null,
    [managePlanId, plans],
  );
  const strengthRows = useMemo(
    () =>
      Object.entries(strengthDraft).map(([key, value]) => ({
        key,
        fallbackKey: familyFallbackKeyForBaselineKey(key),
        label: targetLabelFromKey(key),
        oneRepMaxKg: value.oneRepMaxKg,
        trainingMaxKg: value.trainingMaxKg,
      })),
    [strengthDraft],
  );
  const isAutoProgression = useMemo(
    () => toRecord(managedPlan?.params).autoProgression === true,
    [managedPlan],
  );
  const isRef5ManagedPlan = useMemo(
    () => isRef5PlanParams(toRecord(managedPlan?.params)),
    [managedPlan],
  );
  const currentProgressRows = useMemo(() => {
    const rows = Object.entries(incrementDraft).map(([key, entry]) => ({
      key,
      label: shortTargetLabel(key),
      weightKg: entry.workKg > 0 ? entry.workKg : null,
      // 맨몸 운동(PULL 등)은 현재 무게(=총부하) 뒤에 추가중량 병기.
      weightSuffix:
        entry.workKg > 0
          ? bodyweightAddedSuffix(
              bodyweightExerciseNameForTargetKey(key),
              entry.workKg,
              bodyweightKg,
              localeKey,
            )
          : null,
      lastDeltaKg: lastEvents[key]?.lastDeltaKg ?? null,
      lastEventType: lastEvents[key]?.lastEventType ?? null,
    }));
    rows.sort((a, b) => {
      const ai = TARGET_PRIORITY.indexOf(a.key);
      const bi = TARGET_PRIORITY.indexOf(b.key);
      if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return rows;
  }, [incrementDraft, lastEvents, bodyweightKg, localeKey]);
  const isSettled = useQuerySettled(loadKey, loading);
  const filteredPlans = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return plans.filter((plan) => {
      const days = daysSince(plan.lastPerformedAt);
      const activityMatched = activityFilter === "ALL"
        || (activityFilter === "RECENT" && typeof days === "number" && days <= RECENT_THRESHOLD_DAYS)
        || (activityFilter === "IDLE" && days === null);
      if (!activityMatched) return false;
      if (!normalizedQuery) return true;
      return normalizeSearchText(plan.name, plan.baseProgramName, plan.type).includes(normalizedQuery);
    });
  }, [activityFilter, plans, searchQuery]);

  // terminal 목록 행 파생 — paper PlanCardV2가 인라인으로 계산하던 표시값(타입 라벨/톤,
  // 상대 수행시각, 최근 여부)을 presentation-only 뷰에 넘기기 위해 한 번에 계산한다.
  const planRows = useMemo(
    () =>
      filteredPlans.map((plan) => {
        const days = daysSince(plan.lastPerformedAt);
        return {
          plan,
          typeLabel: planTypeTermLabel(plan.type),
          typeTone: planTypeTermTone(plan.type),
          relText: formatRelativeDays(days, localeKey),
          isFresh: typeof days === "number" && days <= RECENT_THRESHOLD_DAYS,
        };
      }),
    [filteredPlans, localeKey],
  );

  const heroMetrics = useMemo(() => {
    const total = plans.length;
    let recent = 0;
    let untouched = 0;
    for (const plan of plans) {
      const days = daysSince(plan.lastPerformedAt);
      if (days === null) {
        untouched += 1;
      } else if (days <= RECENT_THRESHOLD_DAYS) {
        recent += 1;
      }
    }
    return { total, recent, untouched };
  }, [plans]);

  const loadPlans = useCallback(async (options?: { isRefresh?: boolean }) => {
    try {
      if (!storeHasLoadedRef.current && !options?.isRefresh) setLoading(true);
      setLoadKey(`plans-manage:load:${Date.now()}`);
      setError(null);
      const res = await apiGet<{ items: Plan[] }>("/api/plans");
      storeHasLoadedRef.current = true;
      setPlans(res.items ?? []);
    } catch (e) {
      setError(errorMessage(e) ?? "플랜 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (refreshTick > 0) {
      void loadPlans({ isRefresh: true });
    }
  }, [loadPlans, refreshTick]);

  useEffect(() => {
    if (!managePlanId) return;
    if (plans.some((item) => item.id === managePlanId)) return;
    setManagePlanId("");
    setSaving(false);
    setDeleting(false);
  }, [managePlanId, plans]);

  function openManageSheet(plan: Plan) {
    setError(null);
    setNameDraft(plan.name);
    setStrengthDraft(createStrengthBaselineDraft(plan.params));
    setIncrementDraft({});
    setProgressPosition(null);
    setLastEvents({});
    setRef5Status(null);
    setLightBlockActive(false);
    setShowStartingBaseline(false);
    setShowIncrementSettings(false);
    setAdjustOpen(false);
    setAdjustDraft({});
    setManagePlanId(plan.id);

    const planParams = toRecord(plan.params);
    if (planParams.autoProgression === true) {
      void loadIncrementDraft(plan.id);
    }
  }

  async function loadIncrementDraft(planId: string) {
    try {
      setIncrementLoading(true);
      const res = await apiGet<ProgressionStateApiResponse>(
        `/api/plans/${encodeURIComponent(planId)}/progression-state`,
      );
      if (res.program === "ref5") {
        setRef5Status(res.ref5Status ?? null);
        setIncrementDraft({});
        setProgressPosition(null);
        setLastEvents({});
        setLightBlockActive(false);
        return;
      }
      setRef5Status(null);
      if (!res.program || !res.effectiveRules) {
        setIncrementDraft({});
        return;
      }
      const draft: IncrementDraft = {};
      for (const [key, rule] of Object.entries(res.effectiveRules)) {
        const workKg = res.state?.targets?.[key]?.workKg ?? 0;
        draft[key] = {
          increaseKg: rule.increaseKg,
          decreaseKg: rule.decreaseKg ?? 0,
          defaultIncreaseKg: rule.defaultIncreaseKg,
          defaultResetFactor: rule.defaultResetFactor,
          workKg,
        };
      }
      setIncrementDraft(draft);
      if (res.state) {
        setProgressPosition({
          cycle: res.state.cycle,
          week: res.state.week,
          day: res.state.day,
        });
      }
      setLastEvents(res.targetsLastEvent ?? {});
      setLightBlockActive(res.program === "asymptote" && res.state?.lightBlockMode === true);
    } catch {
      setIncrementDraft({});
      setRef5Status(null);
    } finally {
      setIncrementLoading(false);
    }
  }

  function openAdjustment() {
    const draft: Record<string, number> = {};
    for (const row of currentProgressRows) {
      draft[row.key] = row.weightKg ?? 0;
    }
    setAdjustDraft(draft);
    setAdjustOpen(true);
  }

  async function saveAdjustment() {
    if (!managedPlan) return;
    const adjustments: Record<string, { workKg: number }> = {};
    for (const row of currentProgressRows) {
      const next = adjustDraft[row.key];
      if (typeof next !== "number" || !Number.isFinite(next) || next <= 0) continue;
      if (next === (row.weightKg ?? 0)) continue;
      adjustments[row.key] = { workKg: next };
    }
    if (Object.keys(adjustments).length === 0) {
      setAdjustOpen(false);
      return;
    }
    try {
      setAdjusting(true);
      const res = await apiPost<{
        ok: boolean;
        state: ProgressionStateApiResponse["state"];
        targetsLastEvent?: Record<string, TargetLastEvent>;
      }>(
        `/api/plans/${encodeURIComponent(managedPlan.id)}/runtime-targets`,
        { adjustments },
        { invalidateCachePrefixes: ["/api/plans"] },
      );
      const targets = res.state?.targets ?? {};
      setIncrementDraft((prev) => {
        const nextDraft = { ...prev };
        for (const [key, target] of Object.entries(targets)) {
          if (nextDraft[key]) {
            nextDraft[key] = {
              ...nextDraft[key],
              workKg: target.workKg ?? nextDraft[key].workKg,
            };
          }
        }
        return nextDraft;
      });
      if (res.state) {
        setProgressPosition({
          cycle: res.state.cycle,
          week: res.state.week,
          day: res.state.day,
        });
      }
      if (res.targetsLastEvent) setLastEvents(res.targetsLastEvent);
      setAdjustOpen(false);
      await alert({
        title: "조정 완료",
        message: "현재 TM이 조정되었습니다.",
        buttonText: "확인",
      });
    } catch (e) {
      await alert({
        title: "조정 실패",
        message: errorMessage(e) ?? "현재 TM 조정에 실패했습니다.",
        buttonText: "확인",
        tone: "danger",
      });
    } finally {
      setAdjusting(false);
    }
  }

  async function savePlanChanges() {
    if (!managedPlan) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      await alert({
        title: "입력 확인 필요",
        message: "플랜 이름은 비워둘 수 없습니다.",
        buttonText: "확인",
        tone: "danger",
      });
      return;
    }

    const prevPlan = managedPlan;
    const currentParams = toRecord(managedPlan.params);
    const nextParams: Record<string, unknown> = { ...currentParams };

    if (!isRef5ManagedPlan) {
      const oneRepMaxKg: Record<string, number> = {};
      const trainingMaxKg: Record<string, number> = {};
      for (const row of strengthRows) {
        if (row.oneRepMaxKg <= 0 && row.trainingMaxKg <= 0) {
          await alert({
            title: "입력 확인 필요",
            message: `${row.label}의 1RM 또는 TM을 kg 기준으로 입력하세요.`,
            buttonText: "확인",
            tone: "danger",
          });
          return;
        }
        if (row.oneRepMaxKg > 0) oneRepMaxKg[row.key] = row.oneRepMaxKg;
        if (row.trainingMaxKg > 0) trainingMaxKg[row.key] = row.trainingMaxKg;

        // Keep per-exercise baselines synchronized with their family fallback key.
        const { fallbackKey } = row;
        if (fallbackKey) {
          if (row.oneRepMaxKg > 0 && oneRepMaxKg[fallbackKey] === undefined) {
            oneRepMaxKg[fallbackKey] = row.oneRepMaxKg;
          }
          if (row.trainingMaxKg > 0 && trainingMaxKg[fallbackKey] === undefined) {
            trainingMaxKg[fallbackKey] = row.trainingMaxKg;
          }
        }
      }
      nextParams.oneRepMaxKg = oneRepMaxKg;
      nextParams.trainingMaxKg = trainingMaxKg;

      const overrideEntries = Object.entries(incrementDraft);
      if (overrideEntries.length > 0) {
        const increaseKgMap: Record<string, number> = {};
        const decreaseKgMap: Record<string, number> = {};
        for (const [key, row] of overrideEntries) {
          if (row.increaseKg !== row.defaultIncreaseKg) {
            increaseKgMap[key] = row.increaseKg;
          }
          if (row.decreaseKg > 0) {
            decreaseKgMap[key] = row.decreaseKg;
          }
        }
        const hasOverrides =
          Object.keys(increaseKgMap).length > 0 || Object.keys(decreaseKgMap).length > 0;
        if (hasOverrides) {
          const incrementOverrides: Record<string, Record<string, number>> = {};
          if (Object.keys(increaseKgMap).length > 0) incrementOverrides.increaseKg = increaseKgMap;
          if (Object.keys(decreaseKgMap).length > 0) incrementOverrides.decreaseKg = decreaseKgMap;
          nextParams.incrementOverrides = incrementOverrides;
        } else {
          delete nextParams.incrementOverrides;
        }
      }
    }

    try {
      setSaving(true);
      setError(null);

      setPlans((prev) =>
        prev.map((item) =>
          item.id === managedPlan.id ? { ...item, name: nextName, params: nextParams } : item,
        ),
      );

      const res = await apiPatch<{ plan: Plan }>(`/api/plans/${encodeURIComponent(managedPlan.id)}`, {
        name: nextName,
        ...(!isRef5ManagedPlan ? { params: nextParams } : {}),
      });
      setPlans((prev) =>
        prev.map((item) =>
          item.id === managedPlan.id ? planWithPatchedFields(item, res.plan) : item,
        ),
      );
      setManagePlanId("");
      await alert({
        title: "수정 완료",
        message: `플랜 정보가 변경되었습니다.\n${res.plan.name}`,
        buttonText: "확인",
      });
    } catch (e) {
      if (managedPlan) {
        setPlans((prev) => prev.map((item) => (item.id === managedPlan.id ? prevPlan : item)));
      }
      const message = errorMessage(e) ?? "플랜 정보 수정에 실패했습니다.";
      setError(message);
      await alert({
        title: "수정 실패",
        message,
        buttonText: "확인",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan() {
    if (!managedPlan) return;
    const ok = await confirm({
      title: "플랜 삭제",
      message: `'${managedPlan.name}' 플랜을 삭제하시겠습니까?\n생성된 세션/진행 상태가 함께 정리됩니다.`,
      confirmText: "삭제",
      cancelText: "취소",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setDeleting(true);
      setError(null);

      const targetId = managedPlan.id;
      setManagePlanId("");
      setPlans((prev) => prev.filter((item) => item.id !== targetId));

      await apiDelete<{ deleted: boolean; planId: string }>(
        `/api/plans/${encodeURIComponent(targetId)}`,
      );
      await alert({
        title: "삭제 완료",
        message: `플랜이 삭제되었습니다.\n${managedPlan.name}`,
        buttonText: "확인",
      });
    } catch (e) {
      void loadPlans({ isRefresh: true });
      const message = errorMessage(e) ?? "플랜 삭제에 실패했습니다.";
      setError(message);
      await alert({
        title: "삭제 실패",
        message,
        buttonText: "확인",
        tone: "danger",
      });
    } finally {
      setDeleting(false);
    }
  }
  return {
    plans,
    loading,
    error,
    isSettled,
    searchQuery,
    setSearchQuery,
    activityFilter,
    setActivityFilter,
    managePlanId,
    setManagePlanId,
    nameDraft,
    setNameDraft,
    strengthDraft,
    setStrengthDraft,
    incrementDraft,
    setIncrementDraft,
    incrementLoading,
    progressPosition,
    lightBlockActive,
    lastEvents,
    showStartingBaseline,
    setShowStartingBaseline,
    showIncrementSettings,
    setShowIncrementSettings,
    adjustOpen,
    setAdjustOpen,
    adjustDraft,
    setAdjustDraft,
    adjusting,
    saving,
    deleting,
    managedPlan,
    strengthRows,
    isAutoProgression,
    isRef5ManagedPlan,
    ref5Status,
    currentProgressRows,
    filteredPlans,
    planRows,
    heroMetrics,
    loadPlans,
    openManageSheet,
    openAdjustment,
    saveAdjustment,
    savePlanChanges,
    deletePlan,
  };
}
