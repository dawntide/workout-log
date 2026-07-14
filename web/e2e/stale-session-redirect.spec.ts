import { expect, test } from "@playwright/test";

test("active session cookies pass the page authentication gate", async ({
  baseURL,
  context,
  page,
  request,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `session-gate-${suffix}@example.com`;
  const password = "session-gate-test-123";

  const signup = await request.post("/api/auth/signup", {
    data: { email, password },
  });
  expect(signup.status()).toBe(200);

  const state = await request.storageState();
  const sessionCookie = state.cookies.find((cookie) => cookie.name === "wl_session");
  expect(sessionCookie).toBeDefined();
  await context.addCookies([
    {
      ...sessionCookie!,
      secure: new URL(baseURL).protocol === "https:",
    },
  ]);

  const response = await page.goto("/plans");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/plans");
  await expect(page.locator('[data-app-error-boundary="segment"]')).toHaveCount(0);

  const cleanupStatus = await page.evaluate(async (accountPassword) => {
    const response = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmToken: "DELETE_MY_ACCOUNT",
        password: accountPassword,
      }),
    });
    return response.status;
  }, password);
  expect(cleanupStatus).toBe(200);
});

test("revoked session cookies redirect server-rendered pages to login", async ({
  baseURL,
  context,
  page,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");

  for (const nextPath of ["/", "/calendar"]) {
    await context.addCookies([
      {
        name: "wl_session",
        value: "e2e-revoked-session-token",
        url: baseURL,
      },
    ]);
    await page.goto(nextPath);

    const current = new URL(page.url());
    expect(current.pathname).toBe("/login");
    expect(current.searchParams.get("next")).toBe(nextPath);
    await expect(page.locator('[data-app-error-boundary="segment"]')).toHaveCount(0);
  }
});
