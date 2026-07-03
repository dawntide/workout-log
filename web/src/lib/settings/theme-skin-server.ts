/**
 * 서버 전용 theme-skin 유틸리티.
 * next/headers를 동적 import해 클라이언트 번들 오염 방지.
 * 서버 컴포넌트/Route Handler에서만 import해야 함(i18n/server.ts와 동일 패턴).
 */
import { cache } from "react";
import {
  DEFAULT_THEME_SKIN,
  THEME_SKIN_COOKIE_NAME,
  normalizeThemeSkin,
  type ThemeSkin,
} from "./workout-preferences";

// PERF/정합: cache()로 요청 단위 메모이제이션(SSR 요청 간 공유 아님).
// wl_skin 쿠키를 읽어 SSR 첫 렌더 셸(paper/terminal)을 확정 → terminal 사용자의
// per-load paper→terminal remount + 바텀네비 flash 제거. 쿠키 부재 시 paper 폴백
// (최초 로드 1회만 구 방식 remount 후 applyThemeSkinToDocument가 쿠키를 써 수렴).
export const resolveRequestSkin = cache(async (): Promise<ThemeSkin> => {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const raw = cookieStore.get(THEME_SKIN_COOKIE_NAME)?.value;
  if (!raw) return DEFAULT_THEME_SKIN;
  return normalizeThemeSkin(raw);
});
