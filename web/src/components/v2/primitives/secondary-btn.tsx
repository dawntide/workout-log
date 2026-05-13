"use client";

import type { CSSProperties, ReactNode } from "react";

type CommonProps = {
  children: ReactNode;
  icon?: string;
  full?: boolean;
  style?: CSSProperties;
  className?: string;
  tone?: "neutral" | "danger";
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

export function V2SecondaryBtn(props: ButtonProps | AnchorProps) {
  const { children, icon, full = false, style, className, tone = "neutral" } = props;
  const bg =
    tone === "danger"
      ? "color-mix(in srgb, var(--v2-c-danger) 10%, var(--v2-paper-2))"
      : "var(--v2-paper-2)";
  const fg = tone === "danger" ? "var(--v2-c-danger)" : "var(--v2-ink)";
  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: full ? "100%" : undefined,
    minHeight: 44,
    padding: "10px 18px",
    borderRadius: "var(--v2-r-2)",
    background: bg,
    color: fg,
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--v2-f-display)",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
    transition:
      "transform var(--v2-d-1) var(--v2-e-out), background var(--v2-d-1) var(--v2-e-out)",
    ...style,
  };
  const cls = ["v2-pressable", "v2-btn-secondary", className]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
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
    </>
  );

  if (props.as === "a") {
    return (
      <a href={props.href} className={cls} style={baseStyle}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cls}
      style={{
        ...baseStyle,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      {inner}
    </button>
  );
}
