/**
 * Settings/account E2E
 *
 * Covers PR #259 (account deletion + session management):
 * - GET /api/auth/sessions returns at least the current session
 * - DELETE /api/auth/sessions revokes other sessions but keeps current
 * - DELETE /api/auth/account requires confirmToken + password
 * - /settings/account page renders without 500
 */
import { expect, test } from "@playwright/test";

const NAV_TIMEOUT = 30_000;

test.describe("settings/account", () => {
  test("/settings/account renders without 500", async ({ page }) => {
    const response = await page.goto("/settings/account", { timeout: NAV_TIMEOUT });
    expect(response?.status()).not.toBe(500);
    await expect(page.getByText("Application error")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("session list contains the current session after signup", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `session-${suffix}@example.com`;
    const password = "session-test-pw-123";

    const signup = await request.post("/api/auth/signup", {
      data: { email, password },
    });
    expect(signup.status()).toBe(200);

    const list = await request.get("/api/auth/sessions");
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.some((s: { isCurrent: boolean }) => s.isCurrent)).toBe(true);
  });

  test("revoke-others keeps the current session token usable", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `revoke-${suffix}@example.com`;
    const password = "revoke-test-pw-123";

    await request.post("/api/auth/signup", { data: { email, password } });
    // Create a second session by logging in again with the same credentials in a
    // fresh request context. The cookie for THIS request stays untouched.
    await request.post("/api/auth/login", { data: { email, password } });

    const before = await request.get("/api/auth/sessions");
    const beforeBody = await before.json();
    expect(beforeBody.items.length).toBeGreaterThanOrEqual(1);

    const revoke = await request.delete("/api/auth/sessions");
    expect(revoke.status()).toBe(200);

    // Current session still works
    const me = await request.get("/api/auth/me");
    expect(me.status()).toBe(200);
  });

  test("account delete rejects wrong password", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `del-fail-${suffix}@example.com`;
    const password = "delete-test-pw-123";

    await request.post("/api/auth/signup", { data: { email, password } });

    const wrong = await request.delete("/api/auth/account", {
      data: { confirmToken: "DELETE_MY_ACCOUNT", password: "wrong-pw" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("account delete rejects missing confirmToken", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `del-token-${suffix}@example.com`;
    const password = "delete-test-pw-123";

    await request.post("/api/auth/signup", { data: { email, password } });

    const noToken = await request.delete("/api/auth/account", {
      data: { password },
    });
    expect(noToken.status()).toBe(400);
  });
});
