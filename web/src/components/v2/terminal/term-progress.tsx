"use client";

import type { ReactNode } from "react";

// ironlog TermProgress — btop식 블록 글리프 바(█ fill / ░ track) + 인라인 텍스트
// (label·value) + 액션 children. data-theme="terminal" 전용(--term-* 의존).
// 규칙: border 금지(track=글리프 색), 치수 var(--v2-*)만, 색 --term-*만.
// tone="meter"는 위치별 green→amber→red(btop triad), 그 외는 단색 fill.
// redesign-target.md §6 TermProgress.

export type TermProgressTone = "meter" | "success" | "accent" | "info";

const SOLID_FILL: Record<Exclude<TermProgressTone, "meter">, string> = {
  success: "var(--term-green)",
  accent: "var(--term-amber)",
  info: "var(--term-cyan)",
};

// 위치별 그라디언트(btop): 앞 1/3 green · 중간 amber · 끝 1/3 red.
function meterColor(index: number, cells: number): string {
  const p = (index + 0.5) / cells;
  if (p < 1 / 3) return "var(--term-green)";
  if (p < 2 / 3) return "var(--term-amber)";
  return "var(--term-red)";
}

export function TermProgress({
  ratio,
  label,
  value,
  glyph,
  tone = "meter",
  cells = 14,
  children,
}: {
  ratio: number;
  label: string;
  value?: string;
  glyph?: string;
  tone?: TermProgressTone;
  cells?: number;
  children?: ReactNode;
}) {
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const filled = Math.round(clamped * cells);

  return (
    <div
      className="v2-font-num"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "var(--v2-s-2)",
        fontSize: "var(--v2-t-small)",
      }}
    >
      <span style={{ color: "var(--term-dim)", whiteSpace: "nowrap" }}>
        {glyph ? `${glyph} ` : ""}
        {label}
      </span>
      {/* 바: 인접 span(공백 없음)으로 연속 블록 유지 */}
      <span aria-hidden style={{ whiteSpace: "nowrap", letterSpacing: 0 }}>
        {Array.from({ length: cells }).map((_, i) => {
          const isFilled = i < filled;
          const color = isFilled
            ? tone === "meter"
              ? meterColor(i, cells)
              : SOLID_FILL[tone]
            : "var(--term-track)";
          return (
            <span key={i} style={{ color }}>
              {isFilled ? "█" : "░"}
            </span>
          );
        })}
      </span>
      {value ? (
        <span style={{ color: "var(--term-fg)", whiteSpace: "nowrap" }}>
          {value}
        </span>
      ) : null}
      {children}
    </div>
  );
}
