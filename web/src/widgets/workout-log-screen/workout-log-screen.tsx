"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  EmptyStateRows,
  ErrorStateRows,
  NoticeStateRows,
} from "@/components/ui/settings-state";
import { Toast } from "@/components/ui/toast";
import { useLocale } from "@/components/locale-provider";
import {
  useWorkoutLogAddExerciseController,
} from "@/features/workout-log/model/use-workout-log-add-exercise-controller";
import { useWorkoutLogContextController } from "@/features/workout-log/model/use-workout-log-context-controller";
import { useWorkoutLogDraftPersistence } from "@/features/workout-log/model/use-workout-log-draft-persistence";
import { useWorkoutLogEditorController } from "@/features/workout-log/model/use-workout-log-editor-controller";
import { useWorkoutLogKeyboardOpenEffect } from "@/features/workout-log/model/use-workout-log-keyboard-open-effect";
import { useWorkoutLogPlanSheetController } from "@/features/workout-log/model/use-workout-log-plan-sheet-controller";
import { readWorkoutLogQueryContext } from "@/lib/workout-record/query-context";
import { useWorkoutLogSaveController } from "@/features/workout-log/model/use-workout-log-save-controller";
import { useBodyweightCheck } from "@/features/workout-log/model/use-bodyweight-check";
import { useRef5SessionCancel } from "@/features/workout-log/model/use-ref5-session-cancel";
import {
  addDaysToDateKey,
  deriveSessionLabel,
  deriveSessionTypeLabel,
} from "@/features/workout-log/model/session-labels";
import { applyWorkoutLogWeightRulesToDraft } from "@/lib/workout-record/weight-rules";
import { migrateWorkoutRecordDraft } from "@/entities/workout-record";
import { BodyweightCheckBanner } from "./bodyweight-check-banner";
import { DateNav } from "./date-nav";
import { SessionFeedbackNotices } from "./session-feedback-notices";
import { SessionSaveBar } from "./session-save-bar";
import { useRestTimer } from "@/features/workout-log/model/use-rest-timer";
import { restPersistenceKeyAtom } from "@/features/workout-log/store/workout-log-atoms";
import { SessionToolbar } from "./session-toolbar";
import { shouldShowAmrapEveNotice } from "@/features/workout-log/model/progression-feedback";
import { usePlanProgressionFeedback } from "@/features/workout-log/model/use-plan-progression-feedback";
import { formatDateFriendly } from "@/lib/workout-record/last-session-summary";
import { WorkoutLogOverlaySheets } from "@/features/workout-log/ui/workout-log-overlay-sheets";
import {
  WorkoutLogStackedList,
  type WorkoutLogStackedListHandle,
} from "@/features/workout-log/ui/workout-log-stacked-list";
import { WorkoutLogSummarySheet } from "@/features/workout-log/ui/workout-log-summary-sheet";
import { AppPage } from "@/components/ui/page-layout";
import { V2SectionHeader } from "@/components/v2/primitives";
import type {
  WorkoutLogInitialContext,
  WorkoutLogPageBootstrap,
} from "@/server/services/workout-log/get-workout-log-page-bootstrap";
import { Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai";
import {
  draftAtom,
  isDraftLoadedAtom,
  programEntryStateAtom,
  saveErrorAtom,
  completedSetsCountAtom,
  totalSetsCountAtom,
  workflowStateAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import WorkoutRecordLoading from "./workout-record-skeleton";
import { Ref5SessionStartPanel } from "@/features/workout-log/ui/ref5-session-start-panel";
import { Ref5WindowProgressPanel } from "@/components/ref5/ref5-window-progress-panel";
import { isRef5PlanParams } from "@/lib/workout-record/ref5-plan";

type WorkoutRecordPageProps = WorkoutLogPageBootstrap & {
  initialContext?: WorkoutLogInitialContext | null;
};

function WorkoutLogScreenContent({
  initialPlans,
  initialSettings,
  initialContext,
}: WorkoutRecordPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { copy, locale } = useLocale();
  const { alert } = useAppDialog();
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const [query, setQuery] = useState(() => readWorkoutLogQueryContext());
  const [selectedPlanId, setSelectedPlanId] = useState(() => {
    const initialQuery = readWorkoutLogQueryContext();
    return initialQuery.planId || "";
  });
  const workflowState = useAtomValue(workflowStateAtom);
  const saveError = useAtomValue(saveErrorAtom);
  const isDraftLoaded = useAtomValue(isDraftLoadedAtom);
  const draft = useAtomValue(draftAtom);
  const completedSetsCount = useAtomValue(completedSetsCountAtom);
  const totalSetsCount = useAtomValue(totalSetsCountAtom);
  const setDraft = useSetAtom(draftAtom);
  const setProgramEntryState = useSetAtom(programEntryStateAtom);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [showSaveSuccessToast, setShowSaveSuccessToast] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const stackedListRef = useRef<WorkoutLogStackedListHandle>(null);

  const dismissSaveSuccessToast = useCallback(
    () => setShowSaveSuccessToast(false),
    [],
  );

  const persistenceKey =
    selectedPlanId && query.date
      ? `${selectedPlanId}:${query.date}:${query.sessionId ?? "new"}`
      : null;
  // 휴식 타이머 컨트롤러는 화면에 한 번만 마운트한다 — 틱·Wake Lock·만료음을 전담한다.
  const restTimer = useRestTimer(persistenceKey);
  const setRestPersistenceKey = useSetAtom(restPersistenceKeyAtom);
  useEffect(() => {
    setRestPersistenceKey(persistenceKey);
  }, [persistenceKey, setRestPersistenceKey]);
  const isWorkoutLogRouteActive = pathname?.startsWith("/workout/log") ?? true;
  const isEditingExistingLog = Boolean(query.logId);
  const isStartedRef5Session = Boolean(draft?.session.ref5);

  const {
    pendingRestorePrompt,
    resolveRestorePrompt,
    isRestoreFlowActive,
    registerReloadDraftContext,
    hasRestoredDraft,
  } = useWorkoutLogDraftPersistence({
    persistenceKey,
    enabled: isWorkoutLogRouteActive,
    onRestoreAccepted: useCallback(
      (data) => {
        // 구버전 draft(weightKgPerSet 없음)는 단일 weightKg에서 세트별 배열로 마이그레이션.
        setDraft(migrateWorkoutRecordDraft(data.draft));
        setProgramEntryState(data.programEntryState);
      },
      [setDraft, setProgramEntryState],
    ),
  });

  const handleNoPlanDetected = useCallback(async () => {
    await alert({
      title:
        locale === "ko" ? "프로그램 선택 필요" : "Program Selection Required",
      message:
        locale === "ko"
          ? "선택된 플랜이 없습니다.\n프로그램 스토어로 이동합니다."
          : "No plan is selected.\nYou will be moved to the program store.",
      buttonText: locale === "ko" ? "이동" : "Go",
    });
    router.replace("/program-store");
  }, [alert, locale, router]);

  const openAddSheetFromBootstrap = useCallback(() => {
    setAddSheetOpen(true);
  }, []);

  const {
    plans,
    loading,
    error,
    selectedPlan,
    noPlan,
    blockedMessage,
    ref5ResumeNotice,
    ref5StartContext,
    hydrateRef5GeneratedSession,
    handlePlanChange,
    retryCurrentContextLoad,
  } = useWorkoutLogContextController({
    initialPlans,
    initialSettings,
    initialContext: initialContext ?? null,
    query,
    setQuery,
    selectedPlanId,
    setSelectedPlanId,
    locale,
    browserTimezone,
    applyWeightRulesToDraft: applyWorkoutLogWeightRulesToDraft,
    hasRestoredDraft,
    registerReloadDraftContext,
    onNoPlanDetected: handleNoPlanDetected,
    onBootstrapOpenAddSheet: openAddSheetFromBootstrap,
  });

  const { handleExerciseAction, handleSessionDateChange } =
    useWorkoutLogEditorController();

  const {
    addDraft,
    setAddDraft,
    exerciseQuery,
    setExerciseQuery,
    exerciseOptionsError,
    setExerciseOptionsError,
    exerciseOptionsLoading,
    filteredExerciseOptions,
    selectedExerciseOption,
    openAddExerciseSheet,
    closeAddExerciseSheet,
    selectExerciseOption,
    handleAddExercise,
  } = useWorkoutLogAddExerciseController({
    open: addSheetOpen,
    setOpen: setAddSheetOpen,
    locale,
  });

  const {
    planSheetOpen,
    planQuery,
    setPlanQuery,
    openPlanSheet,
    closePlanSheet,
    planSheetOptions,
  } = useWorkoutLogPlanSheetController({
    plans,
    selectedPlan,
    selectedPlanId,
    onPlanChange: handlePlanChange,
  });

  useWorkoutLogKeyboardOpenEffect();

  // 체중은 저장 컨트롤러가 총중량(meta.totalLoadKg) 스탬프에 쓰므로 그보다 먼저 읽는다.
  const currentSessionKey = draft?.session.sessionKey ?? null;
  const {
    bodyweightKg,
    submitting: bodyweightSubmitting,
    showCheck: showBodyweightCheck,
    handleUpdate: handleBodyweightUpdate,
    handleKeep: handleBodyweightKeep,
  } = useBodyweightCheck({
    initialSettings: initialSettings as Record<string, unknown>,
    sessionKey: currentSessionKey,
    seedExercises: draft?.seedExercises ?? [],
    enabled: !isEditingExistingLog && !isStartedRef5Session && Boolean(draft),
  });

  const { failureProtocolSheet, handleFailureProtocolSelect, requestSave } =
    useWorkoutLogSaveController({
      locale,
      selectedPlan,
      bodyweightKg,
      persistenceKey,
      onSaved: useCallback(
        (savedLogId: string | null) => {
          setShowSaveSuccessToast(true);
          window.setTimeout(() => {
            if (savedLogId) {
              router.replace(
                `/workout/session/${encodeURIComponent(savedLogId)}?fresh=1`,
              );
            } else {
              router.replace("/workout/log");
            }
            // router.refresh() 를 호출하지 않는다.
            // 저장 server action(submitWorkoutLogAction)이 이미 revalidatePath 로
            // 홈/캘린더/기록/통계의 Router Cache 를 무효화하므로 신선도는 보장된다.
            // 여기서 refresh 하면 떠나는 기록 화면의 부트스트랩 effect 가 재실행되며
            // (force-dynamic 페이지가 새 initialContext/initialPlans 참조를 내려줘
            //  setLoading(true)) 로딩 스켈레톤이 한 번 깜빡인다 — 저장→축하 사이의
            // 부자연스러운 재로드의 원인이었다.
          }, 600);
        },
        [router],
      ),
    });

  const {
    canCancel: canCancelRef5Session,
    cancelling: cancellingRef5Session,
    handleCancel: handleCancelRef5Session,
  } = useRef5SessionCancel({
    planId: selectedPlanId,
    sessionId: query.sessionId,
    dateKey: query.date,
    persistenceKey,
    enabled: isStartedRef5Session && !isEditingExistingLog,
    locale,
  });

  const handleDateChange = useCallback(
    (newDateKey: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateKey)) return;
      if (isEditingExistingLog || isStartedRef5Session) {
        handleSessionDateChange(newDateKey);
      } else {
        const url = new URL(window.location.href);
        url.searchParams.set("date", newDateKey);
        if (selectedPlan?.id) {
          url.searchParams.set("planId", selectedPlan.id);
        }
        url.searchParams.delete("sessionId");
        router.push(url.pathname + url.search);
      }
    },
    [isEditingExistingLog, isStartedRef5Session, handleSessionDateChange, router, selectedPlan],
  );

  const sessionDate = draft?.session.sessionDate ?? "";
  // draft 가 없는 blocked 상태에서도 날짜 이동이 가능하도록 query.date 로 폴백한다.
  const navDateKey = sessionDate || query.date;

  // ── v0.5.1 실패 프로토콜 피드백(F1~F5) ──────────────────────────────────────
  // 판정 파생은 전부 모델(progression-feedback.ts + 훅)에 위임 — 여기는 표출 조립만.
  const progressionFeedback = usePlanProgressionFeedback({
    planId: selectedPlan?.id ?? ref5StartContext?.planId ?? null,
    // 저장 후 컨텍스트가 로그 뷰로 바뀔 때 최신 이벤트를 다시 읽는다(F1·F2 트리거).
    refreshKey: draft?.session.logId ?? null,
    locale,
  });
  const isRef5SelectedPlan = Boolean(
    ref5StartContext ||
      draft?.session.ref5 ||
      isRef5PlanParams(selectedPlan?.params),
  );
  const ref5WindowProgress = isRef5SelectedPlan ? (
    <Ref5WindowProgressPanel
      status={progressionFeedback.ref5Status}
      locale={locale}
      loading={
        progressionFeedback.progressionStateLoading ||
        !progressionFeedback.progressionStateSettled
      }
    />
  ) : null;
  const todayDateKey = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: browserTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    [browserTimezone],
  );
  // F5: 오늘 세션을 저장한 상태에서 다음 세션이 판정(AMRAP) 세션이면 예고(정보만, 차단 아님).
  const showAmrapEveNotice =
    Boolean(draft?.session.logId) &&
    sessionDate === todayDateKey &&
    shouldShowAmrapEveNotice({
      program: progressionFeedback.program,
      week: draft?.session.week ?? null,
      day: draft?.session.day ?? null,
    });
  const sessionLabel = deriveSessionLabel(draft?.session.sessionKey);
  const sessionTypeLabel = deriveSessionTypeLabel({
    sessionType: draft?.session.sessionType,
    day: draft?.session.day,
    sessionLabel,
  });
  const shiftDate = useCallback(
    (delta: number) => {
      const next = addDaysToDateKey(sessionDate || query.date, delta);
      if (next) handleDateChange(next);
    },
    [sessionDate, query.date, handleDateChange],
  );

  return (
    <>
      <Toast
        show={showSaveSuccessToast}
        message={copy.workoutLog.saveSuccess}
        onDismiss={dismissSaveSuccessToast}
        durationMs={2000}
        ariaLabel={copy.workoutLog.saveSuccess}
      />
      {loading && !isRestoreFlowActive && <WorkoutRecordLoading />}
      <ErrorStateRows
        message={error}
        title={
          locale === "ko"
            ? "기록 화면 데이터를 불러오지 못했습니다"
            : "Could not load workout log data"
        }
        onRetry={retryCurrentContextLoad}
      />
      <NoticeStateRows
        message={saveError}
        tone="warning"
        label={copy.workoutLog.validationLabel}
        ariaLabel={copy.workoutLog.validationAriaLabel}
      />
      <EmptyStateRows className="v2-font-display" when={noPlan} label={copy.workoutLog.noPlans} />

      {!noPlan && ref5StartContext ? (
        <AppPage>
          <V2SectionHeader
            level="h1"
            eyebrow={locale === "ko" ? "오늘의 운동" : "TODAY"}
            title={selectedPlan?.name ?? ref5StartContext.planName}
            onTitleClick={openPlanSheet}
            titleAriaLabel={locale === "ko" ? "플랜 선택 열기" : "Open plan selector"}
            titleAriaExpanded={planSheetOpen}
            titleAriaHasPopup="dialog"
          />
          <DateNav
            dateKey={ref5StartContext.dateKey}
            label={formatDateFriendly(ref5StartContext.dateKey, locale)}
            onPrev={() => shiftDate(-1)}
            onNext={() => shiftDate(1)}
            onPick={handleDateChange}
            ariaLabel={copy.workoutLog.dateChangeAriaLabel}
            prevLabel={copy.workoutLog.dateNavPrev}
            nextLabel={copy.workoutLog.dateNavNext}
          />
          {ref5WindowProgress}
          <Ref5SessionStartPanel
            key={`${ref5StartContext.planId}:${ref5StartContext.dateKey}`}
            planId={ref5StartContext.planId}
            planName={ref5StartContext.planName}
            dateKey={ref5StartContext.dateKey}
            locale={locale}
            defaultBodyweightKg={bodyweightKg}
            onStarted={hydrateRef5GeneratedSession}
          />
        </AppPage>
      ) : null}

      {!noPlan && !ref5StartContext && ((isDraftLoaded && draft) || blockedMessage) ? (
        <AppPage>
          <V2SectionHeader
            level="h1"
            eyebrow={
              (locale === "ko" ? "오늘의 운동" : "TODAY") +
              (sessionTypeLabel ? ` · ${sessionTypeLabel}` : "")
            }
            title={selectedPlan?.name ?? ""}
            description={
              isEditingExistingLog
                ? copy.workoutLog.planLockedWhileEditing
                : undefined
            }
            onTitleClick={openPlanSheet}
            titleDisabled={isEditingExistingLog || isStartedRef5Session}
            titleAriaLabel={
              locale === "ko" ? "플랜 선택 열기" : "Open plan selector"
            }
            titleAriaExpanded={!isEditingExistingLog && !isStartedRef5Session && planSheetOpen}
            titleAriaHasPopup="dialog"
          />

          <SessionFeedbackNotices
            feedback={progressionFeedback}
            amrapDeferred={draft?.session.amrapDeferred === true}
            showAmrapEveNotice={showAmrapEveNotice}
            locale={locale}
          />

          {ref5WindowProgress}

          {showBodyweightCheck ? (
            <BodyweightCheckBanner
              currentKg={bodyweightKg}
              locale={locale}
              submitting={bodyweightSubmitting}
              onUpdate={handleBodyweightUpdate}
              onKeep={handleBodyweightKeep}
            />
          ) : null}

          <SessionToolbar
            dateKey={navDateKey}
            locale={locale}
            copy={copy.workoutLog}
            onShiftDate={shiftDate}
            onPickDate={handleDateChange}
            dateDisabled={isStartedRef5Session}
            sessionLabel={sessionLabel}
            canCancelSession={canCancelRef5Session}
            cancelling={cancellingRef5Session}
            onCancelSession={() => {
              void handleCancelRef5Session();
            }}
            onOpenSummary={
              isStartedRef5Session ? null : () => setSummaryOpen(true)
            }
          />

          {!draft ? (
            <NoticeStateRows
              message={blockedMessage}
              tone="warning"
              preferInline
              label={locale === "ko" ? "기록 안내" : "Log notice"}
              ariaLabel={
                locale === "ko" ? "기록 안내 상태" : "Log notice state"
              }
            />
          ) : (
            <>
              <NoticeStateRows
                message={ref5ResumeNotice}
                tone="neutral"
                preferInline
                label={locale === "ko" ? "미완료 세션 재개" : "Unfinished session resumed"}
                ariaLabel={locale === "ko" ? "REF5 세션 재개 안내" : "REF5 session resume notice"}
              />
              <WorkoutLogStackedList
                ref={stackedListRef}
                onExerciseAction={handleExerciseAction}
                onOpenAddExerciseSheet={draft.session.ref5 ? undefined : openAddExerciseSheet}
              />

              <SessionSaveBar
                completedSetsCount={completedSetsCount}
                totalSetsCount={totalSetsCount}
                saving={workflowState === "saving"}
                isEditingExistingLog={isEditingExistingLog}
                onSave={requestSave}
                locale={locale}
                copy={copy.workoutLog}
                rest={{
                  active: restTimer.active,
                  remaining: restTimer.remaining,
                  target: restTimer.target,
                  ratio: restTimer.ratio,
                  onExtend: restTimer.extend,
                  onSkip: restTimer.skip,
                }}
              />
            </>
          )}
        </AppPage>
      ) : null}

      {!isStartedRef5Session ? (
        <WorkoutLogSummarySheet
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          planId={selectedPlan?.id ?? null}
        />
      ) : null}

      <WorkoutLogOverlaySheets
        locale={locale}
        copy={copy.workoutLog}
        planSheetOpen={planSheetOpen}
        planQuery={planQuery}
        onChangePlanQuery={setPlanQuery}
        onClosePlanSheet={closePlanSheet}
        planSheetOptions={planSheetOptions}
        addSheetOpen={addSheetOpen}
        addDraft={addDraft}
        setAddDraft={setAddDraft}
        exerciseQuery={exerciseQuery}
        setExerciseQuery={setExerciseQuery}
        exerciseOptionsError={exerciseOptionsError}
        setExerciseOptionsError={setExerciseOptionsError}
        exerciseOptionsLoading={exerciseOptionsLoading}
        filteredExerciseOptions={filteredExerciseOptions}
        selectedExerciseOption={selectedExerciseOption}
        onSelectExerciseOption={selectExerciseOption}
        onCloseAddExerciseSheet={closeAddExerciseSheet}
        onAddExercise={handleAddExercise}
        pendingRestorePrompt={pendingRestorePrompt}
        onResolveRestorePrompt={resolveRestorePrompt}
        failureProtocolSheet={failureProtocolSheet}
        onSelectFailureProtocol={handleFailureProtocolSelect}
      />
    </>
  );
}

export function WorkoutLogScreen(props: WorkoutRecordPageProps) {
  return (
    <JotaiProvider>
      <WorkoutLogScreenContent {...props} />
    </JotaiProvider>
  );
}
