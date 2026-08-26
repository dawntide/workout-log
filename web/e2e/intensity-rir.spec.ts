/**
 * RIR 입력 모드 E2E (M2-2 PR3).
 *
 * 변환 규칙은 packages/core/src/settings/intensity.test.ts가 덮고, Go와의 파리티는
 * fixtures/intensity.json이 잠근다. 여기서 지키는 것은 **UI 배선의 회귀**다:
 *   1) 설정을 RIR로 바꾸면 열 헤더와 셀 라벨이 RIR로 전환된다
 *   2) RIR 값을 입력하고 저장하면 DB에는 `rpe = 10 - rir`로 들어간다
 *   3) 다시 RPE로 되돌리면 같은 세트가 원래 스케일로 보인다
 *
 * 2번이 이 스펙의 핵심이다. 저장 스케일이 어긋나면 통계가 조용히 뒤집히는데,
 * 단위 테스트는 변환 함수만 보므로 화면에서 저장까지의 배선은 못 본다.
 *
 * signup은 IP당 5/hr 제한이라 계정 하나를 공유한다(CI는 WORKOUT_DISABLE_RATE_LIMIT로 우회).
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "rir-mode-test-pw-123";

function uniqueEmail() {
  return `rir-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function dismissOnboarding(page: Page) {
  const dismiss = page.getByRole("button", { name: "닫기", exact: true });
  const appeared = await dismiss
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await dismiss.click();
  await expect(dismiss).toHaveCount(0, { timeout: 10_000 });
}

async function signupThroughUi(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(uniqueEmail());
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });
  await dismissOnboarding(page);
}

async function setIntensityMode(page: Page, mode: "RPE" | "RIR") {
  await page.goto("/settings");
  await dismissOnboarding(page);
  const row = page.getByText("강도 입력", { exact: true });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  const option = page.getByText(mode === "RIR" ? /RIR \(남은 반복/ : /RPE \(운동 자각도/);
  await expect(option).toBeVisible();
  await option.click();
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/settings");
        const body = (await res.json()) as Record<string, unknown> & {
          settings?: Record<string, unknown>;
        };
        return (body.settings ?? body)["prefs.intensityInput"];
      },
      { timeout: 15_000 },
    )
    .toBe(mode);
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

test.describe.configure({ mode: "serial" });

test.describe("intensity input mode", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signupThroughUi(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("RIR로 바꾸면 열 헤더와 셀 라벨이 전환된다", async () => {
    await setIntensityMode(page, "RIR");

    // /workout/log는 플랜이 없으면 프로그램 스토어로 보낸다 — 실제 경로로 세션을 연다.
    await startOperatorPlan(page);

    // 헤더는 RIR, 셀 aria-label도 RIR.
    await expect(page.getByText("RIR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("1세트 RIR").first()).toBeVisible();
    await expect(page.getByLabel("1세트 RPE")).toHaveCount(0);
  });

  test("RIR 2를 입력하면 rpe 8로 저장된다", async () => {
    // 완료 탭이 처방 반복을 채운다(rest-timer 스펙과 같은 동선). 탭하면 라벨이
    // "완료됨"으로 바뀌어 목록이 갈리므로, 매번 다시 조회해 남은 첫 버튼을 누른다.
    for (let guard = 0; guard < 30; guard += 1) {
      const next = page.getByRole("button", { name: /세트 완료 \(/ }).first();
      if ((await next.count()) === 0) break;
      await next.click();
      // 휴식 타이머가 뜨면 다음 탭을 가릴 수 있다 — 건너뛴다.
      const skip = page.getByRole("button", { name: "휴식 건너뛰기" });
      if (await skip.isVisible().catch(() => false)) await skip.click();
    }
    const rirCell = page.getByLabel("1세트 RIR").first();
    await rirCell.fill("2");
    // 저장은 8이 되지만 화면은 사용자 방향(2)을 유지해야 한다 — 표시 경로가 깨지면
    // 여기서 8이 보인다.
    await expect(rirCell).toHaveValue("2");

    await page.getByRole("button", { name: /운동기록 완료 및 저장|운동기록 수정 완료/ }).click();
    await expect(page).toHaveURL(/\/workout\/session\//, { timeout: 30_000 });

    const logId = new URL(page.url()).pathname.split("/").at(-1);
    const res = await page.request.get(`/api/logs/${logId}`);
    const body = (await res.json()) as { item: { sets: Array<{ rpe: number | null }> } };
    // 화면에 2(RIR)를 적었지만 저장은 RPE 스케일이다 — 이게 어긋나면 통계가 뒤집힌다.
    expect(body.item.sets[0]?.rpe).toBe(8);
    // 나머지 세트는 손대지 않았으므로 null이어야 한다(0이면 평균이 희석된다).
    expect(body.item.sets[1]?.rpe).toBeNull();
  });

  test("RPE로 되돌리면 열 헤더와 셀 라벨이 원래대로 돌아온다", async () => {
    // 저장된 세션을 다시 여는 방식은 쓰지 않는다 — /workout/log는 그 날짜의 세션을
    // 새로 생성하므로(자정을 넘기면 다른 날이다) 값 비교가 환경에 의존한다.
    // 여기서 지킬 것은 전환이 **양방향**이라는 사실이다.
    await setIntensityMode(page, "RPE");
    await page.goto("/workout/log");
    await dismissOnboarding(page);

    await expect(page.getByLabel("1세트 RPE").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("1세트 RIR")).toHaveCount(0);
    await expect(page.getByText("RIR", { exact: true })).toHaveCount(0);
  });
});
