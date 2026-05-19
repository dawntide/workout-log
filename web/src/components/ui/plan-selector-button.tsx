import type { ComponentPropsWithoutRef } from "react";
import { useLocale } from "@/components/locale-provider";

type PlanSelectorButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type"> & {
  planName: string;
};

export function PlanSelectorButton({ planName, disabled, ...props }: PlanSelectorButtonProps) {
  const { copy, locale } = useLocale();
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={locale === "ko" ? "플랜 선택 열기" : "Open plan selector"}
      aria-haspopup="dialog"
      className="v2-pressable"
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        textAlign: "left",
        padding: "var(--v2-s-4) var(--v2-s-5)",
        background: "var(--v2-paper)",
        border: "none",
        borderRadius: "var(--v2-r-4)",
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.15s",
      }}
      {...props}
    >
      <div>
        <div className="v2-eyebrow" style={{ color: "var(--v2-ink-2)", marginBottom: "var(--v2-s-1)" }}>
          {copy.workoutLog.activePlanLabel}
        </div>
        <div className="v2-body v2-font-display" style={{ fontWeight: 700, color: "var(--v2-ink)" }}>
          {planName}
        </div>
      </div>
      {!disabled && (
        <span aria-hidden="true" style={{ color: "var(--v2-ink-2)", flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: "var(--v2-t-18)", fontVariationSettings: "'wght' 400" }}>unfold_more</span>
        </span>
      )}
    </button>
  );
}
