/**
 * OAuth status endpoint smoke
 *
 * Covers PR #262 graceful fallback: /api/auth/oauth/status returns
 * { google: boolean } based on env presence. UI uses this to show/hide
 * the "Continue with Google" button.
 */
import { expect, test } from "@playwright/test";

test.describe("oauth status", () => {
  test("GET /api/auth/oauth/status returns boolean google flag", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/oauth/status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.google).toBe("boolean");
  });

  test("GET /api/auth/google/start redirects to Google when configured, else 501", async ({
    request,
  }) => {
    const status = await request.get("/api/auth/oauth/status");
    const { google } = await status.json();

    const start = await request.get("/api/auth/google/start", {
      maxRedirects: 0,
    });

    if (google) {
      expect(start.status()).toBe(302);
      const location = start.headers()["location"] ?? "";
      expect(location).toContain("accounts.google.com");
    } else {
      expect(start.status()).toBe(501);
    }
  });
});
