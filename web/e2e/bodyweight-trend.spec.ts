/**
 * 체중 추이 E2E (M2-1 PR2).
 *
 * 순수 로직은 packages/core/src/stats/bodyweight-timeline.test.ts와
 * web/src/features/stats/ui/trend-line-chart.test.ts가 덮는다. 여기서 지키는 것은
 * **UI 배선의 회귀**다:
 *   1) 기록이 없으면 빈 상태다 — 설정의 단일 체중값을 점 하나로 그리지 않는다
 *   2) 기록하면 차트가 나타나고 값이 표시된다
 *   3) 두 번째 기록이 구간 변화를 만든다
 *   4) **SVG 그라디언트 id가 인스턴스마다 유일하다**
 *
 * 4번이 이 스펙의 핵심이다. 차트를 일반화하면서 e1RM과 체중이 같은 SVG를 쓰게 됐는데,
 * 그라디언트 id가 고정이면 두 번째 차트가 첫 번째의 정의를 물어 색이 틀어진다.
 * 단위 테스트로는 잡히지 않는 종류의 회귀다.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "bodyweight-test-pw-123";

function uniqueEmail() {
  return `bodyweight-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function signupThroughUi(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(uniqueEmail());
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });

  await dismissOnboarding(page);
}

/**
 * 온보딩은 별도 라우트일 때도 있고 홈 위에 덮일 때도 있으며, 가입 직후 **URL이 바뀐
 * 뒤에 그려진다.** 그래서 URL로 판단하거나 즉시 isVisible()을 보면 그냥 지나치고,
 * 이후 화면이 오버레이에 가려 아무것도 못 찾는다. 나타날 때까지 잠깐 기다린다.
 */
async function dismissOnboarding(page: Page) {
  const dismiss = page.getByRole("button", { name: /닫기/ });
  const appeared = await dismiss
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await dismiss.click();
  await expect(dismiss).toHaveCount(0, { timeout: 10_000 });
}

async function recordBodyweight(page: Page, valueKg: string) {
  await page.getByRole("button", { name: "기록", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "체중 기록" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("체중 kg").fill(valueKg);
  await sheet.getByRole("button", { name: "기록", exact: true }).click();
  await expect(sheet).toHaveCount(0, { timeout: 15_000 });
}

// 계정 하나를 두 테스트가 공유한다. signup은 IP당 5/hr로 제한돼 있어(CI는
// WORKOUT_DISABLE_RATE_LIMIT로 우회) 스펙마다 계정을 새로 만들면 로컬에서 두세 번
// 돌리는 순간 429가 난다. 순서 의존이 생기므로 serial로 고정한다.
test.describe.configure({ mode: "serial" });

test.describe("bodyweight trend", () => {
  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage();
    await signupThroughUi(sharedPage);
  });

  test.afterAll(async () => {
    await sharedPage?.close();
  });

  test("기록이 없으면 빈 상태, 기록하면 차트가 나타난다", async () => {
    const page = sharedPage;
    await page.goto("/stats");
    await dismissOnboarding(page);

    const heading = page.getByRole("heading", { name: "체중 추이" });
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // 1) 빈 상태 — 설정 단일값을 점 하나로 그리지 않는다.
    // **카드 안으로 좁힌다.** 통계 화면에는 빈 상태를 가진 카드가 여럿이라
    // (신선도 카드도 "최근 기록이 없습니다"라고 말한다) 전역 텍스트 매치는
    // 이웃 카드가 하나 늘 때마다 strict 위반으로 깨진다.
    const bodyweightCard = heading.locator("xpath=ancestor::*[self::section or self::div][3]");
    await expect(bodyweightCard.getByText(/기록이 없습니다/)).toBeVisible();
    await expect(page.getByRole("img", { name: "체중 추이 차트" })).toHaveCount(0);

    // 2) 기록 -> 차트 등장
    await recordBodyweight(page, "72.5");
    const chart = page.getByRole("img", { name: "체중 추이 차트" });
    await expect(chart).toBeVisible({ timeout: 15_000 });
    // 값 단독으로 찾으면 y축 눈금 라벨과도 매치된다 — 단위까지 붙은 헤드라인을 본다.
    await expect(page.getByText("72.5kg")).toBeVisible();
  });

  test("두 차트가 한 화면에 있어도 각자의 색을 쓴다", async () => {
    const page = sharedPage;
    // 앞 테스트가 이미 한 건 기록했다(serial). 두 번째 기록으로 구간 변화도 만든다.
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "체중 추이" })).toBeVisible({
      timeout: 30_000,
    });
    await recordBodyweight(page, "70");

    const chart = page.getByRole("img", { name: "체중 추이 차트" });
    await expect(chart).toBeVisible({ timeout: 15_000 });
    // 3) 두 기록 -> 구간 변화가 나타난다.
    await expect(page.getByText(/구간 변화/)).toBeVisible();

    // 그라디언트 id는 인스턴스마다 유일해야 한다 — 고정 id면 같은 화면의 두 번째
    // 차트가 첫 번째의 정의를 물어 색이 어긋난다.
    const gradientIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("svg linearGradient")).map((node) => node.id),
    );
    expect(gradientIds.length).toBeGreaterThan(0);
    expect(new Set(gradientIds).size).toBe(gradientIds.length);

    // 체중 차트는 무게 도메인 색을 쓴다 — e1RM 색을 물려받지 않는다. 토큰을 실제
    // rgb로 해석해 비교한다(하나는 hex, 하나는 computed rgb라 문자열 비교는 못 한다).
    const resolved = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const read = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const out = { weight: read("--v2-c-weight"), onerm: read("--v2-c-onerm") };
      probe.remove();
      return out;
    });
    const chartColor = await chart.evaluate((node) => getComputedStyle(node).color);
    expect(resolved.weight).not.toBe(resolved.onerm);
    expect(chartColor).toBe(resolved.weight);
  });
});
