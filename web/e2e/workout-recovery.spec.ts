import { expect, test, type Page } from "@playwright/test";
import { createWorkoutRecordDraftFromLog } from "../src/lib/workout-record/model";
import type { RecoverySavedLog } from "../src/lib/workout-record/recovery";
import type { WorkoutDraftData } from "../src/lib/storage/workoutDraftStore";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

async function setup(page: Page) {
  const signup = await page.request.post("/api/auth/signup", { data: {
    email: `recovery-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: "Recovery-test-password-17!",
  } });
  expect(signup.ok()).toBe(true);
  const created = await page.request.post("/api/logs", { data: {
    performedAt: "2026-07-17T09:00:00.000Z", timezone: "Asia/Seoul",
    clientMutationId: `web:recovery-${Date.now()}`,
    sets: [{ exerciseName: "Recovery Squat", setNumber: 1, reps: 5, weightKg: 60, isExtra: false }],
  } });
  expect(created.status()).toBe(201);
  const response = await page.request.get("/api/logs?includeGeneratedSession=false&includeProgression=false");
  const log = (await response.json()).items[0] as RecoverySavedLog;
  await page.goto("/");
  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: "닫기", exact: true }).click();
  }
  const draft: WorkoutDraftData = {
    key: `unplanned:2026-07-17:${log.id}`, updatedAt: 1,
    draft: createWorkoutRecordDraftFromLog(log, "Recovery test", { sessionDate: "2026-07-17" }),
    programEntryState: {},
  };
  return { log, draft };
}

async function putDraft(page: Page, draft: WorkoutDraftData) {
  await page.evaluate((data) => localStorage.setItem(`workout-draft-${data.key}`, JSON.stringify(data)), draft);
  await page.reload();
}

test("draft recovery: saved copies stay out of the notice, modified drafts can be dismissed and reopened", async ({ page }, testInfo) => {
  const { log, draft } = await setup(page);
  const lookup = page.waitForResponse((res) => res.url().includes("logId=") && res.request().method() === "GET");
  await putDraft(page, draft);
  expect((await lookup).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "기기에 남은 운동 기록이 있어요" })).toHaveCount(0);
  draft.draft.session.note.memo = "아직 저장하지 않은 메모";
  draft.updatedAt = 2;
  await putDraft(page, draft);
  await expect(page.getByRole("heading", { name: "기기에 남은 운동 기록이 있어요" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Recovery test/ })).toHaveCount(0);
  await page.getByRole("button", { name: "나중에", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "복구 목록 (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "기기에 남은 운동 기록이 있어요" })).toHaveCount(0);
  await page.getByRole("button", { name: "복구 목록 (1)", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "복구 목록", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recovery-list-mobile.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "복구 목록", exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(`workout-draft-${key}`), draft.key)).not.toBeNull();
  draft.updatedAt = 3;
  await putDraft(page, draft);
  await expect(page.getByRole("button", { name: "목록 보기", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recovery-notice-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "목록 보기", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(`workout-draft-${key}`), draft.key)).not.toBeNull();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "초안 삭제", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "복구 목록", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /복구 목록/ })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(`workout-draft-${key}`), draft.key)).toBeNull();
  const saved = await page.request.get(`/api/logs?logId=${log.id}`);
  expect((await saved.json()).items).toHaveLength(1);
});

test("draft recovery: failed server checks preserve drafts and identity filters respect account ownership", async ({ page, playwright, baseURL }) => {
  const { log, draft } = await setup(page);
  const other = await playwright.request.newContext({ baseURL });
  try {
    const signup = await other.post("/api/auth/signup", { data: {
      email: `recovery-other-${Date.now()}@example.com`, password: "Recovery-other-password-17!",
    } });
    expect(signup.ok()).toBe(true);
    for (const query of [`logId=${log.id}`, `clientMutationId=${log.clientMutationId}`]) {
      const response = await other.get(`/api/logs?${query}`);
      expect(response.ok()).toBe(true);
      expect((await response.json()).items).toEqual([]);
    }
  } finally { await other.dispose(); }
  await page.route("**/api/logs?**", (route) => route.abort("failed"));
  await putDraft(page, draft);
  await expect(page.getByRole("button", { name: "목록 보기", exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(`workout-draft-${key}`), draft.key)).not.toBeNull();
});
