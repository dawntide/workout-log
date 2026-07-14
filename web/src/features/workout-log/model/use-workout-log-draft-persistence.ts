"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { clearWorkoutDraft, type WorkoutDraftData } from "@/lib/storage/workoutDraftStore";
import { useWorkoutRecordPersistence } from "@/lib/workout-record/useWorkoutRecordPersistence";
import { isWorkoutDraftProtocolCompatible } from "@/lib/workout-record/model";
import type {
  PendingRestorePrompt,
} from "@/features/workout-log/model/editor-actions";
import { useAtomValue } from "jotai";
import { draftAtom, programEntryStateAtom, workflowStateAtom } from "../store/workout-log-atoms";

type UseWorkoutLogDraftPersistenceInput = {
  persistenceKey: string | null;
  onRestoreAccepted: (data: WorkoutDraftData) => void;
  enabled?: boolean;
};

export function useWorkoutLogDraftPersistence({
  persistenceKey,
  onRestoreAccepted,
  enabled = true,
}: UseWorkoutLogDraftPersistenceInput) {
  const draft = useAtomValue(draftAtom);
  const programEntryState = useAtomValue(programEntryStateAtom);
  const workflowState = useAtomValue(workflowStateAtom);
  const isUserEditing = workflowState === "editing";
  const isRestoredRef = useRef(false);
  const currentDraftRef = useRef(draft);
  const isRestoringRef = useRef(false);
  const persistenceKeyRef = useRef<string | null>(null);
  const reloadDraftContextRef = useRef<(() => Promise<void>) | null>(null);
  const [pendingRestorePrompt, setPendingRestorePrompt] = useState<PendingRestorePrompt | null>(null);
  const restorePromptResolveRef = useRef<((keep: boolean) => void) | null>(null);
  currentDraftRef.current = draft;

  useEffect(() => {
    persistenceKeyRef.current = persistenceKey;
    isRestoredRef.current = false;
  }, [persistenceKey]);

  const { resetRestoreState } = useWorkoutRecordPersistence(
    persistenceKey,
    draft,
    programEntryState,
    useCallback(async (data) => {
      isRestoredRef.current = true;
      isRestoringRef.current = true;

      const capturedKey = persistenceKeyRef.current;

      try {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (!isWorkoutDraftProtocolCompatible(currentDraftRef.current, data.draft)) {
          isRestoredRef.current = false;
          if (capturedKey) await clearWorkoutDraft(capturedKey);
          await reloadDraftContextRef.current?.();
          return false;
        }
        const shouldKeep = await new Promise<boolean>((resolve) => {
          restorePromptResolveRef.current = resolve;
          setPendingRestorePrompt({
            capturedKey,
            data,
          });
        });

        if (shouldKeep) {
          startTransition(() => {
            onRestoreAccepted(data);
          });
          return true;
        }

        isRestoredRef.current = false;
        if (capturedKey) {
          await clearWorkoutDraft(capturedKey);
        }
        await reloadDraftContextRef.current?.();
        return false;
      } finally {
        restorePromptResolveRef.current = null;
        isRestoringRef.current = false;
      }
    }, [onRestoreAccepted]),
    { enabled, isUserEditing },
  );

  useEffect(() => {
    if (enabled) return;
    isRestoredRef.current = false;
    isRestoringRef.current = false;
    restorePromptResolveRef.current?.(false);
    restorePromptResolveRef.current = null;
    setPendingRestorePrompt(null);
    resetRestoreState();
  }, [enabled, resetRestoreState]);

  useEffect(() => {
    if (!enabled || !persistenceKey) return;
    // When returning to workout log via SPA navigation, force the same key
    // to be eligible for restore again. Without this, a stale "already handled"
    // mark from a previous mount/pass can suppress the modal intermittently.
    isRestoredRef.current = false;
    resetRestoreState();
  }, [enabled, persistenceKey, resetRestoreState]);

  const resolveRestorePrompt = useCallback((keep: boolean) => {
    restorePromptResolveRef.current?.(keep);
    restorePromptResolveRef.current = null;
    setPendingRestorePrompt(null);
  }, []);

  const registerReloadDraftContext = useCallback((fn: (() => Promise<void>) | null) => {
    reloadDraftContextRef.current = fn;
  }, []);

  const hasRestoredDraft = useCallback(() => isRestoredRef.current, []);

  return {
    pendingRestorePrompt,
    resolveRestorePrompt,
    isRestoreFlowActive: pendingRestorePrompt !== null || isRestoringRef.current,
    registerReloadDraftContext,
    hasRestoredDraft,
  };
}
