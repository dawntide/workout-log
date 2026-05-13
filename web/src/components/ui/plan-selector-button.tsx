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
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        textAlign: "left",
        padding: "14px 18px",
        background: "var(--v2-paper)",
        border: "none",
        borderRadius: "20px",
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.15s",
      }}
      {...props}
    >
      <div>
        <div style={{
          fontFamily: "var(--font-label-family)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--v2-ink-2)",
          marginBottom: "4px",
        }}>
          {copy.workoutLog.activePlanLabel}
        </div>
        <div style={{
          fontFamily: "var(--font-headline-family)",
          fontSize: "15px",
          fontWeight: 700,
          color: "var(--v2-ink)",
        }}>
          {planName}
        </div>
      </div>
      {!disabled && (
        <span aria-hidden="true" style={{ color: "var(--v2-ink-2)", flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'wght' 400" }}>unfold_more</span>
        </span>
      )}
    </button>
  );
}
