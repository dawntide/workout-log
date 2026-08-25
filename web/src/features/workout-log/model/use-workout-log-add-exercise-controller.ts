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
  // 부위·장비 필터. 755종 사전에서 "빨리 찾기"를 위한 것이라 서버가 적용한다.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<string | null>(null);
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
        // 필터가 캐시 키에 들어가야 한다 — 안 그러면 필터를 바꿔도 이전 결과가 나온다.
        const cacheKey = `${normalizedQuery}|${categoryFilter ?? ""}|${equipmentFilter ?? ""}`;
        const cached = exerciseOptionsCacheRef.current.get(cacheKey);
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
        const nextItems = await fetchWorkoutExerciseOptions(queryValue, controller.signal, {
          category: categoryFilter,
          equipment: equipmentFilter,
        });
        exerciseOptionsCacheRef.current.set(cacheKey, nextItems);
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
    [categoryFilter, equipmentFilter, locale],
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
    // 필터도 함께 되돌린다. 검색어는 지우면서 필터만 남기면, 다음에 시트를 열었을 때
    // 빈 검색어에 필터만 걸린 목록이 나오고 왜 좁아졌는지 알 수 없다.
    setCategoryFilter(null);
    setEquipmentFilter(null);
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
    categoryFilter,
    setCategoryFilter,
    equipmentFilter,
    setEquipmentFilter,
    selectedExerciseOption,
    openAddExerciseSheet,
    closeAddExerciseSheet,
    selectExerciseOption,
    handleAddExercise,
  };
}
