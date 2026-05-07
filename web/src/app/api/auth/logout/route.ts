import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteSession,
  findActiveSession,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";
import { assertSameOrigin } from "@/server/auth/origin";
import { logAuthEvent } from "@/server/auth/security-events";

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
  return res;
}
