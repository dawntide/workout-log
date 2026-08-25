import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getExerciseDetailBootstrap } from "@/server/services/exercises/get-exercise-detail-bootstrap";
import { ExerciseDetailScreen } from "@/widgets/exercise-detail-screen";
import { getSettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import {
  normalizeIntensityInput,
  SETTINGS_KEYS,
} from "@/lib/settings/workout-preferences";
import ExerciseDetailLoading from "./loading";

async function ExerciseDetailContent({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const [bootstrap, settings] = await Promise.all([
    getExerciseDetailBootstrap(exerciseId),
    getSettingsSnapshot(),
  ]);
  if (bootstrap.exercise === null) {
    notFound();
  }
  // 표시 설정은 부트스트랩 payload에 넣지 않는다 — 그건 stats_cache에 담기는
  // 데이터이고, 화면 표시 방향은 캐시 대상이 아니다.
  return (
    <ExerciseDetailScreen
      {...bootstrap}
      intensityMode={normalizeIntensityInput(settings[SETTINGS_KEYS.intensityInput])}
    />
  );
}

export default function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  return (
    <Suspense fallback={<ExerciseDetailLoading />}>
      <ExerciseDetailContent params={params} />
    </Suspense>
  );
}
