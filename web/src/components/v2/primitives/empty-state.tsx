"use client";

import type { ReactNode } from "react";
import { V2Card } from "./card";

export function V2EmptyState({
  icon,
  title,
  description,
  action,
  tone = "paper",
}: {
  icon: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "paper" | "inset";
}) {
  return (
    <V2Card tone={tone} padding="var(--v2-s-6)">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "var(--v2-s-2)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 32,
            color: "var(--v2-ink-3)",
          }}
          aria-hidden
        >
          {icon}
        </span>
        <p className="v2-h3" style={{ margin: 0 }}>
          {title}
        </p>
        {description ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
            {description}
          </p>
        ) : null}
        {action ? (
          <div style={{ marginTop: "var(--v2-s-2)" }}>{action}</div>
        ) : null}
      </div>
    </V2Card>
  );
}
