"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "./bottom-sheet";
import { WheelPicker, generateNumberRange } from "./wheel-picker";

export type MonthYearPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  year: number;
  month: number;
  minYear: number;
  maxYear: number;
  onChange: (value: { year: number; month: number }) => void;
};

export function MonthYearPickerSheet({
  open,
  onClose,
  title,
  year,
  month,
  minYear,
  maxYear,
  onChange,
}: MonthYearPickerSheetProps) {
  const { locale } = useLocale();
  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);

  const years = useMemo(() => generateNumberRange(minYear, maxYear, 1), [minYear, maxYear]);
  const months = useMemo(() => generateNumberRange(1, 12, 1), []);

  useEffect(() => {
    if (!open) return;
    setDraftYear(year);
    setDraftMonth(month);
  }, [month, open, year]);

  const handleConfirm = useCallback(() => {
    onChange({ year: draftYear, month: draftMonth });
    onClose();
  }, [draftMonth, draftYear, onChange, onClose]);

  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onClose}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      panelClassName="month-year-picker-sheet-panel"
      primaryAction={{
        ariaLabel: locale === "ko" ? "확인" : "Confirm",
        onPress: handleConfirm,
      }}
      footer={null}
    >
      <div style={{ padding: "var(--v2-s-2) 0 var(--v2-s-5)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--v2-s-4)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", marginBottom: "var(--v2-s-2)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--v2-ink-2)" }}>{locale === "ko" ? "연도" : "Year"}</span>
            <WheelPicker
              values={years}
              value={draftYear}
              onChange={setDraftYear}
              itemHeight={48}
              visibleCount={7}
              formatValue={(value) => locale === "ko" ? `${value}년` : String(value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", marginBottom: "var(--v2-s-2)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--v2-ink-2)" }}>{locale === "ko" ? "월" : "Month"}</span>
            <WheelPicker
              values={months}
              value={draftMonth}
              onChange={setDraftMonth}
              itemHeight={48}
              visibleCount={7}
              formatValue={(value) => locale === "ko" ? `${value}월` : `${value}`}
            />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
