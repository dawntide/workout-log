"use client";

import { memo } from "react";
import { PlanSelectorButton } from "@/components/ui/plan-selector-button";
import { AppTextarea } from "@/components/ui/form-controls";
import { FieldLabel, StickyActionBar } from "@/components/ui/page-layout";
import { V2PrimaryBtn } from "@/components/v2/primitives";
import type {
  ExerciseRowAction,
  InlinePickerRequest,
} from "@/features/workout-log/model/editor-actions";
import { formatDateFriendly } from "@/features/workout-log/model/last-session-summary";
import { ExerciseRow } from "@/features/workout-log/ui/exercise-row";
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";
import type { WorkoutWorkflowState } from "@/entities/workout-record";
import { useAtomValue } from "jotai";
import {
  draftAtom,
  workoutPreferencesAtom,
  lastSessionAtom,
  completedExercisesCountAtom,
  sessionExerciseIdsAtom,
} from "../store/workout-log-atoms";

type WorkoutSessionContentProps = {
  copy: AppCopy["workoutLog"];
  locale: AppLocale;
  selectedPlanName: string;
  isEditingExistingLog: boolean;
  planSheetOpen: boolean;
  onOpenPlanSheet: () => void;
  onExerciseAction: (exerciseId: string, action: ExerciseRowAction) => void;
  onOpenInlinePicker: (request: InlinePickerRequest) => void;
  onOpenAddExerciseSheet: () => void;
  onSessionMemoChange: (value: string) => void;
  onDateChange: (newDateKey: string) => void;
  workflowState: WorkoutWorkflowState;
  onSave: () => void;
};

type WorkoutExerciseCardsListProps = {
  locale: AppLocale;
  bodyweightKg: number | null;
  exerciseIds: string[];
  onExerciseAction: (exerciseId: string, action: ExerciseRowAction) => void;
  onOpenInlinePicker: (request: InlinePickerRequest) => void;
};

function areExerciseIdsEqual(left: string[], right: string[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function areWorkoutExerciseCardsListPropsEqual(
  previous: WorkoutExerciseCardsListProps,
  next: WorkoutExerciseCardsListProps,
) {
  return (
    previous.locale === next.locale &&
    previous.bodyweightKg === next.bodyweightKg &&
    previous.onExerciseAction === next.onExerciseAction &&
    previous.onOpenInlinePicker === next.onOpenInlinePicker &&
    areExerciseIdsEqual(previous.exerciseIds, next.exerciseIds)
  );
}

function areWorkoutSessionContentPropsEqual(
  previous: WorkoutSessionContentProps,
  next: WorkoutSessionContentProps,
) {
  return (
    previous.copy === next.copy &&
    previous.locale === next.locale &&
    previous.selectedPlanName === next.selectedPlanName &&
    previous.isEditingExistingLog === next.isEditingExistingLog &&
    previous.planSheetOpen === next.planSheetOpen &&
    previous.onOpenPlanSheet === next.onOpenPlanSheet &&
    previous.onExerciseAction === next.onExerciseAction &&
    previous.onOpenInlinePicker === next.onOpenInlinePicker &&
    previous.onOpenAddExerciseSheet === next.onOpenAddExerciseSheet &&
    previous.onSessionMemoChange === next.onSessionMemoChange &&
    previous.onDateChange === next.onDateChange &&
    previous.workflowState === next.workflowState &&
    previous.onSave === next.onSave
  );
}

const WorkoutExerciseCardsList = memo(function WorkoutExerciseCardsList({
  locale,
  bodyweightKg,
  exerciseIds,
  onExerciseAction,
  onOpenInlinePicker,
}: WorkoutExerciseCardsListProps) {
  if (exerciseIds.length === 0) {
    return (
      <div
        style={{
          padding: "var(--space-md) 0",
          color: "var(--text-hint)",
          fontSize: "14px",
        }}
      >
        {locale === "ko" ? "기록할 운동이 없습니다." : "No exercises to log."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)", width: "100%" }}>
      {exerciseIds.map((id) => (
        <div key={id}>
          <ExerciseRow
            exerciseId={id}
            bodyweightKg={bodyweightKg}
            onAction={onExerciseAction}
            onOpenInlinePicker={onOpenInlinePicker}
          />
        </div>
      ))}
    </div>
  );
}, areWorkoutExerciseCardsListPropsEqual);

export const WorkoutSessionContent = memo(function WorkoutSessionContent({
  copy,
  locale,
  selectedPlanName,
  isEditingExistingLog,
  planSheetOpen,
  onOpenPlanSheet,
  onExerciseAction,
  onOpenInlinePicker,
  onOpenAddExerciseSheet,
  onSessionMemoChange,
  onDateChange,
  workflowState,
  onSave,
}: WorkoutSessionContentProps) {
  const draft = useAtomValue(draftAtom);
  const workoutPreferences = useAtomValue(workoutPreferencesAtom);
  const lastSession = useAtomValue(lastSessionAtom);
  const completedExercisesCount = useAtomValue(completedExercisesCountAtom);
  const exerciseIds = useAtomValue(sessionExerciseIdsAtom);

  if (!draft) return null;

  return (
    <>
      <section className="plan-selector-strip">
        <div className="plan-selector-strip__label">{copy.activePlanLabel}</div>
        <PlanSelectorButton
          planName={selectedPlanName}
          aria-expanded={isEditingExistingLog ? false : planSheetOpen}
          onClick={isEditingExistingLog ? undefined : onOpenPlanSheet}
          disabled={isEditingExistingLog}
        />
        {isEditingExistingLog ? (
          <p style={{ marginTop: "var(--space-xs)", fontSize: "12px", color: "var(--text-hint)" }}>
            {copy.planLockedWhileEditing}
          </p>
        ) : null}
      </section>

      <section>
        <div className="session-progress-header">
          <div className="session-progress-header__top-row">
            <div className="session-progress-header__title-group">
              <div className="session-progress-header__eyebrow">
                {isEditingExistingLog ? copy.editingLog : copy.activeSession}
              </div>
              <h2 className="session-progress-header__title">
                Week {draft.session.week} · {draft.session.sessionType}
              </h2>
            </div>
          </div>
          <div className="session-progress-header__chips">
            <span className={`session-chip ${completedExercisesCount > 0 ? "session-chip--active" : ""}`}>
              {completedExercisesCount}/{exerciseIds.length} {copy.exercisesCount}
            </span>
            <span className="session-chip session-chip--date-nav">
              <button
                type="button"
                className="date-nav-btn"
                aria-label={copy.dateNavPrev}
                onClick={() => {
                  const d = new Date(`${draft.session.sessionDate}T00:00:00`);
                  d.setDate(d.getDate() - 1);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const dd = String(d.getDate()).padStart(2, "0");
                  onDateChange(`${y}-${m}-${dd}`);
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}>chevron_left</span>
              </button>
              <label style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span aria-live="polite">{formatDateFriendly(draft.session.sessionDate, locale)}</span>
                <input
                  type="date"
                  aria-label={copy.dateChangeAriaLabel}
                  value={draft.session.sessionDate}
                  onChange={(e) => { if (e.target.value) onDateChange(e.target.value); }}
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
                aria-label={copy.dateNavNext}
                onClick={() => {
                  const d = new Date(`${draft.session.sessionDate}T00:00:00`);
                  d.setDate(d.getDate() + 1);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const dd = String(d.getDate()).padStart(2, "0");
                  onDateChange(`${y}-${m}-${dd}`);
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}>chevron_right</span>
              </button>
            </span>
            {workoutPreferences.bodyweightKg ? (
              <span className="session-chip">
                {copy.bodyweightShort} {workoutPreferences.bodyweightKg.toFixed(1)}kg
              </span>
            ) : null}
          </div>
        </div>

        {lastSession ? (
          <div className="last-session-banner">
            <div className="last-session-banner__icon">
              <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 400", lineHeight: 1 }}>
                history
              </span>
            </div>
            <div className="last-session-banner__body">
              <div className="last-session-banner__label">{copy.lastSession}</div>
              <div className="last-session-banner__title">
                {lastSession.weekLabel} · {lastSession.sessionLabel}
              </div>
              <div className="last-session-banner__meta">{lastSession.dateLabel}</div>
            </div>
            {lastSession.totalSets != null ? (
              <div className="last-session-banner__stat">
                <div className="last-session-banner__stat-value">{lastSession.totalSets}</div>
                <div className="last-session-banner__stat-label">{copy.sets}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <WorkoutExerciseCardsList
            locale={locale}
            bodyweightKg={workoutPreferences.bodyweightKg}
            exerciseIds={exerciseIds}
            onExerciseAction={onExerciseAction}
            onOpenInlinePicker={onOpenInlinePicker}
          />
        </div>

        <div style={{ marginBottom: "var(--space-md)" }}>
          <button
            type="button"
            className="btn-add-exercise"
            onClick={onOpenAddExerciseSheet}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 28, fontVariationSettings: "'wght' 300" }}>
              add
            </span>
            <span>{copy.addExerciseButton}</span>
          </button>
        </div>

        <div style={{ marginBottom: "var(--space-md)" }}>
          <FieldLabel>{locale === "ko" ? "세션 메모" : "Session Memo"}</FieldLabel>
          <label>
            <AppTextarea
              variant="workout"
              value={draft.session.note.memo}
              onChange={(event) => {
                onSessionMemoChange(event.target.value);
              }}
              placeholder={copy.sessionMemoPlaceholder}
              style={{
                border: "none",
                borderRadius: "16px",
                background: "var(--color-surface-container-low)",
              }}
            />
          </label>
        </div>

        <StickyActionBar className="finish-workout-cta">
          <V2PrimaryBtn
            type="button"
            full
            icon="done_all"
            onClick={onSave}
            disabled={workflowState === "saving"}
          >
            {workflowState === "saving"
              ? copy.saveInProgress
              : isEditingExistingLog
                ? copy.saveEdited
                : copy.saveCreate}
          </V2PrimaryBtn>
        </StickyActionBar>
      </section>
    </>
  );
}, areWorkoutSessionContentPropsEqual);
