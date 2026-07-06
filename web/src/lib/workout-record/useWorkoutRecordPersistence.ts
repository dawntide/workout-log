"use client";

import { useEffect, useCallback, useRef } from "react";
import { saveWorkoutDraft, loadWorkoutDraft, saveWorkoutDraftSync, type WorkoutDraftData } from "@/lib/storage/workoutDraftStore";
import type { WorkoutRecordDraft } from "@/lib/workout-record/model";
import { hasWorkoutEdits } from "@/lib/workout-record/model";
import type { WorkoutProgramExerciseEntryStateMap } from "@/lib/workout-record/entry-state";
import { hasProgramEntryStateEdits } from "@/lib/workout-record/entry-state";
import { debounce } from "@/lib/debounce";

const DRAFT_EXPIRATION_MS = 6 * 60 * 60 * 1000; // 6 hours

function toHandledDraftSignature(key: string, updatedAt: number) {
  return `${key}:${updatedAt}`;
}

export function useWorkoutRecordPersistence(
  key: string | null,
  draft: WorkoutRecordDraft | null,
  programEntryState: WorkoutProgramExerciseEntryStateMap,
  onRestore: (data: WorkoutDraftData) => Promise<boolean> | boolean,
  options: { enabled?: boolean; isUserEditing?: boolean } = { enabled: true }
) {
  const isRestoringRef = useRef(false);
  const lastHandledDraftRef = useRef<string | null>(null);

  // Refs to keep values stable in event listeners / unmount cleanup
  const keyRef = useRef(key);
  const draftRef = useRef(draft);
  const entryStateRef = useRef(programEntryState);
  const enabledRef = useRef(options.enabled);
  const isUserEditingRef = useRef(options.isUserEditing);

  // Keep refs in sync during render as well.
  // This closes a race where SPA navigation unmounts the component before the
  // post-commit effect runs, causing cleanup/save handlers to see stale draft data.
  keyRef.current = key;
  draftRef.current = draft;
  entryStateRef.current = programEntryState;
  enabledRef.current = options.enabled;
  isUserEditingRef.current = options.isUserEditing;

  const forceSave = useCallback(() => {
    if (!keyRef.current || !draftRef.current || !enabledRef.current) return;
    saveWorkoutDraft(keyRef.current, draftRef.current, entryStateRef.current);
    console.log(`[Persistence] Draft saved for key: ${keyRef.current}`);
  }, []);

  const forceSaveSync = useCallback(() => {
    if (!keyRef.current || !draftRef.current || !enabledRef.current) return;
    saveWorkoutDraftSync(keyRef.current, draftRef.current, entryStateRef.current);
    console.log(`[Persistence] Sync draft saved for key: ${keyRef.current}`);
  }, []);

  const debouncedSave = useRef(
    debounce((k: string, d: WorkoutRecordDraft, p: WorkoutProgramExerciseEntryStateMap) => {
      saveWorkoutDraft(k, d, p);
    }, 1000)
  ).current;

  // Auto-save on change - only when user is actively editing.
  // Why: a freshly loaded saved log (userExercises populated from the server) looks
  // structurally identical to a user-edited draft, so hasWorkoutEdits alone can't
  // distinguish them. Gating on workflow state prevents the loaded log from being
  // re-persisted as a recoverable draft, which would otherwise cause the recovery
  // modal to pop up on the next entry.
  useEffect(() => {
    if (!key || !draft || isRestoringRef.current) return;
    if (!options.isUserEditing) return;
    if (!hasWorkoutEdits(draft) && !hasProgramEntryStateEdits(programEntryState)) return;
    debouncedSave(key, draft, programEntryState);
  }, [key, draft, programEntryState, options.isUserEditing, debouncedSave]);

  // Cancel any pending debounced save when the user is no longer editing
  // (e.g., after a successful save flips state to "done").
  useEffect(() => {
    if (!options.isUserEditing) {
      debouncedSave.cancel();
    }
  }, [options.isUserEditing, debouncedSave]);

  // Restoration attempt
  const attemptRestore = useCallback(async (targetKey: string) => {
    if (!enabledRef.current || isRestoringRef.current) return;
    isRestoringRef.current = true;

    try {
      console.log(`[Persistence] Attempting restore for key: ${targetKey}`);
      const loaded = await loadWorkoutDraft(targetKey);
      if (loaded) {
        const isExpired = Date.now() - loaded.updatedAt > DRAFT_EXPIRATION_MS;
        if (!isExpired) {
          const handledSignature = toHandledDraftSignature(targetKey, loaded.updatedAt);
          if (lastHandledDraftRef.current === handledSignature) {
            console.log(`[Persistence] Draft already handled for key: ${targetKey}`);
            return;
          }

          if (!hasWorkoutEdits(loaded.draft) && !hasProgramEntryStateEdits(loaded.programEntryState)) {
            console.log(`[Persistence] Draft found but has no user edits, skipping restore`);
            lastHandledDraftRef.current = handledSignature;
          } else {
            console.log(`[Persistence] Valid draft found (updatedAt: ${loaded.updatedAt}), calling onRestore`);
            const restored = await onRestore(loaded);
            if (restored) {
              lastHandledDraftRef.current = handledSignature;
              console.log(`[Persistence] onRestore completed for key: ${targetKey}`);
            } else {
              console.log(`[Persistence] onRestore declined for key: ${targetKey}`);
            }
          }
        } else {
          console.log(`[Persistence] Expired draft found, ignoring`);
        }
      } else {
        console.log(`[Persistence] No draft found for key: ${targetKey}`);
      }
    } catch (e) {
      console.error("[Persistence] Restoration failed", e);
    } finally {
      isRestoringRef.current = false;
    }
  }, [onRestore]);

  // Save on unmount to handle client-side SPA navigation
  // pagehide covers browser-level navigation; this covers Next.js route changes where pagehide doesn't fire
  // NOTE: Do NOT check enabledRef.current here. During SPA navigation, Next.js updates pathname before
  // unmount, which flips isWorkoutLogRouteActive → enabled = false → enabledRef = false, causing the
  // save to be skipped and the draft to be lost. The unmount itself is the signal to save.
  useEffect(() => {
    return () => {
      debouncedSave.cancel(); // Prevent stale async save after remount
      if (
        keyRef.current &&
        draftRef.current &&
        !isRestoringRef.current &&
        isUserEditingRef.current &&
        (hasWorkoutEdits(draftRef.current) || hasProgramEntryStateEdits(entryStateRef.current))
      ) {
        saveWorkoutDraftSync(keyRef.current, draftRef.current, entryStateRef.current);
      }
    };
  }, [debouncedSave]);

  // Lifecycle events - Keep listeners stable
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isUserEditingRef.current) {
        forceSave();
      }
    };

    const handlePageHide = () => {
      // Use sync save on pagehide for maximum reliability - NO DYNAMIC IMPORTS
      if (
        keyRef.current &&
        draftRef.current &&
        enabledRef.current &&
        isUserEditingRef.current
      ) {
        saveWorkoutDraftSync(keyRef.current, draftRef.current, entryStateRef.current);
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      console.log(`[Persistence] Page shown (persisted: ${event.persisted})`);
      if (keyRef.current && enabledRef.current && !isRestoringRef.current) {
        attemptRestore(keyRef.current);
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow as EventListener);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow as EventListener);
    };
  }, [forceSave, attemptRestore]); // Only stable dependencies

  useEffect(() => {
    if (key && options.enabled) {
      attemptRestore(key);
    }
  }, [key, attemptRestore, options.enabled]);

  const cancelPendingSave = useCallback(() => {
    debouncedSave.cancel();
  }, [debouncedSave]);

  const resetRestoreState = useCallback(() => {
    lastHandledDraftRef.current = null;
  }, []);

  return { forceSave: forceSaveSync, cancelPendingSave, resetRestoreState };
}
