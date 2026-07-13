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
  getYear,
  monthGrid,
  monthStart,
} from "@/lib/date-utils";
import { useIsIos } from "@/lib/use-is-ios";

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
  onPickMonth: (value: { year: number; month: number }) => void;
};

const NAV_BUTTON_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "var(--v2-touch)",
  height: "var(--v2-touch)",
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
  onPickMonth,
}: CalendarMonthCardProps) {
  // iOS Safari에서는 커스텀 휠픽커 바텀시트 대신 네이티브 연월 휠픽커
  // (`<input type="month">`)를 트리거 버튼 위에 덮어 띄운다.
  const isIos = useIsIos();
  const anchorMonth = anchorDate.slice(0, 7);
  const minMonth = `${getYear(today) - 10}-01`;
  const maxMonth = `${getYear(today) + 10}-12`;

  function handleNativeMonthChange(value: string) {
    if (!value) return;
    const [yearStr, monthStr] = value.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isInteger(year) || !Number.isInteger(month)) return;
    onPickMonth({ year, month });
  }

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
        <div style={{ position: "relative", display: "inline-flex" }}>
          <button
            type="button"
            onClick={onOpenMonthPicker}
            aria-label={
              locale === "ko" ? "연월 선택 열기" : "Open year and month picker"
            }
            aria-haspopup="dialog"
            aria-expanded={monthPickerOpen}
            className="v2-pressable v2-font-display"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--v2-s-1)",
              background: "transparent",
              border: "none",
              padding: "var(--v2-s-1) var(--v2-s-1)",
              minHeight: "var(--v2-touch)",
              cursor: "pointer",
              fontSize: "var(--v2-t-16)",
              fontWeight: 700,
              color: "var(--v2-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            <span>{monthLabel}</span>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "var(--v2-t-18)", color: "var(--v2-ink-3)" }}
            >
              expand_more
            </span>
          </button>
          {isIos ? (
            <input
              type="month"
              value={anchorMonth}
              min={minMonth}
              max={maxMonth}
              onChange={(event) => handleNativeMonthChange(event.target.value)}
              aria-label={
                locale === "ko" ? "연월 선택" : "Select year and month"
              }
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                margin: 0,
                padding: 0,
                border: "none",
                opacity: 0,
                cursor: "pointer",
                // iOS Safari 자동 확대 방지 — 16px 미만 폰트 회피.
                fontSize: "var(--v2-t-16)",
              }}
            />
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "var(--v2-s-1)" }}>
          <button
            type="button"
            onClick={onShiftPrevMonth}
            aria-label={locale === "ko" ? "이전 달" : "Previous month"}
            className="v2-pressable"
            style={NAV_BUTTON_STYLE}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "var(--v2-t-18)" }}
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
              style={{ fontSize: "var(--v2-t-18)" }}
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
          marginBottom: "var(--v2-s-1)",
        }}
      >
        {(locale === "ko" ? WEEKDAY_SHORT_KO : WEEKDAY_SHORT_EN).map((name) => (
          <div
            key={name}
            className="v2-eyebrow"
            style={{ padding: "var(--v2-s-1) 0px", color: "var(--v2-ink-3)" }}
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
            role="row"
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
              const cellBg = isSelected
                ? "var(--v2-accent)"
                : isToday
                  ? "var(--v2-accent-weak)"
                  : "transparent";
              const cellColor = isSelected
                ? "var(--v2-ink-on-accent)"
                : isToday
                  ? "var(--v2-accent-ink)"
                  : isOutside
                    ? "var(--v2-ink-3)"
                    : "var(--v2-ink)";
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
                  className="v2-pressable v2-font-num"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "var(--v2-touch)",
                    height: "var(--v2-touch)",
                    margin: "0 auto",
                    padding: 0,
                    border: "none",
                    background: cellBg,
                    color: cellColor,
                    borderRadius: "50%",
                    transition: "background 0.15s ease, color 0.15s ease",
                    fontWeight: isToday || isSelected ? 700 : 400,
                    cursor: "pointer",
                    position: "relative",
                    fontSize: "var(--v2-t-14)",
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
