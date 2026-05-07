import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getExerciseDetailBootstrap } from "@/server/services/exercises/get-exercise-detail-bootstrap";
import { ExerciseDetailScreen } from "@/widgets/exercise-detail-screen";
import ExerciseDetailLoading from "./loading";

async function ExerciseDetailContent({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const bootstrap = await getExerciseDetailBootstrap(exerciseId);
  if (bootstrap.exercise === null) {
    notFound();
  }
  return <ExerciseDetailScreen {...bootstrap} />;
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
