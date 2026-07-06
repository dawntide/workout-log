import { errorMessage } from "@/lib/error-message";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { authSession } from "@workout/core/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import { assertSameOrigin } from "@/server/auth/origin";

function maskToken(token: string): string {
  if (token.length <= 10) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

async function GETImpl(_req: Request) {
  void _req;
  try {
    const userId = await requireAuthenticatedUserId();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

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

    const items = rows.map((row) => {
      const isCurrent = currentToken === row.token;
      const isExpired = row.expiresAt.getTime() <= Date.now();
      return {
        tokenMask: maskToken(row.token),
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        isCurrent,
        isExpired,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    if (errorMessage(e)?.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("api.handler_error", { error: e, route: "auth.sessions.list" });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);

/**
 * 다른 모든 세션 종료. 현재 cookie 세션은 유지된다.
 *
 * Per-session revoke는 클라이언트에 토큰 또는 그에 준하는 식별자가 필요한데,
 * httpOnly cookie 외 노출을 피하기 위해 본 엔드포인트는 일괄 revoke만 지원한다.
 */
async function DELETEImpl(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    const userId = await requireAuthenticatedUserId();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

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
      req,
      success: true,
      meta: revoked != null ? { revoked } : undefined,
    }).catch(() => {});

    return NextResponse.json({ ok: true, revoked });
  } catch (e) {
    if (errorMessage(e)?.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("api.handler_error", {
      error: e,
      route: "auth.sessions.revoke-others",
    });
    return apiErrorResponse(e);
  }
}

export const DELETE = withApiLogging(DELETEImpl);
