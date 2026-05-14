"use client";

import { memo } from "react";

export const Stats1RMControls = memo(function Stats1RMControls({
  locale,
  selectedExerciseName,
  selectedProgramLabel,
  rangePreset,
  isControlPending,
  onOpenExerciseSheet,
  onOpenProgramSheet,
  onOpenRangeSheet,
  onSelectPreset,
}: {
  locale: "ko" | "en";
  selectedExerciseName: string | null;
  selectedProgramLabel: string;
  rangePreset: 7 | 30 | 90 | 180 | 365 | "CUSTOM";
  isControlPending: boolean;
  onOpenExerciseSheet: () => void;
  onOpenProgramSheet: () => void;
  onOpenRangeSheet: () => void;
  onSelectPreset: (preset: 7 | 30 | 90 | 365) => void;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--v2-s-2)" }}>
        <button
          type="button"
          onClick={onOpenExerciseSheet}
          className="btn"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px var(--v2-s-4)",
            border: "none",
            borderRadius: "var(--v2-r-1)",
            backgroundColor: "var(--v2-paper)",
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "var(--v2-elev-1)",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: "11px", color: "var(--v2-ink-2)", marginBottom: "2px", fontWeight: 600 }}>
              {locale === "ko" ? "운동종목" : "Exercise"}
            </div>
            <div
              style={{
                font: "var(--font-body)",
                fontWeight: 700,
                color: "var(--v2-accent)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: isControlPending ? 0.72 : 1,
              }}
            >
              {selectedExerciseName ?? (locale === "ko" ? "선택" : "Select")}
            </div>
          </div>
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ color: "var(--v2-ink-2)", flexShrink: 0, marginLeft: "4px", fontSize: 18 }}
          >
            expand_more
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenProgramSheet}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px var(--v2-s-4)",
            border: "none",
            borderRadius: "var(--v2-r-1)",
            backgroundColor: "var(--v2-paper)",
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "var(--v2-elev-1)",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: "11px", color: "var(--v2-ink-2)", marginBottom: "2px", fontWeight: 600 }}>
              {locale === "ko" ? "필터링" : "Filter"}
            </div>
            <div
              style={{
                font: "var(--font-body)",
                fontWeight: 600,
                color: "var(--v2-ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: isControlPending ? 0.72 : 1,
              }}
            >
              {selectedProgramLabel}
            </div>
          </div>
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ color: "var(--v2-ink-2)", flexShrink: 0, marginLeft: "4px", fontSize: 18 }}
          >
            expand_more
          </span>
        </button>
      </div>

      <div style={{ marginTop: "2px" }}>
        <div style={{ background: "var(--v2-paper-3)", borderRadius: "var(--v2-r-1)", overflow: "hidden", padding: "3px" }}>
          <div style={{ display: "flex", gap: "2px" }}>
            {[
              { label: "7D", value: 7 },
              { label: "1M", value: 30 },
              { label: "3M", value: 90 },
              { label: "ALL", value: 365 },
            ].map((option) => {
              const isActive = rangePreset === option.value;
              return (
                <button
                  key={option.label}
                  onClick={() => onSelectPreset(option.value as 7 | 30 | 90 | 365)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    border: "none",
                    borderRadius: "var(--v2-r-1)",
                    fontSize: "12px",
                    fontWeight: isActive ? 700 : 500,
                    cursor: "pointer",
                    background: isActive ? "var(--v2-paper)" : "transparent",
                    color: isActive ? "var(--v2-ink)" : "var(--v2-ink-2)",
                    boxShadow: isActive ? "var(--v2-elev-1)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
            <button
              onClick={onOpenRangeSheet}
              aria-label={locale === "ko" ? "기간 지정" : "Choose date range"}
              style={{
                width: "38px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                borderRadius: "var(--v2-r-1)",
                background: rangePreset === "CUSTOM" ? "var(--v2-paper)" : "transparent",
                color: rangePreset === "CUSTOM" ? "var(--v2-accent)" : "var(--v2-ink-3)",
                cursor: "pointer",
                boxShadow: rangePreset === "CUSTOM" ? "var(--v2-elev-1)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, fontVariationSettings: "'wght' 400", lineHeight: 1 }}
                aria-hidden="true"
              >
                calendar_today
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
});
