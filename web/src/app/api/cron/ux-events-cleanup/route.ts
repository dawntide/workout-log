import { NextResponse } from "next/server";
import { opsTokenAuthorized } from "@workout/core/auth/ops-token";
import { cleanupUxEventLog } from "@workout/core/data/ux-event-retention";
import { withApiLogging } from "@/server/observability/apiRoute";

/**
 * Vercel Cron 진입점 — ux_event_log 보존 정리 (스케줄은 `web/vercel.json`의 crons).
 *
 * **GET인 이유**: Vercel Cron은 대상 경로를 GET으로만 호출한다. `/api/cron/session-prune`과
 * 같은 규약이다.
 *
 * **인증**: `Authorization: Bearer <CRON_SECRET>` — Vercel이 CRON_SECRET 설정 시 자동으로
 * 붙여준다. 수동 확인용으로 `WORKOUT_OPS_TOKEN`도 받는다. 둘 다 미설정이면 **거부**한다:
 * 공개 주소에서 닿는 파괴적 엔드포인트라 cron이 401로 시끄럽게 실패하는 편이 안전하다.
 *
 * 보존 기간·dry-run은 CLI(`db:cleanup:ux-events`)와 같은 env를 읽는다:
 * `UX_EVENTS_RETENTION_DAYS`(기본 120), `UX_EVENTS_CLEANUP_DRY_RUN=1`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function GETImpl(req: Request) {
  if (
    !opsTokenAuthorized(req.headers.get("authorization"), ["cron-secret", "ops-token"])
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await cleanupUxEventLog();
  return NextResponse.json({ ...result, at: new Date().toISOString() });
}

export const GET = withApiLogging(GETImpl);
