"use client";

import type { ReactNode } from "react";
import { V2Card } from "./card";

export type V2MetricTone =
  | "neutral"
  | "weight"
  | "reps"
  | "volume"
  | "onerm"
  | "pr"
  | "success";

const TONE_FG: Record<V2MetricTone, string> = {
  neutral: "var(--v2-ink)",
  weight: "var(--v2-c-weight)",
  reps: "var(--v2-c-reps)",
  volume: "var(--v2-c-volume)",
  onerm: "var(--v2-c-onerm)",
  pr: "var(--v2-c-pr)",
  success: "var(--v2-c-success)",
};

export function V2MetricCard({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
  trend,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: V2MetricTone;
  trend?: { direction: "up" | "down" | "flat"; text: string };
  size?: "sm" | "md" | "lg";
}) {
  const numClass =
    size === "lg" ? "v2-num-lg" : size === "sm" ? "v2-num-sm" : "v2-num-md";
  const fg = TONE_FG[tone];

  return (
    <V2Card tone="paper" padding="var(--v2-s-4)">
      <p className="v2-label" style={{ marginBottom: 6 }}>
        {label}
      </p>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
        <span className={numClass} style={{ color: fg }}>
          {value}
        </span>
        {unit ? (
          <span className="v2-h3" style={{ color: "var(--v2-ink-3)" }}>
            {unit}
          </span>
        ) : null}
      </div>
      {sub ? (
        <p className="v2-small" style={{ marginTop: 6, color: "var(--v2-ink-3)" }}>
          {sub}
        </p>
      ) : null}
      {trend ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
            color:
              trend.direction === "up"
                ? "var(--v2-c-success)"
                : trend.direction === "down"
                  ? "var(--v2-c-danger)"
                  : "var(--v2-ink-3)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
            {trend.direction === "up"
              ? "trending_up"
              : trend.direction === "down"
                ? "trending_down"
                : "trending_flat"}
          </span>
          <span className="v2-mono-label">{trend.text}</span>
        </div>
      ) : null}
    </V2Card>
  );
}
