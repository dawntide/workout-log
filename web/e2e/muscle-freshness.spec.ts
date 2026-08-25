/**
 * 부위별 신선도 카드 E2E (M5 PR2).
 *
 * 모델 자체는 `packages/core/src/stats/muscle-freshness.test.ts`가 16건으로 덮는다.
 * 여기서 지키는 것은 **화면이 모델을 정직하게 옮기는가**다:
 *
 *   1) 기록이 없으면 게이지를 그리지 않고 빈 상태를 말한다.
 *   2) 세션을 저장하면 값이 바뀐다 — 부트스트랩·캐시 경로가 살아 있다는 뜻이다.
 *      신선도는 시간 함수라 캐시가 굳으면 저장 전 값이 그대로 남는다.
 *   3) **`capacityKg === 0`은 "기록 없음"으로 표시된다.** 모델이 100%를 주지만
 *      "회복 완료"가 아니라 "그 부위를 한 번도 안 했다"는 뜻이다. 게이지를 채워
 *      두면 거짓말이 된다(계획서 §7 결정 6). prod에서 `Core`가 상시 이 상태다.
 *   4) 모델 파라미터가 화면에 적혀 있다 — 근거를 설명하는 것이 M5의 정체성이라
 *      캡션이 사라지면 그냥 또 하나의 불투명한 점수가 된다.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "muscle-freshness-test-pw-123";

function uniqueEmail() {
  return `freshness-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

/**
 * 온보딩 오버레이를 걷어낸다.
 *
 * **URL로 판단하지 않는다.** 가입 직후 `/`로 착지한 뒤 오버레이가 뒤늦게 뜨는
 * 경우가 있어(URL은 이미 `/`) 경로 분기로는 놓친다 — 놓치면 이후 화면이 통째로
 * 가려져 "요소 없음"으로 실패한다. 실제로 이 스펙이 그렇게 한 번 깨졌다.
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

async function signupThroughUi(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(uniqueEmail());
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });
  await dismissOnboarding(page);
}

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

async function openFreshnessCard(page: Page) {
  await page.goto("/?deck=stats");
  await dismissOnboarding(page);
  await expect(page.getByText("부위별 신선도")).toBeVisible({ timeout: 30_000 });
}

/** 카드의 게이지 행들을 라벨 → 표시값으로 읽는다. */
async function freshnessRows(page: Page): Promise<Array<{ label: string; value: string }>> {
  return page.locator('[role="meter"]').evaluateAll((meters) =>
    meters.map((meter) => {
      const row = meter.parentElement!;
      const spans = row.querySelectorAll("span");
      return {
        label: spans[0]?.textContent?.trim() ?? "",
        value: spans[1]?.textContent?.trim() ?? "",
      };
    }),
  );
}

/** 근거 시트를 연다. 각 테스트가 스스로 열어 앞 테스트의 UI 상태에 기대지 않는다. */
async function openEvidenceSheet(page: Page) {
  await openFreshnessCard(page);
  await page.getByRole("button", { name: "신선도 계산 근거" }).click();
  const sheet = page.getByRole("dialog", { name: "신선도 계산 근거" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe.configure({ mode: "serial" });

test.describe("muscle freshness", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signupThroughUi(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("기록이 없으면 게이지 대신 빈 상태를 말한다", async () => {
    await openFreshnessCard(page);
    await expect(page.getByText(/세션을 저장하면 부위별로 쌓인 피로가/)).toBeVisible();
    // 게이지를 하나도 그리지 않아야 한다 — 전 부위 100%로 채우면 "다 쉬었다"는
    // 거짓 신호가 된다.
    expect(await page.locator('[role="meter"]').count()).toBe(0);
  });

  test("모델 파라미터가 화면에 적혀 있다", async () => {
    // 근거를 설명하는 것이 M5의 정체성이다. 캡션이 사라지면 불투명한 점수가 된다.
    await expect(page.getByText(/최근 8주 주간 평균 볼륨 기준/)).toBeVisible();
    await expect(page.getByText(/6일이면 완전 회복/)).toBeVisible();
  });

  test("세션을 저장하면 값이 바뀌고, 안 한 부위는 '기록 없음'이다", async () => {
    await startOperatorPlan(page);
    for (let guard = 0; guard < 40; guard += 1) {
      const next = page.getByRole("button", { name: /세트 완료 \(/ }).first();
      if ((await next.count()) === 0) break;
      await next.click();
      const skip = page.getByRole("button", { name: "휴식 건너뛰기" });
      if (await skip.isVisible().catch(() => false)) await skip.click();
    }
    await page.getByRole("button", { name: /운동기록 완료 및 저장/ }).click();
    await expect(page).toHaveURL(/\/workout\/session\//, { timeout: 30_000 });

    await openFreshnessCard(page);
    const rows = await freshnessRows(page);
    expect(rows.length, "저장 뒤에도 게이지가 안 그려졌다").toBeGreaterThan(0);

    // 방금 훈련한 부위는 100%가 아니다. 캐시가 굳었다면 여기서 전부 100%로 남는다.
    const trained = rows.filter((row) => /%/.test(row.value));
    expect(trained.length, `퍼센트 행이 없다: ${JSON.stringify(rows)}`).toBeGreaterThan(0);
    expect(
      trained.some((row) => !row.value.startsWith("100%")),
      `저장 직후인데 전 부위가 100%다 — 부트스트랩이 낡은 값을 보고 있다: ${JSON.stringify(trained)}`,
    ).toBe(true);

    // Operator는 코어 종목이 없다 → capacity 0 → "기록 없음"(게이지 없음).
    const core = rows.find((row) => row.label === "코어");
    expect(core, `코어 행이 없다: ${JSON.stringify(rows)}`).toBeTruthy();
    expect(
      core!.value,
      "코어를 '100%'로 그리면 '쉬어서 준비됨'으로 읽힌다 — 기록이 아예 없는 것이다",
    ).toBe("기록 없음");

    // 매핑되지 않은 부위 버킷은 목록에 내밀지 않는다(계획서 §7 결정 5).
    expect(rows.some((row) => row.label === "기타")).toBe(false);
  });

  test("근거 시트가 식·기여 세션·매핑 공백을 연다", async () => {
    const sheet = await openEvidenceSheet(page);

    // 식 자체가 보여야 한다 — 이 시트의 존재 이유다.
    await expect(sheet.locator("pre")).toContainText("신선도 = 1 -");
    await expect(sheet.locator("pre")).toContainText("144h");

    // 기여 세션은 "부하 × 감쇠 = 피로" 형태로 총합을 설명해야 한다.
    await expect(sheet.getByText(/합계 피로/).first()).toBeVisible();

    // Other는 목록에서 숨기되 여기서는 비율을 밝힌다(계획서 §7 결정 5).
    await expect(sheet.getByText(/부위를 특정하지 못한 세트/)).toBeVisible();
  });

  test("회복 시간을 바꾸면 저장되고 서버가 다시 계산한다", async () => {
    // **앞 테스트가 열어 둔 시트에 기대지 않는다.** serial 스위트라 통과하긴 하지만,
    // 한 건만 골라 돌리면(--grep) 시트가 닫힌 채로 시작해 엉뚱한 자리에서 깨진다.
    const sheet = await openEvidenceSheet(page);
    await expect(sheet.locator("pre")).toContainText("144h");

    await sheet.getByRole("radio", { name: "192h" }).click();

    // 식이 바뀐다 = 설정 저장 → 서버 재계산 → 부트스트랩 재수신이 전부 돌았다는 뜻.
    // 클라이언트에서 숫자만 바꾸는 구현이면 여기까지 오지 못한다.
    await expect(sheet.locator("pre")).toContainText("192h", { timeout: 20_000 });
    await expect(sheet.getByRole("radio", { name: "192h" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    const stored = await page.evaluate(async () => {
      const res = await fetch("/api/settings");
      const body = (await res.json()) as Record<string, unknown> & {
        settings?: Record<string, unknown>;
      };
      return (body.settings ?? body)["prefs.freshness.recoveryHours"];
    });
    expect(Number(stored)).toBe(192);

    // 기본값 안내는 현재 값이 아니라 **기본값**을 말해야 한다.
    await expect(sheet.getByText(/기본 6일/)).toBeVisible();
  });
});
