"use client";

import type { CSSProperties, ReactNode } from "react";

type V2SpacingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function gapValue(gap: V2SpacingStep | string) {
  return typeof gap === "number" ? `var(--v2-s-${gap})` : gap;
}

type StackProps = {
  gap?: V2SpacingStep | string;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  wrap?: boolean;
  inline?: boolean;
  as?: "div" | "section" | "ul" | "ol";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export function V2Stack({
  gap = 4,
  align,
  justify,
  wrap = false,
  inline = false,
  as: As = "div",
  className,
  style,
  children,
}: StackProps) {
  return (
    <As
      className={className}
      style={{
        display: inline ? "inline-flex" : "flex",
        flexDirection: "column",
        gap: gapValue(gap),
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : undefined,
        ...style,
      }}
    >
      {children}
    </As>
  );
}

export function V2Inline({
  gap = 2,
  align = "center",
  justify,
  wrap = false,
  as: As = "div",
  className,
  style,
  children,
}: Omit<StackProps, "inline">) {
  return (
    <As
      className={className}
      style={{
        display: "flex",
        flexDirection: "row",
        gap: gapValue(gap),
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : undefined,
        ...style,
      }}
    >
      {children}
    </As>
  );
}
