"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PlansManageTuiView } from "./plans-manage-tui-view";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { AppTextInput } from "@/components/ui/form-controls";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import {
  V2Card,
  V2Chip,
  V2EmptyState,
  V2Hairline,
  V2MetricCard,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Segmented,
  V2Stack,
} from "@/components/v2/primitives";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyStateRows, ErrorStateRows, LoadingStateRows } from "@/components/ui/settings-state";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { APP_ROUTES } from "@/lib/app-routes";
import {
  familyFallbackKeyForBaselineKey,
  selectDisplayStrengthBaselineKeys,
} from "@workout/core/program-store/model";
import { TargetWeightChip } from "@/components/v2/target-weight-chip";
import { bodyweightAddedSuffix } from "@workout/core/bodyweight-load";
import { useBodyweightKg } from "@/lib/settings/use-bodyweight";
import type { PlanForManage } from "@/server/services/plans/get-plans-for-manage";

// PERF: SSR로 주입된 initialPlans로 첫 화면 즉시 렌더 (스피너 없음).

// 순수 모델(타입·표시 헬퍼)은 features/plans-manage/model로 추출됨(god-component 분해 1단계).
import {
  RECENT_THRESHOLD_DAYS,
  TARGET_PRIORITY,
  bodyweightExerciseNameForTargetKey,
  createStrengthBaselineDraft,
  daysSince,
  formatDateTime,
  formatKg,
  formatRelativeDays,
  normalizeSearchText,
  planTypeChipTone,
  planTypeLabel,
  planTypeTermLabel,
  planTypeTermTone,
  planWithPatchedFields,
  shortTargetLabel,
  targetLabelFromKey,
  toRecord,
  readPositiveNumberMap,
  type IncrementDraft,
  type IncrementDraftEntry,
  type Plan,
  type ProgressionStateApiResponse,
  type StrengthBaselineDraft,
  type TargetLastEvent,
} from "@/features/plans-manage/model/plan-view";


function PlanCardV2({
  plan,
  onManage,
  copy,
  locale,
}: {
  plan: Plan;
  onManage: () => void;
  copy: ReturnType<typeof useLocale>["copy"];
  locale: "ko" | "en";
}) {
  const days = daysSince(plan.lastPerformedAt);
  const relText = formatRelativeDays(days, locale);
  const isFresh = typeof days === "number" && days <= RECENT_THRESHOLD_DAYS;
  const typeText = planTypeLabel(plan.type, locale);
  const typeTone = planTypeChipTone(plan.type);

  return (
    <V2Card tone="paper" padding="var(--v2-s-5)">
      <V2Stack gap={4}>
        <V2Stack gap={2}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--v2-s-1)",
            }}
          >
            <V2Chip tone={typeTone}>{typeText}</V2Chip>
            {isFresh ? (
              <V2Chip tone="success" icon="bolt">
                {locale === "ko" ? "최근 수행" : "Recent"}
              </V2Chip>
            ) : null}
          </div>
          <h3
            className="v2-h3"
            style={{ margin: 0, color: "var(--v2-ink)" }}
          >
            {plan.name}
          </h3>
          {plan.baseProgramName ? (
            <p
              className="v2-small"
              style={{ margin: 0, color: "var(--v2-ink-2)" }}
            >
              {plan.baseProgramName}
            </p>
          ) : null}
          <p
            className="v2-small"
            style={{
              margin: 0,
              color: isFresh ? "var(--v2-c-success)" : "var(--v2-ink-3)",
            }}
          >
            {relText
              ? `${copy.plansManage.recentPerformedPrefix} · ${relText}`
              : copy.plansManage.noPerformedHistory}
          </p>
        </V2Stack>

        <V2PrimaryBtn
          full
          icon="tune"
          onClick={onManage}
        >
          {copy.plansManage.manage}
        </V2PrimaryBtn>
      </V2Stack>
    </V2Card>
  );
}

function PlanDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <V2Card tone="inset" padding="var(--v2-s-3) var(--v2-s-4)" radius="var(--v2-r-2)">
      <p className="v2-eyebrow" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
        {label}
      </p>
      <p
        className="v2-body"
        style={{
          margin: 0,
          marginTop: "var(--v2-s-1)",
          color: "var(--v2-ink)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
    </V2Card>
  );
}

function StrengthEditRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <V2Card tone="inset" padding="var(--v2-s-3) var(--v2-s-4)" radius="var(--v2-r-2)">
      <V2Stack gap={3}>
        <strong
          className="v2-body"
          style={{ color: "var(--v2-ink)", fontWeight: 700 }}
        >
          {label}
        </strong>
        {children}
      </V2Stack>
    </V2Card>
  );
}

function StrengthEditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <V2Stack gap={1}>
      <span
        className="v2-eyebrow"
        style={{ color: "var(--v2-ink-3)" }}
      >
        {label}
      </span>
      {children}
    </V2Stack>
  );
}

export function PlansManageContent({ initialPlans }: { initialPlans: Plan[] }) {
  const { copy, locale } = useLocale();
  const localeKey: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const skin = useThemeSkin();
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
    } catch (e: any) {
      setError(e?.message ?? "플랜 목록을 불러오지 못했습니다.");
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
    } catch {
      setIncrementDraft({});
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
    } catch (e: any) {
      await alert({
        title: "조정 실패",
        message: e?.message ?? "현재 TM 조정에 실패했습니다.",
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

      // per-exercise(EX_) 행은 family canonical 키에도 같은 값을 기록한다. 표시 단계에서 접은
      // family 그림자 행을 여기서 되살려, 자동 진행이 참조하는 family baseline이 사라지지 않게 한다.
      // (프로그램 시작 시 submitStartProgram이 펼치는 fallbackKey 동기화와 동일한 패턴.)
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

    const prevPlan = managedPlan;
    const currentParams = toRecord(managedPlan.params);
    const nextParams: Record<string, unknown> = {
      ...currentParams,
      oneRepMaxKg,
      trainingMaxKg,
    };

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
        params: nextParams,
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
    } catch (e: any) {
      if (managedPlan) {
        setPlans((prev) => prev.map((item) => (item.id === managedPlan.id ? prevPlan : item)));
      }
      const message = e?.message ?? "플랜 정보 수정에 실패했습니다.";
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
    } catch (e: any) {
      void loadPlans({ isRefresh: true });
      const message = e?.message ?? "플랜 삭제에 실패했습니다.";
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

  const heroDescription = locale === "ko"
    ? "활성 플랜을 한눈에 보고, 1RM/TM·이름·삭제를 빠르게 정리하세요."
    : "Browse active plans and quickly tune 1RM/TM, names, or remove obsolete ones.";
  const totalLabel = locale === "ko" ? "총 플랜" : "Total";
  const recentLabel = locale === "ko" ? "최근 7일" : "Active 7d";
  const idleLabel = locale === "ko" ? "미수행" : "Unused";
  const browseStoreLabel = locale === "ko" ? "프로그램 스토어 둘러보기" : "Browse Program Store";

  const filterOptions = useMemo(
    () => [
      {
        value: "ALL" as const,
        label: `${locale === "ko" ? "전체" : "All"} · ${heroMetrics.total}`,
      },
      {
        value: "RECENT" as const,
        label: `${locale === "ko" ? "최근" : "Recent"} · ${heroMetrics.recent}`,
      },
      {
        value: "IDLE" as const,
        label: `${locale === "ko" ? "미수행" : "Idle"} · ${heroMetrics.untouched}`,
      },
    ],
    [heroMetrics, locale],
  );

  // terminal 필터 토글용 — paper V2Segmented는 라벨에 카운트를 합치지만, TUI는 [label N] 형태라 분리.
  const termFilterOptions = useMemo(
    () => [
      { value: "ALL" as const, label: locale === "ko" ? "전체" : "all", count: heroMetrics.total },
      { value: "RECENT" as const, label: locale === "ko" ? "최근" : "recent", count: heroMetrics.recent },
      { value: "IDLE" as const, label: locale === "ko" ? "미수행" : "idle", count: heroMetrics.untouched },
    ],
    [heroMetrics, locale],
  );

  const openStore = useCallback(() => {
    window.location.assign(APP_ROUTES.programStore);
  }, []);

  // ── 본문(hero·필터·목록)만 skin 분기 — 편집 시트/상태/다이얼로그는 분기 밖에서 공유 ──
  // (paper 무회귀: terminal이 아니면 기존 본문을 그대로 렌더. 데이터/핸들러는 단일 컴포넌트가 소유.)
  const body = skin === "terminal" ? (
    <PlansManageTuiView
      locale={localeKey}
      heroMetrics={heroMetrics}
      filterOptions={termFilterOptions}
      activityFilter={activityFilter}
      onChangeActivityFilter={setActivityFilter}
      searchQuery={searchQuery}
      onChangeSearchQuery={setSearchQuery}
      showFilters={plans.length > 0 || searchQuery.trim().length > 0}
      planRows={planRows}
      isSettled={isSettled}
      loading={loading}
      error={error}
      hasPlans={plans.length > 0}
      onRetry={() => {
        void loadPlans();
      }}
      onManage={openManageSheet}
      onOpenStore={openStore}
      copy={{
        title: copy.plansManage.title,
        searchPlaceholder: copy.plansManage.searchPlaceholder,
        searchAriaLabel: copy.plansManage.searchAriaLabel,
        loadError: copy.plansManage.loadError,
        noPlans: copy.plansManage.noPlans,
        noResults: copy.plansManage.noResults,
        recentPerformedPrefix: copy.plansManage.recentPerformedPrefix,
        noPerformedHistory: copy.plansManage.noPerformedHistory,
        manage: copy.plansManage.manage,
      }}
    />
  ) : (
    <V2Stack gap={5}>
        {/* ── HERO ── */}
        <V2Card tone="paper" padding="var(--v2-s-5)" radius="var(--v2-r-3)">
          <V2Stack gap={4}>
            <V2Stack gap={1}>
              <p
                className="v2-eyebrow"
                style={{ margin: 0, color: "var(--v2-accent-ink)" }}
              >
                {copy.plansManage.headerEyebrow}
              </p>
              <h1 className="v2-h1" style={{ margin: 0 }}>
                {copy.plansManage.title}
              </h1>
              <p
                className="v2-small"
                style={{ margin: 0, color: "var(--v2-ink-2)" }}
              >
                {heroDescription}
              </p>
            </V2Stack>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "var(--v2-s-2)",
              }}
            >
              <V2MetricCard
                label={totalLabel}
                value={heroMetrics.total}
                size="sm"
              />
              <V2MetricCard
                label={recentLabel}
                value={heroMetrics.recent}
                tone="success"
                size="sm"
              />
              <V2MetricCard
                label={idleLabel}
                value={heroMetrics.untouched}
                size="sm"
              />
            </div>

            <V2PrimaryBtn
              as="a"
              href={APP_ROUTES.programStore}
              icon="add"
              full
            >
              {browseStoreLabel}
            </V2PrimaryBtn>
          </V2Stack>
        </V2Card>

        {/* ── FILTER + SEARCH ── */}
        {plans.length > 0 || searchQuery.trim().length > 0 ? (
          <V2Stack gap={3}>
            <V2Segmented
              ariaLabel={locale === "ko" ? "플랜 필터" : "Plan filter"}
              options={filterOptions}
              value={activityFilter}
              onChange={(value) => setActivityFilter(value)}
              size="sm"
            />
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={copy.plansManage.searchPlaceholder}
              ariaLabel={copy.plansManage.searchAriaLabel}
            />
          </V2Stack>
        ) : null}

        {/* ── STATES + LIST ── */}
        <div>
          <LoadingStateRows active={loading} label={locale === "ko" ? "플랜 목록 로딩 중" : "Loading plans"} />
          <ErrorStateRows
            message={error}
            title={copy.plansManage.loadError}
            onRetry={() => {
              void loadPlans();
            }}
          />
          <EmptyStateRows
            when={isSettled && !error && plans.length === 0}
            label={copy.plansManage.noPlans}
            description={copy.plansManage.noPlansDescription}
          />
          <EmptyStateRows
            when={isSettled && !error && plans.length > 0 && filteredPlans.length === 0}
            label={copy.plansManage.noResults}
            description={copy.plansManage.noResultsDescription}
          />

          {filteredPlans.length > 0 ? (
            <V2Stack gap={3}>
              {filteredPlans.map((plan) => (
                <PlanCardV2
                  key={plan.id}
                  plan={plan}
                  copy={copy}
                  locale={locale}
                  onManage={() => openManageSheet(plan)}
                />
              ))}
            </V2Stack>
          ) : null}
        </div>
      </V2Stack>
  );

  return (
    <>
      {body}

      <BottomSheet
        open={Boolean(managePlanId)}
        onClose={() => {
          if (saving || deleting) return;
          setManagePlanId("");
        }}
        title={copy.plansManage.detailTitle}
        description={copy.plansManage.detailDescription}
        closeLabel={copy.plansManage.close}
      >
        {managedPlan ? (
          <V2Stack gap={5}>
            {/* ── Plan info ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "var(--v2-s-2)",
              }}
            >
              <PlanDetailRow
                label={locale === "ko" ? "타입" : "Type"}
                value={planTypeLabel(managedPlan.type, locale)}
              />
              <PlanDetailRow
                label={copy.plansManage.baseProgram}
                value={managedPlan.baseProgramName ?? "-"}
              />
              <PlanDetailRow
                label={copy.plansManage.createdAt}
                value={formatDateTime(managedPlan.createdAt)}
              />
              <PlanDetailRow
                label={copy.plansManage.lastPerformedAt}
                value={
                  managedPlan.lastPerformedAt
                    ? formatDateTime(managedPlan.lastPerformedAt)
                    : copy.plansManage.noRecord
                }
              />
            </div>

            <V2Hairline />

            {/* ── Plan name ── */}
            <V2Stack gap={2} as="div">
              <span
                className="v2-eyebrow"
                style={{ color: "var(--v2-ink-3)" }}
              >
                {copy.plansManage.planName}
              </span>
              <AppTextInput
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder={copy.plansManage.planNamePlaceholder}
              />
            </V2Stack>

            {/* ── Current progression ── */}
            {isAutoProgression && currentProgressRows.length > 0 ? (
              <V2Stack gap={2}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "var(--v2-s-2)",
                  }}
                >
                  <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
                    {copy.plansManage.currentProgress}
                  </span>
                  {progressPosition ? (
                    <span
                      className="v2-mono-label"
                      style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-eyebrow)" }}
                    >
                      {`C${progressPosition.cycle}W${progressPosition.week}D${progressPosition.day}`}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--v2-s-2)",
                  }}
                >
                  {currentProgressRows.map((row) => (
                    <TargetWeightChip
                      key={row.key}
                      label={row.label}
                      weightKg={row.weightKg}
                      weightSuffix={row.weightSuffix}
                      lastDeltaKg={row.lastDeltaKg}
                      lastEventType={row.lastEventType}
                    />
                  ))}
                </div>
                {adjustOpen ? (
                  <V2Stack gap={2}>
                    <p
                      className="v2-small"
                      style={{ margin: 0, color: "var(--v2-ink-2)" }}
                    >
                      {copy.plansManage.adjustHint}
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "var(--v2-s-3)",
                      }}
                    >
                      {currentProgressRows.map((row) => (
                        <StrengthEditField key={row.key} label={row.label}>
                          <NumberKeypadField
                            ariaLabel={`${row.label} TM`}
                            value={adjustDraft[row.key] ?? 0}
                            min={0}
                            max={500}
                            allowDecimal
                            step={2.5}
                            onChange={(value) =>
                              setAdjustDraft((prev) => ({ ...prev, [row.key]: value }))
                            }
                          />
                        </StrengthEditField>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "var(--v2-s-2)" }}>
                      <V2PrimaryBtn
                        full
                        disabled={adjusting}
                        onClick={() => {
                          void saveAdjustment();
                        }}
                      >
                        {adjusting ? copy.plansManage.saveInProgress : copy.plansManage.adjustSave}
                      </V2PrimaryBtn>
                      <V2SecondaryBtn
                        full
                        disabled={adjusting}
                        onClick={() => setAdjustOpen(false)}
                      >
                        {copy.plansManage.adjustCancel}
                      </V2SecondaryBtn>
                    </div>
                  </V2Stack>
                ) : (
                  <V2SecondaryBtn full icon="tune" onClick={openAdjustment}>
                    {copy.plansManage.adjustCurrentTm}
                  </V2SecondaryBtn>
                )}
              </V2Stack>
            ) : null}

            {/* ── Strength baselines ── */}
            <V2Stack gap={2}>
              <span
                className="v2-eyebrow"
                style={{ color: "var(--v2-ink-3)" }}
              >
                {copy.plansManage.strengthBaselines}
              </span>
              {isAutoProgression ? (
                <p
                  className="v2-small"
                  style={{ margin: 0, color: "var(--v2-ink-2)" }}
                >
                  {copy.plansManage.startingBaselineHint}
                </p>
              ) : null}
              {isAutoProgression ? (
                <V2SecondaryBtn
                  full
                  icon={showStartingBaseline ? "expand_less" : "expand_more"}
                  onClick={() => setShowStartingBaseline((prev) => !prev)}
                >
                  {showStartingBaseline
                    ? copy.plansManage.hideStartingBaseline
                    : copy.plansManage.showStartingBaseline}
                </V2SecondaryBtn>
              ) : null}
              {!isAutoProgression || showStartingBaseline ? (
                strengthRows.length > 0 ? (
                <V2Stack gap={2}>
                  {strengthRows.map((row) => (
                    <StrengthEditRow key={row.key} label={row.label}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: "var(--v2-s-3)",
                        }}
                      >
                        <StrengthEditField label={copy.plansManage.oneRepMax}>
                          {isAutoProgression ? (
                            <span className="v2-body" style={{ color: "var(--v2-ink)" }}>
                              {row.oneRepMaxKg > 0 ? `${formatKg(row.oneRepMaxKg)} kg` : "—"}
                            </span>
                          ) : (
                            <NumberKeypadField
                              ariaLabel={`${row.label} ${copy.plansManage.oneRepMax}`}
                              value={row.oneRepMaxKg}
                              min={0}
                              max={500}
                              allowDecimal
                              step={0.5}
                              onChange={(value) => {
                                setStrengthDraft((prev) => ({
                                  ...prev,
                                  [row.key]: {
                                    ...(prev[row.key] ?? { oneRepMaxKg: 0, trainingMaxKg: 0 }),
                                    oneRepMaxKg: value,
                                  },
                                }));
                              }}
                            />
                          )}
                        </StrengthEditField>
                        <StrengthEditField label={copy.plansManage.trainingMax}>
                          {isAutoProgression ? (
                            <span className="v2-body" style={{ color: "var(--v2-ink)" }}>
                              {row.trainingMaxKg > 0 ? `${formatKg(row.trainingMaxKg)} kg` : "—"}
                            </span>
                          ) : (
                            <NumberKeypadField
                              ariaLabel={`${row.label} ${copy.plansManage.trainingMax}`}
                              value={row.trainingMaxKg}
                              min={0}
                              max={500}
                              allowDecimal
                              step={0.5}
                              onChange={(value) => {
                                setStrengthDraft((prev) => ({
                                  ...prev,
                                  [row.key]: {
                                    ...(prev[row.key] ?? { oneRepMaxKg: 0, trainingMaxKg: 0 }),
                                    trainingMaxKg: value,
                                  },
                                }));
                              }}
                            />
                          )}
                        </StrengthEditField>
                      </div>
                    </StrengthEditRow>
                  ))}
                </V2Stack>
              ) : (
                <V2EmptyState
                  icon="straighten"
                  title={copy.plansManage.noStrengthBaselines}
                  tone="inset"
                />
                )
              ) : null}
            </V2Stack>

            {/* ── Increment overrides ── */}
            {Object.keys(incrementDraft).length > 0 ? (
              <V2Stack gap={2}>
                <span
                  className="v2-eyebrow"
                  style={{ color: "var(--v2-ink-3)" }}
                >
                  {copy.plansManage.incrementSettingsLabel}
                </span>
                <V2SecondaryBtn
                  full
                  icon={showIncrementSettings ? "expand_less" : "expand_more"}
                  onClick={() => setShowIncrementSettings((prev) => !prev)}
                >
                  {showIncrementSettings
                    ? copy.plansManage.hideIncrementSettings
                    : copy.plansManage.showIncrementSettings}
                </V2SecondaryBtn>
                {showIncrementSettings ? (
                <V2Stack gap={2}>
                  <p
                    className="v2-small"
                    style={{ margin: 0, color: "var(--v2-ink-2)" }}
                  >
                    {copy.plansManage.incrementSettingsHint}
                  </p>
                  {Object.entries(incrementDraft).map(([key, row]) => {
                    const label = targetLabelFromKey(key);
                    return (
                      <StrengthEditRow key={key} label={label}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                            gap: "var(--v2-s-3)",
                          }}
                        >
                          <StrengthEditField
                            label={
                              locale === "ko"
                                ? `증량 (기본 ${formatKg(row.defaultIncreaseKg)}kg)`
                                : `Increase (default ${formatKg(row.defaultIncreaseKg)}kg)`
                            }
                          >
                            <NumberKeypadField
                              ariaLabel={`${label} ${locale === "ko" ? "증량" : "Increase"}`}
                              value={row.increaseKg}
                              min={0}
                              max={20}
                              allowDecimal
                              step={2.5}
                              onChange={(value) => {
                                setIncrementDraft((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key]!, increaseKg: value },
                                }));
                              }}
                            />
                          </StrengthEditField>
                          <StrengthEditField
                            label={
                              locale === "ko"
                                ? `감량 (기본 ${Math.round((1 - row.defaultResetFactor) * 100)}%)`
                                : `Decrease (default ${Math.round((1 - row.defaultResetFactor) * 100)}%)`
                            }
                          >
                            <NumberKeypadField
                              ariaLabel={`${label} ${locale === "ko" ? "감량" : "Decrease"}`}
                              value={row.decreaseKg}
                              min={0}
                              max={20}
                              allowDecimal
                              step={2.5}
                              onChange={(value) => {
                                setIncrementDraft((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key]!, decreaseKg: value },
                                }));
                              }}
                            />
                          </StrengthEditField>
                        </div>
                      </StrengthEditRow>
                    );
                  })}
                </V2Stack>
                ) : null}
              </V2Stack>
            ) : incrementLoading ? (
              <V2EmptyState
                icon="hourglass_empty"
                title={
                  locale === "ko"
                    ? "증량/감량 설정 불러오는 중..."
                    : "Loading increment settings..."
                }
                tone="inset"
              />
            ) : null}

            {/* ── Actions ── */}
            <V2Stack gap={2}>
              <V2PrimaryBtn
                full
                disabled={saving || deleting}
                onClick={() => {
                  void savePlanChanges();
                }}
              >
                {saving
                  ? copy.plansManage.saveInProgress
                  : copy.plansManage.saveChanges}
              </V2PrimaryBtn>
              <V2SecondaryBtn
                full
                tone="danger"
                icon="delete"
                disabled={saving || deleting}
                onClick={() => {
                  void deletePlan();
                }}
              >
                {deleting
                  ? copy.plansManage.deleteInProgress
                  : copy.plansManage.deletePlan}
              </V2SecondaryBtn>
            </V2Stack>
          </V2Stack>
        ) : (
          <V2EmptyState
            icon="search_off"
            title={copy.plansManage.notFound}
            tone="inset"
          />
        )}
      </BottomSheet>
    </>
  );
}
