"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  dateOnlyInTimezone,
  WEEKDAY_SHORT_EN,
  WEEKDAY_SHORT_KO,
} from "@/features/calendar/lib/format";
import { useCalendarNavigationController } from "@/features/calendar/model/use-calendar-navigation-controller";
import { useCalendarDataController } from "@/features/calendar/model/use-calendar-data-controller";
import { useCalendarDerivedState } from "@/features/calendar/model/use-calendar-derived-state";
import {
  dateOnlyToUtcDate,
  dayOfMonth,
  monthGrid,
  monthStart,
} from "@/lib/date-utils";
import { useBodyweightKg } from "@/lib/settings/use-bodyweight";
import type { CalendarPageBootstrap } from "@/server/services/calendar/get-calendar-page-bootstrap";

// terminal(ironlog) calendar 뷰 — paper CalendarScreen의 terminal 대응(P3).
// navigation/data/derived 컨트롤러(presentation-agnostic)를 그대로 공유하고 표현만 TUI로.
// 월 그리드(logged █/▪ green·today amber·selected sel bg) + 역시간 세션 리스트.
// 첫 플랜 자동 선택(plan-scoped). 플랜 피커·날짜이동·삭제·세션 상세는 후속(P3-b).
// TermShell ViewPane 안 렌더라 외곽 패딩 없음.

export function CalendarTuiView({
  initialPlans,
  initialSessions,
  initialLogs,
  initialTimezone,
  initialToday,
}: CalendarPageBootstrap) {
  const { locale } = useLocale();
  const localeKey: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const bodyweightKg = useBodyweightKg();

  const timezone = useMemo(
    () =>
      initialTimezone ??
      (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    [initialTimezone],
  );
  const today = useMemo(
    () => initialToday ?? dateOnlyInTimezone(new Date(), timezone),
    [initialToday, timezone],
  );

  const { anchorDate, selectedDate, shiftMonthWithFeedback, selectDate, focusDate } =
    useCalendarNavigationController({ initialToday: today });
  const [planQuery] = useState("");
  const { recentSessions, allPlanLogs, currentSelectedLog, selectedPlan } =
    useCalendarDataController({
      locale,
      timezone,
      selectedDate,
      planQuery,
      initialPlans,
      initialSessions,
      initialLogs,
    });
  const { logDates, recentPastLogs } = useCalendarDerivedState({
    selectedPlan,
    selectedDate,
    today,
    timezone,
    recentSessions,
    allPlanLogs,
    currentSelectedLog,
    bodyweightKg,
    locale: localeKey,
  });

  const hasSelectedPlan = !!selectedPlan;
  const baseMonthKey = monthStart(anchorDate).slice(0, 7);
  const cells = monthGrid(anchorDate);
  const weekCount = Math.ceil(cells.length / 7);
  const weekdays = locale === "ko" ? WEEKDAY_SHORT_KO : WEEKDAY_SHORT_EN;
  const monthLabel = new Intl.DateTimeFormat(
    locale === "ko" ? "ko-KR" : "en-US",
    { year: "numeric", month: "long", timeZone: "UTC" },
  ).format(dateOnlyToUtcDate(anchorDate));

  return (
    <section
      aria-label={locale === "ko" ? "캘린더" : "Calendar"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}
    >
      {/* 월 네비 + 플랜명 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--v2-s-2)",
        }}
      >
        <NavBtn label="‹" onClick={() => shiftMonthWithFeedback(-1)} />
        <span
          className="v2-mono-label"
          style={{ color: "var(--term-fg)", whiteSpace: "nowrap" }}
        >
          {monthLabel}
        </span>
        <NavBtn label="›" onClick={() => shiftMonthWithFeedback(1)} />
        <span
          className="v2-mono-label"
          style={{
            marginLeft: "auto",
            color: "var(--term-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {selectedPlan?.name ?? (locale === "ko" ? "플랜 없음" : "no plan")}
        </span>
      </div>

      {/* 월 그리드 */}
      <div
        style={{
          padding: "var(--v2-s-3)",
          background: "var(--term-panel)",
          boxShadow: "inset 0 0 0 1px var(--term-line-box)",
          borderRadius: "var(--v2-r-2)",
        }}
      >
        <div
          aria-hidden
          className="v2-mono-label"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            textAlign: "center",
            color: "var(--term-dim)",
          }}
        >
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        {Array.from({ length: weekCount }, (_, week) => (
          <div
            key={week}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
            }}
          >
            {cells.slice(week * 7, week * 7 + 7).map((cell) => {
              const isToday = cell === today;
              const isSelected = cell === selectedDate;
              const isOutside = !cell.startsWith(baseMonthKey);
              const logged = hasSelectedPlan && logDates.has(cell);
              const color = isSelected
                ? "var(--term-amber)"
                : isToday
                  ? "var(--term-amber)"
                  : logged
                    ? "var(--term-green)"
                    : isOutside
                      ? "var(--term-ghost)"
                      : "var(--term-fg)";
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => selectDate(cell)}
                  aria-current={isSelected}
                  className="v2-font-num"
                  style={{
                    minHeight: "var(--v2-touch)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "var(--v2-s-1)",
                    border: "none",
                    cursor: "pointer",
                    background: isSelected ? "var(--term-sel)" : "transparent",
                    boxShadow: isToday
                      ? "inset 0 0 0 1px var(--term-amber)"
                      : undefined,
                    color,
                    fontWeight: isToday || isSelected || logged ? 700 : 400,
                  }}
                >
                  <span>{dayOfMonth(cell)}</span>
                  {/* 색 + 글리프 이중 인코딩: logged=▪ green / 그 외=빈칸 */}
                  <span
                    aria-hidden
                    style={{
                      fontSize: "var(--v2-t-12)",
                      lineHeight: 1,
                      color: logged ? "var(--term-green)" : "transparent",
                    }}
                  >
                    ▪
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 역시간 세션 리스트 */}
      {recentPastLogs.length > 0 ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
        >
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            {locale === "ko" ? "최근 세션" : "recent sessions"}
          </span>
          {recentPastLogs.map((log) => {
            const dateOnly = dateOnlyInTimezone(
              new Date(log.performedAt),
              timezone,
            );
            return (
              <button
                key={log.id}
                type="button"
                onClick={() => focusDate(dateOnly)}
                className="v2-mono-label"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--v2-s-2)",
                  minHeight: "var(--v2-touch)",
                  padding: "0 var(--v2-s-2)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ color: "var(--term-dim)", whiteSpace: "nowrap" }}>
                  ‹{dateOnly}›
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--term-fg)",
                  }}
                >
                  {selectedPlan?.name ?? ""}
                </span>
                <span style={{ color: "var(--term-green)" }}>✓</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function NavBtn({ label, onClick }: { label: string; onClick: () => void }) {
  const style: CSSProperties = {
    minHeight: "var(--v2-touch)",
    minWidth: "var(--v2-touch)",
    background: "transparent",
    border: "none",
    color: "var(--term-cyan)",
    cursor: "pointer",
  };
  return (
    <button type="button" onClick={onClick} className="v2-mono-label" style={style}>
      {label}
    </button>
  );
}
