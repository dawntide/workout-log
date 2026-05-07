"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import type { Dispatch, SetStateAction } from "react";
import type { FailureProtocolChoice } from "@/components/ui/failure-protocol-sheet";
import type { PendingRestorePrompt } from "@/features/workout-log/model/editor-actions";
import type { InlinePickerRequest } from "@/features/workout-log/model/editor-actions";
import type { AddExerciseDraft, WorkoutLogExerciseOption } from "@/features/workout-log/model/types";
import {
  areAddExerciseDraftsEqual,
  arePendingRestorePromptsEqual,
  areSearchSelectOptionsEqual,
  areWorkoutLogExerciseOptionsEqual,
} from "@/features/workout-log/ui/prop-equality";
import { AddExerciseSheet } from "./add-exercise-sheet";
import { PlanSelectorSheet } from "./plan-selector-sheet";
import { RestoreDraftSheet } from "./restore-draft-sheet";
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";

const FailureProtocolSheet = dynamic(
  () =>
    import("@/components/ui/failure-protocol-sheet").then(
      (mod) => mod.FailureProtocolSheet,
    ),
  { ssr: false },
);

const NumberPickerSheet = dynamic(
  () =>
    import("@/components/ui/number-picker-sheet").then(
      (mod) => mod.NumberPickerSheet,
    ),
  { ssr: false },
);

type WorkoutLogOverlaySheetsProps = {
  locale: AppLocale;
  copy: AppCopy["workoutLog"];
  inlinePickerRequest: InlinePickerRequest | null;
  onCloseInlinePicker: () => void;
  onChangeInlinePicker: (value: number) => void;
  planSheetOpen: boolean;
  planQuery: string;
  onChangePlanQuery: (value: string) => void;
  onClosePlanSheet: () => void;
  planSheetOptions: Array<{
    key: string;
    label: string;
    active?: boolean;
    ariaCurrent?: boolean;
    onSelect: () => void;
  }>;
  addSheetOpen: boolean;
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
  onCloseAddExerciseSheet: () => void;
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
  pendingRestorePrompt: PendingRestorePrompt | null;
  onResolveRestorePrompt: (accept: boolean) => void;
  failureProtocolSheet: {
    title: string;
    message: string;
    mode: "block-completion" | "greyskull-reset";
  } | null;
  onSelectFailureProtocol: (choice: FailureProtocolChoice) => void;
};

function areInlinePickerRequestsEqual(
  left: InlinePickerRequest | null,
  right: InlinePickerRequest | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.type === right.type &&
    left.exerciseId === right.exerciseId &&
    left.title === right.title &&
    left.value === right.value &&
    left.min === right.min &&
    left.max === right.max &&
    left.step === right.step &&
    left.formatValue === right.formatValue &&
    (left.type === "CHANGE_SET_REPS" || left.type === "CHANGE_SET_RPE"
      ? left.setIndex
      : -1) ===
      (right.type === "CHANGE_SET_REPS" || right.type === "CHANGE_SET_RPE"
        ? right.setIndex
        : -1)
  );
}

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

function areFailureProtocolSheetsEqual(
  left: WorkoutLogOverlaySheetsProps["failureProtocolSheet"],
  right: WorkoutLogOverlaySheetsProps["failureProtocolSheet"],
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.title === right.title &&
    left.message === right.message &&
    left.mode === right.mode
  );
}

function areWorkoutLogOverlaySheetsPropsEqual(
  previous: WorkoutLogOverlaySheetsProps,
  next: WorkoutLogOverlaySheetsProps,
) {
  return (
    previous.locale === next.locale &&
    previous.copy === next.copy &&
    previous.onCloseInlinePicker === next.onCloseInlinePicker &&
    previous.onChangeInlinePicker === next.onChangeInlinePicker &&
    previous.planSheetOpen === next.planSheetOpen &&
    previous.planQuery === next.planQuery &&
    previous.onChangePlanQuery === next.onChangePlanQuery &&
    previous.onClosePlanSheet === next.onClosePlanSheet &&
    previous.addSheetOpen === next.addSheetOpen &&
    previous.setAddDraft === next.setAddDraft &&
    previous.exerciseQuery === next.exerciseQuery &&
    previous.setExerciseQuery === next.setExerciseQuery &&
    previous.exerciseOptionsError === next.exerciseOptionsError &&
    previous.setExerciseOptionsError === next.setExerciseOptionsError &&
    previous.exerciseOptionsLoading === next.exerciseOptionsLoading &&
    previous.onSelectExerciseOption === next.onSelectExerciseOption &&
    previous.onCloseAddExerciseSheet === next.onCloseAddExerciseSheet &&
    previous.onAddExercise === next.onAddExercise &&
    previous.addDraftIncrementKg === next.addDraftIncrementKg &&
    previous.addDraftIncrementInfo.source === next.addDraftIncrementInfo.source &&
    previous.addDraftTotalLoadKg === next.addDraftTotalLoadKg &&
    previous.bodyweightKg === next.bodyweightKg &&
    previous.resolveWeightWithCurrentPreferences ===
      next.resolveWeightWithCurrentPreferences &&
    previous.onResolveRestorePrompt === next.onResolveRestorePrompt &&
    previous.onSelectFailureProtocol === next.onSelectFailureProtocol &&
    areInlinePickerRequestsEqual(
      previous.inlinePickerRequest,
      next.inlinePickerRequest,
    ) &&
    areSearchSelectOptionsEqual(previous.planSheetOptions, next.planSheetOptions) &&
    areAddExerciseDraftsEqual(previous.addDraft, next.addDraft) &&
    areWorkoutLogExerciseOptionsEqual(
      previous.filteredExerciseOptions,
      next.filteredExerciseOptions,
    ) &&
    areSelectedExerciseOptionsEqual(
      previous.selectedExerciseOption,
      next.selectedExerciseOption,
    ) &&
    arePendingRestorePromptsEqual(
      previous.pendingRestorePrompt,
      next.pendingRestorePrompt,
    ) &&
    areFailureProtocolSheetsEqual(
      previous.failureProtocolSheet,
      next.failureProtocolSheet,
    )
  );
}

export const WorkoutLogOverlaySheets = memo(function WorkoutLogOverlaySheets({
  locale,
  copy,
  inlinePickerRequest,
  onCloseInlinePicker,
  onChangeInlinePicker,
  planSheetOpen,
  planQuery,
  onChangePlanQuery,
  onClosePlanSheet,
  planSheetOptions,
  addSheetOpen,
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
  onCloseAddExerciseSheet,
  onAddExercise,
  addDraftIncrementKg,
  addDraftIncrementInfo,
  addDraftTotalLoadKg,
  bodyweightKg,
  resolveWeightWithCurrentPreferences,
  pendingRestorePrompt,
  onResolveRestorePrompt,
  failureProtocolSheet,
  onSelectFailureProtocol,
}: WorkoutLogOverlaySheetsProps) {
  return (
    <>
      <NumberPickerSheet
        open={inlinePickerRequest !== null}
        onClose={onCloseInlinePicker}
        title={inlinePickerRequest?.title ?? (locale === "ko" ? "숫자 선택" : "Select Number")}
        value={inlinePickerRequest?.value ?? 0}
        min={inlinePickerRequest?.min ?? 0}
        max={inlinePickerRequest?.max ?? 100}
        step={inlinePickerRequest?.step ?? 1}
        onChange={onChangeInlinePicker}
        formatValue={inlinePickerRequest?.formatValue}
      />

      <PlanSelectorSheet
        open={planSheetOpen}
        copy={copy}
        query={planQuery}
        onQueryChange={onChangePlanQuery}
        onClose={onClosePlanSheet}
        options={planSheetOptions}
      />

      <AddExerciseSheet
        open={addSheetOpen}
        locale={locale}
        copy={copy}
        addDraft={addDraft}
        setAddDraft={setAddDraft}
        exerciseQuery={exerciseQuery}
        setExerciseQuery={setExerciseQuery}
        exerciseOptionsError={exerciseOptionsError}
        setExerciseOptionsError={setExerciseOptionsError}
        exerciseOptionsLoading={exerciseOptionsLoading}
        filteredExerciseOptions={filteredExerciseOptions}
        selectedExerciseOption={selectedExerciseOption}
        onSelectExerciseOption={onSelectExerciseOption}
        onClose={onCloseAddExerciseSheet}
        onAddExercise={onAddExercise}
        addDraftIncrementKg={addDraftIncrementKg}
        addDraftIncrementInfo={addDraftIncrementInfo}
        addDraftTotalLoadKg={addDraftTotalLoadKg}
        bodyweightKg={bodyweightKg}
        resolveWeightWithCurrentPreferences={resolveWeightWithCurrentPreferences}
      />

      <RestoreDraftSheet
        request={pendingRestorePrompt}
        title={copy.restoreDraftTitle}
        message={copy.restoreDraftMessage}
        confirmText={copy.restoreDraftConfirm}
        cancelText={copy.restoreDraftDiscard}
        onResolve={onResolveRestorePrompt}
      />

      <FailureProtocolSheet
        open={failureProtocolSheet !== null}
        title={failureProtocolSheet?.title ?? ""}
        message={failureProtocolSheet?.message ?? ""}
        mode={failureProtocolSheet?.mode ?? "block-completion"}
        onSelect={onSelectFailureProtocol}
      />
    </>
  );
}, areWorkoutLogOverlaySheetsPropsEqual);
