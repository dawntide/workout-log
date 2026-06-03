import { Suspense } from "react";
import { WorkoutLogScreen } from "@/widgets/workout-log-screen";
import { getWorkoutLogPageBootstrap } from "@/server/services/workout-log/get-workout-log-page-bootstrap";
import WorkoutRecordLoading from "./loading";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function WorkoutLogPageContent({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const bootstrap = await getWorkoutLogPageBootstrap(resolvedParams);
  return <WorkoutLogScreen {...bootstrap} />;
}

export default function WorkoutLogPage(props: PageProps) {
  return (
    <Suspense fallback={<WorkoutRecordLoading />}>
      <WorkoutLogPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}
