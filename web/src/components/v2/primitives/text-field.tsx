"use client";

import {
  forwardRef,
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { V2Icon } from "./v2-icon";

export type V2TextFieldSize = "md" | "sm";

const SHELL_PADDING: Record<V2TextFieldSize, string> = {
  md: "var(--v2-s-1) var(--v2-s-4)",
  sm: "0 var(--v2-s-3)",
};

const FONT_CLASS: Record<V2TextFieldSize, string> = {
  md: "v2-body",
  sm: "v2-small",
};

const ICON_FONT_SIZE: Record<V2TextFieldSize, string> = {
  md: "var(--v2-t-h3)",
  sm: "var(--v2-t-body)",
};

export type V2TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: string;
  trailing?: ReactNode;
  size?: V2TextFieldSize;
  containerClassName?: string;
  containerStyle?: CSSProperties;
};

export const V2TextField = forwardRef<HTMLInputElement, V2TextFieldProps>(
  function V2TextField(
    {
      label,
      hint,
      error,
      icon,
      trailing,
      size = "md",
      id,
      required,
      className,
      style,
      containerClassName,
      containerStyle,
      ...inputProps
    },
    ref,
  ) {
    const reactId = useId();
    const inputId = id ?? reactId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy =
      [errorId, hintId].filter(Boolean).join(" ") || undefined;
    const invalid = Boolean(error);

    return (
      <div
        className={["v2-textfield", containerClassName]
          .filter(Boolean)
          .join(" ")}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-1)",
          ...containerStyle,
        }}
      >
        {label ? (
          <label htmlFor={inputId} className="v2-label">
            {label}
            {required ? (
              <span
                aria-hidden
                style={{
                  color: "var(--v2-c-danger)",
                  marginLeft: "var(--v2-s-1)",
                }}
              >
                *
              </span>
            ) : null}
          </label>
        ) : null}
        <div
          className="v2-textfield-shell"
          data-invalid={invalid || undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-2)",
            padding: SHELL_PADDING[size],
            borderRadius: "var(--v2-r-2)",
          }}
        >
          {icon ? (
            <V2Icon
              name={icon}
              style={{
                color: "var(--v2-ink-3)",
                fontSize: ICON_FONT_SIZE[size],
                flexShrink: 0,
              }}
            />
          ) : null}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={[
              "v2-textfield-input",
              FONT_CLASS[size],
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            style={style}
            {...inputProps}
          />
          {trailing ? (
            <div style={{ flexShrink: 0, display: "flex" }}>{trailing}</div>
          ) : null}
        </div>
        {error ? (
          <p
            id={errorId}
            className="v2-small"
            role="alert"
            style={{ color: "var(--v2-c-danger)", margin: 0 }}
          >
            {error}
          </p>
        ) : null}
        {hint && !error ? (
          <p
            id={hintId}
            className="v2-small"
            style={{ color: "var(--v2-ink-3)", margin: 0 }}
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
