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
          gap: "var(--v2-s-1)",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <span
          className="v2-mono-label"
          style={{ color: "var(--v2-ink-3)" }}
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
          color="var(--v2-c-weight)"
          onChange={handleWeightChange}
        />
        <WorkoutRecordInlinePicker
          label={locale === "ko" ? `${index + 1}세트 횟수` : `Set ${index + 1} Reps`}
          value={setReps}
          min={1}
          max={100}
          step={1}
          formatValue={formatRepsValue}
          color="var(--v2-c-reps)"
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
  const showRuleInfo = addDraftIncrementInfo.source === "RULE";
  const showBodyweightInfo =
    isBodyweightExerciseName(addDraft.exerciseName) && Boolean(bodyweightKg);
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
                    padding: "10px 14px",
                    background: "var(--v2-accent-weak)",
                    borderRadius: "var(--v2-r-2)",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 18,
                      color: "var(--v2-accent)",
                      fontVariationSettings: "'FILL' 1",
                      flexShrink: 0,
                    }}
                  >
                    check_circle
                  </span>
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
                    className="v2-pressable"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--v2-f-display)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--v2-accent)",
                      padding: "4px 8px",
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

        <div
          style={{
            background: "var(--v2-paper-2)",
            borderRadius: "var(--v2-r-4)",
            padding: "var(--v2-s-4)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              display: "grid",
              gridTemplateColumns: "0.7fr 1.8fr 1.2fr",
              gap: "var(--v2-s-1)",
              marginBottom: "var(--v2-s-2)",
              textAlign: "center",
            }}
          >
            <span className="v2-eyebrow">Sets</span>
            <span
              className="v2-eyebrow"
              style={{ color: "var(--v2-c-weight)" }}
            >
              Weight
            </span>
            <span
              className="v2-eyebrow"
              style={{ color: "var(--v2-c-reps)" }}
            >
              Reps
            </span>
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
            className="v2-pressable"
            style={{
              width: "100%",
              marginTop: "var(--v2-s-3)",
              padding: "10px",
              background: "var(--v2-paper-3)",
              border: "none",
              borderRadius: "var(--v2-r-2)",
              color: "var(--v2-ink-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--v2-s-2)",
              fontFamily: "var(--v2-f-display)",
              fontSize: 13,
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

        {showRuleInfo || showBodyweightInfo ? (
          <div
            style={{
              background: "var(--v2-paper-2)",
              borderRadius: "var(--v2-r-2)",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {showRuleInfo ? (
              <span
                className="v2-small"
                style={{ color: "var(--v2-ink-2)" }}
              >
                {locale === "ko"
                  ? `적용 Increment: ${addDraftIncrementKg.toFixed(2)}kg`
                  : `Applied increment: ${addDraftIncrementKg.toFixed(2)}kg`}
              </span>
            ) : null}
            {showBodyweightInfo ? (
              <span
                className="v2-small"
                style={{ color: "var(--v2-ink-2)" }}
              >
                {locale === "ko"
                  ? `총 부하(외부중량 + 체중): ${addDraftTotalLoadKg?.toFixed(2) ?? "-"}kg`
                  : `Total load (external + bodyweight): ${addDraftTotalLoadKg?.toFixed(2) ?? "-"}kg`}
              </span>
            ) : null}
          </div>
        ) : null}

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span className="v2-eyebrow">
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
            fontFamily: "var(--v2-f-display)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            tune
          </span>
          {locale === "ko" ? "운동종목 관리" : "Manage Exercises"}
        </Link>
      </div>
    </BottomSheet>
  );
}, areAddExerciseSheetPropsEqual);
