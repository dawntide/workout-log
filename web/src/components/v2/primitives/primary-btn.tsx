"use client";

import type { CSSProperties, ReactNode } from "react";

type CommonProps = {
  children: ReactNode;
  icon?: string;
  full?: boolean;
  style?: CSSProperties;
  className?: string;
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

export function V2PrimaryBtn(props: ButtonProps | AnchorProps) {
  const { children, icon, full = false, style, className } = props;
  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: full ? "100%" : undefined,
    minHeight: 52,
    padding: "14px 24px",
    borderRadius: "var(--v2-r-3)",
    background: "var(--v2-accent)",
    color: "var(--v2-ink-on-accent)",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--v2-f-display)",
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: "-0.01em",
    textDecoration: "none",
    boxShadow: "var(--v2-elev-2)",
    transition:
      "transform var(--v2-d-1) var(--v2-e-out), box-shadow var(--v2-d-1) var(--v2-e-out)",
    ...style,
  };
  const cls = ["v2-pressable", "v2-btn-primary", className]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
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
        opacity: props.disabled ? 0.6 : 1,
      }}
    >
      {inner}
    </button>
  );
}
