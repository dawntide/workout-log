"use client";

import { type CSSProperties } from "react";
import { useLocale } from "@/components/locale-provider";
import { EmptyStateRows, ErrorStateRows } from "@/components/ui/settings-state";
import {
  TermBadge,
  TermLineChart,
  TermSparkline,
} from "@/components/v2/terminal";
import { useStats1RMController } from "@/features/stats/model/use-stats-1rm-controller";
import { clampIndex } from "@/features/stats/ui/e1rm-interactive-chart";
import { Stats1RMOverlaySheets } from "@/features/stats/ui/stats-1rm-overlay-sheets";
import type { RangePreset } from "@/features/stats/model/stats-1rm-types";
import type { StatsPageBootstrap } from "@/server/services/stats/get-stats-page-bootstrap";

// terminal(ironlog) stats 뷰 — paper StatsScreen/Stats1RMDetailed의 terminal 대응(P2-b).
// useStats1RMController(presentation-agnostic) + Stats1RMOverlaySheets(시트)를 그대로
// 공유하고 표현만 TUI로 분기. 1RM 추세=SVG fine 라인(§5), 기간탭/배지/readout는 글리프.
// 무거운 섹션(goal/asymptote/weekly volume)은 후속. TermShell ViewPane 안 렌더라 외곽 패딩 없음.

const RANGE_TABS: { preset: Exclude<RangePreset, "CUSTOM">; label: string }[] = [
  { preset: 7, label: "7D" },
  { preset: 30, label: "1M" },
  { preset: 90, label: "3M" },
  { preset: 180, label: "6M" },
  { preset: 365, label: "1Y" },
];

function formatKg(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}t`;
  return `${Math.round(value)}kg`;
}

type StatsTuiViewProps = Pick<
  StatsPageBootstrap,
  | "initialBundle"
  | "initialExercises"
  | "initialPlans"
  | "initialE1rm"
  | "initialSelectedExerciseId"
  | "initialSelectedPlanId"
>;

export function StatsTuiView({
  initialBundle,
  initialExercises,
  initialPlans,
  initialE1rm,
  initialSelectedExerciseId,
  initialSelectedPlanId,
}: StatsTuiViewProps) {
  const { locale } = useLocale();
  const c = useStats1RMController({
    locale,
    refreshTick: 0,
    initialExercises,
    initialPlans,
    initialStats: initialE1rm,
    initialSelectedExerciseId,
    initialSelectedPlanId,
  });

  const series = c.selectedSeries;
  const hasChartData = series.length > 0;
  const activeIdx = hasChartData
    ? clampIndex(c.activePointIndex, series.length)
    : 0;
  const activePoint = hasChartData ? series[activeIdx] : null;
  const e1rmValues = series.map((p) => p.e1rm);
  const improvedPrCount = initialBundle.prs90d.filter(
    (p) => p.improvement > 0,
  ).length;

  return (
    <section
      aria-label={locale === "ko" ? "통계" : "Stats"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}
    >
      {/* 세션 메트릭 readout */}
      <div
        className="v2-mono-label"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--v2-s-1) var(--v2-s-3)",
        }}
      >
        <Stat
          label={locale === "ko" ? "30일 세션" : "30d sess"}
          value={String(initialBundle.sessions30d)}
        />
        <Stat
          label={locale === "ko" ? "30일 볼륨" : "30d vol"}
          value={formatKg(initialBundle.tonnage30d)}
        />
        <Stat
          label={locale === "ko" ? "최고 e1RM" : "best e1RM"}
          value={initialE1rm?.best ? `${initialE1rm.best.e1rm.toFixed(1)}kg` : "—"}
          tone="gold"
        />
        <Stat
          label={locale === "ko" ? "90일 PR" : "90d PR"}
          value={`${initialBundle.prs90d.length} (+${improvedPrCount})`}
        />
      </div>

      {/* 1RM 추세 패널 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-2)",
          padding: "var(--v2-s-3)",
          background: "var(--term-panel)",
          boxShadow: "inset 0 0 0 1px var(--term-line-box)",
          borderRadius: "var(--v2-r-2)",
        }}
      >
        {/* 운동/플랜 선택 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-2)",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => c.setActiveSheet("exercise")}
            className="v2-mono-label"
            style={selectorStyle("var(--term-fg)")}
          >
            {c.selectedExercise?.name ??
              (locale === "ko" ? "운동 선택" : "select lift")}{" "}
            <span style={{ color: "var(--term-dim)" }}>▾</span>
          </button>
          <button
            type="button"
            onClick={() => c.setActiveSheet("program")}
            className="v2-mono-label"
            style={selectorStyle("var(--term-dim)")}
          >
            {c.selectedProgramLabel} <span>▾</span>
          </button>
        </div>

        {/* 기간 탭 + custom */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-1)" }}>
          {RANGE_TABS.map((t) => {
            const active = c.rangeFilter.preset === t.preset;
            return (
              <button
                key={t.preset}
                type="button"
                onClick={() => c.setPresetRange(t.preset)}
                className="v2-mono-label"
                style={tabStyle(active)}
              >
                [{t.label}
                {active ? "*" : ""}]
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => c.setActiveSheet("range")}
            className="v2-mono-label"
            style={tabStyle(c.rangeFilter.preset === "CUSTOM")}
          >
            [{locale === "ko" ? "기간" : "range"}]
          </button>
        </div>

        {/* 에러/빈 상태(공유 컴포넌트, terminal 토큰 리스킨) */}
        <ErrorStateRows
          message={c.optionsError}
          title={locale === "ko" ? "필터 옵션 오류" : "Filter options error"}
          onRetry={() => void c.loadFilterOptions()}
        />
        {!c.showNoExerciseState ? (
          <ErrorStateRows
            message={c.error}
            title={locale === "ko" ? "1RM 데이터 오류" : "1RM data error"}
            onRetry={() => c.retryDataLoad()}
          />
        ) : null}
        <EmptyStateRows
          when={c.showNoExerciseState}
          label={locale === "ko" ? "운동종목 없음" : "No exercises"}
        />
        <EmptyStateRows
          when={c.showDataEmptyState}
          label={
            locale === "ko" ? "선택 조합 데이터 없음" : "No data for filters"
          }
        />

        {/* 차트 + readout */}
        {hasChartData ? (
          <>
            <TermLineChart values={e1rmValues} />
            <div
              className="v2-mono-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-2)",
                flexWrap: "wrap",
              }}
            >
              <TermSparkline data={e1rmValues} width={20} markPeak />
              {activePoint ? (
                <span style={{ color: "var(--term-cyan)" }}>
                  {activePoint.e1rm.toFixed(1)}kg
                </span>
              ) : null}
              {c.stats?.best ? (
                <span style={{ color: "var(--term-gold)" }}>
                  ★ {c.stats.best.e1rm.toFixed(1)}kg
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* PR 리스트 (90일) */}
      {initialBundle.prs90d.length > 0 ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
        >
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            {locale === "ko" ? "PR · 90일" : "PR · 90d"}
          </span>
          {initialBundle.prs90d.slice(0, 6).map((row) => (
            <div
              key={row.exerciseId ?? row.exerciseName}
              className="v2-mono-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-2)",
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--term-fg)",
                }}
              >
                {row.exerciseName}
              </span>
              <span style={{ color: "var(--term-cyan)", whiteSpace: "nowrap" }}>
                {row.best?.e1rm ?? "—"}kg
              </span>
              <TermBadge tone={row.improvement > 0 ? "success" : "dim"}>
                {row.improvement > 0
                  ? `+${row.improvement.toFixed(1)}`
                  : row.improvement.toFixed(1)}
              </TermBadge>
            </div>
          ))}
        </div>
      ) : null}

      {/* 운동/플랜/기간 피커 시트 (공유, terminal CSS 리스킨) */}
      <Stats1RMOverlaySheets
        locale={locale}
        activeSheet={c.activeSheet}
        onClose={() => c.setActiveSheet(null)}
        exerciseQuery={c.exerciseQuery}
        onExerciseQueryChange={c.setExerciseQuery}
        filteredExerciseOptions={c.filteredExerciseOptions}
        programQuery={c.programQuery}
        onProgramQueryChange={c.setProgramQuery}
        filteredProgramOptions={c.filteredProgramOptions}
        optionsLoading={c.optionsLoading}
        rangeDraft={c.rangeDraft}
        onRangeDraftChange={(next) => {
          c.setRangeDraft(next);
          c.setRangeDraftError(null);
        }}
        rangeDraftError={c.rangeDraftError}
        applyRangeDraft={c.applyRangeDraft}
        canApplyRangeDraft={c.canApplyRangeDraft}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gold";
}) {
  return (
    <span style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-2)" }}>
      <span style={{ color: "var(--term-dim)" }}>{label}</span>
      <span
        style={{ color: tone === "gold" ? "var(--term-gold)" : "var(--term-cyan)" }}
      >
        {value}
      </span>
    </span>
  );
}

function selectorStyle(color: string): CSSProperties {
  return {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-2)",
    background: "var(--term-inset)",
    border: "none",
    color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function tabStyle(active: boolean): CSSProperties {
  return {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-2)",
    background: "transparent",
    border: "none",
    color: active ? "var(--term-cyan)" : "var(--term-dim)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
