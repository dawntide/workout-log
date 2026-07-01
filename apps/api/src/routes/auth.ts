import { Hono } from "hono";

import { db } from "@/server/db/client";
import { and, desc, eq, ne } from "@/server/db/ops";
import {
  appUser,
  authOauthAccount,
  authSession,
  emailVerificationToken,
  passwordResetToken,
  userSetting,
  uxEventLog,
} from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
  findActiveSession,
  findUserById,
} from "@/server/auth/session";
import { claimEnvFallbackData } from "@/server/auth/claim-fallback";
import { createEmailVerificationToken } from "@/server/auth/email-verification";
import { createPasswordResetToken } from "@/server/auth/password-reset";
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from "@/server/auth/auth-email";
import { logAuthEvent } from "@/server/auth/security-events";
import { getRequestOrigin } from "@/server/email/sender";
import { deleteUserDomainData } from "@/server/data/deleteUserData";
import { invalidateStatsCacheForUser } from "@/server/stats/cache";

import { requireAuth, sessionToken, type AppEnv } from "../auth";
import { apiError } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Auth — mounted at /api/auth. Ported from web/src/app/api/auth/**, adapted to
// the Bearer/token model: session tokens are returned in the response BODY (not
// Set-Cookie), and the "current session" is read from the Authorization header
// via sessionToken(c) rather than a cookie. Two web-isms are intentionally
// dropped for token clients: assertSameOrigin (CSRF origin check — Bearer tokens
// aren't auto-sent by browsers) and per-route IP rate limiting (consistent with
// apiLogger omitting it; logAuthEvent still records IP/UA from the raw request).
// Deferred (browser/OAuth flows, TUI-unused): email/verify, google/*, oauth/*,
// password/reset/confirm, password/setup.
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskToken(token: string): string {
  if (token.length <= 10) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export const authRoutes = new Hono<AppEnv>();

// POST /api/auth/login — verify password, mint a token (returned in the body).
authRoutes.post("/login", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return c.json({ error: "Email and password required" }, 400);
    }
    const rows = await db
      .select({
        id: appUser.id,
        email: appUser.email,
        passwordHash: appUser.passwordHash,
        displayName: appUser.displayName,
        emailVerifiedAt: appUser.emailVerifiedAt,
      })
      .from(appUser)
      .where(eq(appUser.email, email))
      .limit(1);
    const user = rows[0];
    const ok = user && (await verifyPassword(password, user.passwordHash));
    if (!ok || !user) {
      await logAuthEvent({ eventType: "LOGIN", req: c.req.raw, success: false }).catch(
        () => {},
      );
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const session = await createSession(user.id);
    await logAuthEvent({
      userId: user.id,
      eventType: "LOGIN",
      req: c.req.raw,
      success: true,
    }).catch(() => {});
    return c.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/auth/signup — create an account + mint a token (returned in body).
authRoutes.post("/signup", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown; displayName?: unknown; claimDevData?: unknown }
      | null;
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = body.displayName
      ? String(body.displayName).trim().slice(0, 80)
      : null;
    const claimDevData = body.claimDevData === true;

    if (!EMAIL_RE.test(email)) return c.json({ error: "Invalid email" }, 400);
    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const existing = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, email))
      .limit(1);
    if (existing[0]) return c.json({ error: "Email already in use" }, 409);

    const passwordHash = await hashPassword(password);
    const inserted = await db
      .insert(appUser)
      .values({ email, passwordHash, displayName })
      .returning({ id: appUser.id, email: appUser.email });
    const user = inserted[0];

    let claim: Awaited<ReturnType<typeof claimEnvFallbackData>> | null = null;
    if (claimDevData) {
      claim = await claimEnvFallbackData({ toUserId: user.id }).catch(() => null);
    }

    const session = await createSession(user.id);
    const emailVerification = await createEmailVerificationToken(user.id).catch(() => null);
    if (emailVerification) {
      const origin = getRequestOrigin(c.req.raw);
      const verifyUrl = `${origin}/api/auth/email/verify?token=${encodeURIComponent(
        emailVerification.token,
      )}`;
      await sendEmailVerificationEmail({ to: user.email, verifyUrl }).catch(() => false);
    }
    await logAuthEvent({
      userId: user.id,
      eventType: "SIGNUP",
      req: c.req.raw,
      success: true,
      meta: claim?.claimed
        ? { claimedDevData: true, fromUserId: claim.fromUserId }
        : undefined,
    }).catch(() => {});

    return c.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, displayName, emailVerifiedAt: null },
      claim: claim?.claimed
        ? { fromUserId: claim.fromUserId, movedRowCounts: claim.movedRowCounts }
        : null,
    });
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/auth/me — the current user, or { user: null } (200) when there's no
// valid session. Mirrors the web contract (no 401) so clients can probe a
// persisted token on startup without treating "logged out" as an error.
authRoutes.get("/me", async (c) => {
  try {
    const token = sessionToken(c);
    const session = token ? await findActiveSession(token) : null;
    if (!session) return c.json({ user: null });
    const user = await findUserById(session.userId);
    if (!user) return c.json({ user: null });
    return c.json({ user: { ...user, fallback: false } });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/auth/logout — invalidate the caller's session token.
authRoutes.post("/logout", async (c) => {
  try {
    const token = sessionToken(c);
    if (token) {
      const session = await findActiveSession(token).catch(() => null);
      await deleteSession(token).catch(() => {});
      await logAuthEvent({
        userId: session?.userId ?? null,
        eventType: "LOGOUT",
        req: c.req.raw,
        success: true,
      }).catch(() => {});
    }
    return c.json({ ok: true });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/auth/password — change password; rotates sessions and returns a
// fresh token in the body (the old token is revoked).
authRoutes.post("/password", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const userRows = await db
      .select({ id: appUser.id, passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) {
      return c.json({ error: "Account does not support password change" }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return c.json({ error: "Current and new password required" }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ error: "New password must be at least 8 characters" }, 400);
    }
    if (newPassword === currentPassword) {
      return c.json({ error: "New password must differ from current" }, 400);
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      await logAuthEvent({
        userId,
        eventType: "PASSWORD_CHANGE",
        req: c.req.raw,
        success: false,
      }).catch(() => {});
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    const newHash = await hashPassword(newPassword);
    await db.update(appUser).set({ passwordHash: newHash }).where(eq(appUser.id, userId));

    // Revoke all sessions, then mint a fresh one returned in the body so the
    // token client stays signed in (the web equivalent sets a new cookie).
    await deleteSessionsForUser(userId);
    const session = await createSession(userId);
    await logAuthEvent({
      userId,
      eventType: "PASSWORD_CHANGE",
      req: c.req.raw,
      success: true,
    }).catch(() => {});

    return c.json({ ok: true, token: session.token, expiresAt: session.expiresAt });
  } catch (e) {
    return apiError(c, e);
  }
});

// DELETE /api/auth/account — permanently delete the account after re-auth.
authRoutes.delete("/account", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");

    const body = (await c.req.json().catch(() => null)) as
      | { confirmToken?: unknown; password?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Invalid request body" }, 400);
    }
    if (body.confirmToken !== "DELETE_MY_ACCOUNT") {
      return c.json(
        { error: "confirmToken must equal 'DELETE_MY_ACCOUNT' to delete the account" },
        400,
      );
    }

    const userRows = await db
      .select({ id: appUser.id, passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) return c.json({ error: "Account does not support deletion" }, 400);

    const password = String(body.password ?? "");
    if (!password) return c.json({ error: "Password is required" }, 400);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await logAuthEvent({
        userId,
        eventType: "ACCOUNT_DELETE",
        req: c.req.raw,
        success: false,
      }).catch(() => {});
      return c.json({ error: "Password is incorrect" }, 401);
    }

    await db.transaction(async (tx) => {
      await deleteUserDomainData(tx, userId);
      await tx.delete(passwordResetToken).where(eq(passwordResetToken.userId, userId));
      await tx
        .delete(emailVerificationToken)
        .where(eq(emailVerificationToken.userId, userId));
      await tx.delete(userSetting).where(eq(userSetting.userId, userId));
      await tx.delete(uxEventLog).where(eq(uxEventLog.userId, userId));
      await tx.delete(authOauthAccount).where(eq(authOauthAccount.userId, userId));
      await tx.delete(authSession).where(eq(authSession.userId, userId));
      await tx.delete(appUser).where(eq(appUser.id, userId));
    });

    await invalidateStatsCacheForUser(userId).catch(() => {});
    await logAuthEvent({
      userId,
      eventType: "ACCOUNT_DELETE",
      req: c.req.raw,
      success: true,
    }).catch(() => {});

    return c.json({ ok: true });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/auth/password/reset/request — email a reset link (generic response).
authRoutes.post("/password/reset/request", async (c) => {
  const generic = () =>
    c.json({
      ok: true,
      message: "If an account exists, a password reset email has been sent.",
    });
  try {
    const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return generic();

    const rows = await db
      .select({ id: appUser.id, email: appUser.email })
      .from(appUser)
      .where(eq(appUser.email, email))
      .limit(1);
    const user = rows[0];
    if (!user) {
      await logAuthEvent({
        eventType: "PASSWORD_RESET_REQUEST",
        req: c.req.raw,
        success: false,
        meta: { emailKnown: false },
      }).catch(() => {});
      return generic();
    }

    const resetToken = await createPasswordResetToken(user.id);
    const origin = getRequestOrigin(c.req.raw);
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(resetToken.token)}`;
    const sent = await sendPasswordResetEmail({ to: user.email, resetUrl }).catch(() => false);

    await logAuthEvent({
      userId: user.id,
      eventType: "PASSWORD_RESET_REQUEST",
      req: c.req.raw,
      success: sent,
      meta: { emailKnown: true },
    }).catch(() => {});

    return generic();
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/auth/email/verification/request — (re)send a verification email.
authRoutes.post("/email/verification/request", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const rows = await db
      .select({
        id: appUser.id,
        email: appUser.email,
        emailVerifiedAt: appUser.emailVerifiedAt,
      })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user) {
      return c.json({ error: "Account does not support email verification" }, 400);
    }
    if (user.emailVerifiedAt) {
      return c.json({ ok: true, alreadyVerified: true });
    }

    const verificationToken = await createEmailVerificationToken(user.id);
    const origin = getRequestOrigin(c.req.raw);
    const verifyUrl = `${origin}/api/auth/email/verify?token=${encodeURIComponent(
      verificationToken.token,
    )}`;
    const sent = await sendEmailVerificationEmail({ to: user.email, verifyUrl }).catch(
      () => false,
    );

    await logAuthEvent({
      userId: user.id,
      eventType: "EMAIL_VERIFICATION_REQUEST",
      req: c.req.raw,
      success: sent,
    }).catch(() => {});

    return c.json({ ok: true });
  } catch (e) {
    return apiError(c, e);
  }
});

// GET /api/auth/sessions — the account's active sign-ins (current one flagged).
authRoutes.get("/sessions", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const currentToken = sessionToken(c) || null;

    const rows = await db
      .select({
        token: authSession.token,
        createdAt: authSession.createdAt,
        expiresAt: authSession.expiresAt,
      })
      .from(authSession)
      .where(eq(authSession.userId, userId))
      .orderBy(desc(authSession.createdAt))
      .limit(50);

    const items = rows.map((row) => ({
      tokenMask: maskToken(row.token),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: currentToken === row.token,
      isExpired: row.expiresAt.getTime() <= Date.now(),
    }));

    return c.json({ items });
  } catch (e) {
    return apiError(c, e);
  }
});

// DELETE /api/auth/sessions — revoke every session except the caller's.
authRoutes.delete("/sessions", requireAuth, async (c) => {
  try {
    const userId = c.get("userId");
    const currentToken = sessionToken(c) || null;

    const condition = currentToken
      ? and(eq(authSession.userId, userId), ne(authSession.token, currentToken))
      : eq(authSession.userId, userId);

    const result = await db.delete(authSession).where(condition);
    const revoked =
      typeof (result as { rowCount?: number | null })?.rowCount === "number"
        ? (result as { rowCount: number }).rowCount
        : null;

    await logAuthEvent({
      userId,
      eventType: "SESSION_REVOKE_OTHERS",
      req: c.req.raw,
      success: true,
      meta: revoked != null ? { revoked } : undefined,
    }).catch(() => {});

    return c.json({ ok: true, revoked });
  } catch (e) {
    return apiError(c, e);
  }
});
