/**
 * 세션 쿠키 Secure 플래그 정책.
 *
 * 프로덕션(NODE_ENV=production)에서는 항상 Secure. 단 CI e2e는 프로덕션 빌드를
 * http://127.0.0.1로 구동하는데, http에서 Secure 쿠키는 브라우저·Playwright
 * request 컨텍스트가 저장하지 않아 실계정(signup 쿠키) 스펙이 전부 401이 된다
 * (2026-07-06 nightly prod 전환에서 실측). CI만 WORKOUT_ALLOW_INSECURE_COOKIES=1로
 * 옵트아웃한다 — 실배포(Vercel)에는 이 env가 없으므로 프로덕션 동작 무변경.
 */
export function sessionCookieSecure(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.WORKOUT_ALLOW_INSECURE_COOKIES !== "1"
  );
}
