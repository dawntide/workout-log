import { apiGet } from "@/shared/api";
import { fetchSettingsSnapshot } from "@/lib/settings/settings-api";
import type { SettingsSnapshot } from "@/lib/settings/workout-preferences";
import type {
  WorkoutLogExerciseResponse,
  WorkoutLogExerciseOption,
  WorkoutLogPlanItem,
  WorkoutLogPlansResponse,
} from "./types";

type WorkoutLogClientBootstrapInput = {
  initialPlans?: WorkoutLogPlanItem[];
  initialSettings?: SettingsSnapshot | null;
};

type WorkoutLogClientBootstrapResult = {
  plans: WorkoutLogPlanItem[];
  settingsSnapshot: SettingsSnapshot | null;
};

export async function getWorkoutLogClientBootstrap({
  initialPlans,
  initialSettings,
}: WorkoutLogClientBootstrapInput): Promise<WorkoutLogClientBootstrapResult> {
  if (initialPlans != null) {
    return {
      plans: initialPlans,
      settingsSnapshot: initialSettings ?? null,
    };
  }

  const [planRes, settingsSnapshot] = await Promise.all([
    apiGet<WorkoutLogPlansResponse>("/api/plans"),
    fetchSettingsSnapshot().catch(() => null),
  ]);

  return {
    plans: planRes.items ?? [],
    settingsSnapshot,
  };
}

export async function fetchWorkoutExerciseOptions(
  queryValue: string,
  signal?: AbortSignal,
  filters?: { category?: string | null; equipment?: string | null },
): Promise<WorkoutLogExerciseOption[]> {
  const params = new URLSearchParams({ limit: "40" });
  if (queryValue.trim()) {
    params.set("query", queryValue.trim());
  }
  // 사전이 755종이라 필터 없이는 "squat" 한 번에 57건이 나온다. 서버가 필터·정렬을
  // 맡으므로(내가 기록한 종목 우선) 클라이언트는 파라미터만 실어 보낸다.
  if (filters?.category) params.set("category", filters.category);
  if (filters?.equipment) params.set("equipment", filters.equipment);

  // **network-only다.** 기본 SWR은 stale을 즉시 돌려주고 백그라운드로만 갱신하는데,
  // 이 호출은 `onRevalidated`를 받지 않으므로 갱신분이 화면에 영영 안 닿는다. 응답
  // 순서가 사용자 기록에 따라 바뀌는(사용 이력 우선) 지금은 세션을 저장한 직후에
  // 정확히 낡은 순서가 굳는다. 같은 검색어 반복은 컨트롤러의 in-memory 캐시가 막고
  // 입력은 디바운스돼 있어서, 캐시를 빼도 실제 요청 수는 거의 그대로다.
  const response = await apiGet<WorkoutLogExerciseResponse>(
    `/api/exercises?${params.toString()}`,
    { signal, cachePolicy: "network-only" },
  );

  return response.items ?? [];
}
