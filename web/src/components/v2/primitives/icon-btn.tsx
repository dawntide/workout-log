"use client";

import type { CSSProperties } from "react";
import { V2Icon } from "./v2-icon";

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
    // v2-tap-44의 ::after 히트 영역이 기준으로 삼을 컨테이닝 블록.
    // 기본 size(40)는 44 미만이라 시각 크기와 별개로 탭 영역을 넓혀야 한다.
    position: "relative",
    borderRadius: "var(--v2-r-pill)",
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
    <V2Icon
      name={icon}
      fill={fill}
      weight={fill ? 500 : 400}
      style={{ fontSize: Math.round(size * 0.55) }}
    />
  );
  const cls = ["v2-pressable", "v2-icon-btn", "v2-tap-44", className]
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
