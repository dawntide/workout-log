import { useCallback, useEffect, useRef } from "react";
import {
  buildExerciseActionUpdate,
  type ExerciseRowAction,
} from "./editor-actions";
import type { WorkoutPreferences } from "@/lib/settings/workout-preferences";
import type {
  WorkoutExerciseViewModel,
  WorkoutRecordDraft,
} from "@/entities/workout-record";
import { resolveWorkoutWeightWithPreferences } from "@/lib/workout-record/weight-rules";

import { useSetAtom, useAtomValue } from "jotai";
import { draftAtom, programEntryStateAtom, workflowStateAtom, workoutPreferencesAtom, visibleExercisesAtom } from "../store/workout-log-atoms";

export function useWorkoutLogEditorController() {
  const setDraft = useSetAtom(draftAtom);
  const setProgramEntryState = useSetAtom(programEntryStateAtom);
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const workoutPreferences = useAtomValue(workoutPreferencesAtom);
  const visibleExercises = useAtomValue(visibleExercisesAtom);
  const visibleExercisesRef = useRef<WorkoutExerciseViewModel[]>(visibleExercises);
  const workoutPreferencesRef = useRef<WorkoutPreferences>(workoutPreferences);

  useEffect(() => {
    visibleExercisesRef.current = visibleExercises;
    workoutPreferencesRef.current = workoutPreferences;
  }, [visibleExercises, workoutPreferences]);

  const resolveWeightWithCurrentPreferences = useCallback(
    (weightKg: number, exerciseId: string | null | undefined, exerciseName: string) =>
      resolveWorkoutWeightWithPreferences(
        weightKg,
        exerciseId,
        exerciseName,
        workoutPreferences,
      ),
    [workoutPreferences],
  );

  const applyEditing = useCallback(
    (updater: (prev: WorkoutRecordDraft) => WorkoutRecordDraft) => {
      setDraft((prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
      setWorkflowState((prev) => (prev === "saving" ? prev : "editing"));
    },
    [setDraft, setWorkflowState],
  );

  const handleExerciseAction = useCallback(
    (exerciseId: string, action: ExerciseRowAction) => {
      const exercise = visibleExercisesRef.current.find((entry) => entry.id === exerciseId);
      if (!exercise) return;
      const update = buildExerciseActionUpdate(
        exerciseId,
        exercise,
        action,
        workoutPreferencesRef.current,
        resolveWorkoutWeightWithPreferences,
      );
      if (!update) return;
      if (update.programEntryStateUpdater) {
        setProgramEntryState(update.programEntryStateUpdater);
      }
      applyEditing(update.draftUpdater);
    },
    [applyEditing, setProgramEntryState],
  );

  const handleSessionMemoChange = useCallback(
    (nextMemo: string) => {
      applyEditing((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          note: {
            memo: nextMemo,
          },
        },
      }));
    },
    [applyEditing],
  );

  // Updates sessionDate and performedAt when user changes the date while editing an existing log
  const handleSessionDateChange = useCallback(
    (newDateKey: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateKey)) return;
      applyEditing((prev) => {
        const [year, month, day] = newDateKey.split("-").map(Number);
        const prevPerformedAt = new Date(prev.session.performedAt);
        const newPerformedAt = new Date(
          year!,
          (month ?? 1) - 1,
          day ?? 1,
          prevPerformedAt.getHours(),
          prevPerformedAt.getMinutes(),
          prevPerformedAt.getSeconds(),
          prevPerformedAt.getMilliseconds(),
        );
        return {
          ...prev,
          session: {
            ...prev.session,
            sessionDate: newDateKey,
            performedAt: newPerformedAt.toISOString(),
          },
        };
      });
    },
    [applyEditing],
  );

  return {
    resolveWeightWithCurrentPreferences,
    handleExerciseAction,
    handleSessionMemoChange,
    handleSessionDateChange,
  };
}
