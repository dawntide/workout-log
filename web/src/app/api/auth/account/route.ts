import { errorMessage } from "@/lib/error-message";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  appUser,
  authOauthAccount,
  authSession,
  emailVerificationToken,
  passwordResetToken,
  userSetting,
  uxEventLog,
} from "@workout/core/db/schema";
import { verifyPassword } from "@workout/core/auth/password";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { assertSameOrigin } from "@/server/auth/origin";
import { getClientIp, rateLimit } from "@workout/core/auth/rate-limit";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { deleteUserDomainData } from "@workout/core/data/deleteUserData";
import { invalidateStatsCacheForUser } from "@workout/core/stats/cache";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

type DeleteAccountBody = {
  confirmToken?: unknown;
  password?: unknown;
};

async function DELETEImpl(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    const userId = await requireAuthenticatedUserId();

    const ip = getClientIp(req);
    const limit = await rateLimit({
      key: `account-delete:user:${userId}:${ip}`,
      max: 3,
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

    const body = (await req.json().catch(() => null)) as DeleteAccountBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    if (body.confirmToken !== "DELETE_MY_ACCOUNT") {
      return NextResponse.json(
        {
          error:
            "confirmToken must equal 'DELETE_MY_ACCOUNT' to delete the account",
        },
        { status: 400 },
      );
    }

    const userRows = await db
      .select({ id: appUser.id, passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) {
      // env fallback userId — no actual account row to delete
      return NextResponse.json(
        { error: "Account does not support deletion" },
        { status: 400 },
      );
    }

    const password = String(body.password ?? "");
    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await logAuthEvent({
        userId,
        eventType: "ACCOUNT_DELETE",
        req,
        ip,
        success: false,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Password is incorrect" },
        { status: 401 },
      );
    }

    await db.transaction(async (tx) => {
      await deleteUserDomainData(tx, userId);
      await tx
        .delete(passwordResetToken)
        .where(eq(passwordResetToken.userId, userId));
      await tx
        .delete(emailVerificationToken)
        .where(eq(emailVerificationToken.userId, userId));
      // 계정 삭제 완전성(audit §3.1): FK가 없어 cascade되지 않는 user-scoped 데이터 정리.
      // deleteUserDomainData는 import-replace와 공유하므로(설정 보존), 계정 전용 정리는 여기서 수행.
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
      req,
      ip,
      success: true,
    }).catch(() => {});

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  } catch (e) {
    if (errorMessage(e)?.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("api.handler_error", { error: e, route: "auth.account.delete" });
    return apiErrorResponse(e);
  }
}

export const DELETE = withApiLogging(DELETEImpl);
