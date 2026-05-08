"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { memo, useCallback, type Dispatch, type SetStateAction } from "react";
import { AppPlusMinusIcon, AppTextarea } from "@/components/ui/form-controls";
import { SearchSelectCombobox } from "@/components/ui/search-select-sheet";
import { patchSetRepsAtIndex, appendSetReps } from "@/features/workout-log/model/exercise-entry";
import type { AddExerciseDraft, WorkoutLogExerciseOption } from "@/features/workout-log/model/types";
import {
  areAddExerciseDraftsEqual,
  areWorkoutLogExerciseOptionsEqual,
} from "@/features/workout-log/ui/prop-equality";
import {
  SwipeableSetRow,
  WorkoutRecordInlinePicker,
  formatCompactWeightValue,
} from "@/features/workout-log/ui/set-editor-controls";
import { isBodyweightExerciseName } from "@/lib/bodyweight-load";
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
  addDraftIncrementKg: number;
  addDraftIncrementInfo: {
    source: string;
  };
  addDraftTotalLoadKg: number | null;
  bodyweightKg: number | null;
  resolveWeightWithCurrentPreferences: (
    weightKg: number,
    exerciseId: string | null | undefined,
    exerciseName: string,
  ) => number;
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
    previous.addDraftIncrementKg === next.addDraftIncrementKg &&
    previous.addDraftIncrementInfo.source === next.addDraftIncrementInfo.source &&
    previous.addDraftTotalLoadKg === next.addDraftTotalLoadKg &&
    previous.bodyweightKg === next.bodyweightKg &&
    previous.resolveWeightWithCurrentPreferences ===
      next.resolveWeightWithCurrentPreferences &&
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

type AddExerciseSetRowProps = {
  index: number;
  setReps: number;
  weightKg: number;
  incrementKg: number;
  locale: AppLocale;
  disableDelete: boolean;
  exerciseId: string | null;
  exerciseName: string;
  setAddDraft: Dispatch<SetStateAction<AddExerciseDraft>>;
  resolveWeightWithCurrentPreferences: (
    weightKg: number,
    exerciseId: string | null | undefined,
    exerciseName: string,
  ) => number;
};

function areAddExerciseSetRowPropsEqual(
  previous: AddExerciseSetRowProps,
  next: AddExerciseSetRowProps,
) {
  return (
    previous.index === next.index &&
    previous.setReps === next.setReps &&
    previous.weightKg === next.weightKg &&
    previous.incrementKg === next.incrementKg &&
    previous.locale === next.locale &&
    previous.disableDelete === next.disableDelete &&
    previous.exerciseId === next.exerciseId &&
    previous.exerciseName === next.exerciseName &&
    previous.setAddDraft === next.setAddDraft &&
    previous.resolveWeightWithCurrentPreferences ===
      next.resolveWeightWithCurrentPreferences
  );
}

const AddExerciseSetRow = memo(function AddExerciseSetRow({
  index,
  setReps,
  weightKg,
  incrementKg,
  locale,
  disableDelete,
  exerciseId,
  exerciseName,
  setAddDraft,
  resolveWeightWithCurrentPreferences,
}: AddExerciseSetRowProps) {
  const formatWeightValue = useCallback(
    (value: number) => formatCompactWeightValue(value, incrementKg),
    [incrementKg],
  );
  const formatRepsValue = useCallback(
    (value: number) => String(Math.round(value)),
    [],
  );
  const handleWeightChange = useCallback(
    (value: number) =>
      setAddDraft((prev) => ({
        ...prev,
        weightKg: resolveWeightWithCurrentPreferences(
          value,
          exerciseId,
          exerciseName,
        ),
      })),
    [
      exerciseId,
      exerciseName,
      resolveWeightWithCurrentPreferences,
      setAddDraft,
    ],
  );
  const handleRepsChange = useCallback(
    (value: number) =>
      setAddDraft((prev) => ({
        ...prev,
        repsPerSet: patchSetRepsAtIndex(prev.repsPerSet, index, value),
      })),
    [index, setAddDraft],
  );

  return (
    <SwipeableSetRow
      deleteLabel={locale === "ko" ? "세트 삭제" : "Delete set"}
      disabled={disableDelete}
      onDelete={() =>
        setAddDraft((prev) => ({
          ...prev,
          repsPerSet: prev.repsPerSet.filter((_, rowIndex) => rowIndex !== index),
        }))
      }
    >
      <div
        role="listitem"
        style={{
          display: "grid",
          gridTemplateColumns: "0.7fr 1.8fr 1.2fr",
          gap: "var(--space-xs)",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <span
          style={{
            color: "var(--text-metric-sets)",
            font: "var(--font-secondary)",
            fontWeight: 600,
          }}
        >
          {index + 1}
        </span>
        <WorkoutRecordInlinePicker
          label={locale === "ko" ? `${index + 1}세트 무게` : `Set ${index + 1} Weight`}
          value={weightKg}
          min={0}
          max={1000}
          step={incrementKg}
          formatValue={formatWeightValue}
          color="var(--text-metric-weight)"
          onChange={handleWeightChange}
        />
        <WorkoutRecordInlinePicker
          label={locale === "ko" ? `${index + 1}세트 횟수` : `Set ${index + 1} Reps`}
          value={setReps}
          min={1}
          max={100}
          step={1}
          formatValue={formatRepsValue}
          color="var(--text-metric-reps)"
          onChange={handleRepsChange}
        />
      </div>
    </SwipeableSetRow>
  );
}, areAddExerciseSetRowPropsEqual);

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
  addDraftIncrementKg,
  addDraftIncrementInfo,
  addDraftTotalLoadKg,
  bodyweightKg,
  resolveWeightWithCurrentPreferences,
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
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
                    gap: "10px",
                    marginBottom: "var(--space-sm)",
                    padding: "10px 14px",
                    background: "var(--color-primary-weak)",
                    borderRadius: "12px",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "18px",
                      color: "var(--color-primary)",
                      fontVariationSettings: "'FILL' 1",
                      flexShrink: 0,
                    }}
                  >
                    check_circle
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-headline-family)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--color-text)",
                    }}
                  >
                    {selectedExerciseOption.category
                      ? `${selectedExerciseOption.name} · ${selectedExerciseOption.category}`
                      : selectedExerciseOption.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectExerciseOption(null)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-label-family)",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--color-primary)",
                      padding: "4px 8px",
                      borderRadius: "8px",
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
            <p style={{ margin: "6px 0 0", fontFamily: "var(--font-label-family)", fontSize: "12px", color: "var(--color-danger)" }}>
              {exerciseOptionsError}
            </p>
          ) : null}
        </div>

        <div style={{ background: "var(--color-surface-container)", borderRadius: "20px", padding: "16px" }}>
          <div
            aria-hidden="true"
            style={{
              display: "grid",
              gridTemplateColumns: "0.7fr 1.8fr 1.2fr",
              gap: "var(--space-xs)",
              marginBottom: "10px",
              textAlign: "center",
            }}
          >
            <span style={{ fontFamily: "var(--font-label-family)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Sets</span>
            <span style={{ fontFamily: "var(--font-label-family)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-metric-weight)" }}>Weight</span>
            <span style={{ fontFamily: "var(--font-label-family)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-metric-reps)" }}>Reps</span>
          </div>

          <div role="list" aria-label={locale === "ko" ? "세트 편집" : "Edit sets"}>
            {addDraft.repsPerSet.map((setReps, index) => (
              <AddExerciseSetRow
                key={`add-set-${index}`}
                index={index}
                setReps={setReps}
                weightKg={addDraft.weightKg}
                incrementKg={addDraftIncrementKg}
                locale={locale}
                disableDelete={addDraft.repsPerSet.length <= 1}
                exerciseId={addDraft.exerciseId}
                exerciseName={addDraft.exerciseName}
                setAddDraft={setAddDraft}
                resolveWeightWithCurrentPreferences={resolveWeightWithCurrentPreferences}
              />
            ))}
          </div>

          <button
            type="button"
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "10px",
              background: "var(--color-surface-container-high)",
              border: "none",
              borderRadius: "12px",
              color: "var(--color-text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              fontFamily: "var(--font-label-family)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
            onClick={() =>
              setAddDraft((prev) => ({
                ...prev,
                repsPerSet: appendSetReps(prev.repsPerSet),
              }))
            }
          >
            <AppPlusMinusIcon kind="plus" size={14} />
            <span>{copy.addSet}</span>
          </button>
        </div>

        {(addDraftIncrementInfo.source === "RULE" || (isBodyweightExerciseName(addDraft.exerciseName) && bodyweightKg)) ? (
          <div
            style={{
              background: "var(--color-surface-container)",
              borderRadius: "12px",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {addDraftIncrementInfo.source === "RULE" ? (
              <span style={{ fontFamily: "var(--font-label-family)", fontSize: "12px", color: "var(--color-text-muted)" }}>
                {locale === "ko" ? `적용 Increment: ${addDraftIncrementKg.toFixed(2)}kg` : `Applied increment: ${addDraftIncrementKg.toFixed(2)}kg`}
              </span>
            ) : null}
            {isBodyweightExerciseName(addDraft.exerciseName) && bodyweightKg ? (
              <span style={{ fontFamily: "var(--font-label-family)", fontSize: "12px", color: "var(--color-text-muted)" }}>
                {locale === "ko" ? `총 부하(외부중량 + 체중): ${addDraftTotalLoadKg?.toFixed(2) ?? "-"}kg` : `Total load (external + bodyweight): ${addDraftTotalLoadKg?.toFixed(2) ?? "-"}kg`}
              </span>
            ) : null}
          </div>
        ) : null}

        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span
            style={{
              fontFamily: "var(--font-label-family)",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            {locale === "ko" ? "메모" : "Memo"}
          </span>
          <AppTextarea
            variant="workout"
            value={addDraft.memo}
            onChange={(event) => setAddDraft((prev) => ({ ...prev, memo: event.target.value }))}
          />
        </label>

        <Link
          href="/exercises?context=session"
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "12px",
            borderRadius: "14px",
            background: "var(--color-surface-container)",
            color: "var(--color-text-muted)",
            textDecoration: "none",
            fontFamily: "var(--font-label-family)",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>tune</span>
          {locale === "ko" ? "운동종목 관리" : "Manage Exercises"}
        </Link>
      </div>
    </BottomSheet>
  );
}, areAddExerciseSheetPropsEqual);
