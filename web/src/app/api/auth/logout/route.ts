import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteSession,
  findActiveSession,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";
import { assertSameOrigin } from "@/server/auth/origin";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { IMPERSONATION_RETURN_COOKIE } from "@/server/auth/impersonation";

export async function POST(req: Request) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const session = await findActiveSession(token).catch(() => null);
    await deleteSession(token).catch(() => {});
    await logAuthEvent({
      userId: session?.userId ?? null,
      eventType: "LOGOUT",
      req,
      success: true,
    }).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  // 전환 중 로그아웃하면 복귀 쿠키가 남는다. 그대로 두면 다음 로그인에서 "전환 중"으로
  // 잘못 표시되고, 이미 무의미해진 토큰으로 복귀를 시도하게 된다.
  res.cookies.delete(IMPERSONATION_RETURN_COOKIE);
  return res;
}
