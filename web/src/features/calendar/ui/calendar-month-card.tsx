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
  width: 30,
  height: 30,
  background: "var(--v2-paper-3)",
  border: "none",
  borderRadius: "50%",
  cursor: "pointer",
  color: "var(--v2-ink-2)",
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
  const monthLabel = new Intl.DateTimeFormat(
    locale === "ko" ? "ko-KR" : "en-US",
    {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    },
  ).format(dateOnlyToUtcDate(anchorDate));

  return (
    <div
      style={{
        background: "var(--v2-paper)",
        borderRadius: "var(--v2-r-4)",
        padding: "var(--v2-s-4) var(--v2-s-4) var(--v2-s-5)",
        marginBottom: "var(--v2-s-6)",
        boxShadow: "var(--v2-elev-1)",
      }}
    >
      <div
        className={
          monthNavFeedback
            ? `calendar-month-feedback-${monthNavFeedback}`
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--v2-s-2)",
          marginBottom: "var(--v2-s-3)",
        }}
      >
        <button
          type="button"
          onClick={onOpenMonthPicker}
          aria-label={
            locale === "ko" ? "연월 선택 열기" : "Open year and month picker"
          }
          aria-haspopup="dialog"
          aria-expanded={monthPickerOpen}
          className="v2-pressable"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: "4px 6px",
            cursor: "pointer",
            fontFamily: "var(--v2-f-display)",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--v2-ink)",
            letterSpacing: "-0.01em",
          }}
        >
          <span>{monthLabel}</span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: "var(--v2-ink-3)" }}
          >
            expand_more
          </span>
        </button>

        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={onShiftPrevMonth}
            aria-label={locale === "ko" ? "이전 달" : "Previous month"}
            className="v2-pressable"
            style={NAV_BUTTON_STYLE}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
            >
              chevron_left
            </span>
          </button>
          <button
            type="button"
            onClick={onShiftNextMonth}
            aria-label={locale === "ko" ? "다음 달" : "Next month"}
            className="v2-pressable"
            style={NAV_BUTTON_STYLE}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
            >
              chevron_right
            </span>
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          marginBottom: 4,
        }}
      >
        {(locale === "ko" ? WEEKDAY_SHORT_KO : WEEKDAY_SHORT_EN).map((name) => (
          <div
            key={name}
            className="v2-eyebrow"
            style={{ padding: "4px 0", color: "var(--v2-ink-3)" }}
          >
            {name}
          </div>
        ))}
      </div>

      <div
        role="grid"
        aria-label={locale === "ko" ? "날짜 선택" : "Select date"}
        className={
          monthNavFeedback
            ? `calendar-month-feedback-${monthNavFeedback}`
            : undefined
        }
      >
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) => (
          <div
            key={`${anchorDate}-week-${week}`}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              textAlign: "center",
            }}
          >
            {cells.slice(week * 7, week * 7 + 7).map((dateOnly) => {
              const isToday = dateOnly === today;
              const isSelected = dateOnly === selectedDate;
              const isOutside = !dateOnly.startsWith(baseMonthKey);
              const hasDot = hasSelectedPlan && logDates.has(dateOnly);
              const cellBg = isToday
                ? "color-mix(in srgb, var(--v2-accent) 12%, var(--v2-paper))"
                : isSelected
                  ? "var(--v2-accent)"
                  : "transparent";
              const cellBorder = isToday
                ? "1px solid color-mix(in srgb, var(--v2-accent) 30%, transparent)"
                : "none";
              const cellColor = isToday
                ? "var(--v2-accent-ink)"
                : isSelected
                  ? "var(--v2-ink-on-accent)"
                  : isOutside
                    ? "var(--v2-ink-3)"
                    : "var(--v2-ink)";
              const cellRadius = isToday ? "var(--v2-r-2)" : "50%";
              const dotColor = isSelected
                ? "var(--v2-ink-on-accent)"
                : "var(--v2-accent)";

              return (
                <button
                  key={dateOnly}
                  role="gridcell"
                  onClick={() => onSelectDate(dateOnly)}
                  aria-label={formatCalendarDateAria(dateOnly, locale)}
                  aria-selected={isSelected}
                  className="v2-pressable"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
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
                    fontFamily: "var(--v2-f-num)",
                    fontSize: 14,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>{dayOfMonth(dateOnly)}</span>
                  {hasDot ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        backgroundColor: dotColor,
                        position: "absolute",
                        bottom: 3,
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
