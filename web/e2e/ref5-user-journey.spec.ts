import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PASSWORD = "Ref5-e2e-password-17!";

test.setTimeout(90_000);

test.use({
  viewport: { width: 390, height: 844 },
  video: "retain-on-failure",
  trace: "retain-on-failure",
});

function uniqueEmail(label: string) {
  return `ref5-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function formatLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeDaysAgo(daysAgo: number, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return formatLocalDateTime(date);
}

function offsetLocalDateTime(startAt: string, minutes: number) {
  const date = new Date(startAt);
  date.setMinutes(date.getMinutes() + minutes);
  return formatLocalDateTime(date);
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
  await page.getByLabel("이름 (선택)").fill(`REF5 ${label}`);
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
  return email;
}

async function activateRef5ProgramThroughUi(
  page: Page,
  label: string,
  testInfo: TestInfo,
  capture = false,
) {
  await signupThroughUi(page, label, testInfo);
  await page.goto("/program-store");
  await page.getByPlaceholder(/프로그램명, 설명, 태그 검색/).fill("REF5");
  const ref5Card = page
    .locator(".program-list-card")
    .filter({ hasText: "REF5 Adaptive Strength" })
    .first();
  await expect(ref5Card).toBeVisible({ timeout: 20_000 });
  if (capture) {
    await page.screenshot({ path: testInfo.outputPath("program-store-mobile.png"), fullPage: true });
  }

  await ref5Card.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("dialog", { name: "프로그램 상세" })).toBeVisible();
  await page.getByRole("button", { name: "이 프로그램으로 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "REF5 시작 기준 설정" })).toBeVisible({
    timeout: 15_000,
  });
  const e1rmInputs = page.locator('input[aria-label$="추정 1RM (e1RM)"]');
  await expect(e1rmInputs).toHaveCount(5);
  const e1rmByLabel = [
    ["SQ 추정 1RM (e1RM)", "104"],
    ["BP 추정 1RM (e1RM)", "101"],
    ["PULL 총중량 추정 1RM (e1RM)", "108"],
    ["DL 추정 1RM (e1RM)", "100"],
    ["OHP 추정 1RM (e1RM)", "50"],
  ] as const;
  for (const [ariaLabel, value] of e1rmByLabel) {
    await page.getByLabel(ariaLabel, { exact: true }).fill(value);
  }
  await expect(page.getByText(/계산된 첫 처방/)).toBeVisible();
  await expect(page.getByText(/SQ · 3×3 82\.5kg/)).toBeVisible();
  if (capture) {
    await page.screenshot({ path: testInfo.outputPath("ref5-start-calibration.png"), fullPage: true });
  }

  await page.getByRole("button", { name: "첫 처방으로 시작" }).click();
  await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 20_000 });
  const planId = new URL(page.url()).searchParams.get("planId");
  expect(planId).toBeTruthy();
  await expect(page.getByRole("heading", { name: "REF5 세션 결정" })).toBeVisible({
    timeout: 20_000,
  });
  if (capture) {
    await page.screenshot({ path: testInfo.outputPath("ref5-session-decision.png"), fullPage: true });
  }
  return planId!;
}

async function activateOneRmProgramThroughUi(
  page: Page,
  label: string,
  testInfo: TestInfo,
  programName = "Greyskull LP",
) {
  await signupThroughUi(page, label, testInfo);
  await page.goto("/program-store");
  await page.getByPlaceholder(/프로그램명, 설명, 태그 검색/).fill(programName);
  const programCard = page.locator(".program-list-card").filter({ hasText: programName }).first();
  await expect(programCard).toBeVisible({ timeout: 20_000 });
  await programCard.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("dialog", { name: "프로그램 상세" })).toBeVisible();
  await page.getByRole("button", { name: "이 프로그램으로 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "시작 전 1RM 입력" })).toBeVisible({
    timeout: 15_000,
  });

  const oneRmInputs = page.locator('input[aria-label$=" 1RM"]');
  const inputCount = await oneRmInputs.count();
  expect(inputCount).toBeGreaterThan(0);
  for (let index = 0; index < inputCount; index += 1) {
    await oneRmInputs.nth(index).fill("100");
  }
  await page.getByRole("button", { name: "1RM 저장 후 시작" }).click();
  await expect(page).toHaveURL(/\/workout\/log\?/, { timeout: 20_000 });
  const planId = new URL(page.url()).searchParams.get("planId");
  expect(planId).toBeTruthy();
  await expect(page.locator('input[aria-label*="반복"]').first()).toBeVisible({ timeout: 20_000 });
  return planId!;
}

type Ref5OutcomeKind =
  | "PASS"
  | "HOLD_SLOW"
  | "HOLD_SHORT"
  | "FAIL"
  | "INVALID_SAFETY"
  | "INVALID_EXTERNAL"
  | "CHECK_NORMAL_SHORT";

type Ref5StatusShape = {
  revision: number;
  nextFocus: "PULL" | "BP";
  nextSquatHard: "H3" | "H2";
  pendingMicro: {
    pending: boolean;
    reasons: string[];
    forcedToken: unknown;
    stagnationLifts: string[];
  };
  windows: Record<
    "SQ" | "BP" | "PULL" | "DL" | "OHP",
    { current: number; threshold: number; volumeFailures: number; completed: number }
  >;
  directStandardsKg: {
    sqH3Kg: number;
    bpFocusKg: number;
    pullFocusTotalKg: number;
    deadliftKg: number;
    ohpKg: number;
  };
  structureReview: { SQ: boolean; BP: boolean; PULL: boolean; any: boolean };
  pullLock: null | {
    windowId: string;
    focusTargetTotalKg: number;
    volumeTargetTotalKg: number;
    focusAddedKg: number;
    volumeAddedKg: number;
  };
  startedSessionCount: number;
  completedSessionCount: number;
  recentChanges: Array<Record<string, unknown>>;
};

async function fillRef5ExerciseOutcome(
  page: Page,
  exerciseName: string,
  kind: Ref5OutcomeKind,
) {
  const card = page.getByRole("article", { name: exerciseName, exact: true });
  await expect(card).toBeVisible();
  const repInputs = card.locator('input[aria-label*="반복"]');
  const planned: number[] = [];
  for (let index = 0; index < (await repInputs.count()); index += 1) {
    planned.push(Number(await repInputs.nth(index).getAttribute("placeholder")));
  }
  expect(planned.every((value) => Number.isInteger(value) && value > 0)).toBe(true);

  const actual = [...planned];
  let reason = "NORMAL";
  let expected = "PASS";
  if (kind === "HOLD_SLOW") {
    reason = "CLEAR_SLOWDOWN";
    expected = "HOLD";
  } else if (kind === "HOLD_SHORT") {
    actual[0] = Math.max(0, actual[0]! - 1);
    reason = "FORCE_OR_TECHNIQUE";
    expected = "HOLD";
  } else if (kind === "FAIL") {
    actual[0] = Math.max(0, actual[0]! - 2);
    reason = "FORCE_OR_TECHNIQUE";
    expected = "FAIL";
  } else if (kind === "INVALID_SAFETY" || kind === "INVALID_EXTERNAL") {
    actual.fill(0);
    reason = kind === "INVALID_SAFETY" ? "SAFETY" : "EXTERNAL";
    expected = "INVALID";
  } else if (kind === "CHECK_NORMAL_SHORT") {
    actual[0] = Math.max(0, actual[0]! - 1);
    expected = "CHECK";
  }

  for (let index = 0; index < actual.length; index += 1) {
    await repInputs.nth(index).fill(String(actual[index]));
  }
  await card.getByLabel("REF5 종료 사유").selectOption(reason);
  await expect(card.getByText(expected, { exact: true })).toBeVisible();
}

async function fillCurrentRef5Session(
  page: Page,
  overrides: Record<string, Ref5OutcomeKind> = {},
) {
  const cards = page.locator("article").filter({ has: page.getByLabel("REF5 종료 사유") });
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const exerciseName = await cards.nth(index).getAttribute("aria-label");
    expect(exerciseName).toBeTruthy();
    await fillRef5ExerciseOutcome(page, exerciseName!, overrides[exerciseName!] ?? "PASS");
  }
}

async function openAndPreviewRef5Session(
  page: Page,
  planId: string,
  input: {
    startAt: string;
    bodyweightKg?: number;
    manualMicro?: boolean;
    mode: "NORMAL" | "MICRO";
    squat: "H3" | "H2" | "V";
    focus?: "PULL" | "BP";
    setCount: 9 | 4;
  },
) {
  await page.goto(`/workout/log?planId=${encodeURIComponent(planId)}&context=today`);
  await expect(page.getByRole("heading", { name: "REF5 세션 결정" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel("실제 시작 시각").fill(input.startAt);
  await page.getByLabel("오늘의 체중").fill(String(input.bodyweightKg ?? 75));
  if (input.manualMicro) {
    await page.getByText("오늘 시간 제약이 있을 때 선택", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "수동 마이크로 세션" })).toBeChecked();
  }
  await page.getByRole("button", { name: "세션 미리보기" }).click();
  await expect(page.getByText(input.mode, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`SQ ${input.squat}`, { exact: true })).toBeVisible();
  if (input.focus) await expect(page.getByText(input.focus, { exact: true })).toBeVisible();
  await expect(page.getByText(`${input.setCount} sets`, { exact: true })).toBeVisible();
}

async function startPreviewedRef5Session(page: Page) {
  await page.getByRole("button", { name: "SQ 첫 워크 세트 시작" }).click();
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });
}

async function saveCurrentRef5Session(page: Page) {
  const setProgress = page.getByRole("progressbar", { name: /세트 진행률/ });
  await expect(setProgress).toBeVisible();
  expect(await setProgress.getAttribute("aria-valuenow")).toBe(
    await setProgress.getAttribute("aria-valuemax"),
  );
  await page
    .getByRole("button", { name: /운동기록 (?:완료 및 저장|수정 완료)/ })
    .click();
  await expect(page).toHaveURL(/\/workout\/session\/[^?]+\?fresh=1/, { timeout: 30_000 });
  await expect(page.getByText("세션 완료", { exact: true })).toBeVisible({ timeout: 20_000 });
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

async function readRef5Status(page: Page, planId: string) {
  const response = await page.request.get(`/api/plans/${encodeURIComponent(planId)}/progression-state`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.program).toBe("ref5");
  return body.ref5Status as Ref5StatusShape;
}

async function runRef5Session(
  page: Page,
  planId: string,
  input: Parameters<typeof openAndPreviewRef5Session>[2],
  outcomes: Record<string, Ref5OutcomeKind> = {},
) {
  await openAndPreviewRef5Session(page, planId, input);
  await startPreviewedRef5Session(page);
  await fillCurrentRef5Session(page, outcomes);
  return saveCurrentRef5Session(page);
}

test("REF5 실제 사용자 기본 진입", async ({ page }, testInfo) => {
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "baseline", testInfo, true);

  const firstStartAt = localDateTimeDaysAgo(60);
  await page.getByLabel("실제 시작 시각").fill(firstStartAt);
  await page.getByLabel("오늘의 체중").fill("75");
  await page.getByRole("button", { name: "세션 미리보기" }).click();
  await expect(page.getByText("NORMAL", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SQ H3", { exact: true })).toBeVisible();
  await expect(page.getByText("PULL", { exact: true })).toBeVisible();
  await expect(page.getByText("9 sets", { exact: true })).toBeVisible();
  await expect(page.getByText("0/6", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-first-preview.png"), fullPage: true });

  await page.getByRole("button", { name: "SQ 첫 워크 세트 시작" }).click();
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath("ref5-first-started.png"), fullPage: true });

  await fillCurrentRef5Session(page);
  await expect(page.getByRole("progressbar", { name: /세트 진행률/ })).toHaveAttribute(
    "aria-valuenow",
    "9",
  );
  await page.screenshot({ path: testInfo.outputPath("ref5-first-pass-ready.png"), fullPage: true });

  const logId = await saveCurrentRef5Session(page);
  await page.screenshot({ path: testInfo.outputPath("ref5-first-saved.png"), fullPage: true });

  expect(logId).toBeTruthy();
  const persistedResponse = await page.request.get(`/api/logs/${logId}`);
  expect(persistedResponse.status()).toBe(200);
  const persisted = await persistedResponse.json();
  await testInfo.attach("first-session-persisted", {
    body: JSON.stringify(persisted, null, 2),
    contentType: "application/json",
  });
  expect(persisted.item.sets).toHaveLength(9);

  await page.goto(`/workout/log?planId=${encodeURIComponent(planId)}&context=today`);
  await expect(page.getByRole("heading", { name: "REF5 세션 결정" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("progressbar", { name: "SQ 하드 1/6" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "PULL 집중 1/4" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "DL 1/4" })).toBeVisible();

  await page.getByLabel("실제 시작 시각").fill(localDateTimeDaysAgo(57));
  await page.getByLabel("오늘의 체중").fill("75");
  await page.getByRole("button", { name: "세션 미리보기" }).click();
  await expect(page.getByText("NORMAL", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SQ H2", { exact: true })).toBeVisible();
  await expect(page.getByText("BP", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-second-preview.png"), fullPage: true });

  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });

  expect(browserFailures).toEqual([]);
});

test("REF5 판정 조합·INVALID 큐 유지·강제 및 수동 마이크로", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "outcomes", testInfo);

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(120),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 9,
  });
  await startPreviewedRef5Session(page);
  await fillCurrentRef5Session(page, {
    "High-Bar Back Squat": "PASS",
    "Weighted Pull-Up": "INVALID_SAFETY",
    "Bench Press": "CHECK_NORMAL_SHORT",
    Deadlift: "PASS",
  });
  await page.getByRole("button", { name: "운동기록 완료 및 저장" }).click();
  await expect(
    page.getByText("3번째 REF5 운동의 유효 반복과 종료 사유 조합을 확인해 주세요."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/workout\/log/);
  await page.getByRole("button", { name: "확인" }).click();

  await fillRef5ExerciseOutcome(page, "Bench Press", "HOLD_SLOW");
  await saveCurrentRef5Session(page);
  let status = await readRef5Status(page, planId);
  expect(status.nextFocus).toBe("PULL");
  expect(status.nextSquatHard).toBe("H2");
  expect(status.windows.SQ.current).toBe(1);
  expect(status.windows.PULL.current).toBe(0);
  expect(status.windows.DL.current).toBe(1);

  await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(117),
      mode: "NORMAL",
      squat: "H2",
      focus: "PULL",
      setCount: 9,
    },
    {
      "High-Bar Back Squat": "FAIL",
      "Weighted Pull-Up": "FAIL",
      "Bench Press": "PASS",
      Deadlift: "INVALID_EXTERNAL",
    },
  );
  status = await readRef5Status(page, planId);
  expect(status.nextFocus).toBe("BP");
  expect(status.nextSquatHard).toBe("H3");
  expect(status.pendingMicro.pending).toBe(true);
  expect(status.pendingMicro.reasons).toContain("FORCED_PRIMARY_FAILS");
  expect(status.windows.SQ.current).toBe(2);
  expect(status.windows.PULL.current).toBe(1);

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(114),
    mode: "MICRO",
    squat: "V",
    setCount: 4,
  });
  await expect(page.getByText(/FORCED_PRIMARY_FAILS/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-forced-micro-preview.png"), fullPage: true });
  await startPreviewedRef5Session(page);
  await fillCurrentRef5Session(page);
  await saveCurrentRef5Session(page);
  status = await readRef5Status(page, planId);
  expect(status.pendingMicro.pending).toBe(false);
  expect(status.nextFocus).toBe("BP");
  expect(status.windows.SQ.current).toBe(2);
  expect(status.windows.PULL.current).toBe(1);

  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(111),
    manualMicro: true,
    mode: "MICRO",
    squat: "V",
    setCount: 4,
  });
  status = await readRef5Status(page, planId);
  expect(status.startedSessionCount).toBe(4);
  expect(status.completedSessionCount).toBe(4);
  expect(status.windows.SQ.current).toBe(2);
  expect(status.windows.PULL.current).toBe(1);

  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});

test("REF5 전체 판정창 증가·보조 상한·PULL 체중 잠금", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "windows", testInfo);
  const squatSequence = ["H3", "H2", "V", "H3", "H2", "V", "H3", "H2"] as const;
  const focusSequence = ["PULL", "BP", "PULL", "BP", "PULL", "BP", "PULL", "BP"] as const;
  const bodyweights = [75, 76, 74, 75.5, 73.5, 76.5, 74.5, 75];

  for (let index = 0; index < 8; index += 1) {
    await openAndPreviewRef5Session(page, planId, {
      startAt: localDateTimeDaysAgo(150 - index * 3),
      bodyweightKg: bodyweights[index],
      mode: "NORMAL",
      squat: squatSequence[index],
      focus: focusSequence[index],
      setCount: 9,
    });
    if (index === 2) {
      await expect(page.getByText(/12\.5 kg \(86\.5 kg total\)/)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("pull-lock-daily-total.png"), fullPage: true });
    }
    await startPreviewedRef5Session(page);
    await fillCurrentRef5Session(page);
    await saveCurrentRef5Session(page);
  }

  const status = await readRef5Status(page, planId);
  expect(status.nextFocus).toBe("PULL");
  expect(status.nextSquatHard).toBe("H3");
  for (const lift of ["SQ", "BP", "PULL", "DL", "OHP"] as const) {
    expect(status.windows[lift].current).toBe(0);
    expect(status.windows[lift].completed).toBe(1);
  }
  expect(status.directStandardsKg).toEqual({
    sqH3Kg: 85,
    bpFocusKg: 85,
    pullFocusTotalKg: 90,
    deadliftKg: 75,
    ohpKg: 32.5,
  });
  expect(status.pullLock).toMatchObject({
    focusTargetTotalKg: 90,
    volumeTargetTotalKg: 75,
    focusAddedKg: 15,
    volumeAddedKg: 0,
  });

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(126),
    bodyweightKg: 75,
    mode: "NORMAL",
    squat: "V",
    focus: "PULL",
    setCount: 9,
  });
  await expect(page.getByText(/15 kg \(90 kg total\)/)).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "SQ 하드 0/6" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "BP 집중 0/4" })).toBeVisible();
  await expect(page.getByText("판정 완료 1회", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-all-windows-closed.png"), fullPage: true });

  await testInfo.attach("final-ref5-status", {
    body: JSON.stringify(status, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});

test("REF5 보조 볼륨 FAIL은 주운동 판정창 증량을 거부", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "volume-veto", testInfo);
  const squatSequence = ["H3", "H2", "V", "H3", "H2", "V", "H3", "H2"] as const;
  const focusSequence = ["PULL", "BP", "PULL", "BP", "PULL", "BP", "PULL", "BP"] as const;

  for (let index = 0; index < 8; index += 1) {
    await runRef5Session(
      page,
      planId,
      {
        startAt: localDateTimeDaysAgo(220 - index * 3),
        mode: "NORMAL",
        squat: squatSequence[index],
        focus: focusSequence[index],
        setCount: 9,
      },
      index === 0 ? { "Bench Press": "FAIL" } : undefined,
    );
  }

  const status = await readRef5Status(page, planId);
  expect(status.windows.BP).toMatchObject({ current: 0, volumeFailures: 0, completed: 1 });
  expect(status.directStandardsKg.bpFocusKg).toBe(82.5);
  expect(status.directStandardsKg.sqH3Kg).toBe(85);
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(90);
  expect(status.pendingMicro.pending).toBe(false);
  expect(status.recentChanges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        lift: "BP",
        kind: "MAINTAIN",
        beforeKg: 82.5,
        afterKg: 82.5,
      }),
    ]),
  );

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(196),
    mode: "NORMAL",
    squat: "V",
    focus: "PULL",
    setCount: 9,
  });
  await startPreviewedRef5Session(page);
  await fillCurrentRef5Session(page);
  await saveCurrentRef5Session(page);
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(193),
    mode: "NORMAL",
    squat: "H3",
    focus: "BP",
    setCount: 9,
  });
  await expect(page.getByText("3 × 3 · 82.5 kg", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-volume-veto-next-session.png"), fullPage: true });

  await testInfo.attach("final-ref5-status", {
    body: JSON.stringify(status, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});

test("REF5 정체 2창 이후 마이크로와 재평가 감소", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "stagnation", testInfo);

  for (let index = 0; index < 12; index += 1) {
    await runRef5Session(
      page,
      planId,
      {
        startAt: localDateTimeDaysAgo(340 - index * 8),
        mode: "NORMAL",
        squat: index % 2 === 0 ? "H3" : "H2",
        focus: index % 2 === 0 ? "PULL" : "BP",
        setCount: 9,
      },
      { "High-Bar Back Squat": index % 6 < 2 ? "HOLD_SLOW" : "PASS" },
    );
  }

  let status = await readRef5Status(page, planId);
  expect(status.directStandardsKg.sqH3Kg).toBe(82.5);
  expect(status.windows.SQ).toMatchObject({ current: 0, completed: 2 });
  expect(status.pendingMicro.pending).toBe(true);
  expect(status.pendingMicro.reasons).toContain("STAGNATION_SQ");

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(244),
    mode: "MICRO",
    squat: "V",
    setCount: 4,
  });
  await expect(page.getByText(/STAGNATION_SQ/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-stagnation-micro.png"), fullPage: true });
  await startPreviewedRef5Session(page);
  await fillCurrentRef5Session(page);
  await saveCurrentRef5Session(page);

  status = await readRef5Status(page, planId);
  expect(status.pendingMicro.pending).toBe(false);
  expect(status.directStandardsKg.sqH3Kg).toBe(82.5);

  for (let index = 0; index < 6; index += 1) {
    await runRef5Session(
      page,
      planId,
      {
        startAt: localDateTimeDaysAgo(236 - index * 8),
        mode: "NORMAL",
        squat: index % 2 === 0 ? "H3" : "H2",
        focus: index % 2 === 0 ? "PULL" : "BP",
        setCount: 9,
      },
      { "High-Bar Back Squat": index < 2 ? "HOLD_SLOW" : "PASS" },
    );
  }

  status = await readRef5Status(page, planId);
  expect(status.directStandardsKg.sqH3Kg).toBe(80);
  expect(status.windows.SQ).toMatchObject({ current: 0, completed: 3 });
  expect(status.pendingMicro.pending).toBe(false);
  expect(status.structureReview.SQ).toBe(false);
  expect(status.recentChanges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        lift: "SQ",
        kind: "STAGNATION_DECREASE",
        beforeKg: 82.5,
        afterKg: 80,
      }),
    ]),
  );

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(188),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 9,
  });
  await expect(page.getByText("3 × 3 · 80 kg", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-stagnation-decreased-squat.png"), fullPage: true });

  await testInfo.attach("final-ref5-status", {
    body: JSON.stringify(status, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});

test("REF5 같은 흐름 2연속 FAIL 즉시 감소", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "immediate-decrease", testInfo);

  await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(180),
      mode: "NORMAL",
      squat: "H3",
      focus: "PULL",
      setCount: 9,
    },
    { "Weighted Pull-Up": "FAIL" },
  );
  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(177),
    mode: "NORMAL",
    squat: "H2",
    focus: "BP",
    setCount: 9,
  });
  await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(174),
      mode: "NORMAL",
      squat: "V",
      focus: "PULL",
      setCount: 9,
    },
    { "Weighted Pull-Up": "FAIL" },
  );

  let status = await readRef5Status(page, planId);
  expect(status.pendingMicro.pending).toBe(false);
  expect(status.nextFocus).toBe("BP");
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(85);
  expect(status.windows.PULL.current).toBe(0);
  expect(status.pullLock).toMatchObject({ focusTargetTotalKg: 85, focusAddedKg: 10 });
  expect(status.recentChanges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        lift: "PULL",
        kind: "IMMEDIATE_DECREASE",
        beforeKg: 87.5,
        afterKg: 85,
      }),
    ]),
  );

  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(171),
    mode: "NORMAL",
    squat: "H3",
    focus: "BP",
    setCount: 9,
  });
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(168),
    mode: "NORMAL",
    squat: "H2",
    focus: "PULL",
    setCount: 9,
  });
  await expect(page.getByText(/10 kg \(85 kg total\)/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-immediate-decrease-next-focus.png"), fullPage: true });

  status = await readRef5Status(page, planId);
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(85);
  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});

test("REF5 시작 세션 부분 입력 새로고침 복구", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const planId = await activateRef5ProgramThroughUi(page, "draft-restore", testInfo);

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(90),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 9,
  });
  await startPreviewedRef5Session(page);
  const startedUrl = page.url();
  const generatedSessionId = new URL(startedUrl).searchParams.get("sessionId");
  expect(generatedSessionId).toBeTruthy();

  const firstRep = page.locator('input[aria-label*="반복"]').first();
  await firstRep.fill("2");
  await page.waitForTimeout(1_200);
  const draftKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith("workout-draft-")),
  );
  await testInfo.attach("draft-storage-keys-before-reload", {
    body: JSON.stringify(draftKeys, null, 2),
    contentType: "application/json",
  });
  expect(draftKeys, `REF5 입력 후 임시기록 키: ${JSON.stringify(draftKeys)}`).not.toHaveLength(0);
  await page.reload();
  await expect(page).toHaveURL(startedUrl);
  await expect(page.getByRole("heading", { name: "기록 복구" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "복구", exact: true }).click();
  await expect(page.locator('input[aria-label*="반복"]').first()).toHaveValue("2");
});

test("일반 프로그램 시작 세션 부분 입력 새로고침 복구", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const planId = await activateOneRmProgramThroughUi(page, "generic-draft-restore", testInfo);
  const firstRep = page.locator('input[aria-label*="반복"]').first();
  await firstRep.fill("2");
  await page.waitForTimeout(1_200);

  const draftKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith("workout-draft-")),
  );
  expect(draftKeys.some((key) => key.includes(planId))).toBe(true);
  const startedUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(startedUrl);
  await expect(page.getByRole("heading", { name: "기록 복구" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "복구", exact: true }).click();
  await expect(page.locator('input[aria-label*="반복"]').first()).toHaveValue("2");
});

test("REF5 시작 세션 새로고침 재개와 멀티탭 중복 저장", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "resume-multitab", testInfo);

  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(90),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 9,
  });
  await startPreviewedRef5Session(page);
  const startedUrl = page.url();
  const generatedSessionId = new URL(startedUrl).searchParams.get("sessionId");
  expect(generatedSessionId).toBeTruthy();

  await page.reload();
  await expect(page).toHaveURL(startedUrl);
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });

  const secondPage = await page.context().newPage();
  const secondPageFailures = observeBrowser(secondPage);
  await secondPage.goto(startedUrl);
  await expect(secondPage.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath("ref5-reloaded-started-session.png"), fullPage: true });

  await fillCurrentRef5Session(page);
  await fillCurrentRef5Session(secondPage);
  const secondPageLogId = await saveCurrentRef5Session(secondPage);
  const firstPageLogId = await saveCurrentRef5Session(page);
  expect(firstPageLogId).toBe(secondPageLogId);

  const status = await readRef5Status(page, planId);
  expect(status.startedSessionCount).toBe(1);
  expect(status.completedSessionCount).toBe(1);
  expect(status.windows.SQ.current).toBe(1);
  expect(status.windows.PULL.current).toBe(1);
  await secondPage.close();

  const failures = [...browserFailures, ...secondPageFailures];
  await testInfo.attach("browser-failures", {
    body: failures.length > 0 ? failures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(failures).toEqual([]);
});

test("REF5 하드 세션 48시간·168시간 경계", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "time-boundaries", testInfo);
  const firstStartAt = localDateTimeDaysAgo(100);

  await runRef5Session(page, planId, {
    startAt: firstStartAt,
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 9,
  });
  await openAndPreviewRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 48 * 60 - 1),
    mode: "NORMAL",
    squat: "V",
    focus: "BP",
    setCount: 9,
  });
  await page.screenshot({ path: testInfo.outputPath("ref5-47h59-volume.png"), fullPage: true });

  await runRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 48 * 60),
    mode: "NORMAL",
    squat: "H2",
    focus: "BP",
    setCount: 9,
  });
  await openAndPreviewRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 168 * 60 - 1),
    mode: "NORMAL",
    squat: "V",
    focus: "PULL",
    setCount: 9,
  });
  await page.screenshot({ path: testInfo.outputPath("ref5-167h59-volume.png"), fullPage: true });

  await openAndPreviewRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 168 * 60),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 9,
  });
  await page.screenshot({ path: testInfo.outputPath("ref5-168h-hard.png"), fullPage: true });

  const status = await readRef5Status(page, planId);
  expect(status.startedSessionCount).toBe(2);
  expect(status.completedSessionCount).toBe(2);
  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});

test("REF5 과거 로그 수정·삭제 후 정방향 재계산", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "edit-delete-replay", testInfo);

  const firstLogId = await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(30),
      mode: "NORMAL",
      squat: "H3",
      focus: "PULL",
      setCount: 9,
    },
    { "Weighted Pull-Up": "FAIL" },
  );
  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(22),
    mode: "NORMAL",
    squat: "H2",
    focus: "BP",
    setCount: 9,
  });
  const thirdLogId = await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(14),
      mode: "NORMAL",
      squat: "H3",
      focus: "PULL",
      setCount: 9,
    },
    { "Weighted Pull-Up": "FAIL" },
  );

  let status = await readRef5Status(page, planId);
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(85);

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "캘린더" })).toBeVisible({ timeout: 20_000 });
  let recentSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "최근 기록" }),
  });
  await expect(recentSection.getByRole("button")).toHaveCount(3);
  await recentSection.getByRole("button").last().click();
  const editFirstLink = page.getByRole("link", { name: "기록수정" });
  await expect(editFirstLink).toHaveAttribute("href", new RegExp(firstLogId));
  await editFirstLink.click();
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });
  await fillRef5ExerciseOutcome(page, "Weighted Pull-Up", "PASS");
  expect(await saveCurrentRef5Session(page)).toBe(firstLogId);

  status = await readRef5Status(page, planId);
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(87.5);
  expect(status.windows.PULL.current).toBe(2);
  expect(status.recentChanges).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ lift: "PULL", kind: "IMMEDIATE_DECREASE" }),
    ]),
  );

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "캘린더" })).toBeVisible({ timeout: 20_000 });
  recentSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "최근 기록" }),
  });
  await expect(recentSection.getByRole("button")).toHaveCount(3);
  await recentSection.getByRole("button").first().click();
  await expect(page.getByRole("link", { name: "기록수정" })).toHaveAttribute(
    "href",
    new RegExp(thirdLogId),
  );
  await page.getByRole("button", { name: "기록 삭제", exact: true }).click();
  await expect(page.getByRole("heading", { name: "기록 삭제" })).toBeVisible();
  await page.getByRole("button", { name: "이 운동 기록을 삭제하시겠습니까?" }).click();

  await expect
    .poll(async () => (await readRef5Status(page, planId)).completedSessionCount, {
      timeout: 30_000,
    })
    .toBe(2);
  status = await readRef5Status(page, planId);
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(87.5);
  expect(status.windows.SQ.current).toBe(2);
  expect(status.windows.PULL.current).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("ref5-after-delete-replay.png"), fullPage: true });

  await testInfo.attach("final-ref5-status", {
    body: JSON.stringify(status, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("browser-failures", {
    body: browserFailures.length > 0 ? browserFailures.join("\n") : "none",
    contentType: "text/plain",
  });
  expect(browserFailures).toEqual([]);
});
