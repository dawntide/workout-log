import type { CSSProperties } from "react";

export type V2SkeletonShape = "rect" | "text" | "circle";

export type V2SkeletonProps = {
  shape?: V2SkeletonShape;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  /** Size override for `shape="circle"`. Sets both width and height. */
  size?: CSSProperties["width"];
  /** Override radius. Defaults: rect=r-1, text=r-1, circle=pill. */
  radius?: CSSProperties["borderRadius"];
  className?: string;
  style?: CSSProperties;
};

const DEFAULTS: Record<
  V2SkeletonShape,
  { width: CSSProperties["width"]; height: CSSProperties["height"]; radius: string }
> = {
  rect: { width: "100%", height: "var(--v2-s-6)", radius: "var(--v2-r-1)" },
  text: { width: "100%", height: "var(--v2-s-4)", radius: "var(--v2-r-1)" },
  circle: {
    width: "var(--v2-s-7)",
    height: "var(--v2-s-7)",
    radius: "var(--v2-r-pill)",
  },
};

export function V2Skeleton({
  shape = "rect",
  width,
  height,
  size,
  radius,
  className,
  style,
}: V2SkeletonProps) {
  const defaults = DEFAULTS[shape];
  const resolvedSize = shape === "circle" ? size : undefined;
  return (
    <span
      role="status"
      aria-hidden
      className={["v2-skeleton", className].filter(Boolean).join(" ")}
      style={{
        display: "block",
        width: resolvedSize ?? width ?? defaults.width,
        height: resolvedSize ?? height ?? defaults.height,
        borderRadius: radius ?? defaults.radius,
        ...style,
      }}
    />
  );
}
