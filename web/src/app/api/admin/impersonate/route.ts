import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { assertSameOrigin } from "@/server/auth/origin";
import { requireAdminUserId } from "@/server/auth/user";
import { sessionCookieSecure } from "@/server/auth/session-cookie";
import { withApiLogging } from "@/server/observability/apiRoute";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import {
  ensureTestAccountFor,
  IMPERSONATION_RETURN_COOKIE,
  readReturnMarker,
  RETURN_MARKER_ENV,
  sessionReturnMarker,
} from "@/server/auth/impersonation";
import { resolveRequestLocale } from "@/lib/i18n/messages";

/**
 * POST /api/admin/impersonate — 관리자를 자기 테스트 계정으로 전환시킨다.
 *
 * 진짜 세션을 발급해 `wl_session`을 갈아 끼우고, 원래 신원은 `wl_admin_return`에
 * 담아 둔다. 전환 이후의 모든 요청은 평범한 테스트 계정 요청이라 데이터 API가 그대로
 * 돈다 — 신원 결정 경로에는 분기가 없다.
 *
 * web 잔류 라우트다(쿠키를 굽는 일이라 apps/api의 프레임워크-무지 경계 밖).
 */
async function POSTImpl(req: Request) {
  const locale = await resolveRequestLocale();
  const ko = locale === "ko";

  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    // 401/403은 여기서 갈린다. 테스트 계정(role='test')은 관리자가 아니므로 통과 못 한다 —
    // 전환한 상태에서 또 전환하는 경로가 이 한 줄로 막힌다.
    const adminId = await requireAdminUserId();

    // 중첩 전환 금지. 허용하면 복귀 마커가 덮여 원래 관리자 신원으로 못 돌아간다.
    if (await readReturnMarker()) {
      return NextResponse.json(
        {
          error: ko
            ? "이미 테스트 계정으로 전환한 상태입니다."
            : "Already impersonating a test account.",
        },
        { status: 409 },
      );
    }

    const store = await cookies();
    const adminToken = store.get(SESSION_COOKIE_NAME)?.value ?? "";
    // 쿠키가 없으면 env 폴백으로 관리자인 경우(로컬·CI)다. 돌아갈 토큰이 없는 대신
    // wl_session을 지우면 폴백이 다시 관리자로 인증하므로, 그 사실을 마커로 남긴다.
    const returnMarker = adminToken ? sessionReturnMarker(adminToken) : RETURN_MARKER_ENV;

    const target = await ensureTestAccountFor(adminId);
    // 값으로 잠근 불변식 — 전환 대상은 test 계정만. 실사용자 계정으로는 어떤 경로로도
    // 전환되지 않는다(ensureTestAccountFor가 test로 만들지만, 여기서 다시 확인한다).
    if (target.role !== "test") {
      return NextResponse.json(
        {
          error: ko
            ? "테스트 계정이 아닌 대상으로는 전환할 수 없습니다."
            : "Only test accounts can be impersonated.",
        },
        { status: 403 },
      );
    }

    const session = await createSession(target.id);
    await logAuthEvent({
      userId: adminId,
      eventType: "IMPERSONATE_START",
      req,
      success: true,
      meta: { targetUserId: target.id, targetEmail: target.email },
    }).catch(() => {});

    const res = NextResponse.json({
      ok: true,
      target: { id: target.id, email: target.email },
    });
    const cookieBase = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: sessionCookieSecure(),
      path: "/",
      expires: session.cookieExpiresAt,
    };
    res.cookies.set({ name: SESSION_COOKIE_NAME, value: session.token, ...cookieBase });
    res.cookies.set({ name: IMPERSONATION_RETURN_COOKIE, value: returnMarker, ...cookieBase });
    return res;
  } catch (error) {
    return apiErrorResponse(error, {
      fallback: {
        ko: "테스트 계정으로 전환하지 못했습니다.",
        en: "Failed to switch to the test account.",
      },
    });
  }
}

export const POST = withApiLogging(POSTImpl);
