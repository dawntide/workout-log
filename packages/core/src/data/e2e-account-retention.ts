import { and, count, eq, inArray, lt, sql } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { appUser, authEventLog } from "@workout/core/db/schema";

/**
 * E2E 일회용 계정 정리 — 스케줄러/CLI 공용 구현.
 *
 * E2E 스펙은 매 실행마다 `<이름>-<suffix>@example.com`으로 새 계정을 가입시킨다. 격리는
 * 그 덕이지만 계정이 스스로 줄지 않아, 2026-09-01 실측으로 dev 스키마에 602개가 쌓여
 * 행 1만 개가 넘는 도메인 데이터를 끌고 있었다.
 *
 * **왜 dev 전용인가.** CI E2E는 러너 안의 임시 Postgres 컨테이너를 쓰고 끝나면 사라진다.
 * 잔해가 남는 곳은 `DB_SCHEMA=dev`로 Supabase를 보는 경로(로컬 실행·프리뷰)뿐이다.
 * 그래서 이 함수는 **dev 스키마가 아니면 아무것도 하지 않고 거부한다** — 같은 술어를
 * prod에 돌리면 `@example.com`을 쓰는 실제 사용자를 지울 수 있다.
 *
 * **cascade에 기댄다.** app_user를 참조하는 FK 15개가 전부 ON DELETE CASCADE라 계정 행
 * 하나로 도메인·인증 데이터가 함께 사라진다(account-lifecycle 검증 스크립트와 같은 경로).
 * 예외는 `auth_event_log`뿐 — 감사 로그라 의도적으로 FK가 없어 여기서 따로 지운다.
 *
 * **툼스톤은 남기지 않는다.** 그것은 "삭제 직전에 인증된 요청이 데이터를 되살리는" 경쟁을
 * 막는 장치인데, 여기 대상은 최소 나이를 넘긴 유휴 계정이고 수백 개를 남기면 잡음만 된다.
 */

/** E2E가 쓰는 유일한 이메일 도메인. 프로덕션·시드 코드는 이 도메인을 쓰지 않는다. */
const E2E_EMAIL_SUFFIX = "@example.com";

/**
 * 이보다 최근에 만들어진 계정은 건드리지 않는다 — **실행 중인 E2E의 계정을 지우지 않기
 * 위해서**다. 어떤 스위트도 24시간을 돌지 않으므로 이 창이면 충분하다.
 */
export const E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT = 24;

const HOUR_MS = 3_600_000;

/** `E2E_ACCOUNT_MIN_AGE_HOURS` 파싱 — 양의 정수만, 그 외는 기본값. */
export function resolveE2eAccountMinAgeHours(
  raw: string | undefined,
  fallback = E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored < 1) return fallback;
  return floored;
}

/** `E2E_ACCOUNT_CLEANUP_DRY_RUN` 파싱 — "1"만 dry-run(그 외 값은 opt-in 아님). */
export function resolveE2eAccountCleanupDryRun(raw: string | undefined): boolean {
  return raw === "1";
}

export function e2eAccountCleanupCutoff(now: Date, minAgeHours: number): Date {
  return new Date(now.getTime() - minAgeHours * HOUR_MS);
}

/**
 * 이 정리를 허용하는 스키마인지 판정한다.
 *
 * `DB_SCHEMA`가 비면 drizzle은 `public`(=프로덕션)을 본다. 그래서 "dev가 아니면 거부"가
 * 아니라 **"dev일 때만 허용"**으로 쓴다 — 빈 값이 안전한 쪽으로 떨어지게.
 */
export function isE2eAccountCleanupAllowedSchema(raw: string | undefined): boolean {
  return (raw ?? "").trim() === "dev";
}

export class E2eAccountCleanupForbiddenSchemaError extends Error {
  constructor(schema: string) {
    super(
      `E2E account cleanup is only allowed on DB_SCHEMA="dev" (got "${schema}") — ` +
        "the same predicate would delete real @example.com users in production.",
    );
    this.name = "E2eAccountCleanupForbiddenSchemaError";
  }
}

export type E2eAccountCleanupResult = {
  minAgeHours: number;
  /** 이 시각보다 먼저 만들어진 계정이 삭제 대상 */
  cutoff: string;
  dryRun: boolean;
  /** 삭제 대상 계정 수. 실제 실행이면 삭제된 수와 같다. */
  staleAccounts: number;
  /** dry-run이면 항상 0 */
  deletedAccounts: number;
  /** 함께 지운 감사 로그 행(FK가 없어 cascade에 안 걸린다). dry-run이면 0 */
  deletedAuthEvents: number;
};

/**
 * 최소 나이를 넘긴 E2E 일회용 계정을 삭제한다.
 *
 * 옵션을 주지 않으면 `E2E_ACCOUNT_MIN_AGE_HOURS` / `E2E_ACCOUNT_CLEANUP_DRY_RUN`을 읽는다.
 * @throws {E2eAccountCleanupForbiddenSchemaError} `DB_SCHEMA`가 "dev"가 아닐 때
 */
export async function cleanupE2eAccounts(options?: {
  minAgeHours?: number;
  dryRun?: boolean;
  now?: Date;
}): Promise<E2eAccountCleanupResult> {
  const schema = (process.env.DB_SCHEMA ?? "").trim();
  if (!isE2eAccountCleanupAllowedSchema(schema)) {
    throw new E2eAccountCleanupForbiddenSchemaError(schema);
  }

  const minAgeHours =
    options?.minAgeHours ?? resolveE2eAccountMinAgeHours(process.env.E2E_ACCOUNT_MIN_AGE_HOURS);
  const dryRun =
    options?.dryRun ?? resolveE2eAccountCleanupDryRun(process.env.E2E_ACCOUNT_CLEANUP_DRY_RUN);
  const cutoff = e2eAccountCleanupCutoff(options?.now ?? new Date(), minAgeHours);
  const base = { minAgeHours, cutoff: cutoff.toISOString(), dryRun };

  // 술어 셋을 모두 만족해야 대상이다. role을 함께 보는 것은 임퍼소네이션 센티널·관리자가
  // 이 도메인으로 만들어지는 날이 와도 쓸려나가지 않게 하기 위한 것이다.
  const target = and(
    sql`lower(${appUser.email}) like ${`%${E2E_EMAIL_SUFFIX}`}`,
    eq(appUser.role, "user"),
    lt(appUser.createdAt, cutoff),
  );

  if (dryRun) {
    const rows = await db.select({ value: count() }).from(appUser).where(target);
    return { ...base, staleAccounts: rows[0]?.value ?? 0, deletedAccounts: 0, deletedAuthEvents: 0 };
  }

  const ids = (await db.select({ id: appUser.id }).from(appUser).where(target)).map((r) => r.id);
  if (ids.length === 0) {
    return { ...base, staleAccounts: 0, deletedAccounts: 0, deletedAuthEvents: 0 };
  }

  // 배치로 나눈다 — 계정 하나가 15개 테이블로 cascade하므로 한 문장에 다 넣으면
  // 원격 인스턴스에서 트랜잭션이 지나치게 길어진다.
  let deletedAccounts = 0;
  let deletedAuthEvents = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const events = await db.delete(authEventLog).where(inArray(authEventLog.userId, batch));
    deletedAuthEvents += (events as { rowCount?: number | null })?.rowCount ?? 0;
    const users = await db.delete(appUser).where(inArray(appUser.id, batch));
    deletedAccounts += (users as { rowCount?: number | null })?.rowCount ?? 0;
  }

  return { ...base, staleAccounts: ids.length, deletedAccounts, deletedAuthEvents };
}
