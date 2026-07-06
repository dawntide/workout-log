import { errorMessage } from "@/lib/error-message";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser } from "@workout/core/db/schema";
import { hashPassword } from "@workout/core/auth/password";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { assertSameOrigin } from "@/server/auth/origin";
import { getClientIp, rateLimit } from "@workout/core/auth/rate-limit";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

const PASSWORD_HASH_PREFIX = "pbkdf2$";
const MIN_PASSWORD_LENGTH = 8;

/**
 * 비밀번호가 아직 설정되지 않은 (oauth-only) 사용자가 직접 비밀번호를
 * 추가하는 엔드포인트.
 *
 * 보안 모델: 사용자가 이미 OAuth로 인증된 세션을 가지고 있다는 사실이
 * 계정 소유권 증명. 별도 이메일 verification round-trip 없이 in-app에서
 * 바로 비밀번호 설정.
 *
 * 이미 비밀번호를 가진 사용자는 PASSWORD_ALREADY_SET 으로 거부 — 변경은
 * 기존 /api/auth/password 엔드포인트를 사용해야 함 (현재 비밀번호 검증
 * 필수).
 */
async function POSTImpl(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    const userId = await requireAuthenticatedUserId();

    const ip = getClientIp(req);
    const limit = await rateLimit({
      key: `pw-setup:user:${userId}:${ip}`,
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

    const body = (await req.json().catch(() => null)) as
      | { newPassword?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const newPassword = String(body.newPassword ?? "");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    const userRow = await db
      .select({ id: appUser.id, passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    const user = userRow[0];
    if (!user) {
      return NextResponse.json(
        { error: "Account does not support password setup" },
        { status: 400 },
      );
    }

    if (user.passwordHash?.startsWith(PASSWORD_HASH_PREFIX)) {
      return NextResponse.json(
        {
          error:
            "A password is already set on this account. Use the change-password endpoint instead.",
          code: "PASSWORD_ALREADY_SET",
        },
        { status: 409 },
      );
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(appUser)
      .set({ passwordHash: newHash })
      .where(eq(appUser.id, userId));

    await logAuthEvent({
      userId,
      eventType: "PASSWORD_CHANGE",
      req,
      ip,
      success: true,
      meta: { setup: true },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (errorMessage(e)?.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("api.handler_error", { error: e, route: "auth.password.setup" });
    return apiErrorResponse(e);
  }
}

export const POST = withApiLogging(POSTImpl);
