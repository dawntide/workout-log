import "./load-env";
import { cleanupUxEventLog } from "@workout/core/data/ux-event-retention";

/**
 * 수동/외부 스케줄러용 CLI — `pnpm -C web db:cleanup:ux-events`.
 *
 * 삭제 로직은 core에 있다(`@workout/core/data/ux-event-retention`). Vercel Cron 진입점
 * `/api/cron/ux-events-cleanup`이 같은 함수를 부르므로 보존 기준이 갈라지지 않는다.
 * 환경변수: `UX_EVENTS_RETENTION_DAYS`(기본 120), `UX_EVENTS_CLEANUP_DRY_RUN=1`.
 * env는 `./load-env`가 `.env.local`까지 읽어준다(`dotenv/config`는 `.env`만 본다).
 */
async function main() {
  const result = await cleanupUxEventLog();

  console.log(
    `[ux-events-cleanup] retentionDays=${result.retentionDays} cutoff=${result.cutoff} dryRun=${result.dryRun}`,
  );

  if (result.skipped) {
    console.warn("[ux-events-cleanup] ux_event_log table not found, skipping cleanup");
    return;
  }

  console.log(`[ux-events-cleanup] staleRows=${result.staleRows}`);

  if (result.dryRun || result.staleRows <= 0) {
    console.log("[ux-events-cleanup] completed without delete");
    return;
  }

  console.log(`[ux-events-cleanup] deletedRows=${result.deletedRows}`);
}

main().catch((error) => {
  console.error("[ux-events-cleanup] failed", error);
  process.exit(1);
});
