import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser } from "@workout/core/db/schema";
import { hashPassword } from "@workout/core/auth/password";
import {
  createSession,
  deleteSessionsForUser,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";
import { consumePasswordResetToken } from "@workout/core/auth/password-reset";
import { assertSameOrigin } from "@/server/auth/origin";
import { getClientIp, rateLimit } from "@workout/core/auth/rate-limit";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { sessionCookieSecure } from "@/server/auth/session-cookie";

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const ip = getClientIp(req);
  const limit = await rateLimit({
    key: `pw-reset-confirm:ip:${ip}`,
    max: 10,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const token = String(body?.token ?? "");
  const newPassword = String(body?.newPassword ?? "");
  if (!token || !newPassword) {
    return NextResponse.json(
      { error: "Token and new password required" },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const consumed = await consumePasswordResetToken(token);
  if (!consumed) {
    await logAuthEvent({
      eventType: "PASSWORD_RESET_CONFIRM",
      req,
      ip,
      success: false,
    }).catch(() => {});
    return NextResponse.json(
      { error: "Invalid or expired reset token" },
      { status: 400 },
    );
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(appUser)
    .set({ passwordHash: newHash })
    .where(eq(appUser.id, consumed.userId));

  await deleteSessionsForUser(consumed.userId);
  const session = await createSession(consumed.userId);
  await logAuthEvent({
    userId: consumed.userId,
    eventType: "PASSWORD_RESET_CONFIRM",
    req,
    ip,
    success: true,
  }).catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/",
    expires: session.cookieExpiresAt, // sliding: 쿠키는 절대상한으로 길게(실제 게이트는 DB expiresAt)
  });
  return res;
}
