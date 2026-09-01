import "./load-env";
import { cleanupE2eAccounts } from "@workout/core/data/e2e-account-retention";

/**
 * 수동/스케줄러용 CLI — `pnpm -C web db:cleanup:e2e-accounts`.
 *
 * 삭제 로직은 core에 있다(`@workout/core/data/e2e-account-retention`). 스케줄 워크플로
 * `.github/workflows/db-cleanup-e2e-accounts.yml`이 같은 명령을 부르므로 기준이 갈라지지 않는다.
 * 환경변수: `DB_SCHEMA=dev`(필수), `E2E_ACCOUNT_MIN_AGE_HOURS`(기본 24),
 * `E2E_ACCOUNT_CLEANUP_DRY_RUN=1`.
 * env는 `./load-env`가 `.env.local`까지 읽어준다(`dotenv/config`는 `.env`만 본다).
 */
async function main() {
  const result = await cleanupE2eAccounts();

  console.log(
    `[e2e-account-cleanup] schema=${process.env.DB_SCHEMA} minAgeHours=${result.minAgeHours} ` +
      `cutoff=${result.cutoff} dryRun=${result.dryRun}`,
  );
  console.log(`[e2e-account-cleanup] staleAccounts=${result.staleAccounts}`);

  if (result.dryRun || result.staleAccounts <= 0) {
    console.log("[e2e-account-cleanup] completed without delete");
    return;
  }

  console.log(
    `[e2e-account-cleanup] deletedAccounts=${result.deletedAccounts} ` +
      `deletedAuthEvents=${result.deletedAuthEvents}`,
  );
}

main().catch((error) => {
  console.error("[e2e-account-cleanup] failed", error);
  process.exit(1);
});
