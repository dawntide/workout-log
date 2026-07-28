"use client";

import type { CSSProperties, ReactNode } from "react";
import { V2Icon } from "./v2-icon";

type CommonProps = {
  children: ReactNode;
  icon?: string;
  full?: boolean;
  style?: CSSProperties;
  className?: string;
  /** 파괴적 확인(삭제 등)의 주 버튼. inline background 덮어쓰기 대신 이 prop을 쓴다. */
  tone?: "accent" | "danger";
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
  const { children, icon, full = false, style, className, tone = "accent" } = props;
  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--v2-s-2)",
    width: full ? "100%" : undefined,
    minHeight: "var(--v2-s-8)",
    padding: "var(--v2-s-4) var(--v2-s-6)",
    borderRadius: "var(--v2-r-3)",
    background: tone === "danger" ? "var(--v2-c-danger)" : "var(--v2-accent)",
    color: "var(--v2-ink-on-accent)",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "var(--v2-t-16)",
    letterSpacing: "-0.01em",
    textDecoration: "none",
    boxShadow: "var(--v2-elev-2)",
    transition:
      "transform var(--v2-d-1) var(--v2-e-out), box-shadow var(--v2-d-1) var(--v2-e-out)",
    ...style,
  };
  const cls = [
    "v2-pressable",
    "v2-btn-primary",
    "v2-font-display",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      {icon && (
        <V2Icon name={icon} style={{ fontSize: "var(--v2-t-h2)" }} />
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
