"use client";

import dynamic from "next/dynamic";
import { memo, useRef, useState, type ReactNode, type TouchEvent } from "react";

const NumberPickerSheet = dynamic(
  () =>
    import("@/components/ui/number-picker-sheet").then(
      (mod) => mod.NumberPickerSheet,
    ),
  { ssr: false },
);

export function formatCompactWeightValue(value: number, step = 0.5) {
  if (!Number.isFinite(value)) return "0";
  const raw = String(step);
  const precision = raw.includes(".")
    ? Math.min(2, raw.split(".")[1]?.length ?? 0)
    : 0;
  const rounded = Number(value.toFixed(Math.max(precision, 1)));
  if (precision === 0 || Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(precision);
}

type WorkoutRecordInlinePickerProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  sheetTitle?: string;
  useLocalSheet?: boolean;
  complete?: boolean;
  failed?: boolean;
  color?: string;
};

const REPS_METRIC = "var(--v2-c-reps)";
const SUCCESS_TINT =
  "color-mix(in srgb, var(--v2-c-success) 18%, var(--v2-paper))";
const REPS_TINT =
  "color-mix(in srgb, var(--v2-c-reps) 14%, var(--v2-paper))";
const DANGER_TINT =
  "color-mix(in srgb, var(--v2-c-danger) 22%, var(--v2-paper))";

export const WorkoutRecordInlinePicker = memo(function WorkoutRecordInlinePicker({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  sheetTitle,
  useLocalSheet = true,
  complete = false,
  failed = false,
  color,
}: WorkoutRecordInlinePickerProps) {
  const [open, setOpen] = useState(false);
  const displayValue = formatValue ? formatValue(value) : String(value);
  const usesLocalSheet =
    useLocalSheet &&
    typeof min === "number" &&
    typeof max === "number" &&
    typeof step === "number";

  const isReps = color === REPS_METRIC;
  const bg = failed
    ? DANGER_TINT
    : complete
      ? isReps
        ? REPS_TINT
        : SUCCESS_TINT
      : "transparent";
  const fg = failed
    ? "var(--v2-c-danger)"
    : complete
      ? isReps
        ? "var(--v2-c-reps)"
        : "var(--v2-ink)"
      : color || "var(--v2-ink-2)";

  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "center" }}>
      <button
        type="button"
        className="workout-record-picker-btn v2-pressable v2-font-num"
        style={{
          width: "100%",
          padding: "6px 4px",
          border: "none",
          borderRadius: "var(--v2-r-1)",
          backgroundColor: bg,
          color: fg,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.5px",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          minHeight: 44,
          cursor: "pointer",
        }}
        onClick={() => {
          if (usesLocalSheet) {
            setOpen(true);
            return;
          }
          onChange(value);
        }}
        aria-label={`${label}: ${displayValue}`}
      >
        <span>{displayValue}</span>
      </button>
      {usesLocalSheet ? (
        <NumberPickerSheet
          open={open}
          onClose={() => setOpen(false)}
          title={sheetTitle ?? label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          formatValue={formatValue}
        />
      ) : null}
    </div>
  );
});

export function SwipeableSetRow({
  children,
  onDelete,
  deleteLabel,
  disabled,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
  disabled?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const offsetXRef = useRef(0);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    isDraggingRef.current = true;
    if (rowRef.current) {
      rowRef.current.style.transition = "none";
      rowRef.current.style.willChange = "transform";
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (
      disabled ||
      !isDraggingRef.current ||
      startXRef.current === null ||
      !rowRef.current
    )
      return;
    const diff = e.touches[0].clientX - startXRef.current;
    if (diff < 0) {
      offsetXRef.current = Math.max(diff, -44);
    } else if (offsetXRef.current < 0) {
      offsetXRef.current = Math.min(0, offsetXRef.current + diff);
      startXRef.current = e.touches[0].clientX;
    } else {
      offsetXRef.current = 0;
    }
    rowRef.current.style.transform =
      offsetXRef.current !== 0 ? `translateX(${offsetXRef.current}px)` : "";
  };

  const handleTouchEnd = () => {
    if (disabled || !rowRef.current) return;
    isDraggingRef.current = false;
    rowRef.current.style.willChange = "auto";
    rowRef.current.style.transition =
      "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)";
    if (offsetXRef.current < -22) {
      offsetXRef.current = -44;
      rowRef.current.style.transform = "translateX(-44px)";
    } else {
      offsetXRef.current = 0;
      rowRef.current.style.transform = "";
    }
  };

  const handleDelete = () => {
    if (rowRef.current) {
      rowRef.current.style.transform = "";
      rowRef.current.style.transition = "";
    }
    offsetXRef.current = 0;
    onDelete();
  };

  return (
    <div
      style={{
        position: "relative",
        clipPath: "inset(0 0 0 0 round 6px)",
        marginBottom: "var(--v2-s-1)",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 0,
          width: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--v2-r-0)",
        }}
      >
        <button
          type="button"
          onClick={handleDelete}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--v2-c-danger)",
            backgroundColor: "transparent",
            border: "none",
            boxShadow: "none",
            cursor: "pointer",
          }}
          aria-label={deleteLabel}
          disabled={disabled}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 22, fontVariationSettings: "'wght' 400" }}
          >
            delete
          </span>
        </button>
      </div>
      <div
        data-no-swipe="true"
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          position: "relative",
          zIndex: 1,
          backgroundColor: "var(--v2-paper)",
          borderRadius: "var(--v2-r-0)",
          touchAction: "pan-y",
          padding: "2px 0",
        }}
      >
        {children}
      </div>
    </div>
  );
}
