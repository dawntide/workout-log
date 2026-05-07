import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createEmailVerificationToken } from "../src/server/auth/email-verification";
import { createPasswordResetToken } from "../src/server/auth/password-reset";
import { sha256Hex } from "../src/server/auth/token";
import { db } from "../src/server/db/client";
import { appUser, passwordResetToken } from "../src/server/db/schema";

test.describe("auth recovery and email verification", () => {
  test("reset request is generic for unknown emails", async ({ request }) => {
    const res = await request.post("/api/auth/password/reset/request", {
      data: { email: `unknown-${Date.now()}@example.com` },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ ok: true }));
  });

  test("signup, email verification, password reset, and token reuse protection", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `auth-${suffix}@example.com`;
    const oldPassword = "old-password-123";
    const newPassword = "new-password-123";

    const signup = await request.post("/api/auth/signup", {
      data: { email, password: oldPassword, displayName: "Auth Test" },
    });
    expect(signup.status()).toBe(200);
    const signupBody = await signup.json();
    const userId = signupBody.user.id as string;

    const verification = await createEmailVerificationToken(userId);
    const verify = await request.get(
      `/api/auth/email/verify?token=${encodeURIComponent(verification.token)}`,
    );
    expect(verify.status()).toBeLessThan(400);

    const verifiedRows = await db
      .select({ emailVerifiedAt: appUser.emailVerifiedAt })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    expect(verifiedRows[0]?.emailVerifiedAt).toBeTruthy();

    const reset = await createPasswordResetToken(userId);
    const confirm = await request.post("/api/auth/password/reset/confirm", {
      data: { token: reset.token, newPassword },
    });
    expect(confirm.status()).toBe(200);

    const reused = await request.post("/api/auth/password/reset/confirm", {
      data: { token: reset.token, newPassword: "another-password-123" },
    });
    expect(reused.status()).toBe(400);

    await request.post("/api/auth/logout");

    const oldLogin = await request.post("/api/auth/login", {
      data: { email, password: oldPassword },
    });
    expect(oldLogin.status()).toBe(401);

    const newLogin = await request.post("/api/auth/login", {
      data: { email, password: newPassword },
    });
    expect(newLogin.status()).toBe(200);
  });

  test("expired reset tokens are rejected", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `expired-${suffix}@example.com`;
    const signup = await request.post("/api/auth/signup", {
      data: { email, password: "old-password-123" },
    });
    expect(signup.status()).toBe(200);
    const userId = (await signup.json()).user.id as string;

    const token = `expired-${suffix}`;
    const tokenHash = await sha256Hex(token);
    await db.insert(passwordResetToken).values({
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() - 1_000),
    });

    const confirm = await request.post("/api/auth/password/reset/confirm", {
      data: { token, newPassword: "new-password-123" },
    });
    expect(confirm.status()).toBe(400);
  });
});
