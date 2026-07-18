"use client";

import { useMemo } from "react";
import { useLocale } from "@/components/locale-provider";

import { BottomSheet } from "@/components/ui/bottom-sheet";
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
import { APP_ROUTES } from "@/lib/app-routes";
import { TargetWeightChip } from "@/components/v2/target-weight-chip";
import type { Ref5Status } from "@workout/core/program-engine/ref5-status";

// PERF: SSR로 주입된 initialPlans로 첫 화면 즉시 렌더 (스피너 없음).

// 순수 모델(타입·표시 헬퍼)은 features/plans-manage/model로 추출됨(god-component 분해 1단계).
import {
  RECENT_THRESHOLD_DAYS,
  daysSince,
  formatRelativeDays,
  formatDateTime,
  formatKg,
  planTypeChipTone,
  planTypeLabel,
  targetLabelFromKey,
  type Plan,
} from "@/features/plans-manage/model/plan-view";
import { usePlansManageController } from "@/features/plans-manage/model/use-plans-manage-controller";
import { buildRef5WindowProgressRows } from "@/features/ref5/model/window-progress";


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

function Ref5StatusPanel({
  status,
  locale,
  loading,
}: {
  status: Ref5Status | null;
  locale: "ko" | "en";
  loading: boolean;
}) {
  if (!status) {
    return (
      <V2EmptyState
        icon={loading ? "hourglass_empty" : "sync_problem"}
        title={
          loading
            ? locale === "ko" ? "REF5 진행 상태를 불러오는 중..." : "Loading REF5 state..."
            : locale === "ko" ? "REF5 진행 상태를 불러오지 못했습니다." : "REF5 state is unavailable."
        }
        tone="inset"
      />
    );
  }

  const directStandards = [
    ["SQ H3", status.directStandardsKg.sqH3Kg],
    ["BP focus", status.directStandardsKg.bpFocusKg],
    ["PULL focus total", status.directStandardsKg.pullFocusTotalKg],
    ["DL", status.directStandardsKg.deadliftKg],
    ["OHP", status.directStandardsKg.ohpKg],
  ] as const;
  const derivedStandards = [
    ["SQ H2", status.derivedStandardsKg.sqH2Kg],
    ["SQ volume", status.derivedStandardsKg.sqVolumeKg],
    ["BP volume", status.derivedStandardsKg.bpVolumeKg],
    ["PULL volume total", status.derivedStandardsKg.pullVolumeTargetTotalKg],
  ] as const;
  const controlRefs = [
    ["SQ", status.controlRefsKg.sqKg],
    ["BP", status.controlRefsKg.bpKg],
    ["PULL total", status.controlRefsKg.pullTotalKg],
    ["DL", status.controlRefsKg.deadliftKg],
    ["OHP", status.controlRefsKg.ohpKg],
  ] as const;
  const auxiliaryCaps = [
    ["DL max", status.auxiliaryCapsKg.deadliftMaxKg],
    ["OHP max", status.auxiliaryCapsKg.ohpMaxKg],
  ] as const;
  const structureReviewLifts = (["SQ", "BP", "PULL"] as const).filter(
    (lift) => status.structureReview[lift],
  );
  const windowProgressRows = buildRef5WindowProgressRows(status, locale);

  return (
    <V2Card tone="inset" padding="var(--v2-s-4)" radius="var(--v2-r-2)">
      <V2Stack gap={4}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--v2-s-2)" }}>
          <strong className="v2-body" style={{ color: "var(--v2-ink)" }}>
            {locale === "ko" ? "REF5 적응 상태" : "REF5 adaptive state"}
          </strong>
          <V2Chip tone="info">v{status.protocolVersion}</V2Chip>
          <V2Chip tone="neutral">r{status.revision}</V2Chip>
          {status.pendingMicro.pending ? (
            <V2Chip tone="warning">{locale === "ko" ? "마이크로 세션 대기" : "Micro pending"}</V2Chip>
          ) : null}
          {structureReviewLifts.map((lift) => (
            <V2Chip key={lift} tone="danger">
              {locale === "ko" ? `${lift} 구조 재검토` : `${lift} structure review`}
            </V2Chip>
          ))}
        </div>

        <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-2)" }}>
          {locale === "ko"
            ? "REF5 런타임은 1RM/e1RM·TM이나 주차를 사용하지 않습니다. 아래 값은 완료 로그를 재생해 계산한 읽기 전용 상태입니다."
            : "REF5 runtime uses no 1RM/e1RM, TM, or cycle grid. These read-only values are rebuilt from the completion ledger."}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--v2-s-2)" }}>
          <PlanDetailRow label={locale === "ko" ? "다음 포커스" : "Next focus"} value={status.nextFocus} />
          <PlanDetailRow label={locale === "ko" ? "다음 스쿼트 하드" : "Next squat hard"} value={status.nextSquatHard} />
        </div>

        {status.pendingMicro.reasons.length > 0 ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-c-warning)" }}>
            {`${locale === "ko" ? "마이크로 사유" : "Micro reasons"}: ${status.pendingMicro.reasons.join(", ")}`}
          </p>
        ) : null}

        <V2Stack gap={2}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "진행 창" : "Progression windows"}
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: "var(--v2-s-2)" }}>
            {windowProgressRows.map((row) => (
              <PlanDetailRow
                key={row.key}
                label={row.label}
                value={`${row.current}/${row.threshold} · ${locale === "ko" ? "판정 완료" : "judged"} ${row.completed}`}
              />
            ))}
          </div>
        </V2Stack>

        <V2Stack gap={2}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "직접 기준 / 파생 기준" : "Direct / derived standards"}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-2)" }}>
            {[...directStandards, ...derivedStandards].map(([label, value]) => (
              <V2Chip key={label} tone="weight">{label} {formatKg(value)} kg</V2Chip>
            ))}
          </div>
        </V2Stack>

        <V2Stack gap={2}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "제어 REF / 보조 상한" : "Control REFs / auxiliary caps"}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-2)" }}>
            {controlRefs.map(([label, value]) => (
              <V2Chip key={`ref-${label}`} tone="neutral">REF {label} {formatKg(value)}</V2Chip>
            ))}
            {auxiliaryCaps.map(([label, value]) => (
              <V2Chip key={label} tone="accent">{label} {formatKg(value)} kg</V2Chip>
            ))}
          </div>
        </V2Stack>

        {status.pullLock ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-2)" }}>
            {`PULL ${locale === "ko" ? "창 고정" : "window lock"} ${status.pullLock.windowId}: +${formatKg(status.pullLock.focusAddedKg)} / +${formatKg(status.pullLock.volumeAddedKg)} kg`}
          </p>
        ) : null}
      </V2Stack>
    </V2Card>
  );
}

export function PlansManageContent({ initialPlans }: { initialPlans: Plan[] }) {
  const { copy, locale } = useLocale();
  const localeKey: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const {
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
    setStrengthDraft,
    incrementDraft,
    setIncrementDraft,
    incrementLoading,
    progressPosition,
    lightBlockActive,
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
    heroMetrics,
    loadPlans,
    openManageSheet,
    openAdjustment,
    saveAdjustment,
    savePlanChanges,
    deletePlan,
  } = usePlansManageController({ initialPlans });

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

  const body = (
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

            {isRef5ManagedPlan ? (
              <Ref5StatusPanel status={ref5Status} locale={localeKey} loading={incrementLoading} />
            ) : null}

            {/* ── Current progression ── */}
            {!isRef5ManagedPlan && isAutoProgression && currentProgressRows.length > 0 ? (
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
                  <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--v2-s-2)" }}>
                    {lightBlockActive ? (
                      // v0.5.1 F4: 라이트 블록(회복) 지속 배지 — 플래그 해제 시 자동 소멸.
                      <V2Chip tone="info">
                        {locale === "ko" ? "🌙 라이트 블록" : "🌙 Light block"}
                      </V2Chip>
                    ) : null}
                    {progressPosition ? (
                      <span
                        className="v2-mono-label"
                        style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-eyebrow)" }}
                      >
                        {`C${progressPosition.cycle}W${progressPosition.week}D${progressPosition.day}`}
                      </span>
                    ) : null}
                  </span>
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
            {!isRef5ManagedPlan ? <V2Stack gap={2}>
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
            </V2Stack> : null}

            {/* ── Increment overrides ── */}
            {!isRef5ManagedPlan && Object.keys(incrementDraft).length > 0 ? (
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
            ) : !isRef5ManagedPlan && incrementLoading ? (
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
