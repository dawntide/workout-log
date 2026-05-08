"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

/* ─── Card ─────────────────────────────────────────────────────────── */

type CardTone = "paper" | "inset" | "strong" | "accent";

const CARD_BG: Record<CardTone, string> = {
  paper: "var(--v2-paper)",
  inset: "var(--v2-paper-2)",
  strong: "var(--v2-paper-3)",
  accent: "var(--v2-accent-weak)",
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
  tone?: CardTone;
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
      className={className}
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

/* ─── Hairline ─────────────────────────────────────────────────────── */

export function V2Hairline({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{ height: 1, background: "var(--v2-hairline)", ...style }}
      aria-hidden
    />
  );
}

/* ─── Chip ─────────────────────────────────────────────────────────── */

type ChipTone =
  | "neutral"
  | "accent"
  | "weight"
  | "reps"
  | "volume"
  | "pr"
  | "success"
  | "danger";

const CHIP_TONES: Record<ChipTone, { fg: string; bg: string }> = {
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
  pr: {
    fg: "var(--v2-c-pr)",
    bg: "color-mix(in srgb, var(--v2-c-pr) 14%, var(--v2-paper))",
  },
  success: {
    fg: "var(--v2-c-success)",
    bg: "color-mix(in srgb, var(--v2-c-success) 12%, var(--v2-paper))",
  },
  danger: {
    fg: "var(--v2-c-danger)",
    bg: "color-mix(in srgb, var(--v2-c-danger) 12%, var(--v2-paper))",
  },
};

export function V2Chip({
  tone = "neutral",
  solid = false,
  icon,
  children,
}: {
  tone?: ChipTone;
  solid?: boolean;
  icon?: string;
  children: ReactNode;
}) {
  const t = CHIP_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 9999,
        fontFamily: "var(--v2-f-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: solid ? t.fg : t.bg,
        color: solid ? "var(--v2-ink-on-accent)" : t.fg,
      }}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 13 }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/* ─── IconBtn ──────────────────────────────────────────────────────── */

type IconBtnTone = "neutral" | "accent" | "ghost";

export function V2IconBtn({
  icon,
  onClick,
  size = 40,
  fill = false,
  tone = "neutral",
  label,
  type = "button",
}: {
  icon: string;
  onClick?: () => void;
  size?: number;
  fill?: boolean;
  tone?: IconBtnTone;
  label: string;
  type?: "button" | "submit";
}) {
  const bg: Record<IconBtnTone, string> = {
    neutral: "var(--v2-paper-2)",
    accent: "var(--v2-accent)",
    ghost: "transparent",
  };
  const fg = tone === "accent" ? "var(--v2-ink-on-accent)" : "var(--v2-ink)";
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: bg[tone],
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: fg,
        padding: 0,
        transition:
          "transform var(--v2-d-1) var(--v2-e-out), background var(--v2-d-1) var(--v2-e-out)",
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: Math.round(size * 0.55),
          fontVariationSettings: fill
            ? "'FILL' 1, 'wght' 500"
            : "'FILL' 0, 'wght' 400",
        }}
        aria-hidden
      >
        {icon}
      </span>
    </button>
  );
}

/* ─── PrimaryBtn ───────────────────────────────────────────────────── */

export function V2PrimaryBtn({
  children,
  onClick,
  icon,
  full = false,
  style,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: string;
  full?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: full ? "100%" : undefined,
        minHeight: 52,
        padding: "14px 24px",
        borderRadius: 16,
        background: "var(--v2-accent)",
        color: "var(--v2-ink-on-accent)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "var(--v2-f-display)",
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: "-0.01em",
        boxShadow: "var(--v2-elev-2)",
        transition:
          "transform var(--v2-d-1) var(--v2-e-out), box-shadow var(--v2-d-1) var(--v2-e-out)",
        ...style,
      }}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22 }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

/* ─── SecondaryBtn ─────────────────────────────────────────────────── */

export function V2SecondaryBtn({
  children,
  onClick,
  icon,
  full = false,
  style,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: string;
  full?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: full ? "100%" : undefined,
        minHeight: 44,
        padding: "10px 18px",
        borderRadius: 12,
        background: "var(--v2-paper-2)",
        color: "var(--v2-ink)",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--v2-f-display)",
        fontWeight: 600,
        fontSize: 14,
        ...style,
      }}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18 }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

/* ─── Sheet ────────────────────────────────────────────────────────── */

export function V2Sheet({
  open,
  onClose,
  children,
  height = "85%",
  ariaLabel,
  ariaLabelledBy,
  id,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  id?: string;
}) {
  // ESC dismiss
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--v2-overlay)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity var(--v2-d-2) var(--v2-e-out)",
          zIndex: 80,
        }}
        aria-hidden={!open}
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-hidden={!open}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 81,
          background: "var(--v2-paper)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          height,
          maxHeight: "92vh",
          boxShadow: "var(--v2-elev-sheet)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform var(--v2-d-spring) var(--v2-e-spring)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            padding: "10px 0 6px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              background: "var(--v2-paper-4)",
              borderRadius: 9999,
            }}
          />
        </div>
        <div
          style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/* ─── ActionDock ───────────────────────────────────────────────────── */

export type V2ActionDockItem = {
  key: string;
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  active?: boolean;
  /** 시트 트리거인 경우, 시트의 열림 상태 (aria-expanded용) */
  expanded?: boolean;
  /** 시트 트리거인 경우, 컨트롤되는 시트의 id (aria-controls용) */
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
        left: 12,
        right: 12,
        bottom: "calc(14px + env(safe-area-inset-bottom))",
        background: "color-mix(in srgb, var(--v2-paper) 88%, transparent)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderRadius: 26,
        padding: 10,
        display: "grid",
        gridTemplateColumns: items
          .map((it) => (it.primary ? "1.4fr" : "1fr"))
          .join(" "),
        gap: 4,
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
                fontSize: it.primary ? 26 : 22,
                fontVariationSettings:
                  it.primary || it.active
                    ? "'FILL' 1, 'wght' 500"
                    : "'FILL' 0, 'wght' 400",
              }}
              aria-hidden
            >
              {it.icon}
            </span>
            <span>{it.label}</span>
          </>
        );
        const styleCommon: CSSProperties = {
          background: it.primary ? "var(--v2-accent)" : "transparent",
          color: it.primary
            ? "var(--v2-ink-on-accent)"
            : it.active
              ? "var(--v2-accent)"
              : "var(--v2-ink-2)",
          border: "none",
          cursor: "pointer",
          borderRadius: 18,
          padding: "12px 8px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minHeight: 56,
          textDecoration: "none",
          fontFamily: "var(--v2-f-display)",
          fontSize: 11,
          fontWeight: 700,
          transition: "transform var(--v2-d-1) var(--v2-e-out)",
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
            aria-current={it.active ? "page" : undefined}
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

/* ─── CountUp ──────────────────────────────────────────────────────── */

export function V2CountUp({
  to,
  duration = 800,
  format = (v: number) => Math.round(v).toString(),
}: {
  to: number;
  duration?: number;
  format?: (v: number) => string;
}) {
  const [v, setV] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    let start: number | null = null;
    const step = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(eased * to);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, duration]);
  return <>{format(v)}</>;
}

/* ─── FieldRow (KeypadSession용) ──────────────────────────────────── */

export function V2FieldRow({
  label,
  unit,
  value,
  color,
  active,
  onSelect,
  small = false,
}: {
  label: string;
  unit?: string;
  value: string;
  color: string;
  active: boolean;
  onSelect: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        cursor: "pointer",
        padding: "4px 0",
        opacity: active ? 1 : 0.5,
        background: "transparent",
        border: "none",
        width: "100%",
        textAlign: "left",
        transition: "opacity var(--v2-d-1) var(--v2-e-out)",
      }}
      aria-pressed={active}
    >
      <span
        className="v2-label"
        style={{ color: active ? color : "var(--v2-ink-3)" }}
      >
        {label}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
        <span
          className={small ? "v2-num-md" : "v2-num-lg"}
          style={{ color, fontSize: small ? 32 : 56 }}
        >
          {value}
        </span>
        {unit && (
          <span className="v2-h3" style={{ color: "var(--v2-ink-3)" }}>
            {unit}
          </span>
        )}
      </span>
    </button>
  );
}
