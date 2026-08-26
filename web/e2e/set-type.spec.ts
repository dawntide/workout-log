/**
 * 세트 타입 태그 E2E (M1-3 PR3).
 *
 * 순수 로직은 packages/core/src/workout-set-type.test.ts와 model.test.ts가 덮는다.
 * 여기서 지키는 것은 **UI 배선의 회귀**다:
 *   1) 세트 번호를 탭하면 타입 시트가 열린다
 *   2) 웜업을 고르면 번호 자리가 `W`로 바뀐다 — 열을 추가하지 않는다
 *   3) **세트 행 높이와 열 폭이 변하지 않는다**
 *   4) 작업 세트로 되돌릴 수 있다
 *
 * 3번이 이 스펙의 핵심이다. 번호 칸을 span에서 button으로 올렸으므로 브라우저 기본
 * 스타일이 행을 밀어낼 수 있는데(M1-1에서 저장바가 8px 자랐다), 단위 테스트로는
 * 잡히지 않는다.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "set-type-test-pw-123";

function uniqueEmail() {
  return `set-type-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function signupThroughUi(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(uniqueEmail());
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  }
}

/** Operator를 시작해 세트가 있는 /workout/log로 착지한다. */
async function startOperatorPlan(page: Page) {
  await page.goto("/program-store");
  const searchInput = page.getByPlaceholder(/프로그램명, 설명, 태그 검색/);
  await expect(searchInput).toBeVisible({ timeout: 20_000 });
  await searchInput.fill("Operator");

  const card = page.getByRole("article", {
    name: "Tactical Barbell Operator (Base)",
    exact: true,
  });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();

  const detail = page.getByRole("dialog", { name: "프로그램 상세" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: /시작하기/ }).first().click();

  await expect(page.getByRole("heading", { name: "시작 전 1RM 입력" })).toBeVisible({
    timeout: 15_000,
  });
  const oneRmInputs = page.locator('input[aria-label$=" 1RM"]');
  const count = await oneRmInputs.count();
  for (let index = 0; index < count; index += 1) {
    await oneRmInputs.nth(index).fill("100");
  }
  await page.getByRole("button", { name: /1RM 저장 후 .*시작/ }).click();
  await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 20_000 });
  await expect(page.locator('input[aria-label*="반복"]').first()).toBeVisible({ timeout: 30_000 });
}


test.describe("set type", () => {
  test("세트 번호 탭으로 웜업을 달고 되돌린다 — 행 크기는 그대로", async ({ page }) => {
    await signupThroughUi(page);
    await startOperatorPlan(page);

    const typeButton = page.getByRole("button", { name: "1세트 타입 지정" }).first();
    await expect(typeButton).toBeVisible({ timeout: 20_000 });
    await expect(typeButton).toHaveText("1");

    // 행 크기 기준선 — 번호 칸이 button이라 브라우저 기본 스타일이 밀어낼 수 있다.
    const row = page.locator('input[aria-label*="반복"]').first().locator("xpath=ancestor::div[1]");
    const rowBefore = await row.boundingBox();
    const cellBefore = await typeButton.boundingBox();
    expect(rowBefore?.height ?? 0).toBeGreaterThan(0);

    // 1) 탭 -> 시트
    await typeButton.click();
    const sheet = page.getByRole("dialog", { name: "세트 타입" });
    await expect(sheet).toBeVisible();

    // 2) 웜업 -> 번호 자리가 W
    await sheet.getByRole("radio", { name: /웜업/ }).click();
    await expect(sheet).toHaveCount(0);
    const warmupButton = page.getByRole("button", { name: /1세트 타입: 웜업/ }).first();
    await expect(warmupButton).toHaveText("W");

    // 3) 행 높이·열 폭 불변
    const rowAfter = await row.boundingBox();
    const cellAfter = await warmupButton.boundingBox();
    expect(rowAfter?.height).toBe(rowBefore?.height);
    expect(cellAfter?.width).toBe(cellBefore?.width);

    // 4) 되돌리기
    await warmupButton.click();
    await page
      .getByRole("dialog", { name: "세트 타입" })
      .getByRole("radio", { name: /작업 세트/ })
      .click();
    await expect(page.getByRole("button", { name: "1세트 타입 지정" }).first()).toHaveText("1");
  });

  test("태그는 자기 세트에만 붙는다", async ({ page }) => {
    await signupThroughUi(page);
    await startOperatorPlan(page);

    await page.getByRole("button", { name: "1세트 타입 지정" }).first().click();
    await page
      .getByRole("dialog", { name: "세트 타입" })
      .getByRole("radio", { name: /웜업/ })
      .click();

    await expect(page.getByRole("button", { name: /1세트 타입: 웜업/ }).first()).toHaveText("W");
    // 2세트는 건드리지 않았다 — 번져 있으면 그 세트가 통계에서 통째로 빠진다.
    await expect(page.getByRole("button", { name: "2세트 타입 지정" }).first()).toHaveText("2");
  });
});
