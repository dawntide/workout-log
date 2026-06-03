import { Suspense } from "react";
import { ProgramStoreScreen } from "@/widgets/program-store-screen/program-store-screen";
import { getProgramStorePageBootstrap } from "@/server/services/program-store/get-program-store-page-bootstrap";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

async function ProgramStorePageContent() {
  const bootstrap = await getProgramStorePageBootstrap();
  return (
    <ProgramStoreScreen
      initialTemplates={bootstrap.initialTemplates}
      initialPlans={bootstrap.initialPlans}
      initialExercises={bootstrap.initialExercises}
    />
  );
}

function ProgramStoreLoading() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--token-page-bg)" }} />
  );
}

export default function ProgramStorePage() {
  return (
    <Suspense fallback={<ProgramStoreLoading />}>
      <ProgramStorePageContent />
    </Suspense>
  );
}
