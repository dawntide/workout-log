"use client";

import { memo } from "react";
import type { E1RMPoint, E1RMResponse } from "@/features/stats/model/stats-1rm-types";

function formatPointDate(dateIso: string, locale: "ko" | "en") {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export const Stats1RMChartSection = memo(function Stats1RMChartSection({
  locale,
  stats,
  activePoint,
  chart,
}: {
  locale: "ko" | "en";
  stats: E1RMResponse | null;
  activePoint: E1RMPoint | null;
  chart: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}>
      <div
        style={{
          background: "var(--v2-paper)",
          borderRadius: "var(--v2-r-1)",
          overflow: "hidden",
          boxShadow: "var(--v2-elev-1)",
        }}
      >
        <header
          style={{
            padding: "var(--v2-s-4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2
                style={{
                  fontSize: "var(--v2-t-18)",
                  fontWeight: 700,
                  letterSpacing: 0,
                  color: "var(--v2-ink)",
                  margin: "0 0 2px 0",
                }}
              >
                {locale === "ko" ? "e1RM 상세 추이" : "Detailed e1RM Trend"}
              </h2>
              {stats ? (
                <div style={{ fontSize: "var(--v2-t-12)", color: "var(--v2-ink-2)" }}>
                  {formatPointDate(stats.from, locale)} ~ {formatPointDate(stats.to, locale)}
                </div>
              ) : null}
            </div>
            <div className="metric-1rm" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span className="metric-value" style={{ fontSize: "var(--v2-t-h2)" }}>
                {activePoint ? `${activePoint.e1rm.toFixed(1)}` : "-"}
                <span style={{ fontSize: "var(--v2-t-14)", marginLeft: "2px", fontWeight: 400 }}>kg</span>
              </span>
              <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                {activePoint ? formatPointDate(activePoint.date, locale) : "-"}
              </span>
            </div>
          </div>
        </header>

        <div style={{ padding: "var(--v2-s-4)" }}>{chart}</div>

        {activePoint ? (
          <div
            style={{
              padding: "0 var(--v2-s-4) var(--v2-s-4) var(--v2-s-4)",
              display: "flex",
              gap: "var(--v2-s-2)",
            }}
          >
            <div className="label label-neutral label-sm">
              {/* 1RM 도출 기준이 된 히스토리 1세트. 컨벤션: Weight × Reps */}
              {activePoint.weightKg}kg × {activePoint.reps}
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          background: "var(--v2-paper)",
          borderRadius: "var(--v2-r-1)",
          padding: "var(--v2-s-4)",
          boxShadow: "var(--v2-elev-1)",
        }}
      >
        <div className="metric-1rm" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="metric-label" style={{ display: "block", marginBottom: "2px" }}>
              {locale === "ko" ? "최고 e1RM" : "Best e1RM"}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
              {stats?.best ? formatPointDate(stats.best.date, locale) : "-"}
            </span>
          </div>
          <div className="metric-value" style={{ fontSize: "var(--v2-t-h2)", textAlign: "right" }}>
            {stats?.best ? stats.best.e1rm.toFixed(1) : "-"}
            <span style={{ fontSize: "var(--v2-t-14)", marginLeft: "2px", fontWeight: 400 }}>kg</span>
          </div>
        </div>
      </div>
    </div>
  );
});
