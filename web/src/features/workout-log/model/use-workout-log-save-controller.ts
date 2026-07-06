import { errorMessage } from "@/lib/error-message";
import { useCallback, useRef, useState } from "react";
import type {
  FailureProtocolResult,
  FailureProtocolTarget,
} from "@/components/ui/failure-protocol-sheet";
import {
  validateWorkoutDraft,
  validateWorkoutRecordEntryState,
} from "@/entities/workout-record";
import {
  resolveWorkoutLogProgressionOverride,
  type ProgressionProtocolMode,
} from "./progression";
import { submitWorkoutLogDraft } from "./save";

type FailureProtocolSheetState = {
  title: string;
  description: string;
  mode: ProgressionProtocolMode;
  targets: FailureProtocolTarget[];
} | null;

import { useStore, useSetAtom } from "jotai";
import { draftAtom, visibleExercisesAtom, programEntryStateAtom, saveErrorAtom, workflowStateAtom } from "../store/workout-log-atoms";

type UseWorkoutLogSaveControllerInput = {
  locale: "ko" | "en";
  selectedPlan: {
    id: string;
    params?: Record<string, unknown> | null;
  } | null;
  bodyweightKg: number | null;
  persistenceKey: string | null;
  onSaved: (savedLogId: string | null) => void;
};

export function useWorkoutLogSaveController({
  locale,
  selectedPlan,
  bodyweightKg,
  persistenceKey,
  onSaved,
}: UseWorkoutLogSaveControllerInput) {
  const store = useStore();
  const setSaveError = useSetAtom(saveErrorAtom);
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const [failureProtocolSheet, setFailureProtocolSheet] =
    useState<FailureProtocolSheetState>(null);
  const failureProtocolResolveRef =
    useRef<((result: FailureProtocolResult) => void) | null>(null);

  const requestFailureProtocolChoice = useCallback(
    (input: NonNullable<FailureProtocolSheetState>) =>
      new Promise<FailureProtocolResult>((resolve) => {
        failureProtocolResolveRef.current = (result) => {
          setFailureProtocolSheet(null);
          failureProtocolResolveRef.current = null;
          resolve(result);
        };
        setFailureProtocolSheet(input);
      }),
    [],
  );

  const handleFailureProtocolSelect = useCallback(
    (result: FailureProtocolResult) => {
      failureProtocolResolveRef.current?.(result);
    },
    [],
  );

  const requestSave = useCallback(async () => {
    if (store.get(workflowStateAtom) === "saving") return;

    const draft = store.get(draftAtom);
    const visibleExercises = store.get(visibleExercisesAtom);
    const programEntryState = store.get(programEntryStateAtom);

    if (!draft) return;

    const entryErrors = validateWorkoutRecordEntryState(
      visibleExercises,
      programEntryState,
      locale,
    );
    if (entryErrors.length > 0) {
      setSaveError(
        entryErrors[0] ??
          (locale === "ko" ? "입력값을 확인해 주세요." : "Check your inputs."),
      );
      setWorkflowState("editing");
      return;
    }

    const validation = validateWorkoutDraft(draft, locale);
    if (!validation.valid) {
      setSaveError(
        validation.errors[0] ??
          (locale === "ko" ? "입력값을 확인해 주세요." : "Check your inputs."),
      );
      setWorkflowState("editing");
      return;
    }

    setWorkflowState("saving");
    setSaveError(null);

    try {
      const progression = await resolveWorkoutLogProgressionOverride({
        selectedPlanId: selectedPlan?.id,
        autoProgressionEnabled: selectedPlan?.params?.autoProgression === true,
        sessionWeek: draft.session.week,
        sessionDay: draft.session.day,
        visibleExercises,
        programEntryState,
        locale,
        requestChoice: requestFailureProtocolChoice,
      });
      if (progression.cancelled) {
        setWorkflowState("editing");
        return;
      }
      const saved = await submitWorkoutLogDraft({
        draft,
        bodyweightKg,
        progressionTargetDecisions: progression.decisions,
        persistenceKey,
      });

      const savedResponse = saved as { log?: { id?: unknown } } | null | undefined;
      const savedLogId =
        typeof savedResponse?.log?.id === "string" ? savedResponse.log.id : null;

      setWorkflowState("done");
      onSaved(savedLogId);
    } catch (error) {
      setSaveError(
        errorMessage(error) ??
          (locale === "ko"
            ? "운동기록 저장에 실패했습니다."
            : "Failed to save the workout log."),
      );
      setWorkflowState("editing");
    }
  }, [
    bodyweightKg,
    locale,
    onSaved,
    persistenceKey,
    requestFailureProtocolChoice,
    selectedPlan,
    setSaveError,
    setWorkflowState,
    store,
  ]);

  return {
    failureProtocolSheet,
    handleFailureProtocolSelect,
    requestSave,
  };
}
