import { count, lt } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { uxEventLog } from "@workout/core/db/schema";

/**
 * ux_event_log 보존 정리 — 스케줄러/CLI 공용 구현.
 *
 * 이벤트 스트림은 append-only라 스스로 줄지 않는다. 호출지가 둘이라
 * (web cron 라우트 `/api/cron/ux-events-cleanup`, CLI `pnpm -C web db:cleanup:ux-events`)
 * `pruneExpiredSessions`와 같은 방식으로 구현을 여기 하나로 둔다.
 *
 * 스키마 인지: 예전 CLI는 raw SQL로 스키마 없는 `"ux_event_log"`를 지웠다 →
 * `DB_SCHEMA=dev`여도 search_path 상의 public을 건드렸다. drizzle 테이블 객체를 쓰면
 * 앱의 나머지 쿼리와 같은 스키마를 본다.
 */

export const UX_EVENTS_RETENTION_DAYS_DEFAULT = 120;

const DAY_MS = 86_400_000;

/** `UX_EVENTS_RETENTION_DAYS` 파싱 — 양의 정수만, 그 외는 기본값. */
export function resolveUxEventsRetentionDays(
  raw: string | undefined,
  fallback = UX_EVENTS_RETENTION_DAYS_DEFAULT,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < 1) return fallback;
  return floored;
}

/** `UX_EVENTS_CLEANUP_DRY_RUN` 파싱 — "1"만 dry-run(그 외 값은 opt-in 아님). */
export function resolveUxEventsCleanupDryRun(raw: string | undefined): boolean {
  return raw === "1";
}

export function uxEventsCleanupCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export type UxEventsCleanupResult = {
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

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const errorRecord = error as Record<string, unknown>;
  if (errorRecord.code === "42P01") return true;
  const cause = errorRecord.cause;
  if (!cause || typeof cause !== "object") return false;
  return (cause as Record<string, unknown>).code === "42P01";
}

/**
 * 보존 기간이 지난 ux_event_log 행 삭제.
 *
 * 옵션을 주지 않으면 `UX_EVENTS_RETENTION_DAYS` / `UX_EVENTS_CLEANUP_DRY_RUN`을 읽는다 —
 * cron 라우트와 CLI가 같은 env 계약을 공유하도록 해석을 여기 한 곳에 둔다.
 */
export async function cleanupUxEventLog(options?: {
  retentionDays?: number;
  dryRun?: boolean;
  now?: Date;
}): Promise<UxEventsCleanupResult> {
  const retentionDays =
    options?.retentionDays ??
    resolveUxEventsRetentionDays(process.env.UX_EVENTS_RETENTION_DAYS);
  const dryRun =
    options?.dryRun ?? resolveUxEventsCleanupDryRun(process.env.UX_EVENTS_CLEANUP_DRY_RUN);
  const cutoff = uxEventsCleanupCutoff(options?.now ?? new Date(), retentionDays);
  const base = {
    retentionDays,
    cutoff: cutoff.toISOString(),
    dryRun,
  };

  try {
    if (dryRun) {
      const rows = await db
        .select({ value: count() })
        .from(uxEventLog)
        .where(lt(uxEventLog.recordedAt, cutoff));
      return { ...base, staleRows: rows[0]?.value ?? 0, deletedRows: 0, skipped: false };
    }

    // 단일 DELETE — rowCount가 곧 그 시점의 삭제 대상 수라 사전 count가 필요 없다.
    const result = await db.delete(uxEventLog).where(lt(uxEventLog.recordedAt, cutoff));
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
