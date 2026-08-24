import { getSettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { fetchExercisesServer } from "@/server/services/program-store/get-program-store-page-bootstrap";
import { RestTimerPageContent } from "./rest-timer-page-content";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

export default async function SettingsRestTimerPage() {
  const [snapshot, exercises] = await Promise.all([
    getSettingsSnapshot(),
    fetchExercisesServer(),
  ]);
  return <RestTimerPageContent initialSnapshot={snapshot} initialExercises={exercises} />;
}
