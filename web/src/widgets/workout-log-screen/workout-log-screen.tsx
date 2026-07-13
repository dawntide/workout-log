"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  EmptyStateRows,
  ErrorStateRows,
  NoticeStateRows,
} from "@/components/ui/settings-state";
import { Toast } from "@/components/ui/toast";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
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
import { applyWorkoutLogWeightRulesToDraft } from "@/lib/workout-record/weight-rules";
import { migrateWorkoutRecordDraft } from "@/entities/workout-record";
import { sessionHasBodyweightExercise } from "@workout/core/bodyweight-load";
import { readWorkoutPreferences } from "@/lib/settings/workout-preferences";
import { apiPatch } from "@/lib/api";
import { BodyweightCheckBanner } from "./bodyweight-check-banner";
import { BlockJudgmentCard, SessionFeedbackNotice } from "./hybrid-feedback-banners";
import {
  amrapDeferredBannerCopy,
  amrapEveNoticeCopy,
  lightBlockBadgeCopy,
  shouldShowAmrapEveNotice,
} from "@/features/workout-log/model/progression-feedback";
import { usePlanProgressionFeedback } from "@/features/workout-log/model/use-plan-progression-feedback";
import { formatDateFriendly } from "@/lib/workout-record/last-session-summary";
import { parseSessionKey } from "@workout/core/session-key";
import { WorkoutLogOverlaySheets } from "@/features/workout-log/ui/workout-log-overlay-sheets";
import {
  WorkoutLogStackedList,
  type WorkoutLogStackedListHandle,
} from "@/features/workout-log/ui/workout-log-stacked-list";
import { WorkoutLogTuiView } from "@/features/workout-log/ui/workout-log-tui-view";
import { WorkoutLogSummarySheet } from "@/features/workout-log/ui/workout-log-summary-sheet";
import { AppPage, StickyActionBar } from "@/components/ui/page-layout";
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

// 체중 확인 안내: 마지막 확인 시각 설정 키 + 스테일 임계(14일). 이 기간 내에 확인했으면 다시 안 묻는다.
const BODYWEIGHT_CHECKED_AT_KEY = "prefs.bodyweight.checkedAtMs";
const BODYWEIGHT_CHECK_STALE_MS = 14 * 24 * 60 * 60 * 1000;

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
  const skin = useThemeSkin();
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

  // 체중: (A) 저장 시 맨몸 운동 총중량(meta.totalLoadKg) 스탬프에 전달 + (B) 체중 확인 안내가 공유.
  // 저장 컨트롤러보다 먼저 선언해 모든 프로그램의 중량풀업 로그에 총중량이 기록되도록 한다.
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(
    () => readWorkoutPreferences(initialSettings as Record<string, string | number | boolean | null>).bodyweightKg,
  );
  const [bodyweightSubmitting, setBodyweightSubmitting] = useState(false);
  const [bodyweightDismissedKey, setBodyweightDismissedKey] = useState<string | null>(null);

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

  const isEditingExistingLog = Boolean(query.logId);

  // 체중 확인 안내(B): 중량풀업을 수행하는 모든 프로그램에서, 마지막 확인 후 14일+ 지났을 때만
  // "업데이트/유지"를 권고한다(매 세션 마찰 회피). "유지"도 확인 시각을 기록해 14일간 다시 안 묻는다.
  const currentSessionKey = draft?.session.sessionKey ?? null;
  const bodyweightCheckedAtMs =
    Number((initialSettings as Record<string, unknown>)[BODYWEIGHT_CHECKED_AT_KEY]) || 0;
  const isBodyweightStale = Date.now() - bodyweightCheckedAtMs >= BODYWEIGHT_CHECK_STALE_MS;
  const showBodyweightCheck =
    !isEditingExistingLog &&
    Boolean(draft) &&
    currentSessionKey !== null &&
    bodyweightDismissedKey !== currentSessionKey &&
    isBodyweightStale &&
    sessionHasBodyweightExercise(draft?.seedExercises ?? []);
  const markBodyweightChecked = useCallback(() => {
    // 확인 시각 기록(스테일 게이트). 실패는 무시 — 다음 세션에 다시 권고될 뿐.
    void apiPatch("/api/settings", { key: BODYWEIGHT_CHECKED_AT_KEY, value: Date.now() }).catch(() => {});
  }, []);
  const handleBodyweightUpdate = useCallback(
    async (kg: number) => {
      setBodyweightSubmitting(true);
      try {
        await apiPatch("/api/settings", { key: "prefs.bodyweight.kg", value: kg });
        setBodyweightKg(kg);
        markBodyweightChecked();
      } catch {
        // 저장 실패해도 안내는 닫는다 — 다음 권고 시점에 다시 뜬다.
      } finally {
        setBodyweightSubmitting(false);
        setBodyweightDismissedKey(currentSessionKey);
      }
    },
    [currentSessionKey, markBodyweightChecked],
  );
  const handleBodyweightKeep = useCallback(() => {
    markBodyweightChecked();
    setBodyweightDismissedKey(currentSessionKey);
  }, [currentSessionKey, markBodyweightChecked]);

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
  // draft 가 없는 blocked 상태에서도 날짜 이동이 가능하도록 query.date 로 폴백한다.
  const navDateKey = sessionDate || query.date;

  // ── v0.5.1 실패 프로토콜 피드백(F1~F5) ──────────────────────────────────────
  // 판정 파생은 전부 모델(progression-feedback.ts + 훅)에 위임 — 여기는 표출 조립만.
  const progressionFeedback = usePlanProgressionFeedback({
    planId: selectedPlan?.id ?? null,
    // 저장 후 컨텍스트가 로그 뷰로 바뀔 때 최신 이벤트를 다시 읽는다(F1·F2 트리거).
    refreshKey: draft?.session.logId ?? null,
    locale,
  });
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
  const feedbackNotices = (
    <>
      {progressionFeedback.earlyDeloadBanner ? (
        // 문구는 서버 조립(feedback-catalog) — 그대로 출력(TUI와 동일 문구 보장).
        <SessionFeedbackNotice
          tone="warning"
          title={progressionFeedback.earlyDeloadBanner.title}
          body={progressionFeedback.earlyDeloadBanner.body}
        />
      ) : null}
      {progressionFeedback.blockReport ? (
        <BlockJudgmentCard
          locale={locale}
          title={progressionFeedback.blockReport.title}
          rows={progressionFeedback.blockReport.rows}
          onDismiss={progressionFeedback.dismissBlockReport}
        />
      ) : null}
      {draft?.session.amrapDeferred === true ? (
        <SessionFeedbackNotice tone="info" {...amrapDeferredBannerCopy(locale)} />
      ) : null}
      {progressionFeedback.showLightBlockBadge ? (
        <SessionFeedbackNotice tone="recovery" {...lightBlockBadgeCopy(locale)} />
      ) : null}
      {showAmrapEveNotice ? (
        <SessionFeedbackNotice tone="info" {...amrapEveNoticeCopy(locale)} />
      ) : null}
    </>
  );
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
      const base = sessionDate || query.date;
      if (!base) return;
      const d = new Date(`${base}T00:00:00`);
      d.setDate(d.getDate() + delta);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      handleDateChange(`${y}-${m}-${dd}`);
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

      {!noPlan && ((isDraftLoaded && draft) || blockedMessage) ? (
        skin === "terminal" ? (
          // ── terminal 본문: TUI 테이블 + 저장(⏎, 셸 푸터) + BW notice.
          //    DateNav·헤더는 후속. 시트/toast는 게이트 밖에서 양쪽 공유. ──
          draft ? (
            <>
              {feedbackNotices}
              {showBodyweightCheck ? (
                <BodyweightCheckBanner
                  currentKg={bodyweightKg}
                  locale={locale}
                  submitting={bodyweightSubmitting}
                  onUpdate={handleBodyweightUpdate}
                  onKeep={handleBodyweightKeep}
                />
              ) : null}
              <WorkoutLogTuiView
                onExerciseAction={handleExerciseAction}
                onOpenAddExerciseSheet={openAddExerciseSheet}
                onSave={requestSave}
              />
            </>
          ) : (
            <NoticeStateRows
              message={blockedMessage}
              tone="warning"
              preferInline
              label={locale === "ko" ? "기록 안내" : "Log notice"}
              ariaLabel={
                locale === "ko" ? "기록 안내 상태" : "Log notice state"
              }
            />
          )
        ) : (
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
            titleDisabled={isEditingExistingLog}
            titleAriaLabel={
              locale === "ko" ? "플랜 선택 열기" : "Open plan selector"
            }
            titleAriaExpanded={!isEditingExistingLog && planSheetOpen}
            titleAriaHasPopup="dialog"
          />

          {feedbackNotices}

          {showBodyweightCheck ? (
            <BodyweightCheckBanner
              currentKg={bodyweightKg}
              locale={locale}
              submitting={bodyweightSubmitting}
              onUpdate={handleBodyweightUpdate}
              onKeep={handleBodyweightKeep}
            />
          ) : null}

          <div
            style={{
              display: "flex",
              gap: "var(--v2-s-2)",
              alignItems: "stretch",
            }}
          >
            <DateNav
              dateKey={navDateKey}
              label={formatDateFriendly(navDateKey, locale)}
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
                locale === "ko"
                  ? `오늘의 운동 보기${sessionLabel ? ` · ${sessionLabel}` : ""}`
                  : `View today's workout${sessionLabel ? ` · ${sessionLabel}` : ""}`
              }
              className="v2-font-display"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--v2-s-3)",
                padding: "var(--v2-s-2) var(--v2-s-5)",
                borderRadius: "var(--v2-r-2)",
                background: "var(--v2-paper-2)",
                color: "var(--v2-ink)",
                border: "none",
                cursor: "pointer",
                minHeight: "var(--v2-s-8)",
                flexShrink: 0,
                fontWeight: 700,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "var(--v2-t-18)" }}
                aria-hidden
              >
                list_alt
              </span>
              {sessionLabel ? (
                <span
                  className="v2-mono-label"
                  style={{
                    color: "var(--v2-ink)",
                    fontSize: "var(--v2-t-12)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {sessionLabel}
                </span>
              ) : null}
            </button>
          </div>

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
          <WorkoutLogStackedList
            ref={stackedListRef}
            onExerciseAction={handleExerciseAction}
            onOpenAddExerciseSheet={openAddExerciseSheet}
          />

          <StickyActionBar>
            {totalSetsCount > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--v2-s-2)",
                  paddingBottom: "var(--v2-s-2)",
                }}
                aria-label={
                  locale === "ko"
                    ? `세트 진행률 ${completedSetsCount}/${totalSetsCount}`
                    : `Sets progress ${completedSetsCount}/${totalSetsCount}`
                }
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalSetsCount}
                aria-valuenow={completedSetsCount}
              >
                <span
                  className="v2-mono-label"
                  style={{
                    color:
                      completedSetsCount >= totalSetsCount
                        ? "var(--v2-c-success)"
                        : "var(--v2-ink-3)",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}
                >
                  {completedSetsCount}/{totalSetsCount}{" "}
                  {locale === "ko" ? "세트" : "sets"}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: "var(--v2-s-1)",
                    borderRadius: "var(--v2-r-pill)",
                    background: "var(--v2-paper-2)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (completedSetsCount / Math.max(1, totalSetsCount)) * 100)}%`,
                      height: "100%",
                      background:
                        completedSetsCount >= totalSetsCount
                          ? "var(--v2-c-success)"
                          : "var(--v2-accent)",
                      transition: "width 200ms ease, background 200ms ease",
                    }}
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={requestSave}
              disabled={workflowState === "saving"}
              className="v2-font-display"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--v2-s-2)",
                padding: "var(--v2-s-3) var(--v2-s-4)",
                borderRadius: "var(--v2-r-3)",
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
                minHeight: "var(--v2-s-8)",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "var(--v2-t-18)" }}
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
          </StickyActionBar>
          </>
          )}
        </AppPage>
        )
      ) : null}

      <WorkoutLogSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        planId={selectedPlan?.id ?? null}
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
        minHeight: "var(--v2-s-8)",
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
          style={{ fontSize: "var(--v2-t-18)", fontVariationSettings: "'wght' 400" }}
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
          minHeight: "var(--v2-touch)",
          fontWeight: 700,
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
          style={{ fontSize: "var(--v2-t-18)", fontVariationSettings: "'wght' 400" }}
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
