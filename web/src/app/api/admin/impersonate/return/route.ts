import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteSession,
  findActiveSession,
  findUserRole,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";
import { SESSION_ABSOLUTE_MAX_MS } from "@workout/core/auth/session-policy";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { assertSameOrigin } from "@/server/auth/origin";
import { devFallbackUserId } from "@/server/auth/dev-fallback";
import { sessionCookieSecure } from "@/server/auth/session-cookie";
import { withApiLogging } from "@/server/observability/apiRoute";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import {
  IMPERSONATION_RETURN_COOKIE,
  parseReturnMarker,
  readReturnMarker,
} from "@/server/auth/impersonation";
import { resolveRequestLocale } from "@/lib/i18n/messages";

/**
 * POST /api/admin/impersonate/return — 원래 관리자 신원으로 돌아온다.
 *
 * **여기에는 requireAdmin을 걸지 않는다.** 호출 시점의 신원은 테스트 계정이라 관리자가
 * 아니고, 걸면 돌아올 길이 막힌다. 대신 복귀 쿠키가 가리키는 세션이 **지금도 살아 있는
 * 관리자 세션인지 서버가 다시 확인한다** — 쿠키 값 자체는 신뢰하지 않는다.
 */
async function POSTImpl(req: Request) {
  const locale = await resolveRequestLocale();
  const ko = locale === "ko";

  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    const marker = await readReturnMarker();
    if (!marker) {
      return NextResponse.json(
        { error: ko ? "전환 중이 아닙니다." : "Not impersonating." },
        { status: 400 },
      );
    }
    const parsed = parseReturnMarker(marker);
    if (!parsed) {
      return NextResponse.json(
        { error: ko ? "복귀 정보를 읽을 수 없습니다." : "Malformed return marker." },
        { status: 400 },
      );
    }

    const store = await cookies();
    const currentToken = store.get(SESSION_COOKIE_NAME)?.value ?? "";

    // 복귀할 관리자 신원 확인. 두 경로 모두 "지금도 관리자인가"를 새로 판정한다 —
    // 전환 중에 강등되었다면 돌아갈 자격도 없다.
    let adminUserId: string;
    let restoreToken: string | null = null;

    if (parsed.kind === "env") {
      const fallbackId = devFallbackUserId();
      const role = fallbackId ? await findUserRole(fallbackId) : null;
      if (!fallbackId || role !== "admin") {
        return NextResponse.json(
          {
            error: ko
              ? "복귀할 관리자 신원이 없습니다. 다시 로그인해 주세요."
              : "No admin identity to return to. Please sign in again.",
          },
          { status: 401 },
        );
      }
      adminUserId = fallbackId;
    } else {
      const session = await findActiveSession(parsed.token);
      if (!session || session.role !== "admin") {
        // 관리자 세션도 sliding 만료가 있어, 테스트 계정에 오래 머물면 여기로 온다.
        // 조용히 실패하지 않고 재로그인을 명시적으로 안내한다.
        return NextResponse.json(
          {
            error: ko
              ? "관리자 세션이 만료되었습니다. 다시 로그인해 주세요."
              : "The admin session expired. Please sign in again.",
          },
          { status: 401 },
        );
      }
      adminUserId = session.userId;
      restoreToken = parsed.token;
    }

    // 테스트 세션은 폐기한다 — 남겨 두면 그 토큰으로 계속 테스트 계정에 들어갈 수 있다.
    if (currentToken && currentToken !== restoreToken) {
      await deleteSession(currentToken).catch(() => {});
    }

    await logAuthEvent({
      userId: adminUserId,
      eventType: "IMPERSONATE_END",
      req,
      success: true,
    }).catch(() => {});

    const res = NextResponse.json({ ok: true });
    if (restoreToken) {
      res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: restoreToken,
        httpOnly: true,
        sameSite: "lax",
        secure: sessionCookieSecure(),
        path: "/",
        // 원래 쿠키의 만료를 알 수 없으므로 로그인과 같은 절대 상한 정책으로 다시 굽는다.
        // 실제 게이트는 DB의 expiresAt이라 쿠키 만료는 운반 수단일 뿐이다.
        expires: new Date(Date.now() + SESSION_ABSOLUTE_MAX_MS),
      });
    } else {
      // env 폴백 경로: 세션 쿠키를 지우면 폴백이 다시 관리자로 인증한다.
      res.cookies.delete(SESSION_COOKIE_NAME);
    }
    res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
    return res;
  } catch (error) {
    return apiErrorResponse(error, {
      fallback: {
        ko: "관리자 계정으로 돌아가지 못했습니다.",
        en: "Failed to return to the admin account.",
      },
    });
  }
}

export const POST = withApiLogging(POSTImpl);
