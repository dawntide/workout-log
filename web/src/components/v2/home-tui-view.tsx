"use client";

import { type CSSProperties } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  TermBadge,
  TermSparkline,
} from "@/components/v2/terminal";
import type { HomeData } from "@/lib/home/home-data-source";

// terminal(ironlog) home 뷰 — paper V2HomeDashboard의 terminal 대응(P-home).
// 앱 오픈 랜딩: streak(gold)·주간 day 스트립·resume/next CTA·volume 스파크라인·
// strength·recent. 동일 HomeData를 공유하고 표현만 TUI로. 프리미티브 총동원.
// TermShell ViewPane 안 렌더라 외곽 패딩 없음.

function formatKg(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}t`;
  return `${Math.round(v)}kg`;
}

const PANEL: CSSProperties = {
  padding: "var(--v2-s-3)",
  background: "var(--term-panel)",
  boxShadow: "inset 0 0 0 1px var(--term-line-box)",
  borderRadius: "var(--v2-r-2)",
};

export function HomeTuiView({ data }: { data: HomeData }) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const {
    quickStats,
    weeklySummary,
    today,
    strengthProgress,
    volumeTrend,
    recentSessions,
  } = data;

  const volSeries = volumeTrend.map((p) => p.tonnage).filter((v) => v > 0);
  const resumeLabel = today.completedSets > 0
    ? ko ? "이어가기" : "resume"
    : today.hasPlan
      ? ko ? "시작" : "start"
      : ko ? "플랜 선택" : "select plan";

  return (
    <section
      aria-label={ko ? "홈" : "Home"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}
    >
      {/* 퀵 스탯 readout */}
      <div
        className="v2-mono-label"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--v2-s-1) var(--v2-s-3)",
        }}
      >
        <Stat label={ko ? "총 세션" : "sessions"} value={String(quickStats.totalSessions)} />
        <Stat
          label={ko ? "스트릭" : "streak"}
          value={`${quickStats.currentStreak}${ko ? "일" : "d"}`}
          tone="gold"
        />
        <Stat label={ko ? "총 볼륨" : "volume"} value={formatKg(quickStats.totalVolume)} />
        <Stat label={ko ? "이번달" : "month"} value={String(quickStats.thisMonthSessions)} />
      </div>

      {/* 주간 day 스트립 */}
      <div style={PANEL}>
        <div
          className="v2-mono-label"
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--term-dim)",
            marginBottom: "var(--v2-s-2)",
          }}
        >
          <span>{ko ? "이번 주" : "this week"}</span>
          <span style={{ color: "var(--term-green)" }}>
            {weeklySummary.activeDays}/{weeklySummary.days.length}
          </span>
        </div>
        <div
          className="v2-font-num"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${weeklySummary.days.length}, 1fr)`,
            textAlign: "center",
            gap: "var(--v2-s-1)",
          }}
        >
          {weeklySummary.days.map((d) => (
            <div key={d.key} style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
              <span style={{ color: "var(--term-dim)", fontSize: "var(--v2-t-12)" }}>
                {d.shortLabel}
              </span>
              <span
                aria-hidden
                style={{
                  color: d.hasWorkout
                    ? "var(--term-green)"
                    : d.isToday
                      ? "var(--term-amber)"
                      : "var(--term-ghost)",
                }}
              >
                {d.hasWorkout ? "█" : d.isToday ? "▮" : "·"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 오늘 / resume CTA */}
      <a href={today.href} style={{ ...PANEL, textDecoration: "none", display: "block" }}>
        <div
          className="v2-mono-label"
          style={{
            color: "var(--term-fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {today.headline}
        </div>
        <div
          className="v2-mono-label"
          style={{
            color: "var(--term-dim)",
            marginTop: "var(--v2-s-1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {today.meta}
        </div>
        <div
          className="v2-mono-label"
          style={{ color: "var(--term-amber)", marginTop: "var(--v2-s-2)" }}
        >
          [▶ {resumeLabel}]
        </div>
      </a>

      {/* 볼륨 추세 스파크라인 */}
      {volSeries.length > 1 ? (
        <div
          className="v2-mono-label"
          style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}
        >
          <span style={{ color: "var(--term-dim)" }}>{ko ? "볼륨" : "vol"}</span>
          <TermSparkline data={volSeries} width={20} tone="accent" markPeak />
          <span style={{ color: "var(--term-amber)", marginLeft: "auto" }}>
            {formatKg(volumeTrend.at(-1)?.tonnage ?? 0)}
          </span>
        </div>
      ) : null}

      {/* 1RM strength 진행 */}
      {strengthProgress.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            1RM
          </span>
          {strengthProgress.slice(0, 4).map((s) => (
            <div
              key={s.exerciseId ?? s.exerciseName}
              className="v2-mono-label"
              style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}
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
                {s.exerciseName}
              </span>
              <span aria-hidden style={{ color: trendColor(s.trend) }}>
                {trendGlyph(s.trend)}
              </span>
              <span style={{ color: "var(--term-cyan)", whiteSpace: "nowrap" }}>
                {s.bestE1rm}kg
              </span>
              <TermBadge tone={s.improvement > 0 ? "success" : "dim"}>
                {s.improvement > 0 ? `+${s.improvement.toFixed(1)}` : s.improvement.toFixed(1)}
              </TermBadge>
            </div>
          ))}
        </div>
      ) : null}

      {/* 최근 세션 */}
      {recentSessions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            {ko ? "최근" : "recent"}
          </span>
          {recentSessions.slice(0, 3).map((r) => (
            <a
              key={r.id}
              href={r.href}
              className="v2-mono-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-2)",
                minHeight: "var(--v2-touch)",
                textDecoration: "none",
              }}
            >
              <span style={{ color: "var(--term-green)" }}>✓</span>
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
                {r.title}
              </span>
              <span style={{ color: "var(--term-dim)", whiteSpace: "nowrap" }}>
                {r.subtitle}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function trendGlyph(t: "up" | "down" | "flat"): string {
  return t === "up" ? "▲" : t === "down" ? "▼" : "=";
}
function trendColor(t: "up" | "down" | "flat"): string {
  return t === "up"
    ? "var(--term-green)"
    : t === "down"
      ? "var(--term-red)"
      : "var(--term-dim)";
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
      <span style={{ color: tone === "gold" ? "var(--term-gold)" : "var(--term-cyan)" }}>
        {value}
      </span>
    </span>
  );
}
