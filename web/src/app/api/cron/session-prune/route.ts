import { NextResponse } from "next/server";
import { opsTokenAuthorized } from "@workout/core/auth/ops-token";
import { pruneExpiredSessions } from "@workout/core/auth/session";
import { withApiLogging } from "@/server/observability/apiRoute";

/**
 * Vercel Cron 진입점 — 만료 세션 prune (스케줄은 `web/vercel.json`의 crons).
 *
 * **GET인 이유**: Vercel Cron은 대상 경로를 GET으로만 호출한다. 그래서 ops 라우트
 * (`/api/ops/sessions/prune`: GET=dry-run, POST=삭제)의 의미를 비틀지 않고 cron
 * 전용 경로를 따로 둔다 — systemd 타이머·`ilapi prune`은 기존 ops 라우트를 그대로 쓴다.
 *
 * **인증**: `Authorization: Bearer <CRON_SECRET>` — Vercel이 CRON_SECRET 설정 시
 * 자동으로 붙여준다. 운영 편의를 위해 `WORKOUT_OPS_TOKEN`도 받는다(수동 확인용).
 * 둘 다 미설정이면 **거부**한다: 공개 주소에서 닿는 파괴적 엔드포인트라 열어두는 것보다
 * cron이 401로 시끄럽게 실패하는 편이 안전하다.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function GETImpl(req: Request) {
  if (
    !opsTokenAuthorized(req.headers.get("authorization"), ["cron-secret", "ops-token"])
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deleted = await pruneExpiredSessions();
  return NextResponse.json({ deleted, at: new Date().toISOString() });
}

export const GET = withApiLogging(GETImpl);
