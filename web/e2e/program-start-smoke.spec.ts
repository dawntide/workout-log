/**
 * Program start smoke — PR 필수 게이트
 *
 * 나머지 smoke가 "페이지가 500 없이 뜨는가"를 본다면, 이 스펙은 앱의 **첫 관문**인
 * 프로그램 시작 흐름이 끝까지 이어지는지를 본다: 스토어에서 고르기 → 시작 시트에서
 * 1RM 입력 → 기록 화면에 처방이 뜨기.
 *
 * 왜 PR 게이트에 있어야 하는가: 이 흐름을 검증하던 여정 스펙들은 데이터 라우트를 쓰기
 * 때문에 apps/api가 필요했고, 그래서 nightly 전용이었다. 그 사이 버튼 이름 변경(#579)과
 * 운동명 변경(c5c3985)이 PR을 그대로 통과해 nightly에서만 터졌고, nightly가 이미 빨간
 * 상태라 며칠씩 묻혔다. PR에서 한 번만 통과시키면 그 종류의 회귀가 여기서 걸린다.
 *
 * 셀렉터는 문구 변화에 견디도록 패턴으로 잡되, 흐름이 실제로 끝났는지는 URL과 렌더된
 * 처방으로 확인한다 — 라벨만 맞고 동작이 끊긴 경우를 통과시키지 않기 위해서다.
 */
import { expect, test, type Page } from "@playwright/test";

import { EXERCISE_NAMES } from "@workout/core/exercise/catalog";

const IS_EXTERNAL_E2E = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const PASSWORD = "Program-start-smoke-17!";

test.describe("smoke — program start flow", () => {
  // 외부(Vercel 프리뷰) 실행은 시드도 apps/api도 없고, 실계정을 만들 곳도 아니다.
  test.skip(
    IS_EXTERNAL_E2E,
    "외부 프리뷰에는 시드 데이터와 프록시 백엔드가 없다",
  );

  test.setTimeout(120_000);

  test("스토어에서 시작하면 기록 화면에 처방 세트가 렌더된다", async ({ page }) => {
    await signup(page);

    await page.goto("/program-store");
    const search = page.getByPlaceholder(/프로그램명, 설명, 태그 검색/);
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill("Starting Strength LP");

    const card = page.getByRole("article", {
      name: "Starting Strength LP (Base)",
      exact: true,
    });
    await expect(card).toBeVisible({ timeout: 20_000 });
    // 카드 본문 클릭 = 상세 진입(트레일링 '시작하기'는 시작 시트로 직행).
    await card.click();

    const detail = page.getByRole("dialog", { name: "프로그램 상세" });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: /이 프로그램으로 시작하기/ }).click();

    // 시작 시트: 새 계정이라 기존 플랜이 없으므로 1RM 입력이 떠야 한다.
    await expect(page.getByRole("heading", { name: /1RM 입력/ })).toBeVisible({
      timeout: 15_000,
    });
    const oneRmInputs = page.locator('input[aria-label$="1RM"]');
    const inputCount = await oneRmInputs.count();
    expect(inputCount, "1RM 입력이 하나도 없으면 시작 시트가 깨진 것").toBeGreaterThan(0);
    for (let index = 0; index < inputCount; index += 1) {
      await oneRmInputs.nth(index).fill("100");
    }

    await page.getByRole("button", { name: /1RM 저장 후 .*시작/ }).click();

    // 여기까지 왔으면 플랜이 만들어지고 세션이 생성된 것이다.
    await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get("planId")).toBeTruthy();

    // 처방이 실제로 렌더되는지: 스쿼트 카드와 반복 입력이 보여야 한다.
    // 운동명은 카탈로그에서 읽어, 종목 이름이 바뀌면 시드와 함께 이 검증도 따라간다.
    await expect(
      page.getByRole("article", { name: EXERCISE_NAMES.highBarBackSquat, exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[aria-label*="반복"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

async function signup(page: Page) {
  const email = `smoke-start-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByLabel("이름 (선택)").fill("시작 흐름 스모크");
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 30_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  }
}
