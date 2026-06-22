"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { memo, type Dispatch, type SetStateAction } from "react";
import { SearchSelectCombobox } from "@/components/ui/search-select-sheet";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import type { AddExerciseDraft, WorkoutLogExerciseOption } from "@/features/workout-log/model/types";
import {
  areAddExerciseDraftsEqual,
  areWorkoutLogExerciseOptionsEqual,
} from "@/features/workout-log/ui/prop-equality";
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

type AddExerciseSheetProps = {
  open: boolean;
  locale: AppLocale;
  copy: AppCopy["workoutLog"];
  addDraft: AddExerciseDraft;
  setAddDraft: Dispatch<SetStateAction<AddExerciseDraft>>;
  exerciseQuery: string;
  setExerciseQuery: Dispatch<SetStateAction<string>>;
  exerciseOptionsError: string | null;
  setExerciseOptionsError: Dispatch<SetStateAction<string | null>>;
  exerciseOptionsLoading: boolean;
  filteredExerciseOptions: WorkoutLogExerciseOption[];
  selectedExerciseOption: WorkoutLogExerciseOption | null;
  onSelectExerciseOption: (option: WorkoutLogExerciseOption | null) => void;
  onClose: () => void;
  onAddExercise: () => void;
};

function areSelectedExerciseOptionsEqual(
  left: WorkoutLogExerciseOption | null,
  right: WorkoutLogExerciseOption | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.category === right.category
  );
}

function areAddExerciseSheetPropsEqual(
  previous: AddExerciseSheetProps,
  next: AddExerciseSheetProps,
) {
  return (
    previous.open === next.open &&
    previous.locale === next.locale &&
    previous.copy === next.copy &&
    previous.setAddDraft === next.setAddDraft &&
    previous.exerciseQuery === next.exerciseQuery &&
    previous.setExerciseQuery === next.setExerciseQuery &&
    previous.exerciseOptionsError === next.exerciseOptionsError &&
    previous.setExerciseOptionsError === next.setExerciseOptionsError &&
    previous.exerciseOptionsLoading === next.exerciseOptionsLoading &&
    previous.onSelectExerciseOption === next.onSelectExerciseOption &&
    previous.onClose === next.onClose &&
    previous.onAddExercise === next.onAddExercise &&
    areAddExerciseDraftsEqual(previous.addDraft, next.addDraft) &&
    areWorkoutLogExerciseOptionsEqual(
      previous.filteredExerciseOptions,
      next.filteredExerciseOptions,
    ) &&
    areSelectedExerciseOptionsEqual(
      previous.selectedExerciseOption,
      next.selectedExerciseOption,
    )
  );
}

export const AddExerciseSheet = memo(function AddExerciseSheet({
  open,
  locale,
  copy,
  addDraft,
  setAddDraft,
  exerciseQuery,
  setExerciseQuery,
  exerciseOptionsError,
  setExerciseOptionsError,
  exerciseOptionsLoading,
  filteredExerciseOptions,
  selectedExerciseOption,
  onSelectExerciseOption,
  onClose,
  onAddExercise,
}: AddExerciseSheetProps) {
  return (
    <BottomSheet
      open={open}
      title={copy.addExerciseTitle}
      description={copy.addExerciseDescription}
      onClose={onClose}
      closeLabel={copy.close}
      primaryAction={{
        ariaLabel: copy.addExerciseAction,
        onPress: onAddExercise,
        disabled: !addDraft.exerciseId,
      }}
      footer={null}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-4)",
        }}
      >
        <div>
          <SearchSelectCombobox
            query={exerciseQuery}
            placeholder={locale === "ko" ? "예: Squat" : "e.g. Squat"}
            onQueryChange={(nextQuery) => {
              setExerciseQuery(nextQuery);
              setExerciseOptionsError(null);
              setAddDraft((prev) => {
                if (!prev.exerciseId) return prev;
                if (nextQuery.trim().toLowerCase() === prev.exerciseName.trim().toLowerCase()) return prev;
                return { ...prev, exerciseId: null, exerciseName: "" };
              });
            }}
            onQuerySubmit={() => {
              const first = filteredExerciseOptions[0] ?? null;
              if (!first) return;
              onSelectExerciseOption(first);
            }}
            onClearQuery={() => {
              setExerciseQuery("");
              setExerciseOptionsError(null);
            }}
            resultsAriaLabel={copy.exerciseSearchResults}
            options={filteredExerciseOptions.map((option) => ({
              key: option.id,
              label: option.category ? `${option.name} · ${option.category}` : option.name,
              active: addDraft.exerciseId === option.id,
              onSelect: () => {
                onSelectExerciseOption(option);
              },
            }))}
            emptyText={copy.noMatchingExercises}
            loading={exerciseOptionsLoading}
            loadingText={copy.exerciseSearchLoading}
            selectionSummary={
              selectedExerciseOption ? (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--v2-s-2)",
                    marginBottom: "var(--v2-s-3)",
                    padding: "var(--v2-s-3) var(--v2-s-4)",
                    background: "var(--v2-accent-weak)",
                    borderRadius: "var(--v2-r-2)",
                  }}
                >
                  <V2Icon
                    name="check_circle"
                    fill
                    style={{
                      fontSize: "var(--v2-t-18)",
                      color: "var(--v2-accent)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="v2-body"
                    style={{
                      flex: 1,
                      fontWeight: 700,
                    }}
                  >
                    {selectedExerciseOption.category
                      ? `${selectedExerciseOption.name} · ${selectedExerciseOption.category}`
                      : selectedExerciseOption.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectExerciseOption(null)}
                    className="v2-pressable v2-font-display"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "var(--v2-t-12)",
                      fontWeight: 700,
                      color: "var(--v2-accent)",
                      padding: "var(--v2-s-1) var(--v2-s-2)",
                      borderRadius: "var(--v2-r-1)",
                      flexShrink: 0,
                    }}
                  >
                    {copy.change}
                  </button>
                </div>
              ) : null
            }
            hideOptions={Boolean(selectedExerciseOption)}
          />
          {exerciseOptionsError ? (
            <p
              className="v2-small"
              style={{
                margin: "6px 0 0",
                color: "var(--v2-c-danger)",
              }}
            >
              {exerciseOptionsError}
            </p>
          ) : null}
        </div>

        <p
          className="v2-small"
          style={{ margin: 0, color: "var(--v2-ink-3)" }}
        >
          {locale === "ko"
            ? "운동 종목만 추가됩니다. 무게·횟수·메모는 운동 기록 화면에서 입력하세요."
            : "Only the exercise is added. Enter weight, reps, and notes on the workout log screen."}
        </p>

        <Link
          href="/exercises?context=session"
          onClick={onClose}
          className="v2-pressable"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--v2-s-2)",
            padding: "var(--v2-s-3)",
            borderRadius: "var(--v2-r-3)",
            background: "var(--v2-paper-2)",
            color: "var(--v2-ink-2)",
            textDecoration: "none",
            fontSize: "var(--v2-t-small)",
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          <V2Icon name="tune" style={{ fontSize: "var(--v2-t-16)" }} />
          {locale === "ko" ? "운동종목 관리" : "Manage Exercises"}
        </Link>
      </div>
    </BottomSheet>
  );
}, areAddExerciseSheetPropsEqual);
