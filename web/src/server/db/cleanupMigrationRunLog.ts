import "./load-env";
import { cleanupMigrationRunLog } from "@workout/core/data/migration-log-retention";

/**
 * 수동/외부 스케줄러용 CLI — `pnpm -C web db:cleanup:migration-log`.
 *
 * 삭제 로직은 core에 있다(`@workout/core/data/migration-log-retention`). Vercel Cron 진입점
 * `/api/cron/telemetry-cleanup`이 같은 함수를 부르므로 보존 기준이 갈라지지 않는다.
 * 환경변수: `MIGRATION_LOG_RETENTION_DAYS`(기본 120), `MIGRATION_LOG_CLEANUP_DRY_RUN=1`.
 * env는 `./load-env`가 `.env.local`까지 읽어준다(`dotenv/config`는 `.env`만 본다).
 */
async function main() {
  const result = await cleanupMigrationRunLog();

  console.log(
    `[migration-log-cleanup] retentionDays=${result.retentionDays} cutoff=${result.cutoff} dryRun=${result.dryRun}`,
  );

  if (result.skipped) {
    console.warn("[migration-log-cleanup] migration_run_log table not found, skipping cleanup");
    return;
  }

  console.log(`[migration-log-cleanup] staleRows=${result.staleRows}`);

  if (result.dryRun || result.staleRows <= 0) {
    console.log("[migration-log-cleanup] completed without delete");
    return;
  }

  console.log(`[migration-log-cleanup] deletedRows=${result.deletedRows}`);
}

main().catch((error) => {
  console.error("[migration-log-cleanup] failed", error);
  process.exit(1);
});
