/**
 * 휴식 타이머 E2E (M1-1 PR3).
 *
 * 순수 로직은 web/src/lib/workout-record/rest-timer.test.ts가 덮는다. 여기서 지키는 것은
 * **UI 배선의 회귀**다:
 *   1) 세트 완료 탭이 반복 수를 채우고 완료로 바뀐다
 *   2) 완료가 휴식 타이머를 시작한다
 *   3) 휴식 중에는 진행률 줄이 휴식 줄로 "전환"되고 저장바 높이가 변하지 않는다
 *      (부유 필을 추가하는 대신 교체하기로 한 설계 — 계획서 3.4)
 *   4) 건너뛰기가 타이머를 끄고 진행률 줄을 되돌린다
 *
 * 3번이 이 스펙의 핵심이다. 저장바가 커지면 도크 위 슬롯과 .app-main 여백이 어긋나
 * 마지막 콘텐츠가 가려지는데, 이건 단위 테스트로는 잡히지 않는다.
 *
 * 프록시 cutover 이후 apps/api엔 WORKOUT_AUTH_USER_ID fallback이 없으므로(보안 의도)
 * 실계정을 signup해 wl_session 쿠키로 인증한다(all-programs-user-journey 패턴).
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "rest-timer-test-pw-123";

function uniqueEmail() {
  return `rest-timer-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
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

test.describe("rest timer", () => {
  test("세트 완료 탭이 반복을 채우고 휴식 타이머를 시작한다", async ({ page }) => {
    await signupThroughUi(page);
    await startOperatorPlan(page);

    const saveBar = page.locator(".app-sticky-action");
    await expect(saveBar).toBeVisible({ timeout: 20_000 });

    // 휴식 전: 진행률 줄이 보이고 휴식 줄은 없다.
    await expect(saveBar.getByRole("progressbar")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveCount(0);
    const heightBefore = (await saveBar.boundingBox())?.height ?? 0;
    expect(heightBefore).toBeGreaterThan(0);

    // 1) 완료 탭 -> 반복이 처방값으로 채워지고 완료 상태가 된다.
    const completeButton = page.getByRole("button", { name: /1세트 완료 \(/ }).first();
    await expect(completeButton).toBeVisible();
    await completeButton.click();

    const firstRepsInput = page.locator('input[aria-label*="반복"]').first();
    await expect(firstRepsInput).not.toHaveValue("");
    await expect(page.getByRole("button", { name: /1세트 완료됨/ }).first()).toBeVisible();

    // 2) 완료가 휴식을 시작한다.
    const restRow = page.getByRole("timer");
    await expect(restRow).toBeVisible();
    await expect(restRow).toHaveAttribute("aria-label", /휴식 \d+:\d{2} 남음/);

    // 3) 진행률 줄은 휴식 줄로 "전환"된다 — 추가가 아니라 교체이므로 높이가 그대로다.
    await expect(saveBar.getByRole("progressbar")).toHaveCount(0);
    const heightDuringRest = (await saveBar.boundingBox())?.height ?? 0;
    expect(heightDuringRest).toBe(heightBefore);

    // 4) 건너뛰기 -> 타이머가 꺼지고 진행률 줄이 돌아온다.
    await restRow.getByRole("button", { name: "휴식 건너뛰기" }).click();
    await expect(page.getByRole("timer")).toHaveCount(0);
    await expect(saveBar.getByRole("progressbar")).toBeVisible();
    const heightAfter = (await saveBar.boundingBox())?.height ?? 0;
    expect(heightAfter).toBe(heightBefore);
  });

  test("+30초가 남은 시간을 늘린다", async ({ page }) => {
    await signupThroughUi(page);
    await startOperatorPlan(page);

    await page.getByRole("button", { name: /1세트 완료 \(/ }).first().click();
    const restRow = page.getByRole("timer");
    await expect(restRow).toBeVisible();

    const readRemaining = async () => {
      const label = (await restRow.getAttribute("aria-label")) ?? "";
      const match = label.match(/(\d+):(\d{2})/);
      if (!match) throw new Error(`unexpected rest label: ${label}`);
      return Number(match[1]) * 60 + Number(match[2]);
    };

    const before = await readRemaining();
    await restRow.getByRole("button", { name: "30초 추가" }).click();
    await expect
      .poll(readRemaining, { timeout: 5_000 })
      .toBeGreaterThan(before + 20);
  });
});
