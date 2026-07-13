/**
 * Smoke E2E — PR 필수 게이트
 *
 * 목적: 배포 전 앱의 핵심 페이지가 500 없이 렌더링되는지 확인.
 *      세부 UX/비즈니스 로직은 다른 spec에서 검증.
 *
 * 전제: 테스트 실행 전 DB 마이그레이션 + seed 완료 (CI에서 자동 수행)
 */
import { expect, test, type Page } from "@playwright/test";

// CI에서 서버가 응답하기까지 여유를 줌
const NAV_TIMEOUT = 30_000;

function expectSuccessfulPageResponse(
  response: Awaited<ReturnType<Page["goto"]>>,
) {
  expect(response, "navigation should return a document response").not.toBeNull();
  expect(response?.status(), "page should resolve to HTTP 200").toBe(200);
}

// 렌더 크래시(에러 바운더리 노출) 감지.
// status 검사만으론 부족하다 — RSC 직렬화 크래시(#491 F4) 같은 렌더 에러는 200 + 커스텀
// 에러 바운더리("다시 시도")로 나타난다. "다시 시도" 텍스트는 정상 retry UI에도 쓰여
// false-positive이므로, error.tsx·global-error.tsx에 단 전용 data-app-error-boundary
// 속성이 하나도 없어야 한다(있으면 = 그 라우트가 크래시). CI가 prod 빌드로 도는 것과 짝을
// 이뤄 "프로덕션에서만 터지는 렌더 크래시"를 머지 전에 게이트한다.
async function expectNoRenderCrash(page: Page) {
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  await expect(page.locator("[data-app-error-boundary]")).toHaveCount(0);
}

test.describe("smoke — core pages render", () => {
  test("홈 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });

  test("운동 기록 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/workout/log", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });

  test("통계 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/stats", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expect(page).toHaveURL(/\/?deck=stats$/);
    await expectNoRenderCrash(page);
  });

  test("플랜 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/plans", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });

  test("설정 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/settings", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });

  test("계정 설정 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/settings/account", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });

  test("PR 이력 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/stats/prs", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });

  test("로그인 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/login", { timeout: NAV_TIMEOUT });
    expectSuccessfulPageResponse(response);
    await expectNoRenderCrash(page);
  });
});

test.describe("smoke — API health", () => {
  test("health API 200 응답", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });
});

test.describe("smoke — core navigation flow", () => {
  test("홈에서 운동 기록으로 이동", async ({ page }) => {
    await page.goto("/", { timeout: NAV_TIMEOUT });
    // 앱이 로드될 때까지 대기
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
      // networkidle이 오래 걸릴 수 있어 timeout 무시
    });

    // 실제 하단 내비게이션을 눌러 AppShell의 클라이언트 전환까지 검증한다.
    await page.getByRole("link", { name: /기록|Log/ }).click();
    await expect(page).toHaveURL(/\/workout\/log/);
    await expectNoRenderCrash(page);
  });

  test("프로그램 스토어 화면 밖 카드가 스크롤 시 렌더", async ({ page }) => {
    const response = await page.goto("/program-store", {
      timeout: NAV_TIMEOUT,
    });
    expectSuccessfulPageResponse(response);

    const cards = page.locator(".program-list-card");
    await expect(cards.first()).toBeVisible();
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(2);

    const lastCard = cards.last();
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard).toBeVisible();
    const lastCardHeading = lastCard.getByRole("heading", { level: 2 });
    await expect(lastCardHeading).toBeVisible();
    await expect(lastCardHeading).toHaveText(/\S/);
  });
});
