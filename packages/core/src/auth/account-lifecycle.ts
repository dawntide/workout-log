import { eq, sql } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { accountDeletionTombstone, appUser } from "@workout/core/db/schema";

type TransactionExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

function accountLockKey(userId: string) {
  return `workout-account:${userId}`;
}

function isExplicitLocalDevFallback(userId: string) {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.WORKOUT_API_ALLOW_ENV_AUTH === "1" &&
    (process.env.WORKOUT_AUTH_USER_ID ?? "").trim() === userId
  );
}

export class AccountNoLongerActiveError extends Error {
  constructor() {
    super("Account is no longer active");
    this.name = "UnauthorizedError";
  }
}

/**
 * Shared side of the account lifecycle barrier. Every durable user mutation
 * that can overlap account deletion takes this inside its transaction and then
 * rechecks app_user. A deletion that won the exclusive side therefore makes a
 * late, previously-authenticated write fail instead of recreating orphan data.
 */
export async function acquireActiveAccountMutationLock(
  tx: TransactionExecutor,
  userId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(hashtext(${accountLockKey(userId)}))`,
  );
  const deletedRows = await tx
    .select({ userHash: accountDeletionTombstone.userHash })
    .from(accountDeletionTombstone)
    .where(sql`${accountDeletionTombstone.userHash} = md5(${userId.trim()})`)
    .limit(1);
  if (deletedRows[0]) throw new AccountNoLongerActiveError();
  if (isExplicitLocalDevFallback(userId)) return;
  const rows = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  if (!rows[0]) throw new AccountNoLongerActiveError();
}

/** Exclusive side used as the first statement of an account-delete tx. */
export async function acquireAccountDeletionLock(
  tx: TransactionExecutor,
  userId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${accountLockKey(userId)}))`,
  );
}

/** Must run immediately after the exclusive lock and before cleanup writes. */
export async function recordAccountDeletionTombstone(
  tx: TransactionExecutor,
  userId: string,
) {
  await tx
    .insert(accountDeletionTombstone)
    .values({ userHash: sql`md5(${userId.trim()})` })
    .onConflictDoNothing({ target: accountDeletionTombstone.userHash });
}
