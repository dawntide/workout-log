import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PASSWORD = "All-programs-e2e-password-17!";

test.setTimeout(120_000);

test.use({
  viewport: { width: 390, height: 844 },
  video: "retain-on-failure",
  trace: "retain-on-failure",
});

type ProgramScenario = {
  slug: string;
  inventoryName: string;
  search: string;
  variantLabel?: "기본" | "FSL" | "BBB";
  expectedOneRmInputs: number;
  expectedExerciseCards: number;
  expectedSetCount: number;
  startMode: "ONE_RM" | "REF5";
};

const PROGRAMS: readonly ProgramScenario[] = [
  {
    slug: "operator",
    inventoryName: "Tactical Barbell Operator (Base)",
    search: "Tactical Barbell Operator",
    expectedOneRmInputs: 4,
    expectedExerciseCards: 3,
    expectedSetCount: 9,
    startMode: "ONE_RM",
  },
  {
    slug: "manual",
    inventoryName: "Manual Sessions",
    search: "Manual Sessions",
    expectedOneRmInputs: 4,
    expectedExerciseCards: 2,
    expectedSetCount: 6,
    startMode: "ONE_RM",
  },
  {
    slug: "starting-strength-lp",
    inventoryName: "Starting Strength LP (Base)",
    search: "Starting Strength LP",
    expectedOneRmInputs: 5,
    expectedExerciseCards: 3,
    expectedSetCount: 7,
    startMode: "ONE_RM",
  },
  {
    slug: "stronglifts-5x5",
    inventoryName: "StrongLifts 5x5 (Base)",
    search: "StrongLifts 5x5",
    expectedOneRmInputs: 5,
    expectedExerciseCards: 3,
    expectedSetCount: 15,
    startMode: "ONE_RM",
  },
  {
    slug: "texas-method",
    inventoryName: "Texas Method (Base)",
    search: "Texas Method",
    expectedOneRmInputs: 5,
    expectedExerciseCards: 3,
    expectedSetCount: 15,
    startMode: "ONE_RM",
  },
  {
    slug: "gzclp",
    inventoryName: "GZCLP (Base T1/T2/T3)",
    search: "GZCLP",
    expectedOneRmInputs: 6,
    expectedExerciseCards: 3,
    expectedSetCount: 11,
    startMode: "ONE_RM",
  },
  {
    slug: "wendler-531",
    inventoryName: "Jim Wendler 5/3/1",
    search: "Jim Wendler 5/3/1 (No Assistance)",
    variantLabel: "기본",
    expectedOneRmInputs: 4,
    expectedExerciseCards: 1,
    expectedSetCount: 3,
    startMode: "ONE_RM",
  },
  {
    slug: "wendler-531-fsl",
    inventoryName: "Jim Wendler 5/3/1",
    search: "Jim Wendler 5/3/1 + FSL",
    variantLabel: "FSL",
    expectedOneRmInputs: 4,
    expectedExerciseCards: 2,
    expectedSetCount: 8,
    startMode: "ONE_RM",
  },
  {
    slug: "wendler-531-bbb",
    inventoryName: "Jim Wendler 5/3/1",
    search: "Jim Wendler 5/3/1 + BBB",
    variantLabel: "BBB",
    expectedOneRmInputs: 4,
    expectedExerciseCards: 2,
    expectedSetCount: 8,
    startMode: "ONE_RM",
  },
  {
    slug: "asymptote-protocol",
    inventoryName: "Asymptote Protocol (Base)",
    search: "Asymptote Protocol",
    expectedOneRmInputs: 5,
    expectedExerciseCards: 3,
    expectedSetCount: 12,
    startMode: "ONE_RM",
  },
  {
    slug: "ref5-adaptive-strength",
    inventoryName: "REF5 Adaptive Strength (Base)",
    search: "REF5 Adaptive Strength",
    expectedOneRmInputs: 0,
    expectedExerciseCards: 4,
    expectedSetCount: 9,
    startMode: "REF5",
  },
  {
    slug: "greyskull-lp",
    inventoryName: "Greyskull LP (Base)",
    search: "Greyskull LP",
    expectedOneRmInputs: 5,
    expectedExerciseCards: 3,
    expectedSetCount: 9,
    startMode: "ONE_RM",
  },
] as const;

function uniqueEmail(label: string) {
  return `all-programs-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function formatLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function observeBrowser(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return failures;
}

async function signupThroughUi(page: Page, label: string, testInfo: TestInfo) {
  const email = uniqueEmail(label);
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByLabel("이름 (선택)").fill(`전체 프로그램 ${label}`);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: /닫기/ }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  await testInfo.attach("test-account", {
    body: JSON.stringify({ email, label }, null, 2),
    contentType: "application/json",
  });
}

async function openProgramFromStore(page: Page, scenario: ProgramScenario) {
  await page.goto("/program-store");
  const searchInput = page.getByPlaceholder(/프로그램명, 설명, 태그 검색/);
  await expect(searchInput).toBeVisible({ timeout: 20_000 });
  await searchInput.fill(scenario.search);

  const card = page.getByRole("article", {
    name: scenario.inventoryName,
    exact: true,
  });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "시작하기" }).click();
  const detail = page.getByRole("dialog", { name: "프로그램 상세" });
  await expect(detail).toBeVisible();
  if (scenario.variantLabel) {
    const variants = detail.getByRole("radiogroup", { name: "5/3/1 방식" });
    await expect(variants.getByRole("radio")).toHaveCount(3);
    await variants
      .getByRole("radio", { name: new RegExp(`^${scenario.variantLabel}`) })
      .click();
    await detail
      .getByRole("button", {
        name: `${scenario.variantLabel} 방식으로 시작하기`,
      })
      .click();
  } else {
    await detail
      .getByRole("button", { name: "이 프로그램으로 시작하기" })
      .click();
  }
}

async function activateProgram(page: Page, scenario: ProgramScenario) {
  await openProgramFromStore(page, scenario);

  if (scenario.startMode === "REF5") {
    await expect(page.getByRole("heading", { name: "REF5 시작 기준 설정" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('input[aria-label$=" 1RM"]')).toHaveCount(0);
    await page.getByRole("radio", { name: "직접 입력 · 고급" }).click();
    await expect(page.locator('input[aria-label$="kg"]')).toHaveCount(5);
    await page.getByRole("button", { name: "첫 처방으로 시작" }).click();
    await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "REF5 세션 결정" })).toBeVisible({
      timeout: 20_000,
    });
  } else {
    await expect(page.getByRole("heading", { name: "시작 전 1RM 입력" })).toBeVisible({
      timeout: 15_000,
    });
    const oneRmInputs = page.locator('input[aria-label$=" 1RM"]');
    await expect(oneRmInputs).toHaveCount(scenario.expectedOneRmInputs);
    for (let index = 0; index < scenario.expectedOneRmInputs; index += 1) {
      await oneRmInputs.nth(index).fill("100");
    }
    await page.getByRole("button", { name: "1RM 저장 후 시작" }).click();
    await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 20_000 });
  }

  const planId = new URL(page.url()).searchParams.get("planId");
  expect(planId).toBeTruthy();
  return planId!;
}

async function prepareRef5Session(page: Page) {
  await page.getByLabel("실제 시작 시각").fill(formatLocalDateTime(new Date()));
  await page.getByLabel("오늘의 체중").fill("75");
  await page.getByRole("button", { name: "세션 미리보기" }).click();
  await expect(page.getByText("NORMAL", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "SQ 첫 워크 세트 시작" }).click();
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });
}

async function completeVisibleWorkout(page: Page, scenario: ProgramScenario) {
  if (scenario.startMode === "REF5") {
    await prepareRef5Session(page);
  }

  const bodyweightPrompt = page.getByText("중량풀업 · 체중 확인", { exact: true });
  if (await bodyweightPrompt.isVisible().catch(() => false)) {
    await page.getByLabel("오늘 체중(kg)").fill("75");
    await page.getByRole("button", { name: "업데이트", exact: true }).click();
    await expect(bodyweightPrompt).toBeHidden();
  }

  const exerciseCards = page.locator('article[aria-label]').filter({
    has: page.locator('input[aria-label*="반복"]'),
  });
  await expect(exerciseCards.first()).toBeVisible({ timeout: 20_000 });
  await expect(exerciseCards).toHaveCount(scenario.expectedExerciseCards);

  const exerciseNames: string[] = [];
  for (let index = 0; index < scenario.expectedExerciseCards; index += 1) {
    exerciseNames.push((await exerciseCards.nth(index).getAttribute("aria-label")) ?? "");
  }

  const repInputs = page.locator('input[aria-label*="반복"]');
  await expect(repInputs).toHaveCount(scenario.expectedSetCount);
  for (let index = 0; index < scenario.expectedSetCount; index += 1) {
    const planned = Number(await repInputs.nth(index).getAttribute("placeholder"));
    await repInputs.nth(index).fill(String(Number.isInteger(planned) && planned > 0 ? planned : 5));
  }

  if (scenario.startMode === "REF5") {
    const reasons = page.getByLabel("REF5 종료 사유");
    await expect(reasons).toHaveCount(scenario.expectedExerciseCards);
    for (let index = 0; index < scenario.expectedExerciseCards; index += 1) {
      await reasons.nth(index).selectOption("NORMAL");
    }
  }

  const setProgress = page.getByRole("progressbar", { name: /세트 진행률/ });
  await expect(setProgress).toBeVisible();
  await expect(setProgress).toHaveAttribute("aria-valuenow", String(scenario.expectedSetCount));
  await expect(setProgress).toHaveAttribute("aria-valuemax", String(scenario.expectedSetCount));

  return exerciseNames;
}

async function saveWorkoutAndReadBack(page: Page, planId: string, expectedSetCount: number) {
  await page.getByRole("button", { name: /운동기록 완료 및 저장/ }).click();
  await expect(page).toHaveURL(/\/workout\/session\/[^?]+\?fresh=1/, { timeout: 30_000 });
  await expect(page.getByText("세션 완료", { exact: true })).toBeVisible({ timeout: 20_000 });

  const logId = new URL(page.url()).pathname.split("/").at(-1);
  expect(logId).toBeTruthy();
  const response = await page.request.get(`/api/logs/${encodeURIComponent(logId!)}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    item?: {
      planId?: string | null;
      sets?: Array<{ exerciseName?: string; reps?: number | null }>;
    };
  };
  expect(body.item?.planId).toBe(planId);
  expect(body.item?.sets).toHaveLength(expectedSetCount);
  expect(body.item?.sets?.every((set) => Number(set.reps) > 0)).toBe(true);
  return { logId: logId!, persistedSets: body.item?.sets ?? [] };
}

test("스토어 공개 프로그램 목록과 테스트 매트릭스가 일치한다", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signupThroughUi(page, "inventory", testInfo);
  await page.goto("/program-store");

  const cards = page.locator(".program-list-card");
  const expectedInventoryNames = new Set(
    PROGRAMS.map((program) => program.inventoryName),
  );
  await expect(cards).toHaveCount(expectedInventoryNames.size, {
    timeout: 20_000,
  });
  const actualNames = await cards.evaluateAll((items) =>
    items.map((item) => item.getAttribute("aria-label") ?? ""),
  );
  expect(new Set(actualNames)).toEqual(expectedInventoryNames);
  await page.screenshot({ path: testInfo.outputPath("registered-program-inventory.png"), fullPage: true });
  await testInfo.attach("registered-program-inventory", {
    body: JSON.stringify(actualNames, null, 2),
    contentType: "application/json",
  });
  expect(browserFailures).toEqual([]);
});

for (const scenario of PROGRAMS) {
  test(`${scenario.inventoryName} [${scenario.slug}]: 화면 시작 → 전 세트 입력 → 저장 → 재진입`, async ({ page }, testInfo) => {
    const browserFailures = observeBrowser(page);
    await signupThroughUi(page, scenario.slug, testInfo);
    const planId = await activateProgram(page, scenario);
    const startUrl = page.url();
    const exerciseNames = await completeVisibleWorkout(page, scenario);
    const { logId, persistedSets } = await saveWorkoutAndReadBack(
      page,
      planId,
      scenario.expectedSetCount,
    );

    await page.goto(`/workout/log?planId=${encodeURIComponent(planId)}`);
    if (scenario.startMode === "REF5") {
      await expect(page.getByRole("heading", { name: "REF5 세션 결정" })).toBeVisible({
        timeout: 20_000,
      });
    } else {
      await expect(page.locator('input[aria-label*="반복"]').first()).toBeVisible({
        timeout: 20_000,
      });
      expect(new URL(page.url()).searchParams.get("date")).toBeTruthy();
      expect(page.url()).not.toBe(startUrl);
    }

    await testInfo.attach("program-journey", {
      body: JSON.stringify(
        {
          slug: scenario.slug,
          inventoryName: scenario.inventoryName,
          planId,
          logId,
          startUrl,
          reentryUrl: page.url(),
          oneRmInputs: scenario.expectedOneRmInputs,
          exerciseNames,
          setCount: scenario.expectedSetCount,
          persistedExerciseNames: persistedSets.map((set) => set.exerciseName),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(browserFailures).toEqual([]);
  });
}
