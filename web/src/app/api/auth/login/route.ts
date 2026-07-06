import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser } from "@workout/core/db/schema";
import {
  verifyPassword,
  hashPassword,
  passwordNeedsRehash,
} from "@workout/core/auth/password";
import {
  createSession,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";
import { getClientIp, rateLimit } from "@workout/core/auth/rate-limit";
import { assertSameOrigin } from "@/server/auth/origin";
import { logAuthEvent } from "@workout/core/auth/security-events";

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  // Rate limit: IP당 분당 10회, email당 분당 5회 시도
  const ip = getClientIp(req);
  const ipLimit = await rateLimit({
    key: `login:ip:${ip}`,
    max: 10,
    windowMs: 60_000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(ipLimit.retryAfterMs / 1000)),
        },
      },
    );
  }
  const emailLimit = await rateLimit({
    key: `login:email:${email}`,
    max: 5,
    windowMs: 60_000,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(emailLimit.retryAfterMs / 1000)),
        },
      },
    );
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

  // 동일 에러 메시지로 enumeration 방지
  const ok = user && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    await logAuthEvent({
      userId: user?.id ?? null,
      eventType: "LOGIN_FAIL",
      req,
      ip,
      success: false,
      meta: { email },
    }).catch(() => {});
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  // 점진적 해시 승격: 구 iteration 해시면 새 정책(600k)으로 재해시.
  // best-effort — 실패해도 로그인은 성공(다음 로그인에 재시도). 비번은 방금 검증돼 유효.
  if (passwordNeedsRehash(user.passwordHash)) {
    try {
      const rehashed = await hashPassword(password);
      await db
        .update(appUser)
        .set({ passwordHash: rehashed })
        .where(eq(appUser.id, user.id));
    } catch {
      // ignore
    }
  }

  const session = await createSession(user.id);
  await logAuthEvent({
    userId: user.id,
    eventType: "LOGIN",
    req,
    ip,
    success: true,
  }).catch(() => {});

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  });
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
