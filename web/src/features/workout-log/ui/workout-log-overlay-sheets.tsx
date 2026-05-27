"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import type { Dispatch, SetStateAction } from "react";
import type {
  FailureProtocolResult,
  FailureProtocolTarget,
} from "@/components/ui/failure-protocol-sheet";
import type { PendingRestorePrompt } from "@/features/workout-log/model/editor-actions";
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

type WorkoutLogOverlaySheetsProps = {
  locale: AppLocale;
  copy: AppCopy["workoutLog"];
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
    description: string;
    mode: "block-completion" | "greyskull-reset";
    targets: FailureProtocolTarget[];
  } | null;
  onSelectFailureProtocol: (result: FailureProtocolResult) => void;
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

function areFailureProtocolTargetsEqual(
  left: FailureProtocolTarget[],
  right: FailureProtocolTarget[],
) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (
      a.key !== b.key ||
      a.label !== b.label ||
      a.currentWorkKg !== b.currentWorkKg ||
      a.recommendedIncreaseKg !== b.recommendedIncreaseKg ||
      a.recommendedResetKg !== b.recommendedResetKg ||
      a.recommendedMode !== b.recommendedMode ||
      a.reasonLabel !== b.reasonLabel
    ) {
      return false;
    }
  }
  return true;
}

function areFailureProtocolSheetsEqual(
  left: WorkoutLogOverlaySheetsProps["failureProtocolSheet"],
  right: WorkoutLogOverlaySheetsProps["failureProtocolSheet"],
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.mode === right.mode &&
    areFailureProtocolTargetsEqual(left.targets, right.targets)
  );
}

function areWorkoutLogOverlaySheetsPropsEqual(
  previous: WorkoutLogOverlaySheetsProps,
  next: WorkoutLogOverlaySheetsProps,
) {
  return (
    previous.locale === next.locale &&
    previous.copy === next.copy &&
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
        description={failureProtocolSheet?.description ?? ""}
        mode={failureProtocolSheet?.mode ?? "block-completion"}
        targets={failureProtocolSheet?.targets ?? []}
        onSelect={onSelectFailureProtocol}
      />
    </>
  );
}, areWorkoutLogOverlaySheetsPropsEqual);
