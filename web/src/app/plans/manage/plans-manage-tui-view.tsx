"use client";

import { type CSSProperties } from "react";
import { TermBadge, TermProgress } from "@/components/v2/terminal";
import type { PlanForManage } from "@/server/services/plans/get-plans-for-manage";

// terminal(ironlog) 플랜 관리 본문 뷰 — paper PlansManageContent 본문(hero·필터·목록)의
// terminal 대응. 데이터/상태/편집 시트는 PlansManageContent가 소유하고 그대로 공유하며,
// 이 뷰는 props로 받은 파생값만 TUI(글리프·mono·box-frame)로 렌더한다(presentation-only).
// [manage] 키힌트 클릭 → 부모의 편집 BottomSheet 오픈(cascade, 양 테마 공유).
// TermShell ViewPane(AppShell terminal 분기) 안에서 렌더되므로 외곽 패딩/셸 없음.

type Plan = PlanForManage;
type ActivityFilter = "ALL" | "RECENT" | "IDLE";

type PlanRow = {
  plan: Plan;
  typeLabel: string;
  typeTone: "info" | "accent" | "dim";
  relText: string | null;
  isFresh: boolean;
};

type FilterOption = { value: ActivityFilter; label: string; count: number };

type Props = {
  locale: "ko" | "en";
  heroMetrics: { total: number; recent: number; untouched: number };
  filterOptions: FilterOption[];
  activityFilter: ActivityFilter;
  onChangeActivityFilter: (value: ActivityFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (value: string) => void;
  showFilters: boolean;
  planRows: PlanRow[];
  isSettled: boolean;
  loading: boolean;
  error: string | null;
  hasPlans: boolean;
  onRetry: () => void;
  onManage: (plan: Plan) => void;
  onOpenStore: () => void;
  copy: {
    title: string;
    searchPlaceholder: string;
    searchAriaLabel: string;
    loadError: string;
    noPlans: string;
    noResults: string;
    recentPerformedPrefix: string;
    noPerformedHistory: string;
    manage: string;
  };
};

export function PlansManageTuiView({
  locale,
  heroMetrics,
  filterOptions,
  activityFilter,
  onChangeActivityFilter,
  searchQuery,
  onChangeSearchQuery,
  showFilters,
  planRows,
  isSettled,
  loading,
  error,
  hasPlans,
  onRetry,
  onManage,
  onOpenStore,
  copy,
}: Props) {
  const ko = locale === "ko";
  const activeRatio =
    heroMetrics.total > 0 ? heroMetrics.recent / heroMetrics.total : 0;

  return (
    <section
      aria-label={copy.title}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}
    >
      {/* ── hero: 메트릭 readout ── */}
      <div
        className="v2-mono-label"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-1)",
        }}
      >
        <ReadoutLine label={ko ? "총 플랜" : "total"} value={heroMetrics.total} />
        <ReadoutLine
          label={ko ? "최근 7일" : "recent"}
          value={heroMetrics.recent}
          tone="success"
        />
        <ReadoutLine
          label={ko ? "미수행" : "idle"}
          value={heroMetrics.untouched}
          tone="ghost"
        />
        <TermProgress
          label={ko ? "활성도" : "active"}
          value={`${heroMetrics.recent}/${heroMetrics.total}`}
          ratio={activeRatio}
          tone="success"
        />
        <button
          type="button"
          onClick={onOpenStore}
          className="v2-mono-label"
          style={{
            alignSelf: "flex-start",
            minHeight: "var(--v2-touch)",
            padding: "0 var(--v2-s-2)",
            background: "transparent",
            border: "none",
            color: "var(--term-cyan)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          [+ {ko ? "프로그램 스토어" : "program store"}]
        </button>
      </div>

      {/* ── 필터 토글 + 검색 ── */}
      {showFilters ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-1)" }}>
            {filterOptions.map((opt) => {
              const active = opt.value === activityFilter;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeActivityFilter(opt.value)}
                  aria-pressed={active}
                  className="v2-mono-label"
                  style={filterTabStyle(active)}
                >
                  [{opt.label} {opt.count}
                  {active ? "*" : ""}]
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchAriaLabel}
            className="v2-mono-label"
            style={{
              minHeight: "var(--v2-touch)",
              padding: "0 var(--v2-s-2)",
              background: "var(--term-inset)",
              border: "none",
              outline: "none",
              color: "var(--term-fg)",
            }}
          />
        </div>
      ) : null}

      {/* ── states + 플랜 목록 ── */}
      {error ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
        >
          <span className="v2-mono-label" style={{ color: "var(--term-red)" }}>
            ! {copy.loadError}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="v2-mono-label"
            style={{
              alignSelf: "flex-start",
              minHeight: "var(--v2-touch)",
              padding: "0 var(--v2-s-2)",
              background: "transparent",
              border: "none",
              color: "var(--term-cyan)",
              cursor: "pointer",
            }}
          >
            [{ko ? "다시 시도" : "retry"}]
          </button>
        </div>
      ) : !isSettled && loading ? (
        <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
          …
        </span>
      ) : !hasPlans ? (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {copy.noPlans}
        </span>
      ) : planRows.length === 0 ? (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {copy.noResults}
        </span>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
        >
          {planRows.map((row) => (
            <PlanTuiRow
              key={row.plan.id}
              row={row}
              manageLabel={copy.manage}
              recentPrefix={copy.recentPerformedPrefix}
              noHistoryText={copy.noPerformedHistory}
              onManage={() => onManage(row.plan)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReadoutLine({
  label,
  value,
  tone = "fg",
}: {
  label: string;
  value: number;
  tone?: "fg" | "success" | "ghost";
}) {
  const valueColor =
    tone === "success"
      ? "var(--term-green)"
      : tone === "ghost"
        ? "var(--term-ghost)"
        : "var(--term-fg)";
  return (
    <div style={{ display: "flex", gap: "var(--v2-s-2)" }}>
      <span style={{ color: "var(--term-dim)", minWidth: 0 }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function PlanTuiRow({
  row,
  manageLabel,
  recentPrefix,
  noHistoryText,
  onManage,
}: {
  row: PlanRow;
  manageLabel: string;
  recentPrefix: string;
  noHistoryText: string;
  onManage: () => void;
}) {
  const { plan, typeLabel, typeTone, relText, isFresh } = row;
  const performedText = relText ? `${recentPrefix} · ${relText}` : noHistoryText;
  return (
    <button
      type="button"
      onClick={onManage}
      className="v2-mono-label"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        minHeight: "var(--v2-touch)",
        padding: "var(--v2-s-1) var(--v2-s-2)",
        background: "var(--term-panel)",
        border: "none",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        borderRadius: "var(--v2-r-2)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <TermBadge tone={typeTone}>{typeLabel}</TermBadge>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--term-fg)",
          }}
        >
          {plan.name}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isFresh ? "var(--term-green)" : "var(--term-dim)",
          }}
        >
          {performedText}
        </span>
      </span>
      <span style={{ color: "var(--term-cyan)", whiteSpace: "nowrap" }}>
        [{manageLabel}]
      </span>
    </button>
  );
}

function filterTabStyle(active: boolean): CSSProperties {
  return {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-2)",
    background: "transparent",
    border: "none",
    color: active ? "var(--term-amber)" : "var(--term-dim)",
    cursor: "pointer",
  };
}
