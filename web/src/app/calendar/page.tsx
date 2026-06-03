import { Suspense } from "react";
import { getCalendarPageBootstrap } from "@/server/services/calendar/get-calendar-page-bootstrap";
import { CalendarScreen } from "@/widgets/calendar-screen";
import CalendarLoading from "./loading";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

async function CalendarPageContent() {
  const bootstrap = await getCalendarPageBootstrap();
  return <CalendarScreen {...bootstrap} />;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarLoading />}>
      <CalendarPageContent />
    </Suspense>
  );
}
