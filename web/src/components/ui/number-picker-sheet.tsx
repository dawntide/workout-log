"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "./bottom-sheet";
import { WheelPicker, generateNumberRange, type WheelPickerHandle } from "./wheel-picker";

// ── NumberPickerSheet ────────────────────────────────────────────────────────

export type NumberPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Format function for display text */
  formatValue?: (value: number) => string;
  /** Unit suffix shown next to picker (e.g. "kg", "회") */
  unit?: string;
};

export function NumberPickerSheet({
  open,
  onClose,
  title,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  unit,
}: NumberPickerSheetProps) {
  const { locale } = useLocale();
  const pickerRef = useRef<WheelPickerHandle>(null);
  const [draftValue, setDraftValue] = useState(value);

  const values = useMemo(() => generateNumberRange(min, max, step), [min, max, step]);

  // Sync draft value when sheet opens
  useEffect(() => {
    if (open) {
      setDraftValue(value);
    }
  }, [open, value]);

  const handleChange = useCallback((next: number) => {
    setDraftValue(next);
  }, []);

  const handleConfirm = useCallback(() => {
    onChange(draftValue);
    onClose();
  }, [draftValue, onChange, onClose]);

  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onClose}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      panelClassName="number-picker-sheet-panel"
      primaryAction={{
        ariaLabel: locale === "ko" ? "확인" : "Confirm",
        onPress: handleConfirm,
      }}
      footer={null}
    >
      <div style={{ padding: "var(--v2-s-4) 0 var(--v2-s-7)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--v2-s-4)" }}>
          <WheelPicker
            ref={pickerRef}
            values={values}
            value={draftValue}
            onChange={handleChange}
            itemHeight={48}
            visibleCount={7}
            formatValue={formatValue}
          />
          {unit ? <span style={{ fontSize: "1.25rem", color: "var(--v2-ink-2)" }}>{unit}</span> : null}
        </div>
      </div>
    </BottomSheet>
  );
}

// ── NumberPickerField ────────────────────────────────────────────────────────
// A tappable field that displays a value and opens a NumberPickerSheet on tap.

export type NumberPickerFieldProps = {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Format function for display text */
  formatValue?: (value: number) => string;
  /** Unit suffix */
  unit?: string;
  /** Sheet title (defaults to label) */
  sheetTitle?: string;
  /** Additional class on the outer wrapper */
  className?: string;
  /** Variant styling */
  variant?: "default" | "workout-number" | "stepper";
  /** Whether the field is in "complete" state */
  complete?: boolean;
  /** Metric tone for complete-state highlight color */
  tone?: "reps" | "weight" | "default";
};

export function NumberPickerField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  unit,
  sheetTitle,
  className = "",
  variant = "default",
  complete = false,
  tone = "default",
}: NumberPickerFieldProps) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);

  const displayText = formatValue ? formatValue(value) : String(value);
  const isCompletedReps = variant === "workout-number" && complete && tone === "reps";
  const variantStyles = (() => {
    if (variant === "stepper") {
      return {
        justifyContent: "space-between" as const,
        borderRadius: "8px",
        minHeight: "44px",
        padding: "8px 12px",
        backgroundColor: complete ? "var(--v2-paper-2)" : "var(--v2-paper)",
        color: complete ? "var(--v2-ink)" : "var(--v2-ink-2)",
        font: "var(--font-body)",
      };
    }
    if (variant === "workout-number") {
      const isReps = tone === "reps";
      return {
        justifyContent: "center" as const,
        borderRadius: "6px",
        minHeight: "36px",
        padding: "4px 8px",
        backgroundColor: complete
          ? isReps
            ? "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))"
            : "var(--v2-paper-2)"
          : "transparent",
        color: complete
          ? isReps
            ? "var(--v2-c-success)"
            : "var(--v2-ink)"
          : "var(--v2-ink-2)",
        border: complete && isReps
          ? "1px solid color-mix(in srgb, var(--v2-c-success) 35%, var(--v2-hairline))"
          : undefined,
        fontWeight: complete && isReps ? "600" : undefined,
        font: "var(--font-secondary)",
      };
    }
    return {
      justifyContent: "space-between" as const,
      borderRadius: "8px",
      minHeight: "44px",
      padding: "10px 12px",
      backgroundColor: complete ? "var(--v2-paper-2)" : "var(--v2-paper)",
      color: complete ? "var(--v2-ink)" : "var(--v2-ink)",
      font: "var(--font-body)",
    };
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ? `${label}: ${displayText}` : displayText}
        className={[className, isCompletedReps ? "reps-complete" : ""].join(" ").trim()}
        style={{
          width: "100%",
          border: "1px solid var(--v2-hairline)",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          textAlign: "left",
          cursor: "pointer",
          ...variantStyles,
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{displayText}</span>
        {unit ? <span style={{ color: isCompletedReps ? "var(--v2-accent-ink)" : "var(--v2-ink-2)", font: "var(--font-secondary)", fontWeight: isCompletedReps ? 600 : undefined }}>{unit}</span> : null}
      </button>
      <NumberPickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label ?? (locale === "ko" ? "숫자 선택" : "Select Number")}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        formatValue={formatValue}
        unit={unit}
      />
    </>
  );
}
