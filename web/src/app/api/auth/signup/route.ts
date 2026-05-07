import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { appUser } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import {
  createSession,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import { getClientIp, rateLimit } from "@/server/auth/rate-limit";
import { assertSameOrigin } from "@/server/auth/origin";
import { claimEnvFallbackData } from "@/server/auth/claim-fallback";
import { createEmailVerificationToken } from "@/server/auth/email-verification";
import { sendEmailVerificationEmail } from "@/server/auth/auth-email";
import { logAuthEvent } from "@/server/auth/security-events";
import { getRequestOrigin } from "@/server/email/sender";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  // Rate limit: signup IP당 시간당 5회
  const ip = getClientIp(req);
  const ipLimit = rateLimit({
    key: `signup:ip:${ip}`,
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many signups from this IP. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(ipLimit.retryAfterMs / 1000)),
        },
      },
    );
  }

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
  const displayName = body?.displayName
    ? String(body.displayName).trim().slice(0, 80)
    : null;
  const claimDevData = body?.claimDevData === true;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Invalid email" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (existing[0]) {
    return NextResponse.json(
      { error: "Email already in use" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const inserted = await db
    .insert(appUser)
    .values({ email, passwordHash, displayName })
    .returning({ id: appUser.id, email: appUser.email });

  const user = inserted[0];

  // env fallback 데이터 claim (옵션)
  let claim: Awaited<ReturnType<typeof claimEnvFallbackData>> | null = null;
  if (claimDevData) {
    claim = await claimEnvFallbackData({ toUserId: user.id }).catch(
      () => null,
    );
  }

  const session = await createSession(user.id);
  const emailVerification = await createEmailVerificationToken(user.id).catch(
    () => null,
  );
  if (emailVerification) {
    const origin = getRequestOrigin(req);
    const verifyUrl = `${origin}/api/auth/email/verify?token=${encodeURIComponent(
      emailVerification.token,
    )}`;
    await sendEmailVerificationEmail({ to: user.email, verifyUrl }).catch(
      () => false,
    );
  }
  await logAuthEvent({
    userId: user.id,
    eventType: "SIGNUP",
    req,
    ip,
    success: true,
    meta: claim?.claimed
      ? { claimedDevData: true, fromUserId: claim.fromUserId }
      : undefined,
  }).catch(() => {});

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, displayName, emailVerifiedAt: null },
    claim: claim?.claimed
      ? {
          fromUserId: claim.fromUserId,
          movedRowCounts: claim.movedRowCounts,
        }
      : null,
  });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
  return res;
}
