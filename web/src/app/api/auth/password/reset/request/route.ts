import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { appUser } from "@/server/db/schema";
import { assertSameOrigin } from "@/server/auth/origin";
import { getClientIp, rateLimit } from "@/server/auth/rate-limit";
import { createPasswordResetToken } from "@/server/auth/password-reset";
import { sendPasswordResetEmail } from "@/server/auth/auth-email";
import { logAuthEvent } from "@/server/auth/security-events";
import { getRequestOrigin } from "@/server/email/sender";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function genericResponse() {
  return NextResponse.json({
    ok: true,
    message: "If an account exists, a password reset email has been sent.",
  });
}

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const ip = getClientIp(req);
  const ipLimit = rateLimit({
    key: `pw-reset-request:ip:${ip}`,
    max: 3,
    windowMs: 60 * 60_000,
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return genericResponse();
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return genericResponse();

  const emailLimit = rateLimit({
    key: `pw-reset-request:email:${email}`,
    max: 3,
    windowMs: 60 * 60_000,
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
    .select({ id: appUser.id, email: appUser.email })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  const user = rows[0];

  if (!user) {
    await logAuthEvent({
      eventType: "PASSWORD_RESET_REQUEST",
      req,
      ip,
      success: false,
      meta: { emailKnown: false },
    }).catch(() => {});
    return genericResponse();
  }

  const resetToken = await createPasswordResetToken(user.id);
  const origin = getRequestOrigin(req);
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(
    resetToken.token,
  )}`;
  const sent = await sendPasswordResetEmail({
    to: user.email,
    resetUrl,
  }).catch(() => false);

  await logAuthEvent({
    userId: user.id,
    eventType: "PASSWORD_RESET_REQUEST",
    req,
    ip,
    success: sent,
    meta: { emailKnown: true },
  }).catch(() => {});

  return genericResponse();
}
