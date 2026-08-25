/**
 * 개인 액세스 토큰(PAT) E2E (M6 PR1).
 *
 * 순수부는 `packages/core/src/auth/api-token.test.ts`가, 공개 표면 계약은
 * `apps/api/src/api-token-surface.test.ts`가 덮는다. 여기서 지키는 것은
 * **DB를 통과하는 실제 수명 주기**다:
 *
 *   발급 → 평문 1회 노출 → 그 토큰으로 API 호출 → 스코프 위반 403 →
 *   비공개 경로 401 → 폐기 → 즉시 401
 *
 * ⚠️ **프로덕션 프로브로는 공개 표면을 검증할 수 없다** — 미인증 요청은 프록시가
 * 401로 끊어 Hono까지 가지 않고, 존재하지 않는 경로도 401이다. 이 스펙과 위 유닛이
 * 유일한 방어선이다.
 */
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const PASSWORD = "api-token-test-pw-123";

function uniqueEmail() {
  return `api-token-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

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

/** 설정 > 계정에서 토큰을 발급하고 **화면에 뜬 평문**을 읽는다. */
async function issueTokenThroughUi(
  page: Page,
  name: string,
  scope: "읽기" | "읽기+쓰기",
): Promise<string> {
  await page.goto("/settings/account");
  await expect(page.getByText("액세스 토큰", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "새 토큰 발급" }).click();
  const sheet = page.getByRole("dialog", { name: "액세스 토큰 발급" });
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("이름").fill(name);
  if (scope === "읽기+쓰기") {
    await sheet.getByRole("radio", { name: "읽기+쓰기" }).click();
  }
  await sheet.getByRole("button", { name: "발급", exact: true }).click();

  const plaintext = sheet.getByTestId("issued-api-token");
  await expect(plaintext).toBeVisible({ timeout: 20_000 });
  const token = (await plaintext.innerText()).trim();
  expect(token.startsWith("wlpat_"), `접두사가 없다: ${token}`).toBe(true);

  await sheet.getByRole("button", { name: "복사했습니다" }).click();
  await expect(sheet).toHaveCount(0);
  return token;
}

/**
 * 세션 쿠키 없이 **PAT만으로** 호출한다.
 *
 * ⚠️ `page.request`를 쓰면 안 된다 — 브라우저의 쿠키 항아리를 공유하므로 웹 프록시가
 * `wl_session` 쿠키로 `Authorization`을 **덮어쓴다**(catch-all route.ts). 그러면
 * 통과시킨 것이 PAT인지 세션인지 구분되지 않는다. 실제로 이 스펙이 처음에 그렇게
 * 짜여 있었고, read 토큰의 쓰기가 403이 아니라 400(세션으로 통과 후 본문 검증 실패)
 * 으로 나와서 드러났다.
 */
function withToken(request: APIRequestContext, token: string) {
  return {
    get: (path: string) =>
      request.get(path, { headers: { Authorization: `Bearer ${token}` } }),
    post: (path: string, data?: unknown) =>
      request.post(path, { headers: { Authorization: `Bearer ${token}` }, data: data ?? {} }),
    delete: (path: string) =>
      request.delete(path, { headers: { Authorization: `Bearer ${token}` } }),
  };
}

test.describe.configure({ mode: "serial" });

test.describe("personal access tokens", () => {
  let page: Page;
  /** 쿠키 없는 요청 컨텍스트 — PAT만 실린다. */
  let anon: APIRequestContext;
  let readToken: string;
  let writeToken: string;

  test.beforeAll(async ({ browser, playwright }, testInfo) => {
    page = await browser.newPage();
    await signupThroughUi(page);
    anon = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
  });

  test.afterAll(async () => {
    await anon?.dispose();
    await page?.close();
  });

  test("발급하면 평문이 한 번 보이고 목록에 앞자리만 남는다", async () => {
    readToken = await issueTokenThroughUi(page, "read-token", "읽기");

    // 목록에는 앞자리만 — 평문이 다시 보이면 "한 번만"이 거짓이 된다.
    await expect(page.getByText(/read-token · wlpat_/)).toBeVisible({ timeout: 20_000 });
    const body = await page.locator("body").innerText();
    expect(
      body.includes(readToken),
      "발급 화면을 닫았는데 평문이 아직 화면에 있다",
    ).toBe(false);
  });

  test("read 토큰은 공개 읽기 경로에서 동작한다", async () => {
    const api = withToken(anon, readToken);
    for (const path of [
      "/api/logs",
      "/api/exercises",
      "/api/stats/volume",
      "/api/bodyweight",
      // 백업 스크립트가 PAT의 가장 자연스러운 용도다(§7 결정 8).
      "/api/export",
    ]) {
      const response = await api.get(path);
      expect(response.status(), `${path}가 read 토큰에서 막힌다`).toBe(200);
    }
  });

  test("read 토큰의 쓰기는 403 — 스코프가 강제된다", async () => {
    const api = withToken(anon, readToken);
    expect((await api.post("/api/logs", { performedAt: new Date().toISOString() })).status()).toBe(
      403,
    );
  });

  test("apps/api가 처리하는 비공개 경로는 401", async () => {
    const api = withToken(anon, readToken);
    for (const path of ["/api/auth/api-tokens", "/api/settings", "/api/stats/ux-snapshot"]) {
      expect((await api.get(path)).status(), `${path}가 PAT에 열려 있다`).toBe(401);
    }
    // 삭제는 어느 스코프로도 열지 않는다.
    expect((await api.delete("/api/logs/00000000-0000-4000-8000-000000000001")).status()).toBe(401);
    // export는 열었지만 **역방향은 아니다** — replace import는 전부 지운다.
    expect((await api.post("/api/me/import", { mode: "dryRun" })).status()).toBe(401);
  });

  test("web이 직접 처리하는 auth 경로는 PAT로 신원이 서지 않는다", async () => {
    // `/api/auth/me`·`/sessions` 등은 **web의 자체 route.ts**가 처리한다(구체 경로가
    // catch-all보다 우선). 그쪽은 `Authorization`을 아예 읽지 않고 `wl_session`
    // 쿠키만 보므로 PAT는 "인증 안 됨"으로 떨어진다 — 그게 의도한 결과다.
    //
    // **상태 코드를 단정하지 않는다.** 로컬에서는 env fallback이 켜져 있어 200에
    // 폴백 사용자가 실려 나온다(프로덕션은 차단). 지켜야 할 것은 코드가 아니라
    // "이 PAT가 **내 계정의** 신원을 만들지 않는다"는 사실이다.
    const email = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me");
      const body = (await res.json()) as { user?: { email?: string } | null };
      return body.user?.email ?? null;
    });
    expect(email, "세션으로는 내 계정이 보여야 한다").toBeTruthy();

    const viaToken = await withToken(anon, readToken).get("/api/auth/me");
    const payload = (await viaToken.json()) as { user?: { email?: string } | null };
    expect(
      payload.user?.email ?? null,
      "PAT로 내 계정의 신원이 섰다 — auth 경로는 PAT를 받으면 안 된다",
    ).not.toBe(email);
  });

  test("read_write 토큰은 세션을 기록할 수 있다", async () => {
    writeToken = await issueTokenThroughUi(page, "write-token", "읽기+쓰기");
    const api = withToken(anon, writeToken);

    const created = await api.post("/api/logs", {
      performedAt: new Date().toISOString(),
      sets: [{ exerciseName: "Bench Press", weightKg: 60, reps: 5, setNumber: 1 }],
    });
    expect([200, 201], await created.text()).toContain(created.status());

    // 쓴 것이 읽힌다 — 같은 계정에 들어갔다는 뜻이다.
    const list = await api.get("/api/logs");
    expect(list.status()).toBe(200);
    const payload = (await list.json()) as { items?: unknown[] };
    expect((payload.items ?? []).length).toBeGreaterThan(0);

    // 쓰기 토큰이라도 설정·계정은 못 만진다.
    expect((await api.get("/api/settings")).status()).toBe(401);
    expect((await api.get("/api/auth/api-tokens")).status()).toBe(401);
  });

  test("폐기하면 다음 요청부터 즉시 401이다", async () => {
    await page.goto("/settings/account");
    await expect(page.getByText(/read-token · wlpat_/)).toBeVisible({ timeout: 30_000 });

    // 폐기 전에는 동작한다 — 이 단정이 없으면 아래 401이 폐기 때문인지
    // 애초에 안 되던 건지 구분되지 않는다.
    expect((await withToken(anon, readToken).get("/api/logs")).status()).toBe(200);

    await page.getByRole("button", { name: "read-token 토큰 폐기" }).click();
    await expect(page.getByText(/read-token · wlpat_/)).toHaveCount(0, { timeout: 20_000 });

    expect((await withToken(anon, readToken).get("/api/logs")).status()).toBe(401);
    // 다른 토큰은 살아 있다 — 폐기가 전체를 쓸어버리면 안 된다.
    expect((await withToken(anon, writeToken).get("/api/logs")).status()).toBe(200);
  });

  test("다른 세션을 모두 종료해도 PAT는 살아남는다", async () => {
    // 세션 무효화는 브라우저 탈취 대응이고, PAT는 명시 폐기하는 자산이다
    // (계획서 §7 결정 2). 같은 테이블에 섞였다면 여기서 죽는다.
    await page.goto("/settings/account");
    const revokeOthers = page.getByRole("button", { name: /다른 세션/ });
    await expect(revokeOthers).toBeVisible({ timeout: 30_000 });
    if (await revokeOthers.isEnabled()) {
      await revokeOthers.click();
    }
    expect((await withToken(anon, writeToken).get("/api/logs")).status()).toBe(200);
  });
});
