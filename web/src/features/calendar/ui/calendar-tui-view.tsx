"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  dateOnlyInTimezone,
  formatVolume,
  WEEKDAY_SHORT_EN,
  WEEKDAY_SHORT_KO,
} from "@/features/calendar/lib/format";
import { useCalendarNavigationController } from "@/features/calendar/model/use-calendar-navigation-controller";
import { useCalendarDataController } from "@/features/calendar/model/use-calendar-data-controller";
import { useCalendarDerivedState } from "@/features/calendar/model/use-calendar-derived-state";
import { useCalendarPlanPickerController } from "@/features/calendar/model/use-calendar-plan-picker-controller";
import { SearchSelectSheet } from "@/components/ui/search-select-sheet";
import { APP_ROUTES } from "@/lib/app-routes";
import {
  dateOnlyToUtcDate,
  dayOfMonth,
  monthGrid,
  monthStart,
} from "@/lib/date-utils";
import { useBodyweightKg } from "@/lib/settings/use-bodyweight";
import { formatPerformedHistoryLine } from "@/lib/workout-notation";
import { buildTodayLogHref } from "@/lib/workout-links";
import { apiDelete } from "@/lib/api";
import type { CalendarWorkoutLogForDate } from "@/features/calendar/model/types";
import type { CalendarPageBootstrap } from "@/server/services/calendar/get-calendar-page-bootstrap";

// 선택일 로그를 운동별 한 줄 요약으로(히스토리 Weight × Reps 표기 재사용).
function summarizeDayLog(
  log: CalendarWorkoutLogForDate | null,
): { name: string; line: string }[] {
  if (!log) return [];
  const byEx = new Map<string, { weightKg: number; reps: number }[]>();
  for (const s of log.sets) {
    if ((s.reps ?? 0) <= 0) continue;
    const arr = byEx.get(s.exerciseName) ?? [];
    arr.push({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0 });
    byEx.set(s.exerciseName, arr);
  }
  return Array.from(byEx, ([name, sets]) => ({
    name,
    line: formatPerformedHistoryLine(sets),
  }));
}

// terminal(ironlog) calendar 뷰 — paper CalendarScreen의 terminal 대응(P3).
// navigation/data/derived 컨트롤러(presentation-agnostic)를 그대로 공유하고 표현만 TUI로.
// 월 그리드(logged █/▪ green·today amber·selected sel bg) + 역시간 세션 리스트.
// 선택일 상세는 운동별 한 줄 + 집계(세트·볼륨, paper Metric 대응) + [수정]/[del]
// (삭제는 paper handleConfirmDelete와 동일 계약, useAppDialog confirm 재사용).
// 첫 플랜 자동 선택(plan-scoped). 날짜이동·세션 상세는 후속(P3-b).
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
  const router = useRouter();
  const { confirm } = useAppDialog();

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
  const [planQuery, setPlanQuery] = useState("");
  const {
    planId,
    setPlanId,
    recentSessions,
    allPlanLogs,
    currentSelectedLog,
    selectedLogLoading,
    selectedPlan,
    filteredPlans,
    refresh,
    applyOptimisticDelete,
  } = useCalendarDataController({
      locale,
      timezone,
      selectedDate,
      planQuery,
      initialPlans,
      initialSessions,
      initialLogs,
    });
  const { logDates, loggedSummary, recentPastLogs } = useCalendarDerivedState({
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
  const {
    planSheetOpen,
    openPlanPicker,
    closePlanPicker,
    submitFirstMatchingPlan,
    selectPlan,
  } = useCalendarPlanPickerController({
    filteredPlans,
    setPlanId,
    resetPlanQuery: () => setPlanQuery(""),
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
  const daySummary = summarizeDayLog(currentSelectedLog);
  const detailHref = buildTodayLogHref({
    planId,
    date: selectedDate,
    logId: currentSelectedLog?.id,
  });

  // 로그 삭제 — paper handleConfirmDelete와 동일 계약(낙관 삭제→apiDelete→refresh,
  // 실패 시 서버 데이터로 복원). overlay 시트 대신 useAppDialog confirm 재사용.
  const handleDeleteLog = async () => {
    const logId = currentSelectedLog?.id;
    if (!logId) return;
    const ok = await confirm({
      title: locale === "ko" ? "기록 삭제" : "Delete Log",
      message:
        locale === "ko"
          ? "이 운동 기록을 삭제하시겠습니까?"
          : "Delete this workout log?",
      confirmText: locale === "ko" ? "삭제" : "Delete",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    applyOptimisticDelete(logId);
    try {
      await apiDelete(`/api/logs/${logId}`);
      refresh();
      router.refresh();
    } catch {
      refresh();
    }
  };

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
        <button
          type="button"
          onClick={openPlanPicker}
          className="v2-mono-label"
          style={{
            marginLeft: "auto",
            minWidth: 0,
            minHeight: "var(--v2-touch)",
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-1)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--term-dim)",
          }}
        >
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedPlan?.name ?? (locale === "ko" ? "플랜 없음" : "no plan")}
          </span>
          <span>▾</span>
        </button>
        <a
          href={APP_ROUTES.plansManage}
          className="v2-mono-label"
          aria-label={locale === "ko" ? "플랜 관리 열기" : "Open plan management"}
          style={{
            minHeight: "var(--v2-touch)",
            display: "inline-flex",
            alignItems: "center",
            padding: "0 var(--v2-s-2)",
            color: "var(--term-amber)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {locale === "ko" ? "[관리]" : "[manage]"}
        </a>
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

      {/* 선택일 상세 — 그날 기록 + 기록/수정 링크 */}
      <div
        style={{
          padding: "var(--v2-s-3)",
          background: "var(--term-panel)",
          boxShadow: "inset 0 0 0 1px var(--term-line-box)",
          borderRadius: "var(--v2-r-2)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-1)",
        }}
      >
        <div
          className="v2-mono-label"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "var(--term-dim)",
          }}
        >
          <span>‹{selectedDate}›</span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}>
            <a
              href={detailHref}
              className="v2-mono-label"
              style={{ color: "var(--term-cyan)", textDecoration: "none" }}
            >
              {currentSelectedLog
                ? locale === "ko"
                  ? "[수정]"
                  : "[edit]"
                : locale === "ko"
                  ? "[+ 기록]"
                  : "[+ log]"}
            </a>
            {currentSelectedLog ? (
              <button
                type="button"
                onClick={handleDeleteLog}
                aria-label={locale === "ko" ? "기록 삭제" : "Delete log"}
                className="v2-mono-label"
                style={{
                  minHeight: "var(--v2-touch)",
                  padding: "0 var(--v2-s-2)",
                  background: "transparent",
                  border: "none",
                  color: "var(--term-red)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                [del]
              </button>
            ) : null}
          </span>
        </div>
        {selectedLogLoading ? (
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            …
          </span>
        ) : daySummary.length > 0 ? (
          <>
            {daySummary.map((row, i) => (
              <div
                key={i}
                className="v2-mono-label"
                style={{ display: "flex", gap: "var(--v2-s-2)" }}
              >
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
                  {row.name}
                </span>
                <span style={{ color: "var(--term-cyan)", whiteSpace: "nowrap" }}>
                  {row.line}
                </span>
              </div>
            ))}
            {/* 집계 readout — paper Metric(sets·volume) 대응 (loggedSummary 공유) */}
            {loggedSummary.totalSets > 0 ? (
              <div
                className="v2-mono-label"
                style={{
                  display: "flex",
                  gap: "var(--v2-s-2)",
                  color: "var(--term-dim)",
                }}
              >
                <span>
                  {locale === "ko" ? "세트" : "sets"}{" "}
                  <span style={{ color: "var(--term-fg)" }}>
                    {loggedSummary.totalSets}
                  </span>
                </span>
                <span>·</span>
                <span>
                  {locale === "ko" ? "볼륨" : "vol"}{" "}
                  <span style={{ color: "var(--term-fg)" }}>
                    {formatVolume(loggedSummary.totalVolume)}
                  </span>
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
            {locale === "ko" ? "기록 없음" : "no log"}
          </span>
        )}
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

      {/* 플랜 피커 시트 (공유 SearchSelectSheet, terminal CSS 리스킨) */}
      <SearchSelectSheet
        open={planSheetOpen}
        title={locale === "ko" ? "플랜 선택" : "Select plan"}
        description={
          locale === "ko"
            ? "캘린더에 표시할 플랜을 고릅니다."
            : "Choose the plan to show in the calendar."
        }
        onClose={closePlanPicker}
        closeLabel={locale === "ko" ? "닫기" : "Close"}
        query={planQuery}
        placeholder={locale === "ko" ? "플랜 검색..." : "Search plans..."}
        onQueryChange={setPlanQuery}
        onQuerySubmit={submitFirstMatchingPlan}
        resultsAriaLabel={locale === "ko" ? "플랜 목록" : "Plan list"}
        emptyText={locale === "ko" ? "검색 결과가 없습니다." : "No results found."}
        options={filteredPlans.map((plan) => ({
          key: plan.id,
          label: plan.name,
          active: plan.id === planId,
          ariaCurrent: plan.id === planId,
          onSelect: () => selectPlan(plan.id),
        }))}
      />
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
