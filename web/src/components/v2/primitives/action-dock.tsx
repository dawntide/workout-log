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
  compact = false,
}: {
  items: V2ActionDockItem[];
  className?: string;
  /** 스크롤 다운 시 축소 상태. 크기 전환은 CSS(data-compact)가 담당. */
  compact?: boolean;
}) {
  return (
    <nav
      className={`v2-action-dock ${className ?? ""}`}
      data-compact={compact ? "" : undefined}
      aria-label="Main navigation"
      style={{
        position: "fixed",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        // 홈 인디케이터(safe-area)가 있으면 그 영역이 곧 하단 여백이 된다.
        // safe-area에서 10px 당겨 PWA standalone(주소창 없음)에서 네비를
        // 홈 인디케이터 쪽으로 더 내린다. max 하한 12px 덕에 브라우저
        // (safe-area=0)에서는 그대로 12px이 유지된다.
        bottom: "max(12px, calc(env(safe-area-inset-bottom) - 10px))",
        background: "color-mix(in srgb, var(--v2-paper) 52%, transparent)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderRadius: "var(--v2-r-pill)",
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 2,
        overflow: "hidden",
        boxShadow: "var(--v2-elev-2)",
        zIndex: 40,
        margin: "0 auto",
        // max-width는 v2-action-dock(CSS)에 — compact 시 너비도 함께 축소
      }}
    >
      {items.map((it) => {
        const isSelected = Boolean(it.active);
        const inner = (
          <span
            className="v2-action-dock__icon-box"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--v2-r-3)",
              background: isSelected
                ? "color-mix(in srgb, var(--v2-ink) 10%, transparent)"
                : "transparent",
            }}
          >
            <span
              className="material-symbols-outlined"
              data-primary={it.primary ? "" : undefined}
              style={{
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
          textDecoration: "none",
          overflow: "hidden",
          WebkitTapHighlightColor: "transparent",
          // transition은 v2-action-dock__item(CSS)에 통합 — inline으로 두면
          // compact 시 min-height 전환을 덮어써 높이만 끊겨 점프한다.
        };
        if (it.href) {
          return (
            <a
              key={it.key}
              href={it.href}
              aria-label={it.label}
              aria-current={it.active ? "page" : undefined}
              className="v2-font-display v2-action-dock__item"
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
            className="v2-font-display v2-action-dock__item"
            style={styleCommon}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
