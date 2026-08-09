/**
 * 로컬 개발용 인증 폴백(`WORKOUT_AUTH_USER_ID`)이 이 런타임에서 유효한지 판정한다.
 *
 * **왜 잠그나.** 이 값이 살아 있으면 쿠키 없는 요청이 그 유저로 해석된다 — `proxy.ts`의
 * 세션 게이트를 통과시키고, `user.ts`가 그 값을 userId로 돌려준다. 배포 env에 실수로
 * 들어오면 RSC 페이지와 web 잔류 API 전부(`DELETE /api/auth/account` 포함)가 무인증으로
 * 열리는데, **에러도 로그도 남지 않아** 겉으로는 정상 동작과 구분되지 않는다.
 *
 * apps/api는 이미 같은 이유로 잠겨 있다([`apps/api/src/auth.ts`](../../../../apps/api/src/auth.ts)의
 * `localDevUserId`). 같은 env를 읽는 두 런타임의 정책이 갈려 있던 것이 이 모듈의 존재 이유다.
 *
 * **정책.**
 * - 비프로덕션: 종전과 동일하게 동작한다. 로컬 `.env.local`은 손댈 필요가 없다.
 * - 프로덕션 런타임: `WORKOUT_WEB_ALLOW_ENV_AUTH=1`로 **명시 opt-in** 해야만 살아난다.
 *
 * 프로덕션에서 통째로 막지 않고 문을 하나 남긴 건 E2E 때문이다 — 스모크·nightly 모두
 * `PLAYWRIGHT_SERVER_MODE=prod`로 **프로덕션 빌드**를 띄운 채 이 폴백에 의존한다. 그래서
 * 잠금은 "NODE_ENV만 보고 차단"이 아니라 "차단 + 명시 opt-in"이어야 한다. Vercel
 * 프로덕션에는 이 플래그를 세우지 않으므로, `WORKOUT_AUTH_USER_ID`가 혼자 들어와도
 * 아무 일도 일어나지 않는다.
 *
 * 참고: `process.env.X`는 미들웨어 번들에서 빌드 타임에 인라인될 수 있으므로 동적 키
 * 접근을 쓰지 않는다(리터럴 접근 유지).
 */
export function devFallbackUserId(): string {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.WORKOUT_WEB_ALLOW_ENV_AUTH !== "1"
  ) {
    return "";
  }
  return (process.env.WORKOUT_AUTH_USER_ID ?? "").trim();
}
