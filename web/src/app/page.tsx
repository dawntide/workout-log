import { Suspense } from "react";
import { cookies } from "next/headers";
import { getHomeData } from "@workout/core/home/home-service";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { V2HomeDashboard } from "@/widgets/home-dashboard/v2-home-dashboard";
import { V2OnboardingRedirect } from "@/components/v2/v2-onboarding-redirect";
import HomeLoading from "./loading";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

async function HomeContent() {
  const userId = await requireAuthenticatedUserId();
  const locale = await resolveRequestLocale();

  const cookieStore = await cookies();
  const timezone = cookieStore.get("timezone")?.value ?? "UTC";

  // DB 쿼리 및 데이터 빌드를 서버에서 직접 실행
  const data = await getHomeData({
    userId,
    locale,
    timezone,
  });

  const hasExistingData =
    data.quickStats.totalSessions > 0 || data.planOverview.totalPlans > 0;

  return (
    <>
      <V2OnboardingRedirect hasExistingData={hasExistingData} />
      <V2HomeDashboard data={data} />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
