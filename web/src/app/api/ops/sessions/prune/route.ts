import { NextResponse } from "next/server";
import { opsTokenAuthorized } from "@workout/core/auth/ops-token";
import {
  countExpiredSessions,
  pruneExpiredSessions,
} from "@workout/core/auth/session";
import { withApiLogging } from "@/server/observability/apiRoute";

/**
 * 만료된 auth_session row 삭제 — 수동/외부 스케줄러용.
 *
 * - 인증: `Authorization: Bearer <WORKOUT_OPS_TOKEN>`, **fail-closed**
 *   (토큰 미설정이면 거부. 로컬은 `WORKOUT_OPS_ALLOW_NO_TOKEN=1`로 opt-in).
 * - Vercel Cron은 GET만 보내고 CRON_SECRET을 쓰므로 별도 라우트를 탄다:
 *   `/api/cron/session-prune`.
 */
async function POSTImpl(req: Request) {
  if (!opsTokenAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deleted = await pruneExpiredSessions();
  return NextResponse.json({ deleted, at: new Date().toISOString() });
}

export const POST = withApiLogging(POSTImpl);

// GET은 dry-run (count only) — 모니터링/health-check용
async function GETImpl(req: Request) {
  if (!opsTokenAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { expired, truncated } = await countExpiredSessions();
  return NextResponse.json({ expired, truncated, at: new Date().toISOString() });
}

export const GET = withApiLogging(GETImpl);
