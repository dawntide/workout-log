"use client";

import type { CSSProperties, ReactNode } from "react";

type CommonProps = {
  label: ReactNode;
  icon?: string;
  value?: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  trailing?: "chevron" | "none";
  className?: string;
  style?: CSSProperties;
};

type ButtonProps = CommonProps & {
  as?: "button";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  href?: never;
  expandable?: never;
  expanded?: never;
  onExpandedChange?: never;
  expandedContent?: never;
};

type AnchorProps = CommonProps & {
  as: "a";
  href: string;
  onClick?: never;
  type?: never;
  disabled?: never;
  expandable?: never;
  expanded?: never;
  onExpandedChange?: never;
  expandedContent?: never;
};

type DivProps = CommonProps & {
  as: "div";
  href?: never;
  onClick?: never;
  type?: never;
  disabled?: never;
  expandable?: never;
  expanded?: never;
  onExpandedChange?: never;
  expandedContent?: never;
};

type ExpandableProps = CommonProps & {
  as?: never;
  href?: never;
  type?: "button" | "submit";
  onClick?: never;
  disabled?: boolean;
  /** When true, the row toggles `expandedContent` instead of navigating. */
  expandable: true;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  expandedContent: ReactNode;
};

export function V2NavRow(
  props: ButtonProps | AnchorProps | DivProps | ExpandableProps,
) {
  const {
    label,
    icon,
    value,
    badge,
    description,
    trailing = "chevron",
    className,
    style,
  } = props;
  const isExpandable = "expandable" in props && props.expandable === true;
  const interactive = isExpandable || props.as !== "div";

  const baseStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--v2-s-3)",
    width: "100%",
    minHeight: 56,
    padding: "var(--v2-s-3) var(--v2-s-4)",
    background: "var(--v2-paper)",
    color: "var(--v2-ink)",
    border: "none",
    cursor: interactive ? "pointer" : "default",
    textDecoration: "none",
    textAlign: "left",
    borderRadius: "var(--v2-r-2)",
    transition: "background var(--v2-d-1) var(--v2-e-out)",
    ...style,
  };

  const cls = [interactive && "v2-pressable", "v2-nav-row", className]
    .filter(Boolean)
    .join(" ");

  const trailingIcon = isExpandable
    ? props.expanded
      ? "expand_less"
      : "expand_more"
    : trailing === "chevron"
      ? "chevron_right"
      : null;

  const inner = (
    <>
      {icon ? (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22, color: "var(--v2-ink-2)" }}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="v2-body" style={{ margin: 0, fontWeight: 500 }}>
          {label}
        </p>
        {description ? (
          <p
            className="v2-small"
            style={{ margin: 0, color: "var(--v2-ink-3)" }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {badge ? <div style={{ flexShrink: 0 }}>{badge}</div> : null}
      {value !== undefined ? (
        <span
          className="v2-small"
          style={{ color: "var(--v2-ink-3)", flexShrink: 0 }}
        >
          {value}
        </span>
      ) : null}
      {interactive && trailingIcon ? (
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 18,
            color: "var(--v2-ink-3)",
            flexShrink: 0,
            transition: "transform var(--v2-d-1) var(--v2-e-out)",
          }}
          aria-hidden
        >
          {trailingIcon}
        </span>
      ) : null}
    </>
  );

  if (isExpandable) {
    const expanded = props.expanded;
    const disabled = props.disabled;
    return (
      <div style={{ width: "100%" }}>
        <button
          type={props.type ?? "button"}
          onClick={() => {
            if (!disabled) props.onExpandedChange(!expanded);
          }}
          aria-expanded={expanded}
          disabled={disabled}
          className={cls}
          style={{
            ...baseStyle,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {inner}
        </button>
        {expanded ? (
          <div
            role="region"
            style={{
              padding: "var(--v2-s-2) var(--v2-s-4) var(--v2-s-3)",
              animation:
                "v2-fadeUp var(--v2-d-2) var(--v2-e-out) both",
            }}
          >
            {props.expandedContent}
          </div>
        ) : null}
      </div>
    );
  }

  if (props.as === "a") {
    return (
      <a href={props.href} className={cls} style={baseStyle}>
        {inner}
      </a>
    );
  }
  if (props.as === "div") {
    return (
      <div className={cls} style={baseStyle}>
        {inner}
      </div>
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
