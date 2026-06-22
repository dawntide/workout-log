"use client";

import { memo, useEffect } from "react";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

type ToastTone = "success" | "neutral";

type ToastProps = {
  message: string;
  show: boolean;
  onDismiss: () => void;
  tone?: ToastTone;
  durationMs?: number;
  ariaLabel?: string;
};

const ICON_BY_TONE: Record<ToastTone, string> = {
  success: "check_circle",
  neutral: "info",
};

export const Toast = memo(function Toast({
  message,
  show,
  onDismiss,
  tone = "success",
  durationMs = 2000,
  ariaLabel,
}: ToastProps) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => onDismiss(), durationMs);
    return () => clearTimeout(timer);
  }, [show, durationMs, onDismiss]);

  if (!show) return null;

  const background =
    tone === "success" ? "var(--v2-c-success)" : "var(--v2-paper-3)";
  const foreground =
    tone === "success" ? "var(--v2-ink-on-accent)" : "var(--v2-ink)";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + var(--v2-s-4))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        pointerEvents: "none",
        animation: "v2-slideDown 200ms ease-out",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--v2-s-2)",
          padding: "var(--v2-s-3) var(--v2-s-5)",
          borderRadius: "var(--v2-r-pill)",
          background,
          color: foreground,
          boxShadow: "var(--v2-elev-2)",
          fontWeight: 600,
          maxWidth: "min(92vw, 420px)",
          whiteSpace: "nowrap",
        }}
      >
        <V2Icon
          name={ICON_BY_TONE[tone]}
          fill
          style={{ fontSize: "var(--v2-t-20)" }}
        />
        <span style={{ fontSize: "var(--v2-t-14)", lineHeight: 1.3 }}>{message}</span>
      </div>
    </div>
  );
});
