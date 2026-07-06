import { errorMessage } from "@/lib/error-message";
import type { Dispatch, SetStateAction } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchWorkoutExerciseOptions } from "./client";
import {
  buildAddExerciseDraftUpdate,
  buildSelectedExerciseDraft,
} from "./editor-actions";
import {
  createDefaultAddExerciseDraft,
  type AddExerciseDraft,
  type WorkoutLogExerciseOption,
} from "./types";

import { useStore, useSetAtom } from "jotai";
import { draftAtom, workflowStateAtom } from "../store/workout-log-atoms";

type UseWorkoutLogAddExerciseControllerInput = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  locale: "ko" | "en";
};

export function useWorkoutLogAddExerciseController({
  open,
  setOpen,
  locale,
}: UseWorkoutLogAddExerciseControllerInput) {
  const store = useStore();
  const setDraft = useSetAtom(draftAtom);
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const deferredExerciseQuery = useDeferredValue(exerciseQuery);
  const [exerciseOptions, setExerciseOptions] = useState<WorkoutLogExerciseOption[]>([]);
  const [exerciseOptionsLoading, setExerciseOptionsLoading] = useState(false);
  const [exerciseOptionsError, setExerciseOptionsError] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<AddExerciseDraft>(createDefaultAddExerciseDraft);
  const exerciseOptionsCacheRef = useRef(new Map<string, WorkoutLogExerciseOption[]>());
  const exerciseOptionsAbortRef = useRef<AbortController | null>(null);

  const filteredExerciseOptions = useMemo(() => {
    const normalizedQuery = deferredExerciseQuery.trim().toLowerCase();
    if (!normalizedQuery) return exerciseOptions;
    return exerciseOptions.filter((option) => {
      const aliasMatched = option.aliases.some((alias) =>
        alias.toLowerCase().includes(normalizedQuery),
      );
      return (
        option.name.toLowerCase().includes(normalizedQuery) ||
        (option.category ?? "").toLowerCase().includes(normalizedQuery) ||
        aliasMatched
      );
    });
  }, [deferredExerciseQuery, exerciseOptions]);

  const selectedExerciseOption = useMemo(
    () =>
      addDraft.exerciseId
        ? exerciseOptions.find((option) => option.id === addDraft.exerciseId) ?? null
        : null,
    [addDraft.exerciseId, exerciseOptions],
  );

  const loadExerciseOptions = useCallback(
    async (queryValue: string) => {
      try {
        const normalizedQuery = queryValue.trim().toLowerCase();
        const cached = exerciseOptionsCacheRef.current.get(normalizedQuery);
        if (cached) {
          setExerciseOptions(cached);
          setExerciseOptionsError(null);
          return;
        }

        exerciseOptionsAbortRef.current?.abort();
        const controller = new AbortController();
        exerciseOptionsAbortRef.current = controller;
        setExerciseOptionsLoading(true);
        setExerciseOptionsError(null);
        const nextItems = await fetchWorkoutExerciseOptions(queryValue, controller.signal);
        exerciseOptionsCacheRef.current.set(normalizedQuery, nextItems);
        setExerciseOptions(nextItems);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setExerciseOptionsError(
          errorMessage(error) ??
            (locale === "ko"
              ? "운동종목 목록을 불러오지 못했습니다."
              : "Could not load the exercise list."),
        );
      } finally {
        setExerciseOptionsLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void loadExerciseOptions(deferredExerciseQuery);
    }, 160);
    return () => {
      window.clearTimeout(timer);
    };
  }, [deferredExerciseQuery, loadExerciseOptions, open]);

  useEffect(
    () => () => {
      exerciseOptionsAbortRef.current?.abort();
    },
    [],
  );

  const resetAddExerciseSheetState = useCallback(() => {
    setExerciseQuery("");
    setExerciseOptionsError(null);
    setAddDraft(createDefaultAddExerciseDraft());
  }, []);

  const closeAddExerciseSheet = useCallback(() => {
    setOpen(false);
    resetAddExerciseSheetState();
  }, [resetAddExerciseSheetState, setOpen]);

  const openAddExerciseSheet = useCallback(() => {
    resetAddExerciseSheetState();
    setOpen(true);
  }, [resetAddExerciseSheetState, setOpen]);

  const selectExerciseOption = useCallback(
    (option: WorkoutLogExerciseOption | null) => {
      setAddDraft(buildSelectedExerciseDraft(option));
      setExerciseOptionsError(null);
      setExerciseQuery("");
    },
    [],
  );

  const handleAddExercise = useCallback(() => {
    const draft = store.get(draftAtom);
    if (!draft) return;

    const result = buildAddExerciseDraftUpdate(addDraft, locale);
    if (!result.ok) {
      setExerciseOptionsError(result.error);
      return;
    }

    setDraft((prev) => {
      if (!prev) return prev;
      return result.draftUpdater(prev);
    });
    setWorkflowState("editing");
    closeAddExerciseSheet();
  }, [
    addDraft,
    closeAddExerciseSheet,
    locale,
    setDraft,
    setWorkflowState,
    store,
  ]);

  return {
    addDraft,
    setAddDraft,
    exerciseQuery,
    setExerciseQuery,
    exerciseOptionsError,
    setExerciseOptionsError,
    exerciseOptionsLoading,
    filteredExerciseOptions,
    selectedExerciseOption,
    openAddExerciseSheet,
    closeAddExerciseSheet,
    selectExerciseOption,
    handleAddExercise,
  };
}
