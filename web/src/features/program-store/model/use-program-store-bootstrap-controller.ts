import { errorMessage } from "@/lib/error-message";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, isAbortError } from "@/lib/api";
import type { ProgramTemplate } from "@workout/core/program-store/model";
import type {
  ExerciseOption,
  ExerciseResponse,
  PlanItem,
  PlansResponse,
  ProgramStoreQueryState,
  TemplatesResponse,
} from "./types";

function readSearchQueryFromLocation(): ProgramStoreQueryState {
  if (typeof window === "undefined") {
    return {
      detail: "",
      customize: "",
      create: "",
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    detail: params.get("detail") ?? "",
    customize: params.get("customize") ?? "",
    create: params.get("create") ?? "",
  };
}

function replaceAbortController(ref: { current: AbortController | null }) {
  ref.current?.abort();
  const controller = new AbortController();
  ref.current = controller;
  return controller;
}

type UseProgramStoreBootstrapControllerInput = {
  locale: "ko" | "en";
  initialTemplates?: ProgramTemplate[] | null;
  initialPlans?: PlanItem[] | null;
  initialExercises?: ExerciseOption[] | null;
  setTemplates: React.Dispatch<React.SetStateAction<ProgramTemplate[]>>;
  setPlans: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  setExerciseOptions: React.Dispatch<React.SetStateAction<ExerciseOption[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useProgramStoreBootstrapController({
  locale,
  initialTemplates,
  initialPlans,
  initialExercises,
  setTemplates,
  setPlans,
  setExerciseOptions,
  setError,
}: UseProgramStoreBootstrapControllerInput) {
  const hasInitialData = Boolean(initialTemplates && initialPlans && initialExercises);
  const [loading, setLoading] = useState(!hasInitialData);
  const [storeLoadKey, setStoreLoadKey] = useState("program-store:init");
  const [exerciseOptionsLoading, setExerciseOptionsLoading] = useState(false);
  const [queryState, setQueryState] = useState<ProgramStoreQueryState>(() =>
    readSearchQueryFromLocation(),
  );

  const storeLoadControllerRef = useRef<AbortController | null>(null);
  const storeHasLoadedRef = useRef(hasInitialData);
  const exerciseOptionsControllerRef = useRef<AbortController | null>(null);

  const loadStore = useCallback(
    async (options?: { isRefresh?: boolean }) => {
      const controller = replaceAbortController(storeLoadControllerRef);
      try {
        if (!storeHasLoadedRef.current && !options?.isRefresh) {
          setLoading(true);
        }
        setError(null);
        setStoreLoadKey(`program-store:${Date.now()}`);
        const [templatesRes, plansRes] = await Promise.all([
          apiGet<TemplatesResponse>("/api/templates?limit=200", {
            signal: controller.signal,
          }),
          apiGet<PlansResponse>("/api/plans", {
            signal: controller.signal,
          }),
        ]);
        if (storeLoadControllerRef.current !== controller) return;
        storeHasLoadedRef.current = true;
        setTemplates(templatesRes.items ?? []);
        setPlans(plansRes.items ?? []);
      } catch (error) {
        if (isAbortError(error) || storeLoadControllerRef.current !== controller) {
          return;
        }
        setError(
          errorMessage(error) ??
            (locale === "ko"
              ? "프로그램 데이터를 불러오지 못했습니다."
              : "Could not load program data."),
        );
      } finally {
        if (storeLoadControllerRef.current === controller) {
          storeLoadControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [locale, setError, setPlans, setTemplates],
  );

  const loadExerciseOptions = useCallback(async () => {
    const controller = replaceAbortController(exerciseOptionsControllerRef);
    try {
      setExerciseOptionsLoading(true);
      const response = await apiGet<ExerciseResponse>("/api/exercises?limit=250", {
        signal: controller.signal,
      });
      if (exerciseOptionsControllerRef.current !== controller) return;
      setExerciseOptions(response.items ?? []);
    } catch (error) {
      if (
        isAbortError(error) ||
        exerciseOptionsControllerRef.current !== controller
      ) {
        return;
      }
      setExerciseOptions([]);
    } finally {
      if (exerciseOptionsControllerRef.current === controller) {
        exerciseOptionsControllerRef.current = null;
        setExerciseOptionsLoading(false);
      }
    }
  }, [setExerciseOptions]);

  // SSR 초기 데이터 적용 (API 호출 불필요)
  useEffect(() => {
    if (initialTemplates && initialPlans && initialExercises) {
      setTemplates(initialTemplates);
      setPlans(initialPlans);
      setExerciseOptions(initialExercises);
      setLoading(false);
      return;
    }
    // SSR 데이터 없으면 API 로드
    void loadStore();
    void loadExerciseOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only: initialData는 변경되지 않는 SSR 스냅샷

  useEffect(() => {
    return () => {
      storeLoadControllerRef.current?.abort();
      exerciseOptionsControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setQueryState(readSearchQueryFromLocation());
    const onPopState = () => {
      setQueryState(readSearchQueryFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    loading,
    storeLoadKey,
    exerciseOptionsLoading,
    queryState,
    loadStore,
  };
}
