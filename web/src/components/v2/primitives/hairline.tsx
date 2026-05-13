"use client";

import type { CSSProperties } from "react";

export function V2Hairline({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{ height: 1, background: "var(--v2-hairline)", ...style }}
      aria-hidden
    />
  );
}
