/**
 * Exercise detail page smoke E2E.
 *
 * 목적: /exercises/[exerciseId] 라우트가 500 없이 렌더링되며,
 *      not-found 폴백이 invalid id에 대해 작동하는지 확인.
 *      통계 페이지 PR row → 운동 상세 진입 링크 동작 확인.
 *
 * 전제: 테스트 실행 전 DB 마이그레이션 + seed 완료.
 */
import { expect, test } from "@playwright/test";

const NAV_TIMEOUT = 30_000;

test.describe("smoke — exercise detail page", () => {
  test("invalid exerciseId 는 not-found 처리", async ({ page }) => {
    const response = await page.goto(
      "/exercises/00000000-0000-0000-0000-000000000000",
      { timeout: NAV_TIMEOUT },
    );
    // not-found는 404 status를 반환하지만 페이지는 정상 렌더
    expect(response?.status()).not.toBe(500);
    await expect(page.getByText("운동을 찾을 수 없습니다")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("/stats PR row 클릭으로 운동 상세 진입 가능", async ({ page }) => {
    const response = await page.goto("/stats", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);

    // PR row가 한 개라도 있으면 첫 번째 row 클릭, 없으면 skip
    const prRow = page.locator('a[href^="/exercises/"]').first();
    const rowCount = await prRow.count();
    if (rowCount === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "no PR rows in seed data",
      });
      return;
    }

    await prRow.click();
    await page.waitForURL(/\/exercises\//, { timeout: NAV_TIMEOUT });
    // 페이지가 정상 렌더되는지 확인 (Application error 미노출)
    await expect(page.getByText("Application error")).not.toBeVisible({
      timeout: 5_000,
    });
    // 화면 상단에 "운동 상세" 라벨 존재
    await expect(page.getByText("운동 상세").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
