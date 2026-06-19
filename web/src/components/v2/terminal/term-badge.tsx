"use client";

import type { ReactNode } from "react";

// ironlog TermBadge — 단일 리터럴 bracket 토큰, 색=의미(redesign-target.md §6).
// box/border 없음(리터럴 `[ ]` 글리프만), 색 --term-*만. data-theme="terminal" 전용.
// 의미 매핑(§3): pr→gold(희소·축하) · info/숫자→cyan · success/+증량→green ·
// danger/FAIL→red · accent/tag/active→amber · dim→중립 라벨.
export type TermBadgeTone =
  | "pr"
  | "info"
  | "success"
  | "danger"
  | "accent"
  | "dim";

const TONE_COLOR: Record<TermBadgeTone, string> = {
  pr: "var(--term-gold)",
  info: "var(--term-cyan)",
  success: "var(--term-green)",
  danger: "var(--term-red)",
  accent: "var(--term-amber)",
  dim: "var(--term-dim)",
};

export function TermBadge({
  tone = "dim",
  children,
}: {
  tone?: TermBadgeTone;
  children: ReactNode;
}) {
  return (
    <span style={{ color: TONE_COLOR[tone], whiteSpace: "nowrap" }}>
      [{children}]
    </span>
  );
}
