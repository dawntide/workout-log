"use client";

import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyStateRows, ErrorStateRows, LoadingStateRows } from "@/components/ui/settings-state";
import {
  V2Card,
  V2MetricCard,
  V2PrimaryBtn,
  V2Segmented,
  V2Stack,
} from "@/components/v2/primitives";
import type { Plan } from "@/features/plans-manage/model/plan-view";
import { usePlansManageController } from "@/features/plans-manage/model/use-plans-manage-controller";
import { APP_ROUTES } from "@/lib/app-routes";

import { PlanCardV2 } from "./plan-card";
import { PlanManageSheet } from "./plan-manage-sheet";
import type { LocaleKey } from "./view-types";

// PERF: SSR로 주입된 initialPlans로 첫 화면 즉시 렌더 (스피너 없음).

/**
 * 플랜 관리 화면 조립기. 상태·뮤테이션은 `usePlansManageController`,
 * 상세 편집 UI는 `PlanManageSheet`가 맡고 여기서는 히어로·필터·목록만 조립한다.
 */
export function PlansManageScreen({ initialPlans }: { initialPlans: Plan[] }) {
  const { copy, locale } = useLocale();
  const localeKey: LocaleKey = locale === "ko" ? "ko" : "en";
  const controller = usePlansManageController({ initialPlans });
  const {
    plans,
    loading,
    error,
    isSettled,
    searchQuery,
    setSearchQuery,
    activityFilter,
    setActivityFilter,
    filteredPlans,
    heroMetrics,
    loadPlans,
    openManageSheet,
  } = controller;

  const heroDescription = localeKey === "ko"
    ? "활성 플랜을 한눈에 보고, 1RM/TM·이름·삭제를 빠르게 정리하세요."
    : "Browse active plans and quickly tune 1RM/TM, names, or remove obsolete ones.";
  const totalLabel = localeKey === "ko" ? "총 플랜" : "Total";
  const recentLabel = localeKey === "ko" ? "최근 7일" : "Active 7d";
  const idleLabel = localeKey === "ko" ? "미수행" : "Unused";
  const browseStoreLabel = localeKey === "ko" ? "프로그램 스토어 둘러보기" : "Browse Program Store";

  const filterOptions = useMemo(
    () => [
      {
        value: "ALL" as const,
        label: `${localeKey === "ko" ? "전체" : "All"} · ${heroMetrics.total}`,
      },
      {
        value: "RECENT" as const,
        label: `${localeKey === "ko" ? "최근" : "Recent"} · ${heroMetrics.recent}`,
      },
      {
        value: "IDLE" as const,
        label: `${localeKey === "ko" ? "미수행" : "Idle"} · ${heroMetrics.untouched}`,
      },
    ],
    [heroMetrics, localeKey],
  );

  return (
    <>
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
              ariaLabel={localeKey === "ko" ? "플랜 필터" : "Plan filter"}
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
          <LoadingStateRows active={loading} label={localeKey === "ko" ? "플랜 목록 로딩 중" : "Loading plans"} />
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
                  locale={localeKey}
                  onManage={() => openManageSheet(plan)}
                />
              ))}
            </V2Stack>
          ) : null}
        </div>
      </V2Stack>

      <PlanManageSheet controller={controller} copy={copy} locale={localeKey} />
    </>
  );
}
