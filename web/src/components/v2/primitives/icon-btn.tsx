"use client";

import type { CSSProperties } from "react";

export type V2IconBtnTone = "neutral" | "accent" | "ghost";

const TONE_BG: Record<V2IconBtnTone, string> = {
  neutral: "var(--v2-paper-2)",
  accent: "var(--v2-accent)",
  ghost: "transparent",
};

type CommonProps = {
  icon: string;
  size?: number;
  fill?: boolean;
  tone?: V2IconBtnTone;
  label: string;
  className?: string;
  style?: CSSProperties;
};

type ButtonProps = CommonProps & {
  as?: "button";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  href?: never;
};

type AnchorProps = CommonProps & {
  as: "a";
  href: string;
  onClick?: never;
  type?: never;
  disabled?: never;
};

export function V2IconBtn(props: ButtonProps | AnchorProps) {
  const {
    icon,
    size = 40,
    fill = false,
    tone = "neutral",
    label,
    className,
    style,
  } = props;
  const fg = tone === "accent" ? "var(--v2-ink-on-accent)" : "var(--v2-ink)";
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size / 2,
    background: TONE_BG[tone],
    border: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: fg,
    padding: 0,
    textDecoration: "none",
    transition:
      "transform var(--v2-d-1) var(--v2-e-out), background var(--v2-d-1) var(--v2-e-out)",
    ...style,
  };
  const inner = (
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
  );
  const cls = ["v2-pressable", "v2-icon-btn", className]
    .filter(Boolean)
    .join(" ");

  if (props.as === "a") {
    return (
      <a
        href={props.href}
        aria-label={label}
        className={cls}
        style={baseStyle}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={label}
      className={cls}
      style={baseStyle}
    >
      {inner}
    </button>
  );
}
