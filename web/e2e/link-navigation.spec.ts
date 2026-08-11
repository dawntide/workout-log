/**
 * 링크 네비게이션 회귀 가드 — PR 스모크 레인
 *
 * `app-shell`은 내부 `<a>` 클릭을 window 리스너에서 가로채 `router.push`로 바꾼다
 * ([app-shell.tsx](../src/components/app-shell.tsx)). 문제는 next/link가 렌더한 앵커다 —
 * Link의 onClick은 React 위임 핸들러라 window 리스너보다 **먼저** 돌면서 preventDefault +
 * 클라 네비게이션을 이미 끝낸다. 인터셉터가 그걸 모르고 한 번 더 push하면 같은 이동이
 * 두 번 일어난다.
 *
 * 이 결함이 오래 조용했던 이유가 곧 이 파일이 존재하는 이유다: 렌더 결과가 같아서 스모크로
 * 안 잡히고, 히스토리는 라우터가 합쳐 `pushState`가 1회라 뒤로가기도 멀쩡하다. **네트워크를
 * 세야만 보인다.** 2026-08-11 실측(수정 전) — next/link 클릭 시 `/plans/manage?_rsc=…`
 * 요청 2건(같은 URL·prefetch 아님), raw `<a>`인 하단 네비는 1건.
 *
 * 그래서 두 경로를 같이 고정한다. 중복을 막겠다고 인터셉터를 과하게 잠그면 raw `<a>`가
 * 풀 페이지 리로드로 떨어지는데, 그것도 화면상으론 정상으로 보이기 때문이다.
 */
import { expect, test, type Page } from "@playwright/test";

const NAV_TIMEOUT = 30_000;
// 중복 요청은 첫 요청 직후에 따라붙는다. "없음"을 단정하려면 URL 전환 뒤 잠깐 더 본다.
const SETTLE_MS = 1_000;

/** 네비게이션용 RSC 요청만 수집한다(prefetch는 클릭과 무관하게 발생하므로 제외). */
function collectNavigationRscRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("_rsc=")) return;
    if (req.headers()["next-router-prefetch"]) return;
    urls.push(url);
  });
  return urls;
}

/**
 * 앱 셸이 렌더되는 환경인지 확인한다. 외부 preview(PLAYWRIGHT_BASE_URL) E2E에는 인증
 * 사용자가 없어 /login으로 밀리고, 그 화면엔 하단 네비도 앱 링크도 없다.
 */
async function skipIfUnauthenticated(page: Page) {
  const path = new URL(page.url()).pathname;
  test.skip(
    path.startsWith("/login"),
    "미인증 환경(외부 preview)에서는 앱 셸이 렌더되지 않는다",
  );
}

test.describe("링크 네비게이션 — 앵커 인터셉터", () => {
  test("next/link 클릭은 RSC 페이로드를 한 번만 받아온다", async ({ page }) => {
    await page.goto("/calendar", { timeout: NAV_TIMEOUT });
    await skipIfUnauthenticated(page);

    // 캘린더 필터바의 "관리"(next/link). 개수를 단정해 링크가 사라지거나 늘어나면
    // 가드가 조용히 통과하지 않고 실패하게 둔다.
    const manageLink = page.locator('a[href="/plans/manage"]');
    await expect(manageLink).toHaveCount(1);

    const rscRequests = collectNavigationRscRequests(page);
    await manageLink.click();
    await page.waitForURL(/\/plans\/manage/, { timeout: NAV_TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);

    const forTarget = rscRequests.filter((u) => u.includes("/plans/manage"));
    expect(
      forTarget,
      "같은 이동에 대한 RSC 요청은 1건이어야 한다(2건 = Link와 인터셉터가 둘 다 push)",
    ).toHaveLength(1);
  });

  test("raw <a>(하단 네비)는 여전히 클라이언트 네비게이션이다", async ({ page }) => {
    await page.goto("/calendar", { timeout: NAV_TIMEOUT });
    await skipIfUnauthenticated(page);

    const storeLink = page.locator('a.v2-action-dock__item[href="/program-store"]');
    await expect(storeLink).toHaveCount(1);

    // 풀 페이지 리로드 감지용 마커 — 살아남으면 문서가 유지된 것(=클라 네비게이션).
    await page.evaluate(() => {
      (window as unknown as { __navMarker?: number }).__navMarker = 1;
    });

    const rscRequests = collectNavigationRscRequests(page);
    await storeLink.click();
    await page.waitForURL(/\/program-store/, { timeout: NAV_TIMEOUT });
    await page.waitForTimeout(SETTLE_MS);

    const markerSurvived = await page.evaluate(
      () => (window as unknown as { __navMarker?: number }).__navMarker === 1,
    );
    expect(
      markerSurvived,
      "인터셉터가 raw <a>를 계속 가로채야 한다(마커 소실 = 풀 페이지 리로드)",
    ).toBe(true);

    const forTarget = rscRequests.filter((u) => u.includes("/program-store"));
    expect(forTarget, "RSC 요청은 1건이어야 한다").toHaveLength(1);
  });
});
