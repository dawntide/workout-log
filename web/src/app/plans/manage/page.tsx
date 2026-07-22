import { Suspense } from "react";
import { getPlansForManage } from "@/server/services/plans/get-plans-for-manage";
import { PlansManageScreen } from "@/widgets/plans-manage-screen";
import PlansManageLoading from "./loading";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

// PERF: 서버 컴포넌트 래퍼 — DB에서 플랜 목록을 직접 조회하여 클라이언트에 초기 데이터 주입.
// 기존 순수 CSR(useEffect + 로딩 스피너) 대비 첫 화면 렌더 시간 단축.

async function PlansManagePageContent() {
  const initialPlans = await getPlansForManage();
  return <PlansManageScreen initialPlans={initialPlans} />;
}

export default function PlansManagePage() {
  return (
    <Suspense fallback={<PlansManageLoading />}>
      <PlansManagePageContent />
    </Suspense>
  );
}
