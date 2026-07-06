"use client";

import { useCallback, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PlansManageTuiView } from "./plans-manage-tui-view";
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
