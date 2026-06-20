"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { TermBadge } from "@/components/v2/terminal";
import { APP_ROUTES } from "@/lib/app-routes";
import type {
  PrHistoryBootstrap,
  PrHistoryDaysPreset,
} from "@/server/services/stats/get-pr-history-bootstrap";

// terminal(ironlog) PR 이력 — paper PrHistoryScreen의 terminal 대응. URL(Link) 기반
// 기간/운동 필터 + PR 리스트(운동 상세 링크). 동일 부트스트랩 props 공유, 표현만 TUI.
// TermShell ViewPane 안 렌더라 외곽 패딩 없음.

const DAYS_PRESETS: PrHistoryDaysPreset[] = [30, 90, 365, "all"];

function presetLabel(preset: PrHistoryDaysPreset, ko: boolean) {
  if (preset === "all") return ko ? "전체" : "all";
  if (preset === 30) return "30d";
  if (preset === 90) return "90d";
  return "1y";
}

type PrHistoryTuiProps = Pick<
  PrHistoryBootstrap,
  "exercises" | "selected" | "prs" | "rangeFrom" | "rangeTo"
>;

function buildHref(
  selected: PrHistoryBootstrap["selected"],
  overrides: { exerciseId?: string | null; days?: PrHistoryDaysPreset },
) {
  const params = new URLSearchParams();
  const nextExerciseId =
    overrides.exerciseId !== undefined ? overrides.exerciseId : selected.exerciseId;
  const nextDays = overrides.days !== undefined ? overrides.days : selected.days;
  if (nextExerciseId) params.set("exerciseId", nextExerciseId);
  if (nextDays && nextDays !== 90) params.set("days", String(nextDays));
  const query = params.toString();
  return query ? `${APP_ROUTES.prHistory}?${query}` : APP_ROUTES.prHistory;
}

function fmtDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : value.slice(0, 10);
}

const chip = (active: boolean) => ({
  minHeight: "var(--v2-touch)",
  display: "inline-flex",
  alignItems: "center",
  padding: "0 var(--v2-s-2)",
  whiteSpace: "nowrap" as const,
  textDecoration: "none",
  color: active ? "var(--term-amber)" : "var(--term-dim)",
  background: active ? "var(--term-sel)" : "transparent",
});

export function PrHistoryTuiView({
  exercises,
  selected,
  prs,
  rangeFrom,
  rangeTo,
}: PrHistoryTuiProps) {
  const { locale } = useLocale();
  const router = useRouter();
  const ko = locale === "ko";

  return (
    <section
      aria-label={ko ? "PR 이력" : "PR History"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}
    >
      <div className="v2-mono-label" style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            minHeight: "var(--v2-touch)",
            minWidth: "var(--v2-touch)",
            background: "transparent",
            border: "none",
            color: "var(--term-cyan)",
            cursor: "pointer",
          }}
        >
          ‹
        </button>
        <span style={{ color: "var(--term-fg)" }}>{ko ? "PR 이력" : "PR History"}</span>
        <span style={{ marginLeft: "auto", color: "var(--term-dim)" }}>
          {fmtDate(rangeFrom)}~{fmtDate(rangeTo)}
        </span>
      </div>

      {/* 기간 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-1)" }}>
        {DAYS_PRESETS.map((preset) => {
          const active = selected.days === preset;
          return (
            <Link
              key={String(preset)}
              href={buildHref(selected, { days: preset })}
              className="v2-mono-label"
              style={chip(active)}
            >
              [{presetLabel(preset, ko)}
              {active ? "*" : ""}]
            </Link>
          );
        })}
      </div>

      {/* 운동 필터 */}
      <div
        style={{
          display: "flex",
          gap: "var(--v2-s-1)",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        <Link
          href={buildHref(selected, { exerciseId: null })}
          className="v2-mono-label"
          style={{ ...chip(selected.exerciseId === null), flexShrink: 0 }}
        >
          [{ko ? "전체" : "all"}]
        </Link>
        {exercises.map((ex) => {
          const active = selected.exerciseId === ex.id;
          return (
            <Link
              key={ex.id}
              href={buildHref(selected, { exerciseId: ex.id })}
              className="v2-mono-label"
              style={{ ...chip(active), flexShrink: 0 }}
            >
              {ex.name}
              {active ? "*" : ""}
            </Link>
          );
        })}
      </div>

      {/* PR 리스트 */}
      {prs.length === 0 ? (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {ko ? "표시할 PR 없음" : "no PRs"}
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
          {prs.map((row) => {
            const inner = (
              <>
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
                  <span style={{ color: "var(--term-dim)" }}>
                    {" "}
                    {row.best.weightKg}×{row.best.reps} · {fmtDate(row.best.date)}
                  </span>
                </span>
                <span style={{ color: "var(--term-gold)", whiteSpace: "nowrap" }}>
                  ★ {row.best.e1rm.toFixed(1)}kg
                </span>
                <TermBadge tone={row.improvement > 0 ? "success" : "dim"}>
                  {row.improvement > 0
                    ? `+${row.improvement.toFixed(1)}`
                    : row.improvement.toFixed(1)}
                </TermBadge>
              </>
            );
            const rowStyle = {
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-2)",
              minHeight: "var(--v2-touch)",
              padding: "0 var(--v2-s-2)",
              textDecoration: "none",
            } as const;
            return row.exerciseId ? (
              <Link
                key={row.exerciseId}
                href={APP_ROUTES.exerciseDetail(row.exerciseId)}
                className="v2-mono-label"
                style={rowStyle}
              >
                {inner}
              </Link>
            ) : (
              <div key={row.exerciseName} className="v2-mono-label" style={rowStyle}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
