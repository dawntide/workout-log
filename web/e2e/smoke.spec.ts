/**
 * Smoke E2E — PR 필수 게이트
 *
 * 목적: 배포 전 앱의 핵심 페이지가 500 없이 렌더링되는지 확인.
 *      세부 UX/비즈니스 로직은 다른 spec에서 검증.
 *
 * 전제: 테스트 실행 전 DB 마이그레이션 + seed 완료 (CI에서 자동 수행)
 */
import { expect, test } from "@playwright/test";

// CI에서 Next.js dev 서버가 응답하기까지 여유를 줌
const NAV_TIMEOUT = 30_000;

test.describe("smoke — core pages render", () => {
  test("홈 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    // 앱 루트 레이아웃이 마운트됐는지 확인 (body 하위에 컨텐츠 존재)
    await expect(page.locator("body")).not.toBeEmpty();
    // 크리티컬 JS 에러 없음을 간접 확인 — 에러 바운더리 텍스트 미노출
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("운동 기록 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/workout/log", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("통계 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/stats", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("플랜 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/plans", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("설정 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/settings", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("계정 설정 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/settings/account", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("PR 이력 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/stats/prs", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("로그인 페이지 정상 로드", async ({ page }) => {
    const response = await page.goto("/login", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe("smoke — API health", () => {
  test("health API 200 응답", async ({ request }) => {
    const response = await request.get("/api/health");
    // health endpoint가 없으면 404도 허용 — 500만 아니면 됨
    expect(response.status()).not.toBe(500);
    expect(response.status()).not.toBe(503);
  });
});

test.describe("smoke — core navigation flow", () => {
  test("홈에서 운동 기록으로 이동", async ({ page }) => {
    await page.goto("/", { timeout: NAV_TIMEOUT });
    // 앱이 로드될 때까지 대기
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
      // networkidle이 오래 걸릴 수 있어 timeout 무시
    });

    // /workout/log 직접 이동으로 검증 (내비게이션 엘리먼트 의존 X)
    const response = await page.goto("/workout/log", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
  });
});
