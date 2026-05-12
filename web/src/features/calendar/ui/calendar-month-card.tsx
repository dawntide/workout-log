"use client";

import { memo } from "react";
import {
  formatCalendarDateAria,
  WEEKDAY_SHORT_EN,
  WEEKDAY_SHORT_KO,
} from "@/features/calendar/lib/format";
import {
  dateOnlyToUtcDate,
  dayOfMonth,
  monthGrid,
  monthStart,
} from "@/lib/date-utils";

type CalendarMonthCardProps = {
  locale: "ko" | "en";
  anchorDate: string;
  selectedDate: string;
  today: string;
  hasSelectedPlan: boolean;
  logDates: Set<string>;
  monthNavFeedback: "" | "prev" | "next";
  monthPickerOpen: boolean;
  onSelectDate: (dateOnly: string) => void;
  onShiftPrevMonth: () => void;
  onShiftNextMonth: () => void;
  onOpenMonthPicker: () => void;
};

const NAV_BUTTON_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  background: "var(--color-surface-container-high)",
  border: "none",
  borderRadius: "50%",
  cursor: "pointer",
  color: "var(--color-text-muted)",
  flexShrink: 0,
} as const;

export const CalendarMonthCard = memo(function CalendarMonthCard({
  locale,
  anchorDate,
  selectedDate,
  today,
  hasSelectedPlan,
  logDates,
  monthNavFeedback,
  monthPickerOpen,
  onSelectDate,
  onShiftPrevMonth,
  onShiftNextMonth,
  onOpenMonthPicker,
}: CalendarMonthCardProps) {
  const baseMonthKey = monthStart(anchorDate).slice(0, 7);
  const cells = monthGrid(anchorDate);
  const monthLabel = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(dateOnlyToUtcDate(anchorDate));

  return (
    <div
      style={{
        background: "var(--color-surface-container-low)",
        borderRadius: "24px",
        padding: "16px 16px 20px",
        marginBottom: "var(--space-lg)",
      }}
    >
      <div
        className={monthNavFeedback ? `calendar-month-feedback-${monthNavFeedback}` : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <button
          type="button"
          onClick={onOpenMonthPicker}
          aria-label={locale === "ko" ? "연월 선택 열기" : "Open year and month picker"}
          aria-haspopup="dialog"
          aria-expanded={monthPickerOpen}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "transparent",
            border: "none",
            padding: "4px 6px",
            cursor: "pointer",
            fontFamily: "var(--font-headline-family)",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          <span>{monthLabel}</span>
          <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-text-muted)" }}>expand_more</span>
        </button>

        <div style={{ display: "flex", gap: "4px" }}>
          <button
            type="button"
            onClick={onShiftPrevMonth}
            aria-label={locale === "ko" ? "이전 달" : "Previous month"}
            style={NAV_BUTTON_STYLE}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>chevron_left</span>
          </button>
          <button
            type="button"
            onClick={onShiftNextMonth}
            aria-label={locale === "ko" ? "다음 달" : "Next month"}
            style={NAV_BUTTON_STYLE}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>chevron_right</span>
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          marginBottom: "4px",
        }}
      >
        {(locale === "ko" ? WEEKDAY_SHORT_KO : WEEKDAY_SHORT_EN).map((name) => (
          <div
            key={name}
            style={{
              padding: "4px 0",
              fontFamily: "var(--font-label-family)",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            {name}
          </div>
        ))}
      </div>

      <div
        role="grid"
        aria-label={locale === "ko" ? "날짜 선택" : "Select date"}
        className={monthNavFeedback ? `calendar-month-feedback-${monthNavFeedback}` : undefined}
      >
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) => (
          <div key={`${anchorDate}-week-${week}`} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }}>
            {cells.slice(week * 7, week * 7 + 7).map((dateOnly) => {
              const isToday = dateOnly === today;
              const isSelected = dateOnly === selectedDate;
              const isOutside = !dateOnly.startsWith(baseMonthKey);
              const hasDot = hasSelectedPlan && logDates.has(dateOnly);
              const cellBg = isToday
                ? "color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-container-low))"
                : isSelected
                  ? "var(--color-primary)"
                  : "transparent";
              const cellBorder = isToday
                ? "1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)"
                : "none";
              const cellColor = isToday
                ? "var(--color-primary-strong)"
                : isSelected
                  ? "var(--color-text-on-primary)"
                  : isOutside
                    ? "var(--color-text-subtle)"
                    : "var(--color-text)";
              const cellRadius = isToday ? "10px" : "50%";
              const dotColor = isSelected
                ? "var(--color-text-on-primary)"
                : "var(--color-calendar-dot)";

              return (
                <button
                  key={dateOnly}
                  role="gridcell"
                  onClick={() => onSelectDate(dateOnly)}
                  aria-label={formatCalendarDateAria(dateOnly, locale)}
                  aria-selected={isSelected}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "36px",
                    height: "36px",
                    margin: "4px auto",
                    padding: 0,
                    border: cellBorder,
                    background: cellBg,
                    color: cellColor,
                    borderRadius: cellRadius,
                    transition: "background 0.15s ease, color 0.15s ease",
                    fontWeight: isToday || isSelected ? 700 : 400,
                    cursor: "pointer",
                    position: "relative",
                    fontSize: "14px",
                    fontFamily: "var(--font-label-family)",
                  }}
                >
                  <span>{dayOfMonth(dateOnly)}</span>
                  {hasDot ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        backgroundColor: dotColor,
                        position: "absolute",
                        bottom: "3px",
                      }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
});
