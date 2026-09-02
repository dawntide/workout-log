import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { REF5_PROTOCOL_VERSION } from "@workout/core/program-engine/ref5";

import { observeBrowser } from "./browser-failures";
import { expectSurfaceContrast } from "./surface-audit";

const PASSWORD = "Ref5-e2e-password-17!";

test.setTimeout(90_000);

test.use({
  viewport: { width: 390, height: 844 },
  // 이 여정 스펙들은 한 테스트가 수십 초~수 분이라 실패 아티팩트가 무겁다. CI는
  // 재시도가 2회여서 trace까지 retain-on-failure로 두면 실패 1건당 3벌이 쌓인다
  // (실측: 실패 36건에 5GB). 첫 재시도 트레이스 1벌이면 원인 파악에 충분하다.
  video: "retain-on-failure",
  trace: "on-first-retry",
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

async function signupThroughUi(page: Page, label: string, testInfo: TestInfo) {
  const email = uniqueEmail(label);
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByLabel("이름 (선택)").fill(`REF5 ${label}`);
  await page.getByRole("button", { name: /계정 만들기/ }).click();
  await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: "닫기", exact: true }).click();
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

  // 카드 본문 클릭 = 상세 진입(트레일링 '시작하기'는 시작 시트로 직행).
  await ref5Card.click();
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
  // 표면 감사 — accent 카드(첫 처방)가 시트 배경 위에서 구분되는지. 이 화면은
  // 보정을 끝내야 뜨므로 design-harmonization이 닿지 못한다.
  await expectSurfaceContrast(page, {
    context: "REF5 시작 기준 설정(계산된 첫 처방)",
    expectTones: ["accent"],
  });
  if (capture) {
    await page.screenshot({ path: testInfo.outputPath("ref5-start-calibration.png"), fullPage: true });
  }

  await page.getByRole("button", { name: /처방으로 시작|새 플랜으로 시작/ }).click();
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
  // 카드 본문 클릭 = 상세 진입(트레일링 '시작하기'는 시작 시트로 직행).
  await programCard.click();
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
  await page.getByRole("button", { name: /1RM 저장 후 .*시작/ }).click();
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
  // v1.4 §18: OAP 좌/우 사다리 표출. kg가 아니라 단이다(§7.5).
  oap: Record<
    "left" | "right",
    {
      rung: number;
      rungName: string;
      rungNameKo: string;
      passStreak: number;
      failStreak: number;
      promoteThreshold: number;
      negativesUnlocked: boolean;
      achieved: boolean;
    }
  >;
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

/**
 * OAP 카드의 기본 결과는 HOLD다(§7.5.4에서 중립 — 승급도 강등도 아니다).
 *
 * 다른 여정들은 OAP를 검사하지 않는데, 기본값을 PASS로 두면 세션을 반복하는 동안
 * 사다리가 조용히 올라가 4단에서 네거티브가 붙고 세션이 10세트에서 11세트가 된다.
 * 그러면 그 여정들의 `10 sets` 단언이 자기가 검사하려던 것과 무관한 이유로 깨진다.
 * 중립을 기본값으로 두면 사다리가 멈춘 채 남고, OAP를 실제로 검사하는 여정만
 * 좌/우 결과를 명시한다.
 */
function ref5DefaultOutcomeFor(exerciseName: string): Ref5OutcomeKind {
  return exerciseName.startsWith("Assisted OAP") ||
    exerciseName.startsWith("OAP Negative") ||
    exerciseName.startsWith("OAP Free")
    ? "HOLD_SLOW"
    : "PASS";
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
    await fillRef5ExerciseOutcome(
      page,
      exerciseName!,
      overrides[exerciseName!] ?? ref5DefaultOutcomeFor(exerciseName!),
    );
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
    // 생략하면 스쿼트 처방을 단언하지 않는다. 하드 밀도(§9)는 세션 간격이 정하므로,
    // 스쿼트를 검사하지 않는 여정이 굳이 그 순서를 미리 계산할 필요가 없다.
    squat?: "H3" | "H2" | "V";
    focus?: "PULL" | "BP";
    // §7.6 되돌리기. BP 집중 차례에서만 토글이 나타나므로 미리보기 뒤에 켠다.
    oapSlotReverted?: boolean;
    // v1.3(§7.3): 정상 세션 상체 볼륨이 1→2세트로 늘어 총 10세트. 마이크로는 4세트 유지(§7.4).
    // v1.4(§7.3): BP 집중 세션의 3번 슬롯이 OAP 페어로 바뀌어도 페어 회계라 10세트다.
    // 네거티브가 붙은 세션만 11세트가 된다.
    setCount: 10 | 11 | 4;
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
  if (input.oapSlotReverted) {
    // 토글은 미리보기가 BP 집중 차례임을 알려준 뒤에야 나타난다(§7.6). 켜면 시작
    // 입력이 달라져 미리보기가 무효화되므로 다시 미리보기를 요청한다.
    const revert = page.getByRole("checkbox", { name: "OAP 슬롯 되돌리기" });
    await expect(revert).toBeVisible();
    await page.getByText("3번 슬롯을 PULL 볼륨 2×6으로 되돌립니다. 사다리 진행은 그대로 보존됩니다.", { exact: true }).click();
    await expect(revert).toBeChecked();
    await page.getByRole("button", { name: "세션 미리보기" }).click();
    await expect(page.getByText(input.mode, { exact: true })).toBeVisible({ timeout: 20_000 });
  }
  if (input.squat) {
    await expect(page.getByText(`SQ ${input.squat}`, { exact: true })).toBeVisible();
  }
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
  await expect(page.getByText("10 sets", { exact: true })).toBeVisible();
  await expect(page.getByText("0/6", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-first-preview.png"), fullPage: true });

  await page.getByRole("button", { name: "SQ 첫 워크 세트 시작" }).click();
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: testInfo.outputPath("ref5-first-started.png"), fullPage: true });

  await fillCurrentRef5Session(page);
  await expect(page.getByRole("progressbar", { name: /세트 진행률/ })).toHaveAttribute(
    "aria-valuenow",
    "10",
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
  expect(persisted.item.sets).toHaveLength(10);

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
    setCount: 10,
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
      setCount: 10,
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
      setCount: 10,
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
    setCount: 10,
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
        setCount: 10,
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
    setCount: 10,
  });
  await startPreviewedRef5Session(page);
  await fillCurrentRef5Session(page);
  await saveCurrentRef5Session(page);
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(193),
    mode: "NORMAL",
    squat: "H3",
    focus: "BP",
    setCount: 10,
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
        setCount: 10,
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
        setCount: 10,
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
    setCount: 10,
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
      setCount: 10,
    },
    { "Weighted Pull-Up": "FAIL" },
  );
  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(177),
    mode: "NORMAL",
    squat: "H2",
    focus: "BP",
    setCount: 10,
  });
  await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(174),
      mode: "NORMAL",
      squat: "V",
      focus: "PULL",
      setCount: 10,
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
    setCount: 10,
  });
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(168),
    mode: "NORMAL",
    squat: "H2",
    focus: "PULL",
    setCount: 10,
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
    setCount: 10,
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

test("REF5 미완료 세션은 새 시작 대신 기존 세션을 자동 재개", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "unfinished-resume", testInfo);
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(0),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 10,
  });
  await startPreviewedRef5Session(page);
  const firstSessionId = new URL(page.url()).searchParams.get("sessionId");
  expect(firstSessionId).toBeTruthy();

  await page.goto(`/workout/log?planId=${encodeURIComponent(planId)}&context=today`);
  await expect(page).toHaveURL(new RegExp(`sessionId=${firstSessionId}`), { timeout: 20_000 });
  await expect(
    page.getByText(
      "미완료 REF5 세션을 이어서 불러왔습니다. 이 세션을 저장한 뒤 새 세션을 시작할 수 있습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("REF5 종료 사유").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("ref5-unfinished-session-resumed.png"),
    fullPage: true,
  });

  const retryStart = new Date();
  retryStart.setMinutes(retryStart.getMinutes() + 1);
  const retryResponse = await page.request.post(
    `/api/plans/${encodeURIComponent(planId)}/generate`,
    {
      data: {
        ref5: {
          // 리터럴로 두면 프로토콜 범프 때마다 서버가 REF5_STALE_VERSION(409)로 거부한다
          // (v1.3 컷오버에서 실제로 그렇게 깨졌다). 엔진 상수를 그대로 따라간다.
          protocolVersion: REF5_PROTOCOL_VERSION,
          actualStartAt: retryStart.toISOString(),
          bodyweightKg: 75,
          manualMicro: false,
          startEventId: `resume-guard-${Date.now()}`,
        },
      },
    },
  );
  expect(retryResponse.status()).toBe(200);
  const retryBody = await retryResponse.json();
  expect(retryBody.resumed).toBe(true);
  expect(retryBody.session.id).toBe(firstSessionId);

  const sessionsResponse = await page.request.get(
    `/api/generated-sessions?planId=${encodeURIComponent(planId)}&limit=10`,
  );
  expect(sessionsResponse.status()).toBe(200);
  const sessionsBody = await sessionsResponse.json();
  expect(sessionsBody.items).toHaveLength(1);
  expect(browserFailures).toEqual([]);
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
    setCount: 10,
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
    setCount: 10,
  });
  await openAndPreviewRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 48 * 60 - 1),
    mode: "NORMAL",
    squat: "V",
    focus: "BP",
    setCount: 10,
  });
  await page.screenshot({ path: testInfo.outputPath("ref5-47h59-volume.png"), fullPage: true });

  await runRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 48 * 60),
    mode: "NORMAL",
    squat: "H2",
    focus: "BP",
    setCount: 10,
  });
  await openAndPreviewRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 168 * 60 - 1),
    mode: "NORMAL",
    squat: "V",
    focus: "PULL",
    setCount: 10,
  });
  await page.screenshot({ path: testInfo.outputPath("ref5-167h59-volume.png"), fullPage: true });

  await openAndPreviewRef5Session(page, planId, {
    startAt: offsetLocalDateTime(firstStartAt, 168 * 60),
    mode: "NORMAL",
    squat: "H3",
    focus: "PULL",
    setCount: 10,
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
      setCount: 10,
    },
    { "Weighted Pull-Up": "FAIL" },
  );
  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(22),
    mode: "NORMAL",
    squat: "H2",
    focus: "BP",
    setCount: 10,
  });
  const thirdLogId = await runRef5Session(
    page,
    planId,
    {
      startAt: localDateTimeDaysAgo(14),
      mode: "NORMAL",
      squat: "H3",
      focus: "PULL",
      setCount: 10,
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
  // ── 날짜 이동 충돌 ─────────────────────────────────────────────────────────
  // 자동 진행 플랜은 기록 순서가 판정에 영향을 주므로, 이동 구간 안에 다른 기록이
  // 있으면 이동을 **막고** 안내한다. 이 여정의 기록은 2026 기준 14·22·30일 전이라,
  // 선택된 최신 기록을 25일 전으로 옮기면 22일 전 기록을 가로지른다.
  // 충돌이면 PATCH가 나가지 않아(이동 취소) 뒤따르는 삭제 흐름에 영향이 없다.
  const conflictAt = new Date();
  conflictAt.setDate(conflictAt.getDate() - 25);
  const conflictDate = [
    conflictAt.getFullYear(),
    String(conflictAt.getMonth() + 1).padStart(2, "0"),
    String(conflictAt.getDate()).padStart(2, "0"),
  ].join("-");

  // 값 입력은 `fill()`로 충분하다 — 앱이 "이전 날짜"를 selectedDate에서 읽으므로
  // date 입력의 focus가 몇 번 발화하든 기준이 흔들리지 않는다. 세그먼트 순서(로케일)에
  // 기대는 키보드 타이핑은 쓰지 않는다 — CI는 로케일이 달라 `60801-02-02`가 나왔다.
  const moveDateInput = page
    .locator("label")
    .filter({ hasText: "날짜 이동" })
    .locator('input[type="date"]');
  await moveDateInput.fill(conflictDate);
  expect(await moveDateInput.inputValue()).toBe(conflictDate);
  // 이동은 blur에서 커밋된다 — 다른 요소를 눌러 포커스를 뺀다.
  await page.getByRole("heading", { name: "캘린더" }).click();

  const moveConflictSheet = page.getByRole("dialog", { name: "날짜 이동 불가" });
  await expect(moveConflictSheet).toBeVisible({ timeout: 20_000 });
  await expect(
    moveConflictSheet.getByText("이동할 날짜 사이에 다른 기록이 있습니다.", { exact: false }),
  ).toBeVisible();
  // 표면 감사 — danger 카드가 시트 배경 위에서 구분되는지. 이 시트는 기록 2건 이상과
  // 가로지르는 이동이 있어야 떠서 감사 스펙이 만들 수 없는 상태다.
  await expectSurfaceContrast(page, {
    context: "캘린더 날짜 이동 충돌 안내",
    expectTones: ["danger"],
  });
  // 시트 상단 닫기와 하단 확인 버튼이 같은 이름이라 첫 번째로 특정한다.
  await moveConflictSheet.getByRole("button", { name: "확인", exact: true }).first().click();
  await expect(moveConflictSheet).toBeHidden();
  // 이동이 실제로 막혔는지 — 선택 날짜가 그대로여야 한다.
  await expect(page.getByRole("link", { name: "기록수정" })).toHaveAttribute(
    "href",
    new RegExp(thirdLogId),
  );

  await page.getByRole("button", { name: "기록 삭제", exact: true }).click();
  // 확인 시트: 질문문은 본문, 버튼은 행동 라벨 — 카드의 트리거 버튼과 이름이 같으므로
  // dialog 안으로 스코프해서 누른다.
  const deleteConfirmSheet = page.getByRole("dialog", { name: "기록 삭제" });
  await expect(deleteConfirmSheet.getByRole("heading", { name: "기록 삭제" })).toBeVisible();
  await expect(
    deleteConfirmSheet.getByText("이 운동 기록을 삭제하시겠습니까?"),
  ).toBeVisible();
  // 표면 감사 — danger 카드가 시트 배경 위에서 구분되는지. 이 시트는 기록이 있어야
  // 열리는데 시드는 workoutLog를 비우므로 감사 스펙에서는 닿지 못한다.
  await expectSurfaceContrast(page, {
    context: "캘린더 기록 삭제 확인 시트",
    expectTones: ["danger"],
  });
  await deleteConfirmSheet.getByRole("button", { name: "기록 삭제", exact: true }).click();

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

// ── v1.4 OAP 스킬 슬롯 (§7.5–§7.6) ──────────────────────────────────────────
// BP 집중 세션의 3번 슬롯이 PULL 볼륨에서 OAP 페어로 바뀐 것, 사다리가 팔별로
// 진행하는 것, 되돌리기가 v1.3 처방을 복원하는 것을 실제 화면에서 확인한다.
const OAP_LEFT_CARD = "Assisted OAP · Left";
const OAP_RIGHT_CARD = "Assisted OAP · Right";

test("REF5 v1.4 OAP 슬롯 — BP 집중 3번 슬롯 교체·팔별 승급·되돌리기", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const browserFailures = observeBrowser(page);
  const planId = await activateRef5ProgramThroughUi(page, "oap-slot", testInfo);

  // 새 플랜의 두 팔은 모두 2단(전완)에서 시작한다(§5.2).
  let status = await readRef5Status(page, planId);
  expect(status.oap.left).toMatchObject({ rung: 2, passStreak: 0, achieved: false });
  expect(status.oap.right).toMatchObject({ rung: 2, negativesUnlocked: false });

  // 1) PULL 집중 세션은 v1.3과 똑같다 — OAP가 끼어들지 않는다(§7.2).
  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(120),
    mode: "NORMAL",
    focus: "PULL",
    setCount: 10,
  });

  // 2) BP 집중 세션의 3번 슬롯이 OAP 좌/우다. 페어 회계라 총 10세트는 그대로.
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(117),
    mode: "NORMAL",
    focus: "BP",
    setCount: 10,
  });
  await startPreviewedRef5Session(page);
  const cardNames = await page
    .locator("article")
    .filter({ has: page.getByLabel("REF5 종료 사유") })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  expect(cardNames).toEqual([
    "High-Bar Back Squat",
    "Bench Press",
    OAP_LEFT_CARD,
    OAP_RIGHT_CARD,
    "Overhead Press",
  ]);
  // 스킬 슬롯은 무게가 아니라 단이 강도 좌표다(§7.5.2).
  await expect(
    page.getByRole("article", { name: OAP_LEFT_CARD, exact: true }).getByText("좌 · 2단 전완"),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ref5-oap-slot-session.png"), fullPage: true });
  // OAP 결과는 언제나 명시한다 — 기본값은 사다리 중립(HOLD)이다.
  await fillCurrentRef5Session(page, {
    [OAP_LEFT_CARD]: "PASS",
    [OAP_RIGHT_CARD]: "PASS",
  });
  const oapLogId = await saveCurrentRef5Session(page);

  // 페어 회계(§7.3)를 눈에 보이게 고정한다: 작업세트는 10이지만 실제로 수행하고
  // 저장하는 세트 행은 12다(좌 2 + 우 2). 둘이 같아지면 어느 한쪽이 틀린 것이다.
  const persisted = await (await page.request.get(`/api/logs/${oapLogId}`)).json();
  expect(persisted.item.sets).toHaveLength(12);
  const oapRows = persisted.item.sets.filter((row: { exerciseName: string }) =>
    row.exerciseName.startsWith("Assisted OAP"),
  );
  expect(oapRows).toHaveLength(4);
  // 스킬 슬롯은 무게가 없다 — 0으로 저장돼야 총중량 통계에 섞이지 않는다.
  expect(oapRows.every((row: { weightKg: number }) => Number(row.weightKg) === 0)).toBe(true);

  status = await readRef5Status(page, planId);
  expect(status.oap.left.passStreak).toBe(1);
  expect(status.oap.right.passStreak).toBe(1);
  // OAP는 PULL 판정창·기준 어느 것도 건드리지 않는다(§7.5.4).
  expect(status.windows.PULL.current).toBe(1);
  expect(status.directStandardsKg.pullFocusTotalKg).toBe(87.5);

  // 3) 좌만 PASS, 우는 FAIL로 두 번 더 — 팔이 서로 독립임을 확인한다(§7.5.2).
  for (const daysAgo of [111, 105]) {
    await runRef5Session(page, planId, {
      startAt: localDateTimeDaysAgo(daysAgo + 3),
      mode: "NORMAL",
      focus: "PULL",
      setCount: 10,
    });
    await runRef5Session(
      page,
      planId,
      {
        startAt: localDateTimeDaysAgo(daysAgo),
        mode: "NORMAL",
        focus: "BP",
        setCount: 10,
      },
      { [OAP_LEFT_CARD]: "PASS", [OAP_RIGHT_CARD]: "FAIL" },
    );
  }

  status = await readRef5Status(page, planId);
  expect(status.oap.left).toMatchObject({ rung: 3, passStreak: 0 });
  expect(status.oap.right).toMatchObject({ rung: 1, failStreak: 0 });
  expect(status.recentChanges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ lift: "OAP", kind: "OAP_PROMOTE", arm: "left", beforeKg: 2, afterKg: 3 }),
      expect.objectContaining({ lift: "OAP", kind: "OAP_DEMOTE", arm: "right", beforeKg: 2, afterKg: 1 }),
    ]),
  );

  // 4) 되돌리기: BP 집중 차례에서 토글을 켜면 3번 슬롯이 v1.3 처방으로 돌아온다(§7.6).
  await runRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(99),
    mode: "NORMAL",
    focus: "PULL",
    setCount: 10,
  });
  const beforeRevert = await readRef5Status(page, planId);
  await openAndPreviewRef5Session(page, planId, {
    startAt: localDateTimeDaysAgo(96),
    mode: "NORMAL",
    focus: "BP",
    oapSlotReverted: true,
    setCount: 10,
  });
  await startPreviewedRef5Session(page);
  const revertedCards = await page
    .locator("article")
    .filter({ has: page.getByLabel("REF5 종료 사유") })
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  expect(revertedCards).toEqual([
    "High-Bar Back Squat",
    "Bench Press",
    "Weighted Pull-Up",
    "Overhead Press",
  ]);
  await page.screenshot({ path: testInfo.outputPath("ref5-oap-reverted-session.png"), fullPage: true });
  await fillCurrentRef5Session(page, { "Weighted Pull-Up": "FAIL" });
  await saveCurrentRef5Session(page);

  status = await readRef5Status(page, planId);
  // 되돌린 세션은 OAP 노출을 만들지 않으므로 사다리가 그대로다(§7.5.5).
  expect(status.oap.left).toMatchObject({ rung: beforeRevert.oap.left.rung, passStreak: beforeRevert.oap.left.passStreak });
  expect(status.oap.right).toMatchObject({ rung: beforeRevert.oap.right.rung });
  // 복원된 흐름은 v1.3과 같은 의미로 PULL 집중창을 veto한다.
  expect(status.windows.PULL.volumeFailures).toBe(1);

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
