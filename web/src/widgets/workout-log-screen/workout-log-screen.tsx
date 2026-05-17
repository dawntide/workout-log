"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { readWorkoutLogQueryContext } from "@/features/workout-log/model/query-context";
import { useWorkoutLogSaveController } from "@/features/workout-log/model/use-workout-log-save-controller";
import { applyWorkoutLogWeightRulesToDraft } from "@/features/workout-log/model/weight-rules";
import { formatDateFriendly } from "@/features/workout-log/model/last-session-summary";
import { parseSessionKey } from "@/lib/session-key";
import { WorkoutLogOverlaySheets } from "@/features/workout-log/ui/workout-log-overlay-sheets";
import {
  WorkoutLogKeypadPanel,
  type KeypadInitialFocus,
} from "@/features/workout-log/ui/workout-log-keypad-panel";
import { WorkoutLogSummarySheet } from "@/features/workout-log/ui/workout-log-summary-sheet";
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
  sessionExerciseIdsAtom,
  completedExercisesCountAtom,
  workflowStateAtom,
} from "@/features/workout-log/store/workout-log-atoms";
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
  const draft = useAtomValue(draftAtom);
  const exerciseIds = useAtomValue(sessionExerciseIdsAtom);
  const completedExercisesCount = useAtomValue(completedExercisesCountAtom);
  const setDraft = useSetAtom(draftAtom);
  const setProgramEntryState = useSetAtom(programEntryStateAtom);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [showSaveSuccessToast, setShowSaveSuccessToast] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [keypadInitialFocus, setKeypadInitialFocus] =
    useState<KeypadInitialFocus | null>(null);

  const dismissSaveSuccessToast = useCallback(
    () => setShowSaveSuccessToast(false),
    [],
  );

  const jumpKeypadToExercise = useCallback((focus: KeypadInitialFocus) => {
    setKeypadInitialFocus(focus);
  }, []);

  const persistenceKey =
    selectedPlanId && query.date ? `${selectedPlanId}:${query.date}` : null;
  const isWorkoutLogRouteActive = pathname?.startsWith("/workout/log") ?? true;

  // 운동기록 화면은 뷰포트 내에서 컨텐츠가 정확히 맞도록 lock.
  // 하단 네비게이션 영역을 reserve 하고 수직 스크롤이 발생하지 않게 한다.
  useEffect(() => {
    const previous = document.body.dataset.viewportLocked;
    document.body.dataset.viewportLocked = "true";
    return () => {
      if (previous === undefined) {
        delete document.body.dataset.viewportLocked;
      } else {
        document.body.dataset.viewportLocked = previous;
      }
    };
  }, []);

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
        setDraft(data.draft);
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
    resolveWeightWithCurrentPreferences: (weight, _id, _name) => weight,
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

  const { failureProtocolSheet, handleFailureProtocolSelect, requestSave } =
    useWorkoutLogSaveController({
      locale,
      selectedPlan,
      bodyweightKg: null,
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
            router.refresh();
          }, 600);
        },
        [router],
      ),
    });

  const isEditingExistingLog = Boolean(query.logId);

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

  const sessionDate = draft?.session.sessionDate ?? "";
  const sessionLabel = useMemo(() => {
    const key = draft?.session.sessionKey;
    if (!key) return null;
    const parsed = parseSessionKey(key);
    if (!parsed) return null;
    if (parsed.kind === "cycle-wave" || parsed.kind === "date-progression") {
      return `C${parsed.cycle}W${parsed.week}D${parsed.day}`;
    }
    if (parsed.kind === "wave") {
      return `W${parsed.week}D${parsed.day}`;
    }
    return null;
  }, [draft?.session.sessionKey]);
  const sessionTypeLabel = useMemo(() => {
    const t = draft?.session.sessionType?.trim();
    if (!t) return null;
    if (sessionLabel && t === sessionLabel) return null;
    if (sessionLabel && t.endsWith(`D${draft?.session.day ?? ""}`)) return null;
    return t;
  }, [draft?.session.sessionType, draft?.session.day, sessionLabel]);
  const shiftDate = useCallback(
    (delta: number) => {
      if (!sessionDate) return;
      const d = new Date(`${sessionDate}T00:00:00`);
      d.setDate(d.getDate() + delta);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      handleDateChange(`${y}-${m}-${dd}`);
    },
    [sessionDate, handleDateChange],
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

      {!noPlan && isDraftLoaded && draft ? (
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            minHeight: 0,
            // 부모(.app-shell__page)의 flex 계산이 일부 모바일 환경에서
            // child 로 height 를 전파하지 못하는 경우를 대비한 안전망.
            height: "100%",
            gap: "var(--v2-s-1)",
            overflow: "hidden",
          }}
        >
          {/* 컴팩트 상단 바 */}
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-1)",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={isEditingExistingLog ? undefined : openPlanSheet}
              disabled={isEditingExistingLog}
              aria-expanded={isEditingExistingLog ? false : planSheetOpen}
              aria-haspopup="dialog"
              aria-label={
                locale === "ko" ? "플랜 선택 열기" : "Open plan selector"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--v2-s-1)",
                padding: "var(--v2-s-1) var(--v2-s-3)",
                borderRadius: "var(--v2-r-2)",
                background: "var(--v2-paper-2)",
                color: "var(--v2-ink)",
                border: "none",
                cursor: isEditingExistingLog ? "default" : "pointer",
                fontWeight: 700,
                fontSize: "var(--v2-t-12)",
                minHeight: "var(--v2-s-7)",
                width: "100%",
                textAlign: "left",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {selectedPlan?.name ?? ""}
              </span>
              {!isEditingExistingLog && (
                <span
                  className="material-symbols-outlined v2-font-display"
                  aria-hidden
                  style={{
                    fontSize: "var(--v2-t-16)",
                    color: "var(--v2-ink-3)",
                    flexShrink: 0,
                  }}
                >
                  unfold_more
                </span>
              )}
            </button>

            <div
              style={{
                display: "flex",
                gap: "var(--v2-s-1)",
                alignItems: "stretch",
              }}
            >
              {sessionLabel && (
                <span
                  className="v2-mono-label"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "var(--v2-s-1)",
                    padding: "var(--v2-s-1) var(--v2-s-3)",
                    borderRadius: "var(--v2-r-2)",
                    background:
                      "color-mix(in srgb, var(--v2-accent) 14%, var(--v2-paper))",
                    color: "var(--v2-accent-ink)",
                    fontWeight: 700,
                    fontSize: "var(--v2-t-12)",
                    letterSpacing: "0.04em",
                    minHeight: "var(--v2-s-7)",
                    flexShrink: 0,
                  }}
                  aria-label={
                    locale === "ko" ? `세션 ${sessionLabel}` : `Session ${sessionLabel}`
                  }
                >
                  {sessionLabel}
                  {sessionTypeLabel && (
                    <span
                      style={{
                        marginLeft: 4,
                        color: "var(--v2-ink-3)",
                        fontWeight: 600,
                        fontSize: "var(--v2-t-eyebrow)",
                      }}
                    >
                      · {sessionTypeLabel}
                    </span>
                  )}
                </span>
              )}
              <DateNav
                dateKey={sessionDate}
                label={formatDateFriendly(sessionDate, locale)}
                onPrev={() => shiftDate(-1)}
                onNext={() => shiftDate(1)}
                onPick={handleDateChange}
                ariaLabel={copy.workoutLog.dateChangeAriaLabel}
                prevLabel={copy.workoutLog.dateNavPrev}
                nextLabel={copy.workoutLog.dateNavNext}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => setSummaryOpen(true)}
                aria-label={
                  locale === "ko" ? "오늘의 운동 보기" : "View today's workout"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--v2-s-1)",
                  padding: "var(--v2-s-2) var(--v2-s-3)",
                  borderRadius: "var(--v2-r-2)",
                  background: "var(--v2-paper-2)",
                  color: "var(--v2-ink)",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "var(--v2-t-12)",
                  minHeight: "var(--v2-s-7)",
                  flexShrink: 0,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "var(--v2-t-16)" }}
                  aria-hidden
                >
                  list_alt
                </span>
                <span
                  className="v2-mono-label"
                  style={{
                    color:
                      completedExercisesCount > 0
                        ? "var(--v2-c-success)"
                        : "var(--v2-ink-3)",
                    fontSize: "var(--v2-t-eyebrow)",
                  }}
                >
                  {completedExercisesCount}/{exerciseIds.length}
                </span>
              </button>
            </div>

            {isEditingExistingLog ? (
              <p
                className="v2-small"
                style={{
                  fontSize: "var(--v2-t-label)",
                  color: "var(--v2-ink-3)",
                  margin: 0,
                }}
              >
                {copy.workoutLog.planLockedWhileEditing}
              </p>
            ) : null}
          </section>

          {/* 인라인 키패드 패널 — 메인 영역 */}
          <WorkoutLogKeypadPanel
            initialFocus={keypadInitialFocus}
            onExerciseAction={handleExerciseAction}
            onOpenAddExerciseSheet={openAddExerciseSheet}
          />

          <button
            type="button"
            onClick={requestSave}
            disabled={workflowState === "saving"}
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--v2-s-1)",
              padding: "var(--v2-s-1) var(--v2-s-4)",
              borderRadius: "var(--v2-r-2)",
              background:
                workflowState === "saving"
                  ? "var(--v2-paper-2)"
                  : "var(--v2-c-success)",
              color:
                workflowState === "saving"
                  ? "var(--v2-ink-3)"
                  : "var(--v2-ink-on-accent)",
              border: "none",
              cursor:
                workflowState === "saving" ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: "var(--v2-t-12)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              minHeight: "var(--v2-s-7)",
              flexShrink: 0,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "var(--v2-t-16)" }}
              aria-hidden
            >
              done_all
            </span>
            {workflowState === "saving"
              ? copy.workoutLog.saveInProgress
              : isEditingExistingLog
                ? copy.workoutLog.saveEdited
                : copy.workoutLog.saveCreate}
          </button>
        </div>
      ) : null}

      <WorkoutLogSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        onJumpToExercise={jumpKeypadToExercise}
      />

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

function DateNav({
  dateKey,
  label,
  onPrev,
  onNext,
  onPick,
  ariaLabel,
  prevLabel,
  nextLabel,
  style,
}: {
  dateKey: string;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onPick: (newDate: string) => void;
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--v2-s-1)",
        padding: "var(--v2-s-1) var(--v2-s-3)",
        borderRadius: "var(--v2-r-2)",
        background: "var(--v2-paper-2)",
        minHeight: "var(--v2-s-7)",
        ...style,
      }}
    >
      <button
        type="button"
        className="date-nav-btn"
        aria-label={prevLabel}
        onClick={onPrev}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: "var(--v2-t-16)", fontVariationSettings: "'wght' 400" }}
        >
          chevron_left
        </span>
      </button>
      <label
        className="v2-font-display"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          fontWeight: 700,
          fontSize: "var(--v2-t-12)",
          color: "var(--v2-ink)",
        }}
      >
        <span aria-live="polite">{label}</span>
        <input
          type="date"
          aria-label={ariaLabel}
          value={dateKey}
          onChange={(e) => {
            if (e.target.value) onPick(e.target.value);
          }}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
          }}
        />
      </label>
      <button
        type="button"
        className="date-nav-btn"
        aria-label={nextLabel}
        onClick={onNext}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: "var(--v2-t-16)", fontVariationSettings: "'wght' 400" }}
        >
          chevron_right
        </span>
      </button>
    </span>
  );
}

export function WorkoutLogScreen(props: WorkoutRecordPageProps) {
  return (
    <JotaiProvider>
      <WorkoutLogScreenContent {...props} />
    </JotaiProvider>
  );
}
