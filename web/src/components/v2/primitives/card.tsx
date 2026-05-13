"use client";

import type { CSSProperties, ReactNode } from "react";

export type V2CardTone =
  | "paper"
  | "inset"
  | "strong"
  | "accent"
  | "danger"
  | "success";

const CARD_BG: Record<V2CardTone, string> = {
  paper: "var(--v2-paper)",
  inset: "var(--v2-paper-2)",
  strong: "var(--v2-paper-3)",
  accent: "var(--v2-accent-weak)",
  danger: "color-mix(in srgb, var(--v2-c-danger) 10%, var(--v2-paper))",
  success: "color-mix(in srgb, var(--v2-c-success) 10%, var(--v2-paper))",
};

export function V2Card({
  tone = "paper",
  padding = "var(--v2-s-5)",
  radius = "var(--v2-r-3)",
  style,
  className,
  children,
  onClick,
}: {
  tone?: V2CardTone;
  padding?: string | number;
  radius?: string | number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={["v2-card", className].filter(Boolean).join(" ")}
      style={{
        background: CARD_BG[tone],
        borderRadius: radius,
        padding,
        boxShadow: tone === "inset" ? "none" : "var(--v2-elev-1)",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
