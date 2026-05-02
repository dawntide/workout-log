"use client";

import { memo, useEffect } from "react";

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
    tone === "success" ? "var(--color-success)" : "var(--color-surface-container-high)";
  const foreground =
    tone === "success" ? "#ffffff" : "var(--color-text-primary)";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="fixed left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 16px)",
      }}
    >
      <div
        className="flex items-center gap-2 px-5 py-3 rounded-full shadow-xl font-semibold"
        style={{
          background,
          color: foreground,
          maxWidth: "min(92vw, 420px)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "20px", fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          {ICON_BY_TONE[tone]}
        </span>
        <span style={{ fontSize: "14px", lineHeight: 1.3 }}>{message}</span>
      </div>
    </div>
  );
});
