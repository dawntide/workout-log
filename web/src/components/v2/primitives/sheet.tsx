"use client";

import { useEffect, type ReactNode } from "react";

export function V2Sheet({
  open,
  onClose,
  children,
  height = "85%",
  ariaLabel,
  ariaLabelledBy,
  id,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  id?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--v2-overlay)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity var(--v2-d-2) var(--v2-e-out)",
          zIndex: 80,
        }}
        aria-hidden={!open}
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-hidden={!open}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 81,
          background: "var(--v2-paper)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          height,
          maxHeight: "92vh",
          boxShadow: "var(--v2-elev-sheet)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform var(--v2-d-spring) var(--v2-e-spring)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            padding: "10px 0 6px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              background: "var(--v2-paper-4)",
              borderRadius: 9999,
            }}
          />
        </div>
        <div
          style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
