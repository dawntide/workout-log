import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { appUser } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth/password";
import {
  createSession,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import { getClientIp, rateLimit } from "@/server/auth/rate-limit";
import { assertSameOrigin } from "@/server/auth/origin";
import { logAuthEvent } from "@/server/auth/security-events";

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  let body: any;
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
