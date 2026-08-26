/**
 * 운동 검색 필터·정렬 E2E (M3 PR4).
 *
 * 카탈로그가 32종 → 755종이 되면서 `"squat"` 한 번에 57건, `"press"`는 101건이
 * 나온다. 이 스펙이 지키는 것은 **"많이"가 "빨리 찾기"를 깨지 않는다**는 계약이다:
 *
 *   1) 필터는 **서버가** 적용한다 — 필터를 켜면 켜기 전 첫 페이지에 없던 종목이
 *      새로 올라온다. 클라이언트에서 걸러 내는 구현은 이 단정에 걸린다.
 *   2) 필터를 바꾸면 **같은 검색어라도 다시 조회한다** — 옵션 캐시 키가 검색어만
 *      쓰면 필터를 바꿔도 이전 결과가 그대로 남는다.
 *   3) 결과가 0건이면 **필터 때문임을 말한다** — 켜 둔 걸 잊는 것이 이 화면의
 *      실패 모드다.
 *   4) 시트를 닫으면 필터가 **초기화된다** — 검색어는 지우면서 필터만 남기면 다음에
 *      열었을 때 왜 좁아졌는지 알 수 없다.
 *   5) 내가 기록한 종목이 **맨 위**에 온다 — 사전순 앞 200건 밖에 있어도.
 *
 * 5번은 SQL 정렬 키가 있어야만 통과한다. JS에서만 정렬하면 이미 잘린 창 안에서만
 * 순서가 바뀐다.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "exercise-filter-test-pw-123";

function uniqueEmail() {
  return `ex-filter-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

async function signupThroughUi(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(uniqueEmail());
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    const close = page.getByRole("button", { name: "닫기", exact: true });
    await close.waitFor({ state: "visible", timeout: 15_000 });
    await close.click();
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

async function openAddExerciseSheet(page: Page) {
  await page.getByRole("button", { name: "운동 추가" }).click();
  const sheet = page.getByRole("dialog", { name: "운동 추가" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** 결과 목록의 현재 항목 이름들. 디바운스가 끝난 뒤를 보려고 항상 재읽는다. */
async function resultNames(page: Page): Promise<string[]> {
  const list = page.getByRole("listbox", { name: "운동종목 검색 결과" });
  await expect(list).toBeVisible();
  return list.getByRole("button").allInnerTexts();
}

test.describe.configure({ mode: "serial" });

test.describe("exercise search filters", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signupThroughUi(page);
    await startOperatorPlan(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test("장비 필터가 서버에서 적용된다 — 필터 전 첫 페이지에 없던 종목이 올라온다", async () => {
    const sheet = await openAddExerciseSheet(page);
    await sheet.getByRole("searchbox").fill("press");

    // 필터 전 첫 페이지(limit 20).
    await expect
      .poll(async () => (await resultNames(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const before = await resultNames(page);

    await sheet.getByRole("radio", { name: "dumbbell" }).click();
    await expect
      .poll(
        async () => {
          const now = await resultNames(page);
          return now.length > 0 && now.join("|") !== before.join("|");
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    const after = await resultNames(page);

    // 클라이언트에서 걸렀다면 after는 before의 부분집합이다. 서버가 걸러야만
    // 필터 전 20건 밖에 있던 덤벨 종목이 새로 올라온다.
    const fresh = after.filter((name) => !before.includes(name));
    expect(fresh.length, `필터 후 새 종목이 없다 — 클라이언트 필터로 회귀했다: ${after.join(", ")}`)
      .toBeGreaterThan(0);

    await sheet.getByRole("button", { name: "닫기" }).click();
    await expect(sheet).toHaveCount(0);

    // 닫으면 필터가 초기화된다 — 남겨 두면 다음에 열었을 때 이유 없이 좁은 목록이 뜬다.
    const reopened = await openAddExerciseSheet(page);
    await expect(reopened.getByRole("radio", { name: "전체 장비" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await reopened.getByRole("button", { name: "닫기" }).click();
    await expect(reopened).toHaveCount(0);
  });

  test("필터를 바꾸면 같은 검색어라도 다시 조회한다 (캐시 키에 필터 포함)", async () => {
    const sheet = await openAddExerciseSheet(page);
    // 케틀벨은 우리 장비 5종 밖(unknown)이라 바벨 필터로는 한 건도 안 나온다.
    await sheet.getByRole("searchbox").fill("kettlebell");
    await expect
      .poll(async () => (await resultNames(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    await sheet.getByRole("radio", { name: "barbell" }).click();
    await expect(sheet.getByText(/필터를 전체로 되돌려/)).toBeVisible({ timeout: 20_000 });

    // 필터만 되돌린다 — 검색어는 그대로다. 캐시 키가 검색어뿐이면 여기서 빈 결과가
    // 그대로 남는다.
    await sheet.getByRole("radio", { name: "전체 장비" }).click();
    await expect
      .poll(async () => (await resultNames(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    await sheet.getByRole("button", { name: "닫기" }).click();
    await expect(sheet).toHaveCount(0);
  });

  test("내가 기록한 종목이 목록 맨 위에 온다", async () => {
    // 세트를 하나 저장해야 "기록한 적 있는 종목"이 생긴다. 저장하는 종목은 목록의
    // 첫 카드 — 프로그램 처방이 바뀌어도 스펙이 따라간다.
    const loggedExercise =
      (await page.getByRole("article").first().getAttribute("aria-label")) ?? "";
    expect(loggedExercise.length, "기록할 종목 이름을 못 읽었다").toBeGreaterThan(0);

    // 세트를 전부 완료해야 저장이 요약 시트 없이 곧장 넘어간다.
    for (let guard = 0; guard < 40; guard += 1) {
      const next = page.getByRole("button", { name: /세트 완료 \(/ }).first();
      if ((await next.count()) === 0) break;
      await next.click();
      const skip = page.getByRole("button", { name: "휴식 건너뛰기" });
      if (await skip.isVisible().catch(() => false)) await skip.click();
    }

    await page.getByRole("button", { name: /운동기록 완료 및 저장/ }).click();
    await expect(page).toHaveURL(/\/workout\/session\//, { timeout: 30_000 });

    // 저장이 실제로 됐는지 확인하고 넘어간다 — 안 그러면 아래 정렬 실패가 "정렬이
    // 빠졌다"인지 "저장이 안 됐다"인지 구분되지 않는다.
    const logId = new URL(page.url()).pathname.split("/").at(-1);
    const saved = await page.request.get(`/api/logs/${logId}`);
    const body = (await saved.json()) as { item: { sets: Array<{ exerciseName: string }> } };
    expect(
      body.item.sets.some((set) => set.exerciseName === loggedExercise),
      `저장된 세트에 ${loggedExercise}가 없다`,
    ).toBe(true);

    // 옵션 캐시는 화면이 마운트돼 있는 동안 유지된다(검색어별 in-memory). 앞 테스트가
    // 빈 검색어 결과를 이미 캐시했으므로, 서버 정렬을 보려면 화면을 새로 띄운다.
    await page.goto("/workout/log");
    await expect(page.getByRole("button", { name: "운동 추가" })).toBeVisible({ timeout: 30_000 });

    const sheet = await openAddExerciseSheet(page);
    // 검색어 없이 훑기 — 순수 사전순이면 숫자로 시작하는 "3/4 Sit-Up"이 맨 위다.
    // 응답이 stale-while-revalidate라 첫 페인트는 저장 전 순서일 수 있어 폴링한다.
    await expect
      .poll(
        async () => {
          const names = await resultNames(page);
          const logged = names.findIndex((name) => name.startsWith(loggedExercise));
          const alphabetical = names.findIndex((name) => name.startsWith("3/4 Sit-Up"));
          if (logged < 0) return `기록 종목 없음: ${names.slice(0, 5).join(", ")}`;
          if (alphabetical < 0) return "사전순 기준 미도달";
          return logged < alphabetical ? "위" : "아래";
        },
        { timeout: 20_000 },
      )
      .toBe("위");

    await sheet.getByRole("button", { name: "닫기" }).click();
  });
});
