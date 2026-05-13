"use client";

import type { CSSProperties, ReactNode } from "react";

export function V2Anchor({
  href,
  children,
  tone = "accent",
  underline = false,
  style,
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: "accent" | "ink" | "danger";
  underline?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const color =
    tone === "danger"
      ? "var(--v2-c-danger)"
      : tone === "ink"
        ? "var(--v2-ink)"
        : "var(--v2-accent)";
  return (
    <a
      href={href}
      className={["v2-anchor", className].filter(Boolean).join(" ")}
      style={{
        color,
        textDecoration: underline ? "underline" : "none",
        textUnderlineOffset: 3,
        fontFamily: "var(--v2-f-text)",
        ...style,
      }}
    >
      {children}
    </a>
  );
}
