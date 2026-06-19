"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
import { CalendarTuiView } from "@/features/calendar/ui/calendar-tui-view";
import {
  dateOnlyInTimezone,
} from "@/features/calendar/lib/format";
import {
  useCalendarNavigationController,
} from "@/features/calendar/model/use-calendar-navigation-controller";
import {
  useCalendarDataController,
} from "@/features/calendar/model/use-calendar-data-controller";
import {
  buildPlannedExercisePreview,
  useCalendarDerivedState,
} from "@/features/calendar/model/use-calendar-derived-state";
import {
  useCalendarPlanPickerController,
} from "@/features/calendar/model/use-calendar-plan-picker-controller";
import {
  useCalendarSessionDetail,
} from "@/features/calendar/model/use-calendar-session-detail";
import {
  CalendarOverlaySheets,
} from "@/features/calendar/ui/calendar-overlay-sheets";
import { AppPage } from "@/components/ui/page-layout";
import { V2SectionHeader } from "@/components/v2/primitives";
import {
  CalendarFilterBar,
} from "@/features/calendar/ui/calendar-filter-bar";
import {
  CalendarMonthCard,
} from "@/features/calendar/ui/calendar-month-card";
import {
  CalendarRecentLogsSection,
} from "@/features/calendar/ui/calendar-recent-logs-section";
import {
  CalendarSelectedDateSection,
} from "@/features/calendar/ui/calendar-selected-date-section";
import type { CalendarPageBootstrap } from "@/server/services/calendar/get-calendar-page-bootstrap";
import { APP_ROUTES } from "@/lib/app-routes";
import { apiDelete, apiPatch } from "@/lib/api";
import { useBodyweightKg } from "@/lib/settings/use-bodyweight";

import { buildTodayLogHref } from "@/lib/workout-links";

type CalendarScreenProps = CalendarPageBootstrap;

// skin 분기 래퍼 — terminal이면 CalendarTuiView, paper는 기존 트리(무수정).
// 래퍼에서 분기해 컨트롤러가 한 쪽에서만 mount(이중 fetch 방지).
export function CalendarScreen(props: CalendarScreenProps) {
  const skin = useThemeSkin();
  if (skin === "terminal") return <CalendarTuiView {...props} />;
  return <CalendarScreenPaper {...props} />;
}

function CalendarScreenPaper({
  initialPlans,
  initialSessions,
  initialLogs,
  initialTimezone,
  initialToday,
}: CalendarScreenProps) {
  const { copy, locale } = useLocale();
  const localeKey: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const bodyweightKg = useBodyweightKg();
  const router = useRouter();
  const timezone = useMemo(
    () => initialTimezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    [initialTimezone],
  );
  const today = useMemo(
    () => initialToday ?? dateOnlyInTimezone(new Date(), timezone),
    [initialToday, timezone],
  );

  const {
    anchorDate,
    selectedDate,
    monthPickerOpen,
    setMonthPickerOpen,
    monthNavFeedback,
    shiftMonthWithFeedback,
    handleMonthPickerChange,
    selectDate,
    focusDate,
  } = useCalendarNavigationController({
    initialToday: today,
  });
  const [planQuery, setPlanQuery] = useState("");
  const {
    planId,
    setPlanId,
    recentSessions,
    allPlanLogs,
    currentSelectedLog,
    selectedLogLoading,
    completedLogKey,
    error,
    setError,
    loading,
    selectedPlan,
    filteredPlans,
    refresh,
    applyOptimisticDateMove,
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
  const currentLogKey = planId ? `${planId}|${selectedDate}` : "";

  const {
    generatedById,
    logDates,
    selectedCtx,
    selectedSession,
    isPastDateCreationBlocked,
    loggedSummary,
    nextSessionLabel,
    loggedDayLabel,
    selectedSessionWDLabel,
    recentPastLogs,
  } = useCalendarDerivedState({
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
  const { selectedSessionDetail } = useCalendarSessionDetail({
    locale,
    planId,
    selectedSessionId: selectedSession?.id ?? null,
    currentSelectedLogId: currentSelectedLog?.id ?? null,
    setError,
  });
  const plannedExercises = useMemo(
    () =>
      buildPlannedExercisePreview(
        selectedSessionDetail?.snapshot ?? null,
        bodyweightKg,
        localeKey,
      ),
    [selectedSessionDetail, bodyweightKg, localeKey],
  );

  const workoutHref = currentSelectedLog
    ? buildTodayLogHref({ planId, date: selectedDate, logId: currentSelectedLog.id })
    : planId
      ? buildTodayLogHref({ planId, date: selectedDate, autoGenerate: false })
      : APP_ROUTES.todayLog;

  const isAutoProgressionPlan = selectedPlan?.params?.autoProgression === true;

  // ── Move date (direct picker) ────────────────────────────────────────────────
  const [moveDateConflictOpen, setMoveDateConflictOpen] = useState(false);
  const [movingDate, setMovingDate] = useState(false);

  const handleMoveDateCommit = useCallback(async (newDate: string) => {
    if (!currentSelectedLog?.id || movingDate) return;

    // 오토프로그레션 플랜의 경우 이동 범위 내 다른 기록 충돌 체크
    if (isAutoProgressionPlan) {
      const oldDate = selectedDate;
      const [minDate, maxDate] = oldDate < newDate ? [oldDate, newDate] : [newDate, oldDate];
      const hasConflict = Array.from(logDates).some(
        (d) => d !== oldDate && d > minDate && d < maxDate,
      );
      if (hasConflict) {
        setMoveDateConflictOpen(true);
        return;
      }
    }

    setMovingDate(true);
    const newPerformedAt = new Date(`${newDate}T12:00:00Z`).toISOString();
    applyOptimisticDateMove(currentSelectedLog.id, newDate, newPerformedAt);
    focusDate(newDate);

    try {
      await apiPatch(`/api/logs/${currentSelectedLog.id}`, {
        performedAt: newPerformedAt,
        timezone,
      });
      refresh();
      router.refresh();
    } catch {
      refresh();
    } finally {
      setMovingDate(false);
    }
  }, [currentSelectedLog?.id, movingDate, isAutoProgressionPlan, selectedDate, logDates, timezone, focusDate, applyOptimisticDateMove, refresh, router]);

  // ── Delete confirm sheet ─────────────────────────────────────────────────────
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleOpenDeleteLog = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const handleCloseDeleteLog = useCallback(() => {
    setDeleteConfirmOpen(false);
  }, []);

  const [deletingLog, setDeletingLog] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    if (!currentSelectedLog?.id || deletingLog) return;
    const logId = currentSelectedLog.id;
    setDeletingLog(true);
    // 낙관적 업데이트: API 완료 전 즉시 제거
    applyOptimisticDelete(logId);
    setDeleteConfirmOpen(false);
    try {
      await apiDelete(`/api/logs/${logId}`);
      refresh();
      router.refresh();
    } catch {
      // 실패 시 서버 데이터로 복원
      refresh();
    } finally {
      setDeletingLog(false);
    }
  }, [currentSelectedLog?.id, deletingLog, applyOptimisticDelete, refresh, router]);

  return (
    <>
      <AppPage>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: "var(--v2-s-5)",
            paddingBottom: "var(--v2-s-8)",
          }}
        >
          <V2SectionHeader
            level="h1"
            eyebrow={locale === "ko" ? "캘린더" : "Calendar"}
            title={copy.calendar.title}
            description={
              locale === "ko"
                ? "날짜별 기록과 예정 세션을 같은 구조에서 탐색하고 조정합니다."
                : "Browse logged sessions and planned days from one consistent calendar workspace."
            }
          />

          <CalendarFilterBar
            locale={locale}
            selectedPlanName={selectedPlan?.name ?? null}
            onOpenPlanPicker={openPlanPicker}
          />

          <CalendarMonthCard
            locale={locale}
            anchorDate={anchorDate}
            selectedDate={selectedDate}
            today={today}
            hasSelectedPlan={!!selectedPlan}
            logDates={logDates}
            monthNavFeedback={monthNavFeedback}
            monthPickerOpen={monthPickerOpen}
            onSelectDate={selectDate}
            onShiftPrevMonth={() => shiftMonthWithFeedback(-1)}
            onShiftNextMonth={() => shiftMonthWithFeedback(1)}
            onOpenMonthPicker={() => setMonthPickerOpen(true)}
            onPickMonth={handleMonthPickerChange}
          />

          <CalendarSelectedDateSection
            locale={locale}
            copy={copy.calendarMain}
            selectedDate={selectedDate}
            today={today}
            selectedPlanName={selectedPlan?.name ?? null}
            error={error}
            isLoading={loading || selectedLogLoading || (!!planId && completedLogKey !== currentLogKey)}
            currentSelectedLog={currentSelectedLog}
            loggedSummary={loggedSummary}
            workoutHref={workoutHref}
            selectedSession={selectedSession}
            selectedSessionWDLabel={selectedSessionWDLabel}
            plannedExercises={plannedExercises}
            isPastDateCreationBlocked={isPastDateCreationBlocked}
            selectedCtx={selectedCtx}
            nextSessionLabel={nextSessionLabel}
            loggedDayLabel={loggedDayLabel}
            onMoveDateCommit={handleMoveDateCommit}
            onDeleteLog={handleOpenDeleteLog}
          />

          <CalendarRecentLogsSection
            locale={locale}
            title={copy.calendarMain.recentLogs}
            timezone={timezone}
            selectedPlanName={selectedPlan?.name ?? null}
            generatedById={generatedById}
            recentPastLogs={recentPastLogs}
            onSelectDate={focusDate}
          />
        </div>
      </AppPage>

      <CalendarOverlaySheets
        copy={copy.calendar}
        planSheetOpen={planSheetOpen}
        planQuery={planQuery}
        filteredPlans={filteredPlans}
        selectedPlanId={planId}
        onClosePlanSheet={closePlanPicker}
        onPlanQueryChange={setPlanQuery}
        onPlanQuerySubmit={submitFirstMatchingPlan}
        onSelectPlan={selectPlan}
        monthPickerOpen={monthPickerOpen}
        anchorDate={anchorDate}
        today={today}
        onCloseMonthPicker={() => setMonthPickerOpen(false)}
        onMonthChange={handleMonthPickerChange}
        moveDateConflictOpen={moveDateConflictOpen}
        moveDateConflictCopy={{
          title: copy.calendarMain.moveDateBlockedTitle,
          description: copy.calendarMain.moveDateBlockedDescription,
          close: locale === "ko" ? "확인" : "OK",
        }}
        onCloseMoveDateConflict={() => setMoveDateConflictOpen(false)}
        deleteConfirmOpen={deleteConfirmOpen}
        deleteCopy={{
          title: copy.calendarMain.deleteLog,
          confirm: copy.calendarMain.deleteLogConfirm,
          cancel: locale === "ko" ? "취소" : "Cancel",
        }}
        onCloseDeleteConfirm={handleCloseDeleteLog}
        onConfirmDelete={handleConfirmDelete}
      />
    </>
  );
}
