"use client";

import type { CSSProperties } from "react";

export type V2ActionDockItem = {
  key: string;
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  active?: boolean;
  expanded?: boolean;
  controls?: string;
};

export function V2ActionDock({
  items,
  className,
}: {
  items: V2ActionDockItem[];
  className?: string;
}) {
  return (
    <nav
      className={`v2-action-dock ${className ?? ""}`}
      aria-label="Main navigation"
      style={{
        position: "fixed",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        bottom: "calc(12px + env(safe-area-inset-bottom))",
        background: "color-mix(in srgb, var(--v2-paper) 88%, transparent)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid var(--v2-hairline)",
        borderRadius: "var(--v2-r-pill)",
        padding: 6,
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 2,
        overflow: "hidden",
        boxShadow: "var(--v2-elev-2)",
        zIndex: 40,
        margin: "0 auto",
        maxWidth: 480,
      }}
    >
      {items.map((it) => {
        const inner = (
          <>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: it.primary ? 22 : 20,
                fontVariationSettings: it.active
                  ? "'FILL' 1, 'wght' 500"
                  : "'FILL' 0, 'wght' 400",
              }}
              aria-hidden
            >
              {it.icon}
            </span>
            <span
              style={{
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontSize: 9,
                lineHeight: 1.1,
              }}
            >
              {it.label}
            </span>
          </>
        );
        const isSelected = Boolean(it.active);
        const styleCommon: CSSProperties = {
          flex: "0 0 auto",
          minWidth: 0,
          background: isSelected ? "var(--v2-accent)" : "transparent",
          color: isSelected ? "var(--v2-ink-on-accent)" : "var(--v2-ink-2)",
          border: "none",
          cursor: "pointer",
          borderRadius: "var(--v2-r-pill)",
          padding: "6px 2px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minHeight: 48,
          textDecoration: "none",
          fontFamily: "var(--v2-f-display)",
          fontSize: 10,
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          WebkitTapHighlightColor: "transparent",
          transition:
            "background var(--v2-d-1) var(--v2-e-out), color var(--v2-d-1) var(--v2-e-out), transform var(--v2-d-1) var(--v2-e-out)",
        };
        if (it.href) {
          return (
            <a
              key={it.key}
              href={it.href}
              aria-label={it.label}
              aria-current={it.active ? "page" : undefined}
              style={styleCommon}
            >
              {inner}
            </a>
          );
        }
        return (
          <button
            key={it.key}
            type="button"
            onClick={it.onClick}
            aria-label={it.label}
            aria-pressed={it.controls ? undefined : Boolean(it.active)}
            aria-expanded={
              it.controls != null || it.expanded != null
                ? Boolean(it.expanded)
                : undefined
            }
            aria-controls={it.controls}
            style={styleCommon}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
