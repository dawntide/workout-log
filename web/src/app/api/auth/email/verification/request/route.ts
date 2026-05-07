import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { appUser } from "@/server/db/schema";
import { assertSameOrigin } from "@/server/auth/origin";
import { tryAuthenticatedUserId } from "@/server/auth/user";
import { getClientIp, rateLimit } from "@/server/auth/rate-limit";
import { createEmailVerificationToken } from "@/server/auth/email-verification";
import { sendEmailVerificationEmail } from "@/server/auth/auth-email";
import { getRequestOrigin } from "@/server/email/sender";
import { logAuthEvent } from "@/server/auth/security-events";

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const userId = await tryAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const limit = rateLimit({
    key: `email-verification-request:${userId}:${ip}`,
    max: 3,
    windowMs: 60 * 60_000,
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
    return NextResponse.json(
      { error: "Account does not support email verification" },
      { status: 400 },
    );
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const verificationToken = await createEmailVerificationToken(user.id);
  const origin = getRequestOrigin(req);
  const verifyUrl = `${origin}/api/auth/email/verify?token=${encodeURIComponent(
    verificationToken.token,
  )}`;
  const sent = await sendEmailVerificationEmail({
    to: user.email,
    verifyUrl,
  }).catch(() => false);

  await logAuthEvent({
    userId: user.id,
    eventType: "EMAIL_VERIFICATION_REQUEST",
    req,
    ip,
    success: sent,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
