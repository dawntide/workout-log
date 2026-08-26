"use client";

import type { ReactNode } from "react";
import { V2Card, type V2CardTone } from "./card";
import { V2Icon } from "./v2-icon";

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
  surface = "paper",
  trend,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  /** 숫자 색만 바꾼다 — 표면색은 `surface`가 정한다. */
  tone?: V2MetricTone;
  /**
   * 카드 표면. **다른 카드 안에 넣을 때는 사다리를 한 칸 내려야 한다**(보통 `inset`).
   *
   * No-Line Rule이라 계층 구분 수단이 배경색뿐이다. paper 카드 안에 paper 타일을
   * 넣으면 ΔE=0이라 타일이 통째로 안 보인다 — `/plans/manage` 히어로의 통계 타일
   * 3개가 실제로 그 상태였다(2026-08-26 실측, design-harmonization 감사가 검출).
   */
  surface?: V2CardTone;
  trend?: { direction: "up" | "down" | "flat"; text: string };
  size?: "sm" | "md" | "lg";
}) {
  const numClass =
    size === "lg" ? "v2-num-lg" : size === "sm" ? "v2-num-sm" : "v2-num-md";
  const fg = TONE_FG[tone];

  return (
    <V2Card tone={surface} padding="var(--v2-s-4)">
      <p className="v2-label" style={{ marginBottom: 6 }}>
        {label}
      </p>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--v2-s-1)" }}>
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
            gap: "var(--v2-s-1)",
            marginTop: 6,
            color:
              trend.direction === "up"
                ? "var(--v2-c-success)"
                : trend.direction === "down"
                  ? "var(--v2-c-danger)"
                  : "var(--v2-ink-3)",
          }}
        >
          <V2Icon
            name={
              trend.direction === "up"
                ? "trending_up"
                : trend.direction === "down"
                  ? "trending_down"
                  : "trending_flat"
            }
            style={{ fontSize: "var(--v2-t-14)" }}
          />
          <span className="v2-mono-label">{trend.text}</span>
        </div>
      ) : null}
    </V2Card>
  );
}
