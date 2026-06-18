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
        background: "color-mix(in srgb, var(--v2-paper) 52%, transparent)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderRadius: "var(--v2-r-pill)",
        padding: "var(--v2-s-1)",
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 2,
        overflow: "hidden",
        boxShadow: "var(--v2-elev-2)",
        zIndex: 40,
        margin: "0 auto",
        maxWidth: 320,
      }}
    >
      {items.map((it) => {
        const isSelected = Boolean(it.active);
        const inner = (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "var(--v2-s-8)",
              height: "var(--v2-s-8)",
              borderRadius: "var(--v2-r-3)",
              background: isSelected
                ? "color-mix(in srgb, var(--v2-ink) 10%, transparent)"
                : "transparent",
              transition: "background var(--v2-d-1) var(--v2-e-out)",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: it.primary ? 26 : 24,
                fontVariationSettings: it.active
                  ? "'FILL' 1, 'wght' 600"
                  : "'FILL' 0, 'wght' 400",
              }}
              aria-hidden
            >
              {it.icon}
            </span>
          </span>
        );
        const styleCommon: CSSProperties = {
          flex: "0 0 auto",
          minWidth: 0,
          background: "transparent",
          color: isSelected ? "var(--v2-ink)" : "var(--v2-ink-3)",
          border: "none",
          cursor: "pointer",
          borderRadius: "var(--v2-r-pill)",
          padding: "0 2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(var(--v2-s-8) + var(--v2-s-1))",
          textDecoration: "none",
          overflow: "hidden",
          WebkitTapHighlightColor: "transparent",
          transition:
            "color var(--v2-d-1) var(--v2-e-out), transform var(--v2-d-1) var(--v2-e-out)",
        };
        if (it.href) {
          return (
            <a
              key={it.key}
              href={it.href}
              aria-label={it.label}
              aria-current={it.active ? "page" : undefined}
              className="v2-font-display"
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
            className="v2-font-display"
            style={styleCommon}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
