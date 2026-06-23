"use client";

import type { ReactNode } from "react";
import { useThemeSkin } from "@/components/use-theme-skin";
import { V2Icon } from "./v2-icon";

export type V2ChipTone =
  | "neutral"
  | "accent"
  | "weight"
  | "reps"
  | "volume"
  | "onerm"
  | "pr"
  | "success"
  | "warning"
  | "danger"
  | "info";

const CHIP_TONES: Record<V2ChipTone, { fg: string; bg: string }> = {
  neutral: { fg: "var(--v2-ink-2)", bg: "var(--v2-paper-2)" },
  accent: { fg: "var(--v2-accent-ink)", bg: "var(--v2-accent-weak)" },
  weight: {
    fg: "var(--v2-c-weight)",
    bg: "color-mix(in srgb, var(--v2-c-weight) 12%, var(--v2-paper))",
  },
  reps: {
    fg: "var(--v2-c-reps)",
    bg: "color-mix(in srgb, var(--v2-c-reps) 12%, var(--v2-paper))",
  },
  volume: {
    fg: "var(--v2-c-volume)",
    bg: "color-mix(in srgb, var(--v2-c-volume) 12%, var(--v2-paper))",
  },
  onerm: {
    fg: "var(--v2-c-onerm)",
    bg: "color-mix(in srgb, var(--v2-c-onerm) 12%, var(--v2-paper))",
  },
  pr: {
    fg: "var(--v2-c-pr)",
    bg: "color-mix(in srgb, var(--v2-c-pr) 14%, var(--v2-paper))",
  },
  success: {
    fg: "var(--v2-c-success)",
    bg: "color-mix(in srgb, var(--v2-c-success) 12%, var(--v2-paper))",
  },
  warning: {
    fg: "var(--v2-c-warning)",
    bg: "color-mix(in srgb, var(--v2-c-warning) 14%, var(--v2-paper))",
  },
  danger: {
    fg: "var(--v2-c-danger)",
    bg: "color-mix(in srgb, var(--v2-c-danger) 12%, var(--v2-paper))",
  },
  info: {
    fg: "var(--v2-c-info)",
    bg: "color-mix(in srgb, var(--v2-c-info) 12%, var(--v2-paper))",
  },
};

export function V2Chip({
  tone = "neutral",
  solid = false,
  icon,
  children,
}: {
  tone?: V2ChipTone;
  solid?: boolean;
  icon?: string;
  children: ReactNode;
}) {
  const skin = useThemeSkin();
  const t = CHIP_TONES[tone];
  if (skin === "terminal") {
    // 터미널: 배경 채운 pill 대신 [tag] 색 텍스트(투명·mono) — 버튼/탭과 일관.
    return (
      <span
        className="v2-chip"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--v2-s-1)",
          fontFamily: "var(--term-mono)",
          fontSize: "var(--v2-t-label)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: t.fg,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden>[</span>
        {icon && (
          <V2Icon name={icon} style={{ fontSize: "var(--v2-t-small)" }} />
        )}
        {children}
        <span aria-hidden>]</span>
      </span>
    );
  }
  return (
    <span
      className="v2-chip v2-font-display"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--v2-s-1)",
        padding: "var(--v2-s-1) var(--v2-s-3)",
        borderRadius: "var(--v2-r-pill)",
        fontSize: "var(--v2-t-label)",
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: solid ? t.fg : t.bg,
        color: solid ? "var(--v2-ink-on-accent)" : t.fg,
      }}
    >
      {icon && (
        <V2Icon name={icon} style={{ fontSize: "var(--v2-t-small)" }} />
      )}
      {children}
    </span>
  );
}
