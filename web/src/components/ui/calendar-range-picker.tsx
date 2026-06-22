"use client";

import React, { useState, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2IconBtn } from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import {
  monthGrid,
  getDayOfWeek,
  dayOfMonth,
  monthStart,
} from "@/lib/date-utils";

type CalendarProps = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onRangeChange: (start: string, end: string) => void;
};

export function CalendarRangePicker({
  startDate,
  endDate,
  onRangeChange,
}: CalendarProps) {
  const { locale } = useLocale();
  const [viewDateStr, setViewDateStr] = useState(() => {
    const d = new Date(endDate || new Date());
    return d.toISOString().slice(0, 10);
  });

  const cells = useMemo(() => monthGrid(viewDateStr), [viewDateStr]);
  const currentMonthKey = monthStart(viewDateStr).slice(0, 7);

  const handleDateClick = (dateStr: string) => {
    if (!startDate || (startDate && endDate && startDate !== endDate)) {
      onRangeChange(dateStr, dateStr);
    } else {
      if (dateStr < startDate) {
        onRangeChange(dateStr, startDate);
      } else {
        onRangeChange(startDate, dateStr);
      }
    }
  };

  const isStart = (dateStr: string) => dateStr === startDate;
  const isEnd = (dateStr: string) => dateStr === endDate;
  const isInRange = (dateStr: string) =>
    startDate && endDate && dateStr > startDate && dateStr < endDate;

  const changeMonth = (delta: number) => {
    const d = new Date(viewDateStr);
    d.setMonth(d.getMonth() + delta);
    setViewDateStr(d.toISOString().slice(0, 10));
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const isSelectingEnd = startDate && endDate && startDate === endDate;
  const monthHeading = new Intl.DateTimeFormat(
    locale === "ko" ? "ko-KR" : "en-US",
    { year: "numeric", month: "long" },
  ).format(new Date(`${viewDateStr.slice(0, 10)}T00:00:00`));
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      weekday: "short",
    }).format(new Date(2026, 2, 29 + index)),
  );

  return (
    <div className="v2-body" style={{ color: "var(--v2-ink)" }}>
      {/* Search status header */}
      <div
        style={{
          display: "flex",
          gap: "var(--v2-s-2)",
          marginBottom: "var(--v2-s-2)",
        }}
      >
        <RangeChip
          label={locale === "ko" ? "시작일" : "Start"}
          value={startDate || "-"}
          active={Boolean(!isSelectingEnd && startDate)}
        />
        <V2Icon
          name="arrow_forward"
          style={{
            alignSelf: "center",
            color: "var(--v2-ink-3)",
            fontSize: "var(--v2-t-20)",
          }}
        />
        <RangeChip
          label={locale === "ko" ? "종료일" : "End"}
          value={
            !isSelectingEnd && endDate && startDate !== endDate ? endDate : "-"
          }
          active={Boolean(isSelectingEnd)}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--v2-s-3)",
        }}
      >
        <span
          className="v2-small"
          style={{ color: "var(--v2-accent)", fontWeight: 500 }}
        >
          {isSelectingEnd
            ? locale === "ko"
              ? "종료일을 선택해 주세요"
              : "Select an end date"
            : locale === "ko"
              ? "달력에서 날짜를 선택하세요"
              : "Choose dates from the calendar"}
        </span>
        <button
          type="button"
          className="v2-pressable v2-small"
          onClick={() => onRangeChange("", "")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--v2-s-1)",
            background: "none",
            border: "none",
            color: "var(--v2-accent)",
            cursor: "pointer",
            minHeight: "var(--v2-s-8)",
            minWidth: "var(--v2-s-8)",
            padding: "var(--v2-s-2) var(--v2-s-3)",
            borderRadius: "var(--v2-r-1)",
          }}
        >
          <V2Icon name="restart_alt" style={{ fontSize: "var(--v2-t-18)" }} />
          {locale === "ko" ? "초기화" : "Reset"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--v2-s-2)",
          padding: "0px var(--v2-s-1)",
        }}
      >
        <V2IconBtn
          icon="chevron_left"
          label={locale === "ko" ? "이전 달" : "Previous month"}
          tone="ghost"
          onClick={() => changeMonth(-1)}
        />
        <span className="v2-h3">{monthHeading}</span>
        <V2IconBtn
          icon="chevron_right"
          label={locale === "ko" ? "다음 달" : "Next month"}
          tone="ghost"
          onClick={() => changeMonth(1)}
        />
      </div>

      <div
        className="v2-mono-label"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          color: "var(--v2-ink-3)",
          marginBottom: "var(--v2-s-1)",
        }}
      >
        {weekdayLabels.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2,
        }}
      >
        {cells.map((dateStr) => {
          const start = isStart(dateStr);
          const end = isEnd(dateStr);
          const selected = start || end;
          const range = isInRange(dateStr);
          const isToday = dateStr === todayStr;
          const isOutside = !dateStr.startsWith(currentMonthKey);
          const dow = getDayOfWeek(dateStr);

          const selectionStyle: React.CSSProperties = selected
            ? {
                background: "var(--v2-accent)",
                color: "var(--v2-ink-on-accent)",
                zIndex: 2,
              }
            : range
              ? {
                  background: "var(--v2-paper-2)",
                  color: "var(--v2-ink)",
                  borderRadius: 0,
                }
              : {};

          const borderRadius = selected ? "50%" : 0;

          const dayColor = selected
            ? "var(--v2-ink-on-accent)"
            : isOutside
              ? "var(--v2-ink-3)"
              : dow === 0
                ? "var(--v2-c-danger)"
                : dow === 6
                  ? "var(--v2-c-info)"
                  : "var(--v2-ink)";

          return (
            <button
              type="button"
              key={dateStr}
              onClick={() => handleDateClick(dateStr)}
              className="v2-pressable v2-font-num"
              style={{
                aspectRatio: "1",
                background: "transparent",
                color: dayColor,
                borderRadius,
                cursor: "pointer",
                fontSize: "var(--v2-t-14)",
                fontWeight: isToday || selected
                  ? "var(--v2-w-bold)"
                  : "var(--v2-w-reg)",
                fontVariantNumeric: "tabular-nums",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "var(--v2-s-8)",
                transition: "background var(--v2-d-2) var(--v2-e-out), color var(--v2-d-2) var(--v2-e-out)",
                position: "relative",
                ...selectionStyle,
              }}
            >
              {dayOfMonth(dateStr)}
              {isToday && !selected && (
                <span
                  style={{
                    position: "absolute",
                    bottom: "var(--v2-s-1)",
                    width: "var(--v2-s-1)",
                    height: "var(--v2-s-1)",
                    borderRadius: "var(--v2-r-pill)",
                    background: "var(--v2-accent)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RangeChip({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "var(--v2-s-2)",
        background: "var(--v2-paper-2)",
        borderRadius: "var(--v2-r-2)",
        textAlign: "center",
        boxShadow: active ? "inset 0 0 0 2px var(--v2-accent)" : "none",
      }}
    >
      <div
        className="v2-mono-label"
        style={{ color: "var(--v2-ink-3)", marginBottom: 2 }}
      >
        {label}
      </div>
      <div
        className="v2-num-sm"
        style={{ color: "var(--v2-ink)", marginTop: "var(--v2-s-1)" }}
      >
        {value}
      </div>
    </div>
  );
}
