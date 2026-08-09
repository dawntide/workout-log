import { NextResponse } from "next/server";
import { opsTokenAuthorized } from "@workout/core/auth/ops-token";
import { cleanupUxEventLog } from "@workout/core/data/ux-event-retention";
import { cleanupMigrationRunLog } from "@workout/core/data/migration-log-retention";
import { withApiLogging } from "@/server/observability/apiRoute";

/**
 * Vercel Cron 진입점 — **운영 텔레메트리 보존 정리** (스케줄은 `web/vercel.json`의 crons).
 *
 * 대상 두 테이블 모두 append-only라 스스로 줄지 않는다:
 * - `ux_event_log` — 익명 Core Web Vitals·UX 이벤트
 * - `migration_run_log` — 마이그레이션 실행 텔레메트리 (2026-08 감사 §3.2 O1에서 편입.
 *   그때까지 DB 내 최다 행수였는데 혼자 보존 정리를 못 받고 있었다)
 *
 * **경로 이름**: 원래 `/api/cron/ux-events-cleanup`이었다. 대상이 둘이 되면서 이름이 하는
 * 일과 어긋나 `telemetry-cleanup`으로 바꿨다. Vercel 크론 슬롯을 하나 더 쓰지 않으려고
 * 라우트를 나누는 대신 여기 얹었다.
 *
 * **GET인 이유**: Vercel Cron은 대상 경로를 GET으로만 호출한다. `/api/cron/session-prune`과
 * 같은 규약이다.
 *
 * **인증**: `Authorization: Bearer <CRON_SECRET>` — Vercel이 CRON_SECRET 설정 시 자동으로
 * 붙여준다. 수동 확인용으로 `WORKOUT_OPS_TOKEN`도 받는다. 둘 다 미설정이면 **거부**한다:
 * 공개 주소에서 닿는 파괴적 엔드포인트라 cron이 401로 시끄럽게 실패하는 편이 안전하다.
 *
 * 보존 기간·dry-run은 각 CLI와 같은 env를 읽는다(테이블별로 독립):
 * `UX_EVENTS_RETENTION_DAYS`(기본 120)·`UX_EVENTS_CLEANUP_DRY_RUN=1`,
 * `MIGRATION_LOG_RETENTION_DAYS`(기본 120)·`MIGRATION_LOG_CLEANUP_DRY_RUN=1`.
 *
 * 한쪽이 실패해도 다른 쪽 결과는 남긴다 — 둘은 독립이라 하나 때문에 나머지가 영영
 * 안 도는 상태가 되면 안 된다. 응답의 `ok:false`와 500으로 실패는 그대로 드러난다.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function GETImpl(req: Request) {
  if (
    !opsTokenAuthorized(req.headers.get("authorization"), ["cron-secret", "ops-token"])
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [uxEvents, migrationLog] = await Promise.allSettled([
    cleanupUxEventLog(),
    cleanupMigrationRunLog(),
  ]);

  const settled = (result: PromiseSettledResult<unknown>) =>
    result.status === "fulfilled"
      ? { ok: true as const, ...(result.value as object) }
      : { ok: false as const, error: String(result.reason?.message ?? result.reason) };

  const body = {
    uxEvents: settled(uxEvents),
    migrationLog: settled(migrationLog),
    at: new Date().toISOString(),
  };
  const failed = !body.uxEvents.ok || !body.migrationLog.ok;
  return NextResponse.json(body, { status: failed ? 500 : 200 });
}

export const GET = withApiLogging(GETImpl);
