import { expect, type Page } from "@playwright/test";

/**
 * role 의존 UI를 단언하기 전에 **클라이언트가 신원을 받아왔는지** 먼저 잠근다.
 *
 * 이 모듈이 따로 있는 이유는 하나다 — 앵커가 정말 무는지 확인하려면 앵커를 스펙 밖에서
 * 부를 수 있어야 한다(돌연변이 검증). 스펙 안에 두면 그걸 import하는 순간 그 스펙의
 * 테스트가 통째로 재등록된다.
 */

/** role 도착을 기다리는 기본 예산. 내비게이션 예산과 같은 값이지만 뜻이 다르다. */
export const ROLE_STATE_TIMEOUT = 30_000;

/**
 * 페이지가 **스스로** 낸 `/api/auth/me`가 200으로 돌아온 횟수.
 *
 * `page.request.get()`은 여기 잡히지 않는다 — 별도 컨텍스트라 페이지 네트워크 이벤트를
 * 내지 않는다(2026-08-27 실측으로 확인). 그래서 이 카운터는 서버가 뭐라 답하는지가
 * 아니라 **브라우저가 실제로 하이드레이션돼 스스로 물었는가**를 말한다.
 */
export type AuthMeTracker = { ok: () => number; lastStatus: () => number | null };
const authMeTrackers = new WeakMap<Page, AuthMeTracker>();

function authMeFor(page: Page): AuthMeTracker {
  const existing = authMeTrackers.get(page);
  if (existing) return existing;
  let ok = 0;
  let lastStatus: number | null = null;
  page.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/auth/me") return;
    lastStatus = response.status();
    if (response.status() === 200) ok += 1;
  });
  const tracker: AuthMeTracker = { ok: () => ok, lastStatus: () => lastStatus };
  authMeTrackers.set(page, tracker);
  return tracker;
}

/**
 * 이동한 뒤 그 화면이 **role을 받아올 때까지** 기다린다.
 *
 * role 의존 UI는 전부 이 응답 뒤에야 렌더된다 — 관리자 진입점(`use-more-screen-data`)도
 * 복귀 알약(`v2-impersonation-dock`)도 마운트 효과에서 `fetch("/api/auth/me")`를 부르고
 * **에러를 삼킨다.** 삼키기 때문에 요청이 실패해도 화면은 그냥 "관리자가 아닌" 모습으로
 * 뜬다 — 단언 입장에서 그건 회귀와 구분되지 않는다.
 *
 * 앵커가 없으면 실패가 원인을 가린다. dev 서버가 layout 청크를 못 줘 하이드레이션이
 * 통째로 죽었을 때(ChunkLoadError) 이 스펙은 "링크가 없다"·"알약이 없다"로 실패했다
 * (2026-08-27 로컬 실측, 실행마다 다른 테스트가 깨졌다). 앵커가 있으면 그 경우
 * **"role이 안 왔다"로 먼저** 실패하므로 UI 회귀와 헷갈리지 않는다.
 *
 * 리스너는 `goto` **전에** 붙어야 응답을 놓치지 않으므로 여기서 만든다.
 */
export async function gotoWithRole(
  page: Page,
  path: string,
  timeout = ROLE_STATE_TIMEOUT,
) {
  const authMe = authMeFor(page);
  const before = authMe.ok();
  await page.goto(path, { timeout });

  const deadline = Date.now() + timeout;
  while (authMe.ok() <= before && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }
  // 메시지는 루프가 끝난 **뒤** 만들어진다 — 마지막 상태가 실제 마지막이어야 한다.
  expect(
    authMe.ok(),
    `${path}: 페이지가 /api/auth/me를 200으로 받지 못했다` +
      `(마지막 상태: ${authMe.lastStatus() ?? "응답 없음"}). ` +
      "role 의존 UI는 이 응답 뒤에야 렌더되므로, 여기서 멈췄다면 원인은 UI가 아니라 " +
      "하이드레이션이나 인증이다.",
  ).toBeGreaterThan(before);
}
