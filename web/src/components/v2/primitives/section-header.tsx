"use client";

import type { ReactNode } from "react";

export function V2SectionHeader({
  eyebrow,
  title,
  action,
  level = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  level?: "h1" | "h2" | "h3";
}) {
  const titleClass =
    level === "h1" ? "v2-h1" : level === "h3" ? "v2-h3" : "v2-h2";
  const TitleTag = level;

  return (
    <div
      className="v2-section-header"
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: "var(--v2-s-3)",
        marginBottom: "var(--v2-s-4)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow ? (
          <p className="v2-eyebrow" style={{ marginBottom: 4 }}>
            {eyebrow}
          </p>
        ) : null}
        <TitleTag className={titleClass}>{title}</TitleTag>
      </div>
      {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
    </div>
  );
}
