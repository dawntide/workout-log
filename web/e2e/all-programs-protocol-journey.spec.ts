import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const PASSWORD = "All-protocols-e2e-password-17!";

test.setTimeout(900_000);
test.use({
  viewport: { width: 390, height: 844 },
  video: "retain-on-failure",
  trace: "retain-on-failure",
});

type ProgramStart = {
  slug: string;
  inventoryName: string;
  search: string;
  variantLabel?: "기본" | "FSL" | "BBB";
  oneRmInputs: number;
};

type TargetState = {
  progressionTarget?: string;
  workKg: number;
  successStreak: number;
  failureStreak: number;
  stage?: number;
};

type ProgressionResponse = {
  program: string | null;
  state: {
    cycle: number;
    week: number;
    day: number;
    lightBlockMode?: boolean;
    targets: Record<string, TargetState>;
  } | null;
  lastEvent?: {
    id: string;
    eventType: string;
    reason: string | null;
    targetDecisions: Array<{
      key?: string;
      progressionTarget?: string;
      eventType?: string;
      reason?: string;
      before?: { workKg?: number; failureStreak?: number };
      after?: { workKg?: number; failureStreak?: number };
    }>;
  } | null;
  feedback?: {
    report?: { title: string; rows: Array<{ target: string; text: string }> } | null;
    earlyDeloadBanner?: { title: string; body: string } | null;
  } | null;
};

type RepRuleContext = {
  exerciseName: string;
  exerciseIndex: number;
  setIndex: number;
  setCount: number;
  plannedReps: number;
};

type ChoiceExpectation = {
  title: RegExp;
  text: RegExp[];
  cancelFirst?: boolean;
  expectedDefaults?: Array<{ targetLabel: RegExp; option: "증량" | "유지" | "감소" }>;
  select?: { targetLabel: RegExp; option: "증량" | "유지" | "감소" };
  screenshotName?: string;
};

const PROGRAM = {
  operator: {
    slug: "operator",
    inventoryName: "Tactical Barbell Operator (Base)",
    search: "Tactical Barbell Operator",
    oneRmInputs: 4,
  },
  manual: {
    slug: "manual",
    inventoryName: "Manual Sessions",
    search: "Manual Sessions",
    oneRmInputs: 4,
  },
  startingStrength: {
    slug: "starting-strength-lp",
    inventoryName: "Starting Strength LP (Base)",
    search: "Starting Strength LP",
    oneRmInputs: 5,
  },
  stronglifts: {
    slug: "stronglifts-5x5",
    inventoryName: "StrongLifts 5x5 (Base)",
    search: "StrongLifts 5x5",
    oneRmInputs: 5,
  },
  texas: {
    slug: "texas-method",
    inventoryName: "Texas Method (Base)",
    search: "Texas Method",
    oneRmInputs: 5,
  },
  gzclp: {
    slug: "gzclp",
    inventoryName: "GZCLP (Base T1/T2/T3)",
    search: "GZCLP",
    oneRmInputs: 6,
  },
  greyskull: {
    slug: "greyskull-lp",
    inventoryName: "Greyskull LP (Base)",
    search: "Greyskull LP",
    oneRmInputs: 5,
  },
  wendler531: {
    slug: "wendler-531",
    inventoryName: "Jim Wendler 5/3/1",
    search: "Jim Wendler 5/3/1 (No Assistance)",
    variantLabel: "기본",
    oneRmInputs: 4,
  },
  wendler531Fsl: {
    slug: "wendler-531-fsl",
    inventoryName: "Jim Wendler 5/3/1",
    search: "Jim Wendler 5/3/1 + FSL",
    variantLabel: "FSL",
    oneRmInputs: 4,
  },
  wendler531Bbb: {
    slug: "wendler-531-bbb",
    inventoryName: "Jim Wendler 5/3/1",
    search: "Jim Wendler 5/3/1 + BBB",
    variantLabel: "BBB",
    oneRmInputs: 4,
  },
  asymptote: {
    slug: "asymptote-protocol",
    inventoryName: "Asymptote Protocol (Base)",
    search: "Asymptote Protocol",
    oneRmInputs: 5,
  },
} satisfies Record<string, ProgramStart>;

function uniqueEmail(label: string) {
  return `protocol-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return next.toISOString().slice(0, 10);
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

async function signup(page: Page, label: string) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(uniqueEmail(label));
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByLabel("이름 (선택)").fill(`프로토콜 ${label}`);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });
  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: /닫기/ }).click();
  }
}

async function activateProgram(
  page: Page,
  program: ProgramStart,
  inspectDetail?: (dialog: Locator) => Promise<void>,
) {
  await page.goto("/program-store");
  const search = page.getByPlaceholder(/프로그램명, 설명, 태그 검색/);
  await expect(search).toBeVisible({ timeout: 20_000 });
  await search.fill(program.search);
  const card = page.getByRole("article", { name: program.inventoryName, exact: true });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "시작하기" }).click();
  const detail = page.getByRole("dialog", { name: "프로그램 상세" });
  await expect(detail).toBeVisible();
  if (program.variantLabel) {
    const variants = detail.getByRole("radiogroup", { name: "5/3/1 방식" });
    await expect(variants.getByRole("radio")).toHaveCount(3);
    await variants
      .getByRole("radio", { name: new RegExp(`^${program.variantLabel}`) })
      .click();
  }
  if (inspectDetail) await inspectDetail(detail);
  await detail
    .getByRole("button", {
      name: program.variantLabel
        ? `${program.variantLabel} 방식으로 시작하기`
        : "이 프로그램으로 시작하기",
    })
    .click();

  await expect(page.getByRole("heading", { name: "시작 전 1RM 입력" })).toBeVisible({
    timeout: 15_000,
  });
  const inputs = page.locator('input[aria-label$="1RM"]');
  await expect(inputs).toHaveCount(program.oneRmInputs);
  for (let index = 0; index < program.oneRmInputs; index += 1) {
    await inputs.nth(index).fill("100");
  }
  await page.getByRole("button", { name: "1RM 저장 후 시작" }).click();
  await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 20_000 });
  const url = new URL(page.url());
  const planId = url.searchParams.get("planId");
  const startDate = url.searchParams.get("date");
  expect(planId).toBeTruthy();
  expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return { planId: planId!, startDate: startDate! };
}

function progressionUrl(planId: string) {
  return `/api/plans/${encodeURIComponent(planId)}/progression-state`;
}

async function readProgression(page: Page, planId: string) {
  const response = await page.request.get(progressionUrl(planId));
  expect(response.status()).toBe(200);
  return (await response.json()) as ProgressionResponse;
}

function targetsFor(response: ProgressionResponse, canonical: string) {
  return Object.entries(response.state?.targets ?? {}).filter(
    ([key, target]) => String(target.progressionTarget ?? key).toUpperCase() === canonical,
  );
}

function targetWorkKg(response: ProgressionResponse, canonical: string) {
  const target = targetsFor(response, canonical)[0]?.[1];
  expect(target, `${canonical} progression target`).toBeTruthy();
  return target!.workKg;
}

async function openSession(page: Page, planId: string, date: string) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/plans/${encodeURIComponent(planId)}/progression-state`),
    { timeout: 30_000 },
  );
  await page.goto(`/workout/log?planId=${encodeURIComponent(planId)}&date=${date}`);
  await responsePromise.catch(() => null);
  await expect(page.locator('input[aria-label*="반복"]').first()).toBeVisible({ timeout: 30_000 });

  const bodyweightPrompt = page.getByText("중량풀업 · 체중 확인", { exact: true });
  if (await bodyweightPrompt.isVisible().catch(() => false)) {
    await page.getByLabel("오늘 체중(kg)").fill("75");
    await page.getByRole("button", { name: "업데이트", exact: true }).click();
    await expect(bodyweightPrompt).toBeHidden();
  }
}

async function fillSession(page: Page, repRule?: (context: RepRuleContext) => number) {
  const cards = page.locator('article[aria-label]').filter({
    has: page.locator('input[aria-label*="반복"]'),
  });
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(0);
  const snapshot: Array<{ exerciseName: string; plannedReps: number[] }> = [];

  for (let exerciseIndex = 0; exerciseIndex < cardCount; exerciseIndex += 1) {
    const card = cards.nth(exerciseIndex);
    const exerciseName = (await card.getAttribute("aria-label")) ?? `exercise-${exerciseIndex}`;
    const inputs = card.locator('input[aria-label*="반복"]');
    const setCount = await inputs.count();
    const plannedReps: number[] = [];
    for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
      const planned = Number(await inputs.nth(setIndex).getAttribute("placeholder"));
      const normalizedPlanned = Number.isFinite(planned) && planned >= 0 ? planned : 5;
      plannedReps.push(normalizedPlanned);
      const reps = repRule
        ? repRule({
            exerciseName,
            exerciseIndex,
            setIndex,
            setCount,
            plannedReps: normalizedPlanned,
          })
        : normalizedPlanned;
      await inputs.nth(setIndex).fill(String(reps));
    }
    snapshot.push({ exerciseName, plannedReps });
  }

  const progress = page.getByRole("progressbar", { name: /세트 진행률/ });
  const maxSets = await progress.getAttribute("aria-valuemax");
  expect(maxSets).toBeTruthy();
  await expect(progress).toHaveAttribute("aria-valuenow", maxSets!);
  return snapshot;
}

async function expectChoiceDialog(
  page: Page,
  choice: ChoiceExpectation,
  testInfo: TestInfo,
) {
  let dialog = page.getByRole("dialog", { name: choice.title });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  for (const pattern of choice.text) await expect(dialog).toContainText(pattern);
  if (choice.screenshotName) {
    await page.screenshot({ path: testInfo.outputPath(choice.screenshotName), fullPage: true });
  }

  if (choice.cancelFirst) {
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await page.getByRole("button", { name: /운동기록 완료 및 저장/ }).click();
    dialog = page.getByRole("dialog", { name: choice.title });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
  }

  for (const expected of choice.expectedDefaults ?? []) {
    const group = dialog.getByRole("radiogroup", { name: expected.targetLabel });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio", { name: expected.option, exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }

  if (choice.select) {
    const group = dialog.getByRole("radiogroup", { name: choice.select.targetLabel });
    await expect(group).toBeVisible();
    await group.getByRole("radio", { name: choice.select.option, exact: true }).click();
    await expect(group.getByRole("radio", { name: choice.select.option, exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
}

async function completeSession(input: {
  page: Page;
  testInfo: TestInfo;
  planId: string;
  date: string;
  repRule?: (context: RepRuleContext) => number;
  choice?: ChoiceExpectation;
}) {
  await openSession(input.page, input.planId, input.date);
  const snapshot = await fillSession(input.page, input.repRule);
  await input.page.getByRole("button", { name: /운동기록 완료 및 저장/ }).click();
  if (input.choice) await expectChoiceDialog(input.page, input.choice, input.testInfo);
  await expect(input.page).toHaveURL(/\/workout\/session\/[^?]+\?fresh=1/, { timeout: 40_000 });
  await expect(input.page.getByText("세션 완료", { exact: true })).toBeVisible({ timeout: 20_000 });
  const logId = new URL(input.page.url()).pathname.split("/").at(-1);
  expect(logId).toBeTruthy();
  const logResponse = await input.page.request.get(`/api/logs/${encodeURIComponent(logId!)}`);
  expect(logResponse.status()).toBe(200);
  const log = (await logResponse.json()) as {
    item?: {
      sets?: Array<{
        exerciseName?: string;
        setNumber?: number;
        reps?: number;
        meta?: { plannedRef?: { reps?: number }; progressionExcluded?: boolean };
      }>;
      progression?: {
        targetDecisions?: Array<{ progressionTarget?: string; eventType?: string; reason?: string }>;
      } | null;
    };
  };
  return { snapshot, progression: await readProgression(input.page, input.planId), log };
}

async function assertFeedback(
  page: Page,
  planId: string,
  date: string,
  patterns: RegExp[],
  testInfo?: TestInfo,
  screenshotName?: string,
) {
  await openSession(page, planId, date);
  const status = page.getByRole("status").filter({ hasText: patterns[0]! });
  await expect(status).toBeVisible({ timeout: 20_000 });
  const text = (await status.innerText()).replace(/\s+/g, " ").trim();
  for (const pattern of patterns) expect(text).toMatch(pattern);
  if (testInfo && screenshotName) {
    await page.screenshot({ path: testInfo.outputPath(screenshotName), fullPage: true });
  }
  const dismiss = status.getByRole("button", { name: "확인" });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  return text;
}

function failExercise(name: RegExp) {
  return (context: RepRuleContext) =>
    name.test(context.exerciseName) && context.setIndex === context.setCount - 1
      ? Math.max(0, context.plannedReps - 1)
      : context.plannedReps;
}

test("Manual: A/B 고정 세션과 자동 진행 없음이 화면·상태에서 일치", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "manual");
  const { planId, startDate } = await activateProgram(page, PROGRAM.manual, async (dialog) => {
    await expect(dialog).toContainText(/세션 고정/);
    await expect(dialog).toContainText(/자동 진행 엔진이 없어|작성한 그대로 기록/);
  });

  const first = await completeSession({ page, testInfo, planId, date: startDate });
  // Manual은 자동 진행 상태가 아니라 시작일 기준 캘린더 인덱스로 A/B를 고른다.
  const second = await completeSession({ page, testInfo, planId, date: addDays(startDate, 1) });
  expect(first.snapshot.map((item) => item.exerciseName)).not.toEqual(
    second.snapshot.map((item) => item.exerciseName),
  );
  expect(second.progression.program).toBeNull();
  expect(second.progression.state).toBeNull();
  expect(second.progression.feedback?.report ?? null).toBeNull();
  expect(browserFailures).toEqual([]);
});

test("Starting Strength: 성공 증량 → 실패 1/3·2/3 → 3/3 리셋 선택과 안내", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "starting-strength");
  const { planId, startDate } = await activateProgram(page, PROGRAM.startingStrength);

  const success = await completeSession({ page, testInfo, planId, date: startDate });
  const successSquat = targetsFor(success.progression, "SQUAT")[0]?.[1];
  expect(successSquat).toBeTruthy();
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 2),
    [/선형 진행 판정/, /처방 세트 완료/, /증량/, /다음 노출 새 무게/],
  );

  const firstMiss = await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 2),
    repRule: failExercise(/Back Squat/),
  });
  const firstMissSquatSets = firstMiss.log.item?.sets?.filter((set) => set.exerciseName === "Back Squat") ?? [];
  expect(firstMissSquatSets.at(-1)?.reps).toBe(4);
  expect(firstMissSquatSets.at(-1)?.meta?.plannedRef?.reps).toBe(5);
  expect(firstMiss.progression.lastEvent?.targetDecisions.find((item) => item.progressionTarget === "SQUAT")?.reason).toBe("hold:failure-streak");
  await assertFeedback(page, planId, addDays(startDate, 4), [/스쿼트/, /처방 미달/, /1\/3/, /같은 무게 재도전/]);

  await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 4),
    repRule: failExercise(/Back Squat/),
  });
  await assertFeedback(page, planId, addDays(startDate, 6), [/스쿼트/, /2\/3/, /같은 무게 재도전/]);

  const reset = await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 6),
    repRule: failExercise(/Back Squat/),
    choice: {
      title: /연속 실패 기준 도달/,
      text: [/3회 연속 처방 미달/, /3회 리셋 기준 도달/, /감소/, /현재/],
      screenshotName: "starting-strength-reset-choice.png",
    },
  });
  const resetSquat = targetsFor(reset.progression, "SQUAT")[0]?.[1];
  expect(resetSquat!.workKg).toBeLessThan(successSquat!.workKg);
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 8),
    [/처방 미달 3회 연속/, /무게 리셋/, /다음 노출 새 무게/],
    testInfo,
    "starting-strength-reset-feedback.png",
  );
  expect(browserFailures).toEqual([]);
});

test("StrongLifts: 3회 실패에서 HOLD를 선택하면 실제 상태와 다음 안내도 HOLD", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "stronglifts");
  const { planId, startDate } = await activateProgram(page, PROGRAM.stronglifts);

  const first = await completeSession({
    page,
    testInfo,
    planId,
    date: startDate,
    repRule: failExercise(/Back Squat/),
  });
  const originalKg = targetsFor(first.progression, "SQUAT")[0]?.[1].workKg;
  await assertFeedback(page, planId, addDays(startDate, 2), [/스쿼트/, /1\/3/, /무게 유지/]);

  await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 2),
    repRule: failExercise(/Back Squat/),
  });
  await assertFeedback(page, planId, addDays(startDate, 4), [/스쿼트/, /2\/3/, /무게 유지/]);

  const held = await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 4),
    repRule: failExercise(/Back Squat/),
    choice: {
      title: /연속 실패 기준 도달/,
      text: [/3회 연속 처방 미달/, /감소/],
      select: { targetLabel: /Back Squat 모드|스쿼트 모드/, option: "유지" },
      screenshotName: "stronglifts-hold-choice.png",
    },
  });
  expect(targetsFor(held.progression, "SQUAT")[0]?.[1].workKg).toBe(originalKg);
  expect(held.progression.lastEvent?.targetDecisions.find((item) => item.progressionTarget === "SQUAT")?.eventType).toBe("HOLD");
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 6),
    [/사용자 선택/, /유지/, /다음 노출에 적용/],
    testInfo,
    "stronglifts-hold-feedback.png",
  );
  expect(browserFailures).toEqual([]);
});

test("Greyskull: AMRAP 7 단일·10 더블·실패 1/2·2/2 리셋 선택", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "greyskull");
  const { planId, startDate } = await activateProgram(page, PROGRAM.greyskull);

  const amrap = (reps: number) => (context: RepRuleContext) =>
    context.setIndex === context.setCount - 1 ? reps : context.plannedReps;
  const failSquatAmrap = (context: RepRuleContext) =>
    /Back Squat/.test(context.exerciseName) && context.setIndex === context.setCount - 1
      ? 3
      : context.setIndex === context.setCount - 1
        ? 7
        : context.plannedReps;

  const single = await completeSession({ page, testInfo, planId, date: startDate, repRule: amrap(7) });
  const singleKg = targetsFor(single.progression, "SQUAT")[0]?.[1].workKg;
  await assertFeedback(page, planId, addDays(startDate, 2), [/AMRAP 7렙\(5–9\)/, /1단계 증량/, /다음 노출 새 무게/]);

  const doubled = await completeSession({ page, testInfo, planId, date: addDays(startDate, 2), repRule: amrap(10) });
  const doubledKg = targetsFor(doubled.progression, "SQUAT")[0]?.[1].workKg;
  expect(doubledKg! - singleKg!).toBeGreaterThan(2.5);
  await assertFeedback(page, planId, addDays(startDate, 4), [/AMRAP 10렙\(10\+\)/, /2단계 증량/]);

  await completeSession({ page, testInfo, planId, date: addDays(startDate, 4), repRule: failSquatAmrap });
  await assertFeedback(page, planId, addDays(startDate, 6), [/스쿼트/, /AMRAP 5렙 미달/, /1\/2/, /5렙 이상 목표/]);

  const reset = await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 6),
    repRule: failSquatAmrap,
    choice: {
      title: /연속 실패 기준 도달/,
      text: [/2회 연속 처방 미달/, /2회 리셋 기준 도달/, /감소/],
      cancelFirst: true,
      screenshotName: "greyskull-reset-choice.png",
    },
  });
  expect(targetsFor(reset.progression, "SQUAT")[0]?.[1].workKg).toBeLessThan(doubledKg!);
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 8),
    [/AMRAP 5렙 미달 2회 연속/, /무게 리셋/, /새 무게로 재시작/],
  );
  expect(browserFailures).toEqual([]);
});

test("Texas Method: V/R/I 역할 → 강도일 실패 1/3·2/3·3/3 동적 슬롯 리셋", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "texas");
  const { planId, startDate } = await activateProgram(page, PROGRAM.texas);
  let beforeResetKg: number | undefined;

  for (let session = 0; session < 9; session += 1) {
    const date = addDays(startDate, session * 2);
    const isIntensity = session % 3 === 2;
    if (session % 3 === 0) {
      await openSession(page, planId, date);
      await expect(page.getByText("볼륨일", { exact: true }).first()).toBeVisible();
    } else if (session % 3 === 1) {
      await openSession(page, planId, date);
      await expect(page.getByText("회복일", { exact: true }).first()).toBeVisible();
    } else {
      await openSession(page, planId, date);
      await expect(page.getByText("강도일", { exact: true }).first()).toBeVisible();
    }

    const isThirdIntensity = session === 8;
    const result = await completeSession({
      page,
      testInfo,
      planId,
      date,
      repRule: isIntensity ? failExercise(/Back Squat/) : undefined,
      choice: isThirdIntensity
        ? {
            title: /연속 실패 기준 도달/,
            text: [/3회 연속 처방 미달/, /3회 리셋 기준 도달/, /Back Squat/, /감소/],
            screenshotName: "texas-intensity-reset-choice.png",
          }
        : undefined,
    });

    if (isIntensity) {
      const squat = targetsFor(result.progression, "SQUAT").find(([key]) => key.startsWith("I_"));
      expect(squat).toBeTruthy();
      if (session === 5) beforeResetKg = squat![1].workKg;
      if (session === 2) {
        await assertFeedback(page, planId, addDays(startDate, 6), [/강도일 처방 미달/, /1\/3/, /다음 강도일 재도전/]);
      }
      if (session === 5) {
        await assertFeedback(page, planId, addDays(startDate, 12), [/강도일 처방 미달/, /2\/3/, /다음 강도일 재도전/]);
      }
      if (session === 8) expect(squat![1].workKg).toBeLessThan(beforeResetKg!);
    }
  }

  await assertFeedback(
    page,
    planId,
    addDays(startDate, 18),
    [/강도일 처방 미달 3회 연속/, /주간 기준 리셋/, /파생 무게도 재계산/],
    testInfo,
    "texas-reset-feedback.png",
  );
  expect(browserFailures).toEqual([]);
});

test("GZCLP: T1 5×3→6×2→10×1→85% 리셋과 T3 AMRAP 양쪽 분기", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "gzclp");
  const { planId, startDate } = await activateProgram(page, PROGRAM.gzclp);

  const d1Rule = (stage: 0 | 1 | 2, t3Reps: number) => (context: RepRuleContext) => {
    if (context.exerciseIndex === 0 && context.setIndex === context.setCount - 1) {
      return stage === 2 ? 0 : Math.max(0, context.plannedReps - 1);
    }
    if (context.exerciseIndex === 2 && context.setIndex === context.setCount - 1) return t3Reps;
    return context.plannedReps;
  };

  const first = await completeSession({ page, testInfo, planId, date: startDate, repRule: d1Rule(0, 20) });
  const initialD1Kg = first.progression.state?.targets.D1_s0?.workKg;
  expect(first.progression.state?.targets.D1_s0?.stage).toBe(1);
  await assertFeedback(page, planId, addDays(startDate, 2), [/단계 0→1/, /무게 유지/, /AMRAP 25렙 미달/, /같은 무게 재도전/]);

  for (let session = 1; session <= 3; session += 1) {
    await completeSession({ page, testInfo, planId, date: addDays(startDate, session * 2) });
  }

  await openSession(page, planId, addDays(startDate, 8));
  const stageOneFirstCard = page.locator('article[aria-label]').filter({ has: page.locator('input[aria-label*="반복"]') }).first();
  await expect(stageOneFirstCard.locator('input[aria-label*="반복"]')).toHaveCount(6);
  const second = await completeSession({ page, testInfo, planId, date: addDays(startDate, 8), repRule: d1Rule(1, 25) });
  expect(second.progression.state?.targets.D1_s0?.stage).toBe(2);
  await assertFeedback(page, planId, addDays(startDate, 10), [/단계 1→2/, /AMRAP ≥25렙 달성/, /증량/]);

  for (let session = 5; session <= 7; session += 1) {
    await completeSession({ page, testInfo, planId, date: addDays(startDate, session * 2) });
  }

  await openSession(page, planId, addDays(startDate, 16));
  const stageTwoFirstCard = page.locator('article[aria-label]').filter({ has: page.locator('input[aria-label*="반복"]') }).first();
  const stageTwoInputs = stageTwoFirstCard.locator('input[aria-label*="반복"]');
  await expect(stageTwoInputs).toHaveCount(10);
  await expect(stageTwoInputs.first()).toHaveAttribute("placeholder", "1");
  const reset = await completeSession({ page, testInfo, planId, date: addDays(startDate, 16), repRule: d1Rule(2, 20) });
  expect(reset.progression.state?.targets.D1_s0?.stage).toBe(0);
  expect(reset.progression.state?.targets.D1_s0?.workKg).toBeLessThan(initialD1Kg!);
  expect(reset.progression.lastEvent?.reason).not.toMatch(/^override:/);
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 18),
    [/스킴 소진/, /무게 리셋/, /AMRAP 25렙 미달/, /같은 무게 재도전/],
    testInfo,
    "gzclp-stage-reset-feedback.png",
  );
  expect(browserFailures).toEqual([]);
});

test("Operator: 18회 파동·최종 미달 전체 동결·선택 취소/재개와 원인 안내", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "operator");
  const { planId, startDate } = await activateProgram(page, PROGRAM.operator, async (dialog) => {
    await expect(dialog).toContainText(/6주/);
    await expect(dialog).toContainText(/훈련 최대 중량|TM/);
  });
  const repsByWeek = [5, 5, 3, 5, 3, 1];
  let beforeFinal: ProgressionResponse | null = null;
  let final: Awaited<ReturnType<typeof completeSession>> | null = null;

  for (let session = 0; session < 18; session += 1) {
    const week = Math.floor(session / 3);
    if (session === 17) beforeFinal = await readProgression(page, planId);
    const isFinal = session === 17;
    const result = await completeSession({
      page,
      testInfo,
      planId,
      date: addDays(startDate, session * 2),
      repRule: isFinal ? failExercise(/Back Squat/) : undefined,
      choice: isFinal
        ? {
            title: /블록 완료 - 무게 설정/,
            text: [
              /6주 블록을 완료했지만/,
              /모든 무게 유지가 권장/,
              /스쿼트/,
              /벤치프레스/,
              /데드리프트/,
              /풀/,
              /전체 증량 보류/,
            ],
            expectedDefaults: [
              { targetLabel: /스쿼트 모드/, option: "유지" },
              { targetLabel: /벤치프레스 모드/, option: "유지" },
              { targetLabel: /데드리프트 모드/, option: "유지" },
              { targetLabel: /풀 모드/, option: "유지" },
            ],
            cancelFirst: true,
            screenshotName: "operator-freeze-choice.png",
          }
        : undefined,
    });
    if (session % 3 === 0) {
      expect(result.snapshot[0]?.plannedReps.every((reps) => reps === repsByWeek[week])).toBe(true);
    }
    if (isFinal) final = result;
  }

  expect(beforeFinal).toBeTruthy();
  expect(final).toBeTruthy();
  expect(final!.progression.state?.cycle).toBe(2);
  expect(final!.progression.state?.week).toBe(1);
  expect(final!.progression.state?.day).toBe(1);
  expect(final!.progression.lastEvent?.reason).toBe("freeze:block:failed=SQUAT");
  for (const target of ["SQUAT", "BENCH", "DEADLIFT", "PULL"] as const) {
    expect(targetWorkKg(final!.progression, target)).toBe(targetWorkKg(beforeFinal!, target));
  }
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 36),
    [/증량 동결/, /처방 미달: 스쿼트/, /다음 블록 동일 TM/],
    testInfo,
    "operator-freeze-feedback.png",
  );
  expect(browserFailures).toEqual([]);
});

test("5/3/1 기본: 16회 주차 파동·블록 증량·리프트별 HOLD 선택과 실제 반영", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "531-base");
  const { planId, startDate } = await activateProgram(page, PROGRAM.wendler531, async (dialog) => {
    await expect(dialog).toContainText(/4주/);
    await expect(dialog).toContainText(/AMRAP/);
  });
  const schemes = [[5, 5, 5], [3, 3, 3], [5, 3, 1], [5, 5, 5]];
  let beforeFinal: ProgressionResponse | null = null;
  let final: Awaited<ReturnType<typeof completeSession>> | null = null;

  for (let session = 0; session < 16; session += 1) {
    if (session === 15) beforeFinal = await readProgression(page, planId);
    const isFinal = session === 15;
    const result = await completeSession({
      page,
      testInfo,
      planId,
      date: addDays(startDate, session * 2),
      choice: isFinal
        ? {
            title: /4주 사이클 완료 - TM 설정/,
            text: [/4주 사이클을 완료/, /다음 사이클/, /스쿼트/, /벤치프레스/, /데드리프트/, /오버헤드프레스/],
            expectedDefaults: [
              { targetLabel: /스쿼트 모드/, option: "증량" },
              { targetLabel: /오버헤드프레스 모드/, option: "증량" },
            ],
            select: { targetLabel: /오버헤드프레스 모드/, option: "유지" },
            screenshotName: "wendler-531-cycle-choice.png",
          }
        : undefined,
    });
    if (session % 4 === 0) expect(result.snapshot[0]?.plannedReps).toEqual(schemes[session / 4]);
    if (isFinal) final = result;
  }

  expect(beforeFinal).toBeTruthy();
  expect(final).toBeTruthy();
  expect(final!.progression.state?.cycle).toBe(2);
  expect(final!.progression.state?.week).toBe(1);
  expect(final!.progression.state?.day).toBe(1);
  expect(targetWorkKg(final!.progression, "SQUAT")).toBeGreaterThan(targetWorkKg(beforeFinal!, "SQUAT"));
  expect(targetWorkKg(final!.progression, "OHP")).toBe(targetWorkKg(beforeFinal!, "OHP"));
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 32),
    [/사용자 선택/, /오버헤드프레스 — 사용자 선택: 유지/, /스쿼트 \+5 .*다음 블록 적용/, /다음 노출에 적용/],
    testInfo,
    "wendler-531-choice-feedback.png",
  );
  expect(browserFailures).toEqual([]);
});

for (const variant of [
  { label: "FSL", program: PROGRAM.wendler531Fsl, reps: 5, detail: /5×5/ },
  { label: "BBB", program: PROGRAM.wendler531Bbb, reps: 10, detail: /5×10/ },
] as const) {
  test(`5/3/1 ${variant.label}: 보조 5세트 처방과 메인 진행 판정 분리`, async ({ page }, testInfo) => {
    const browserFailures = observeBrowser(page);
    await signup(page, `531-${variant.label.toLowerCase()}`);
    const { planId, startDate } = await activateProgram(page, variant.program, async (dialog) => {
      await expect(dialog).toContainText(variant.detail);
    });
    const result = await completeSession({ page, testInfo, planId, date: startDate });
    expect(result.snapshot).toHaveLength(2);
    expect(result.snapshot[1]?.plannedReps).toHaveLength(5);
    expect(result.snapshot[1]?.plannedReps.every((reps) => reps === variant.reps)).toBe(true);
    const savedSets = result.log.item?.sets ?? [];
    expect(savedSets.filter((set) => set.meta?.progressionExcluded === true)).toHaveLength(5);
    const decisions = result.progression.lastEvent?.targetDecisions ?? [];
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.progressionTarget).toBe("SQUAT");
    expect(browserFailures).toEqual([]);
  });
}

test("Asymptote: 12회 블록 AMRAP +2.5/HOLD/-5·라이트와 파생 TM 피드백", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "asymptote-block");
  const { planId, startDate } = await activateProgram(page, PROGRAM.asymptote, async (dialog) => {
    await expect(dialog).toContainText(/적응|빌드/);
    await expect(dialog).toContainText(/검증|AMRAP/);
    await expect(dialog).toContainText(/디로드/);
  });
  let baseline: ProgressionResponse | null = null;
  let final: Awaited<ReturnType<typeof completeSession>> | null = null;

  for (let session = 0; session < 12; session += 1) {
    if (session === 6 || session === 8) {
      await openSession(page, planId, addDays(startDate, session * 2));
      await expect(page.getByText(/AMRAP/).first()).toBeVisible();
    }
    const repRule = (context: RepRuleContext) => {
      const isLast = context.setIndex === context.setCount - 1;
      if (session === 6 && isLast && /Back Squat/.test(context.exerciseName)) return 8;
      if (session === 6 && isLast && /Weighted Pull-Up/.test(context.exerciseName)) return 6;
      if (session === 8 && isLast && /Bench Press/.test(context.exerciseName)) return 2;
      return context.plannedReps;
    };
    const result = await completeSession({
      page,
      testInfo,
      planId,
      date: addDays(startDate, session * 2),
      repRule,
    });
    if (session === 0) baseline = result.progression;
    if (session === 11) final = result;
  }

  expect(baseline).toBeTruthy();
  expect(final).toBeTruthy();
  expect(final!.progression.state?.cycle).toBe(2);
  expect(final!.progression.state?.week).toBe(1);
  expect(final!.progression.state?.day).toBe(1);
  expect(targetWorkKg(final!.progression, "SQUAT")).toBe(targetWorkKg(baseline!, "SQUAT") + 2.5);
  expect(targetWorkKg(final!.progression, "PULL")).toBe(targetWorkKg(baseline!, "PULL"));
  expect(targetWorkKg(final!.progression, "BENCH")).toBe(targetWorkKg(baseline!, "BENCH") - 5);
  expect(targetWorkKg(final!.progression, "DEADLIFT")).toBe(targetWorkKg(final!.progression, "SQUAT"));
  expect(final!.progression.state?.lightBlockMode).toBe(true);
  await assertFeedback(
    page,
    planId,
    addDays(startDate, 24),
    [/SQ — AMRAP 8렙/, /PULL — AMRAP 6렙.*TM 유지/, /BP — AMRAP 2렙.*다음 블록 라이트/, /DL — SQ 연동 갱신/],
    testInfo,
    "asymptote-block-feedback.png",
  );
  await expect(page.getByRole("status").filter({ hasText: /라이트 블록 \(회복\)/ })).toContainText(/직전 AMRAP 0~2렙/);
  expect(browserFailures).toEqual([]);
});

test("Asymptote: AMRAP 전날 예고와 연속일 보류가 이유·다음 행동까지 설명", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "asymptote-deferred");
  const { planId, startDate } = await activateProgram(page, PROGRAM.asymptote);
  const offsets = [-10, -8, -6, -4, -2, 0];
  for (const offset of offsets) {
    await completeSession({ page, testInfo, planId, date: addDays(startDate, offset) });
  }

  await openSession(page, planId, startDate);
  const eve = page.getByRole("status").filter({ hasText: /다음 세션은 AMRAP/ });
  await expect(eve).toBeVisible();
  await expect(eve).toContainText(/내일 치면 보류/);
  await expect(eve).toContainText(/하루 쉬고 치면 판정 가능/);

  const deferredDate = addDays(startDate, 1);
  await openSession(page, planId, deferredDate);
  const deferred = page.getByRole("status").filter({ hasText: /오늘 AMRAP 보류/ });
  await expect(deferred).toBeVisible();
  await expect(deferred).toContainText(/연속일 휴식 부족/);
  await expect(deferred).toContainText(/판정은 다음 블록/);
  await expect(deferred).toContainText(/평소 세트만 치면 됩니다/);
  await page.screenshot({ path: testInfo.outputPath("asymptote-amrap-deferred.png"), fullPage: true });
  await completeSession({ page, testInfo, planId, date: deferredDate });
  expect(browserFailures).toEqual([]);
});

test("Asymptote: 두 드라이버 렙 급감 누적 시 조기 디로드 원인과 회복 행동 안내", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  await signup(page, "asymptote-early-deload");
  const { planId, startDate } = await activateProgram(page, PROGRAM.asymptote);
  const regressSquatAndPull = (context: RepRuleContext) =>
    context.setIndex === context.setCount - 1 && /Back Squat|Weighted Pull-Up/.test(context.exerciseName)
      ? 0
      : context.plannedReps;

  await completeSession({ page, testInfo, planId, date: startDate, repRule: regressSquatAndPull });
  const triggered = await completeSession({
    page,
    testInfo,
    planId,
    date: addDays(startDate, 2),
    repRule: regressSquatAndPull,
  });
  expect(triggered.progression.state?.week).toBe(4);
  expect(triggered.progression.state?.day).toBe(1);
  expect(triggered.progression.lastEvent?.reason).toMatch(/^deload:trigger:regressed=/);

  await openSession(page, planId, addDays(startDate, 4));
  const banner = page.getByRole("status").filter({ hasText: /조기 디로드 발동/ });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/메인 리프트 2개에서 렙 급감이 누적/);
  await expect(banner).toContainText(/회복 사이클로 점프/);
  await expect(banner).toContainText(/TM은 유지/);
  await page.screenshot({ path: testInfo.outputPath("asymptote-early-deload.png"), fullPage: true });
  expect(browserFailures).toEqual([]);
});
