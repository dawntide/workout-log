"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  EmptyStateRows,
  ErrorStateRows,
  NoticeStateRows,
} from "@/components/ui/settings-state";
import { useLocale } from "@/components/locale-provider";
import {
  useWorkoutLogAddExerciseController,
} from "@/features/workout-log/model/use-workout-log-add-exercise-controller";
import { useWorkoutLogContextController } from "@/features/workout-log/model/use-workout-log-context-controller";
import { useWorkoutLogDerivedState } from "@/features/workout-log/model/use-workout-log-derived-state";
import { useWorkoutLogDraftPersistence } from "@/features/workout-log/model/use-workout-log-draft-persistence";
import { useWorkoutLogEditorController } from "@/features/workout-log/model/use-workout-log-editor-controller";
import { useWorkoutLogInlinePickerController } from "@/features/workout-log/model/use-workout-log-inline-picker-controller";
import { useWorkoutLogKeyboardOpenEffect } from "@/features/workout-log/model/use-workout-log-keyboard-open-effect";
import { useWorkoutLogPlanSheetController } from "@/features/workout-log/model/use-workout-log-plan-sheet-controller";
import { readWorkoutLogQueryContext } from "@/features/workout-log/model/query-context";
import { useWorkoutLogSaveController } from "@/features/workout-log/model/use-workout-log-save-controller";
import { applyWorkoutLogWeightRulesToDraft } from "@/features/workout-log/model/weight-rules";
import { WorkoutLogOverlaySheets } from "@/features/workout-log/ui/workout-log-overlay-sheets";
import { WorkoutSessionContent } from "@/features/workout-log/ui/workout-session-content";
import type {
  WorkoutProgramExerciseEntryStateMap,
  WorkoutRecordDraft,
  WorkoutWorkflowState,
} from "@/entities/workout-record";
import type { WorkoutLogInitialContext, WorkoutLogPageBootstrap } from "@/server/services/workout-log/get-workout-log-page-bootstrap";
import { Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai";
import { draftAtom, isDraftLoadedAtom, programEntryStateAtom, saveErrorAtom, workflowStateAtom } from "@/features/workout-log/store/workout-log-atoms";
import WorkoutRecordLoading from "@/app/workout/log/loading";

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
  const setDraft = useSetAtom(draftAtom);
  const setProgramEntryState = useSetAtom(programEntryStateAtom);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const persistenceKey =
    selectedPlanId && query.date ? `${selectedPlanId}:${query.date}` : null;
  const isWorkoutLogRouteActive = pathname?.startsWith("/workout/log") ?? true;

  const {
    pendingRestorePrompt,
    resolveRestorePrompt,
    isRestoreFlowActive,
    registerReloadDraftContext,
    hasRestoredDraft,
  } = useWorkoutLogDraftPersistence({
    persistenceKey,
    enabled: isWorkoutLogRouteActive,
    onRestoreAccepted: useCallback((data) => {
      setDraft(data.draft);
      setProgramEntryState(data.programEntryState);
    }, [setDraft, setProgramEntryState]),
  });

  const handleNoPlanDetected = useCallback(async () => {
    await alert({
      title: locale === "ko" ? "프로그램 선택 필요" : "Program Selection Required",
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

  const {
    handleExerciseAction,
    handleSessionMemoChange,
    handleSessionDateChange,
  } = useWorkoutLogEditorController();

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
    addDraftIncrementKg,
    addDraftIncrementInfo,
    addDraftTotalLoadKg,
    openAddExerciseSheet,
    closeAddExerciseSheet,
    selectExerciseOption,
    handleAddExercise,
  } = useWorkoutLogAddExerciseController({
    open: addSheetOpen,
    setOpen: setAddSheetOpen,
    locale,
    resolveWeightWithCurrentPreferences: (weight, id, name) => weight, // Refactored to handle inside controller via atom
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

  const {
    inlinePickerRequest,
    openInlinePicker,
    closeInlinePicker,
    handleInlinePickerChange,
  } = useWorkoutLogInlinePickerController({
    onExerciseAction: handleExerciseAction,
  });

  useWorkoutLogKeyboardOpenEffect();

  const {
    failureProtocolSheet,
    handleFailureProtocolSelect,
    requestSave,
  } = useWorkoutLogSaveController({
    locale,
    selectedPlan,
    bodyweightKg: null, // this gets pulled inside the controller via atom
    persistenceKey,
    onSaved: useCallback(() => {
      router.replace("/workout/log");
    }, [router]),
  });

  const isEditingExistingLog = Boolean(query.logId); // simplified definition since it doesn't need the actual draft object here

  // Date change handler:
  // - While editing an existing log: update the draft in-place (date is sent to API on save)
  // - While creating a new log: navigate the URL to the new date (reloads context for that date)
  const handleDateChange = useCallback(
    (newDateKey: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateKey)) return;
      if (isEditingExistingLog) {
        handleSessionDateChange(newDateKey);
      } else {
        const url = new URL(window.location.href);
        url.searchParams.set("date", newDateKey);
        if (selectedPlan?.id) {
          url.searchParams.set("planId", selectedPlan.id);
        }
        router.push(url.pathname + url.search);
      }
    },
    [isEditingExistingLog, handleSessionDateChange, router, selectedPlan],
  );

  return (
    <>
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
      <EmptyStateRows when={noPlan} label={copy.workoutLog.noPlans} />

      {!noPlan && isDraftLoaded ? (
        <WorkoutSessionContent
          copy={copy.workoutLog}
          locale={locale}
          selectedPlanName={selectedPlan?.name ?? ""}
          isEditingExistingLog={isEditingExistingLog}
          planSheetOpen={planSheetOpen}
          onOpenPlanSheet={openPlanSheet}
          onExerciseAction={handleExerciseAction}
          onOpenInlinePicker={openInlinePicker}
          onOpenAddExerciseSheet={openAddExerciseSheet}
          onSessionMemoChange={handleSessionMemoChange}
          onDateChange={handleDateChange}
          workflowState={workflowState}
          onSave={requestSave}
        />
      ) : null}

      <WorkoutLogOverlaySheets
        locale={locale}
        copy={copy.workoutLog}
        inlinePickerRequest={inlinePickerRequest}
        onCloseInlinePicker={closeInlinePicker}
        onChangeInlinePicker={handleInlinePickerChange}
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
        addDraftIncrementKg={addDraftIncrementKg}
        addDraftIncrementInfo={addDraftIncrementInfo}
        addDraftTotalLoadKg={addDraftTotalLoadKg}
        bodyweightKg={null}
        resolveWeightWithCurrentPreferences={(w) => w}
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
