import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser } from "@workout/core/db/schema";
import { hashPassword, verifyPassword } from "@workout/core/auth/password";
import {
  deleteSessionsForUser,
  createSession,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";
import { tryAuthenticatedUserId } from "@/server/auth/user";
import { assertSameOrigin } from "@/server/auth/origin";
import { getClientIp, rateLimit } from "@workout/core/auth/rate-limit";
import { logAuthEvent } from "@workout/core/auth/security-events";

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const userId = await tryAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // env fallback 사용자(uuid 형식 아닌 단순 string)는 비밀번호 없음
  const userRows = await db
    .select({
      id: appUser.id,
      passwordHash: appUser.passwordHash,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    return NextResponse.json(
      { error: "Account does not support password change" },
      { status: 400 },
    );
  }

  // Rate limit: user당 분당 5회
  const ip = getClientIp(req);
  const limit = await rateLimit({
    key: `pw-change:user:${userId}:${ip}`,
    max: 5,
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
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new password required" },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must differ from current" },
      { status: 400 },
    );
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    await logAuthEvent({
      userId,
      eventType: "PASSWORD_CHANGE",
      req,
      ip,
      success: false,
    }).catch(() => {});
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401 },
    );
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(appUser)
    .set({ passwordHash: newHash })
    .where(eq(appUser.id, userId));

  // 모든 세션 무효화 + 현재 요청에 새 세션 발급 (강제 로그아웃 방지)
  await deleteSessionsForUser(userId);
  const session = await createSession(userId);
  await logAuthEvent({
    userId,
    eventType: "PASSWORD_CHANGE",
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.cookieExpiresAt, // sliding: 쿠키는 절대상한으로 길게(실제 게이트는 DB expiresAt)
  });
  return res;
}
