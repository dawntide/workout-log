import { count, lt } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { migrationRunLog } from "@workout/core/db/schema";
import { isMissingTableError } from "./missing-table";

/**
 * migration_run_log 보존 정리 — 스케줄러/CLI 공용 구현.
 *
 * 이 테이블은 마이그레이션이 돌 때마다 한 행씩 쌓이기만 하고 스스로 줄지 않는다
 * (`web/scripts/migrate.mjs`가 유일한 writer). 2026-08 감사 시점에 **2,101행 / 1.4 MB로
 * DB 내 최다 행수**였는데, 같은 성격의 형제 텔레메트리인 `ux_event_log`만 보존 정리를
 * 받고 있어 이 쪽만 무한 증가 중이었다(감사 §3.2 O1).
 *
 * **왜 잘라도 안전한가**: 소비자 둘 다 짧은 lookback 윈도로만 읽는다 —
 * `/api/stats/migration-telemetry`는 `lookbackMinutes` 상한이 10,080분(**7일**),
 * `/api/ops/migrations`는 1,440분(**1일**)이다. 기본 보존 120일은 두 상한보다 훨씬
 * 길어 대시보드가 보는 창을 건드리지 않는다.
 *
 * 보존 기간을 형제와 같은 120일로 맞춘 건 의도다 — 운영자가 텔레메트리 보존을
 * 테이블마다 다른 값으로 기억할 이유가 없다.
 */

export const MIGRATION_LOG_RETENTION_DAYS_DEFAULT = 120;

const DAY_MS = 86_400_000;

/** `MIGRATION_LOG_RETENTION_DAYS` 파싱 — 양의 정수만, 그 외는 기본값. */
export function resolveMigrationLogRetentionDays(
  raw: string | undefined,
  fallback = MIGRATION_LOG_RETENTION_DAYS_DEFAULT,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < 1) return fallback;
  return floored;
}

/** `MIGRATION_LOG_CLEANUP_DRY_RUN` 파싱 — "1"만 dry-run(그 외 값은 opt-in 아님). */
export function resolveMigrationLogCleanupDryRun(raw: string | undefined): boolean {
  return raw === "1";
}

export function migrationLogCleanupCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export type MigrationLogCleanupResult = {
  retentionDays: number;
  /** 이 시각보다 오래된 행이 삭제 대상 */
  cutoff: string;
  dryRun: boolean;
  /** 삭제 대상 행 수. 실제 실행이면 삭제된 수와 같다(같은 술어의 단일 DELETE). */
  staleRows: number;
  /** dry-run이면 항상 0 */
  deletedRows: number;
  /** 테이블이 아직 없어(마이그레이션 전) 아무것도 하지 않음 */
  skipped: boolean;
};

/**
 * 보존 기간이 지난 migration_run_log 행 삭제.
 *
 * 옵션을 주지 않으면 `MIGRATION_LOG_RETENTION_DAYS` / `MIGRATION_LOG_CLEANUP_DRY_RUN`을
 * 읽는다 — cron 라우트와 CLI가 같은 env 계약을 공유하도록 해석을 여기 한 곳에 둔다.
 *
 * 기준 컬럼은 `startedAt`이다(`finishedAt`은 RUNNING 상태에서 null이라 술어가 새는 자리).
 * `migration_run_log_started_idx`가 이 컬럼을 받쳐 준다.
 */
export async function cleanupMigrationRunLog(options?: {
  retentionDays?: number;
  dryRun?: boolean;
  now?: Date;
}): Promise<MigrationLogCleanupResult> {
  const retentionDays =
    options?.retentionDays ??
    resolveMigrationLogRetentionDays(process.env.MIGRATION_LOG_RETENTION_DAYS);
  const dryRun =
    options?.dryRun ??
    resolveMigrationLogCleanupDryRun(process.env.MIGRATION_LOG_CLEANUP_DRY_RUN);
  const cutoff = migrationLogCleanupCutoff(options?.now ?? new Date(), retentionDays);
  const base = {
    retentionDays,
    cutoff: cutoff.toISOString(),
    dryRun,
  };

  try {
    if (dryRun) {
      const rows = await db
        .select({ value: count() })
        .from(migrationRunLog)
        .where(lt(migrationRunLog.startedAt, cutoff));
      return { ...base, staleRows: rows[0]?.value ?? 0, deletedRows: 0, skipped: false };
    }

    // 단일 DELETE — rowCount가 곧 그 시점의 삭제 대상 수라 사전 count가 필요 없다.
    const result = await db.delete(migrationRunLog).where(lt(migrationRunLog.startedAt, cutoff));
    const deletedRows = (result as { rowCount?: number | null })?.rowCount ?? 0;
    return { ...base, staleRows: deletedRows, deletedRows, skipped: false };
  } catch (error) {
    // 마이그레이션 전 DB(신규 클론·일부 CI 잡)에서는 테이블이 없다 → 실패가 아니라 무작업.
    if (isMissingTableError(error)) {
      return { ...base, staleRows: 0, deletedRows: 0, skipped: true };
    }
    throw error;
  }
}
