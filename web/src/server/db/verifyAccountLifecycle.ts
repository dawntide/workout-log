import "dotenv/config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { eq, inArray, sql } from "drizzle-orm";

import {
  AccountNoLongerActiveError,
  acquireAccountDeletionLock,
  acquireActiveAccountMutationLock,
  recordAccountDeletionTombstone,
} from "@workout/core/auth/account-lifecycle";
import { db } from "@workout/core/db/client";
import {
  accountDeletionTombstone,
  appUser,
  userSetting,
} from "@workout/core/db/schema";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const STAGE_TIMEOUT_MS = 15_000;

function waitForStage<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = STAGE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function forwardPreCallbackFailure<T, TStage>(
  transaction: Promise<T>,
  stage: Deferred<TStage>,
) {
  void transaction.catch((error: unknown) => {
    stage.reject(error);
  });
}

function deletionHash(userId: string) {
  return createHash("md5").update(userId.trim()).digest("hex");
}

function isDeletedAccountWriteError(error: unknown) {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (
      record.code === "23503" &&
      String(record.message ?? "").includes("account is no longer active")
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function isInactiveAccountHelperError(error: unknown) {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    if (current instanceof AccountNoLongerActiveError) return true;
    seen.add(current);
    current = (current as Record<string, unknown>).cause;
  }
  return false;
}

async function insertUser(userId: string, marker: string, label: string) {
  await db.insert(appUser).values({
    id: userId,
    email: `account-lifecycle-${label}-${marker}@example.invalid`,
    passwordHash: "ci-integration-test-only",
    displayName: `Account lifecycle ${label}`,
  });
}

async function waitForAdvisoryLockWait(pid: number, label: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await waitForStage(
      db.execute(sql`
        select exists (
          select 1
          from "pg_locks"
          where "pid" = ${pid}
            and "locktype" = 'advisory'
            and not "granted"
        ) as "waiting"
      `),
      `${label} pg_locks observation`,
      1_000,
    );
    if (result.rows[0]?.waiting === true) return;
    await delay(20);
  }
  throw new Error(`${label} backend ${pid} did not wait on the advisory lock`);
}

function assertFulfilled(
  result: PromiseSettledResult<unknown>,
  label: string,
): asserts result is PromiseFulfilledResult<unknown> {
  if (result.status === "rejected") {
    throw new Error(`${label} transaction failed`, { cause: result.reason });
  }
}

function assertRejected(
  result: PromiseSettledResult<unknown>,
  predicate: (reason: unknown) => boolean,
  label: string,
): asserts result is PromiseRejectedResult {
  if (result.status !== "rejected") {
    throw new Error(`${label} unexpectedly succeeded`);
  }
  if (!predicate(result.reason)) {
    throw new Error(`${label} failed for the wrong reason`, {
      cause: result.reason,
    });
  }
}

async function verifyMutationFirst(input: {
  userId: string;
  settingId: string;
  marker: string;
}) {
  await insertUser(input.userId, input.marker, "mutation-first");

  const mutationReady = deferred<void>();
  const releaseMutation = deferred<void>();
  const deletionReady = deferred<number>();
  let deletionAcquired = false;

  const mutation = db.transaction(async (tx) => {
    try {
      await acquireActiveAccountMutationLock(tx, input.userId);
      await tx.insert(userSetting).values({
        id: input.settingId,
        userId: input.userId,
        key: `ci-mutation-first-${input.marker}`,
        value: { scenario: "mutation-first" },
      });
      mutationReady.resolve(undefined);
      await waitForStage(
        releaseMutation.promise,
        "mutation-first release signal",
      );
    } catch (error) {
      mutationReady.reject(error);
      throw error;
    }
  });
  forwardPreCallbackFailure(mutation, mutationReady);

  try {
    await waitForStage(mutationReady.promise, "mutation-first readiness");
  } catch (error) {
    releaseMutation.resolve(undefined);
    await waitForStage(
      Promise.allSettled([mutation]),
      "mutation-first failed transaction settlement",
    );
    throw error;
  }

  const deletion = db.transaction(async (tx) => {
    try {
      await tx.execute(sql`set local lock_timeout = '10s'`);
      const pidResult = await tx.execute(
        sql`select pg_backend_pid()::int as "pid"`,
      );
      const pid = Number(pidResult.rows[0]?.pid);
      assert.ok(Number.isInteger(pid) && pid > 0, "invalid deletion backend PID");
      deletionReady.resolve(pid);

      await acquireAccountDeletionLock(tx, input.userId);
      deletionAcquired = true;
      await recordAccountDeletionTombstone(tx, input.userId);
      await tx.delete(userSetting).where(eq(userSetting.userId, input.userId));
      await tx.delete(appUser).where(eq(appUser.id, input.userId));
    } catch (error) {
      deletionReady.reject(error);
      throw error;
    }
  });
  forwardPreCallbackFailure(deletion, deletionReady);

  let observationError: unknown;
  try {
    const deletionPid = await waitForStage(
      deletionReady.promise,
      "mutation-first deletion PID",
    );
    await waitForAdvisoryLockWait(deletionPid, "mutation-first deletion");
    assert.equal(
      deletionAcquired,
      false,
      "exclusive deletion lock bypassed an active shared mutation lock",
    );
  } catch (error) {
    observationError = error;
  } finally {
    releaseMutation.resolve(undefined);
  }

  const [mutationResult, deletionResult] = await waitForStage(
    Promise.allSettled([mutation, deletion]),
    "mutation-first transaction settlement",
  );
  if (observationError) throw observationError;
  assertFulfilled(mutationResult, "shared mutation");
  assertFulfilled(deletionResult, "exclusive deletion");
  assert.equal(deletionAcquired, true, "deletion never acquired its lock");

  const [settings, users, tombstones] = await Promise.all([
    db
      .select({ id: userSetting.id })
      .from(userSetting)
      .where(eq(userSetting.userId, input.userId)),
    db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, input.userId)),
    db
      .select({ userHash: accountDeletionTombstone.userHash })
      .from(accountDeletionTombstone)
      .where(eq(accountDeletionTombstone.userHash, deletionHash(input.userId))),
  ]);
  assert.equal(settings.length, 0, "deletion left a mutation-first setting behind");
  assert.equal(users.length, 0, "deletion left the mutation-first user behind");
  assert.equal(tombstones.length, 1, "deletion did not persist its tombstone");
}

type HeldDeletion = {
  ready: Deferred<void>;
  release: Deferred<void>;
  transaction: Promise<void>;
};

function startHeldDeletion(userId: string, label: string): HeldDeletion {
  const ready = deferred<void>();
  const release = deferred<void>();
  const transaction = db.transaction(async (tx) => {
    try {
      await tx.execute(sql`set local lock_timeout = '10s'`);
      await acquireAccountDeletionLock(tx, userId);
      await recordAccountDeletionTombstone(tx, userId);
      await tx.delete(userSetting).where(eq(userSetting.userId, userId));
      await tx.delete(appUser).where(eq(appUser.id, userId));
      ready.resolve(undefined);
      await waitForStage(
        release.promise,
        `${label} deletion release signal`,
        30_000,
      );
    } catch (error) {
      ready.reject(error);
      throw error;
    }
  });
  forwardPreCallbackFailure(transaction, ready);
  return { ready, release, transaction };
}

async function waitForHeldDeletion(deletion: HeldDeletion, label: string) {
  try {
    await waitForStage(deletion.ready.promise, `${label} deletion readiness`);
  } catch (error) {
    deletion.release.resolve(undefined);
    await waitForStage(
      Promise.allSettled([deletion.transaction]),
      `${label} failed deletion settlement`,
    );
    throw error;
  }
}

async function verifyHelperWaitsForDeletion(input: {
  userId: string;
  marker: string;
}) {
  await insertUser(input.userId, input.marker, "helper-wait");

  const deletion = startHeldDeletion(input.userId, "helper-wait");
  await waitForHeldDeletion(deletion, "helper-wait");

  const helperPidReady = deferred<number>();
  let helperPassedBarrier = false;
  const helper = db.transaction(async (tx) => {
    try {
      await tx.execute(sql`set local lock_timeout = '10s'`);
      const pidResult = await tx.execute(
        sql`select pg_backend_pid()::int as "pid"`,
      );
      const pid = Number(pidResult.rows[0]?.pid);
      assert.ok(Number.isInteger(pid) && pid > 0, "invalid helper backend PID");
      helperPidReady.resolve(pid);

      await acquireActiveAccountMutationLock(tx, input.userId);
      helperPassedBarrier = true;
    } catch (error) {
      helperPidReady.reject(error);
      throw error;
    }
  });
  forwardPreCallbackFailure(helper, helperPidReady);

  let observationError: unknown;
  try {
    const helperPid = await waitForStage(
      helperPidReady.promise,
      "helper-wait backend PID",
    );
    await waitForAdvisoryLockWait(helperPid, "helper-only mutation");
    assert.equal(
      helperPassedBarrier,
      false,
      "helper bypassed the deletion transaction's exclusive lock",
    );
  } catch (error) {
    observationError = error;
  } finally {
    deletion.release.resolve(undefined);
  }

  const [deletionResult, helperResult] = await waitForStage(
    Promise.allSettled([deletion.transaction, helper]),
    "helper-wait transaction settlement",
  );
  if (observationError) throw observationError;
  assertFulfilled(deletionResult, "helper-wait deletion");
  assertRejected(
    helperResult,
    isInactiveAccountHelperError,
    "helper after deletion commit",
  );
  assert.equal(
    helperPassedBarrier,
    false,
    "helper accepted the tombstoned account after waiting",
  );

  const [users, tombstones] = await Promise.all([
    db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, input.userId)),
    db
      .select({ userHash: accountDeletionTombstone.userHash })
      .from(accountDeletionTombstone)
      .where(eq(accountDeletionTombstone.userHash, deletionHash(input.userId))),
  ]);
  assert.equal(users.length, 0, "helper-wait user still exists");
  assert.equal(tombstones.length, 1, "helper-wait tombstone is missing");
}

async function verifyTriggerWaitsForDeletion(input: {
  userId: string;
  carrierUserId: string;
  carrierSettingId: string;
  rejectedInsertId: string;
  marker: string;
}) {
  await insertUser(input.userId, input.marker, "trigger-wait");
  await insertUser(input.carrierUserId, input.marker, "update-carrier");
  await db.insert(userSetting).values({
    id: input.carrierSettingId,
    userId: input.carrierUserId,
    key: `ci-update-carrier-${input.marker}`,
    value: { scenario: "update-carrier" },
  });

  const deletion = startHeldDeletion(input.userId, "trigger-wait");
  await waitForHeldDeletion(deletion, "trigger-wait");

  const triggerPidReady = deferred<number>();
  let rawInsertCompleted = false;
  const rawInsert = db.transaction(async (tx) => {
    try {
      await tx.execute(sql`set local lock_timeout = '10s'`);
      const pidResult = await tx.execute(
        sql`select pg_backend_pid()::int as "pid"`,
      );
      const pid = Number(pidResult.rows[0]?.pid);
      assert.ok(Number.isInteger(pid) && pid > 0, "invalid trigger backend PID");
      triggerPidReady.resolve(pid);

      await tx.execute(sql`
        insert into ${userSetting} (
          "id",
          "user_id",
          "key",
          "value"
        ) values (
          ${input.rejectedInsertId}::uuid,
          ${input.userId},
          ${`ci-rejected-insert-${input.marker}`},
          ${JSON.stringify({ scenario: "rejected-insert" })}::jsonb
        )
      `);
      rawInsertCompleted = true;
    } catch (error) {
      triggerPidReady.reject(error);
      throw error;
    }
  });
  forwardPreCallbackFailure(rawInsert, triggerPidReady);

  let observationError: unknown;
  try {
    const triggerPid = await waitForStage(
      triggerPidReady.promise,
      "trigger-wait backend PID",
    );
    await waitForAdvisoryLockWait(triggerPid, "raw trigger-only write");
    assert.equal(
      rawInsertCompleted,
      false,
      "raw write bypassed the deletion transaction's exclusive lock",
    );
  } catch (error) {
    observationError = error;
  } finally {
    deletion.release.resolve(undefined);
  }

  const [deletionResult, rawInsertResult] = await waitForStage(
    Promise.allSettled([deletion.transaction, rawInsert]),
    "trigger-wait transaction settlement",
  );
  if (observationError) throw observationError;
  assertFulfilled(deletionResult, "trigger-wait deletion");
  assertRejected(
    rawInsertResult,
    isDeletedAccountWriteError,
    "raw trigger-only write after deletion commit",
  );
  assert.equal(
    rawInsertCompleted,
    false,
    "raw trigger-only write committed for the tombstoned account",
  );

  await assert.rejects(
    () =>
      waitForStage(
        db.execute(sql`
          update ${userSetting}
          set "user_id" = ${input.userId}
          where "id" = ${input.carrierSettingId}::uuid
        `),
        "post-deletion trigger UPDATE",
      ),
    isDeletedAccountWriteError,
    "the database trigger accepted an UPDATE into a tombstoned account",
  );

  const [orphanedSettings, deletedUsers, carrierSettings, tombstones] =
    await Promise.all([
      db
        .select({ id: userSetting.id })
        .from(userSetting)
        .where(eq(userSetting.userId, input.userId)),
      db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, input.userId)),
      db
        .select({ userId: userSetting.userId })
        .from(userSetting)
        .where(eq(userSetting.id, input.carrierSettingId)),
      db
        .select({ userHash: accountDeletionTombstone.userHash })
        .from(accountDeletionTombstone)
        .where(eq(accountDeletionTombstone.userHash, deletionHash(input.userId))),
    ]);
  assert.equal(orphanedSettings.length, 0, "late writes created an orphan setting");
  assert.equal(deletedUsers.length, 0, "trigger-wait user still exists");
  assert.deepEqual(
    carrierSettings,
    [{ userId: input.carrierUserId }],
    "the rejected UPDATE changed its carrier row",
  );
  assert.equal(tombstones.length, 1, "trigger-wait tombstone is missing");
}

async function cleanup(userIds: string[], tombstonedUserIds: string[]) {
  const hashes = tombstonedUserIds.map(deletionHash);
  await db.delete(userSetting).where(inArray(userSetting.userId, userIds));
  await db.delete(appUser).where(inArray(appUser.id, userIds));
  await db
    .delete(accountDeletionTombstone)
    .where(inArray(accountDeletionTombstone.userHash, hashes));

  const [settings, users, tombstones] = await Promise.all([
    db
      .select({ id: userSetting.id })
      .from(userSetting)
      .where(inArray(userSetting.userId, userIds)),
    db.select({ id: appUser.id }).from(appUser).where(inArray(appUser.id, userIds)),
    db
      .select({ userHash: accountDeletionTombstone.userHash })
      .from(accountDeletionTombstone)
      .where(inArray(accountDeletionTombstone.userHash, hashes)),
  ]);
  assert.equal(settings.length, 0, "cleanup left test settings behind");
  assert.equal(users.length, 0, "cleanup left test users behind");
  assert.equal(tombstones.length, 0, "cleanup left test tombstones behind");
}

async function main() {
  const configuredStatementTimeout = Number(
    process.env.DB_STATEMENT_TIMEOUT_MS ?? 0,
  );
  if (
    !Number.isFinite(configuredStatementTimeout) ||
    configuredStatementTimeout <= 0 ||
    configuredStatementTimeout > 30_000
  ) {
    process.env.DB_STATEMENT_TIMEOUT_MS = "30000";
  }

  const marker = randomUUID();
  const mutationFirstUserId = randomUUID();
  const helperWaitUserId = randomUUID();
  const triggerWaitUserId = randomUUID();
  const carrierUserId = randomUUID();
  const userIds = [
    mutationFirstUserId,
    helperWaitUserId,
    triggerWaitUserId,
    carrierUserId,
  ];
  const tombstonedUserIds = [
    mutationFirstUserId,
    helperWaitUserId,
    triggerWaitUserId,
  ];

  try {
    await verifyMutationFirst({
      userId: mutationFirstUserId,
      settingId: randomUUID(),
      marker,
    });
    await verifyHelperWaitsForDeletion({
      userId: helperWaitUserId,
      marker,
    });
    await verifyTriggerWaitsForDeletion({
      userId: triggerWaitUserId,
      carrierUserId,
      carrierSettingId: randomUUID(),
      rejectedInsertId: randomUUID(),
      marker,
    });
    console.log("[verify] account lifecycle barrier ok");
  } finally {
    await waitForStage(
      cleanup(userIds, tombstonedUserIds),
      "account lifecycle cleanup",
      35_000,
    );
  }
}

main()
  .catch((error) => {
    console.error("[verify] account lifecycle barrier failed", error);
    process.exitCode = 1;
  })
  .then(async () => {
    if (!global.__dbPool) return;
    await waitForStage(
      global.__dbPool.end(),
      "account lifecycle pool shutdown",
      5_000,
    );
  })
  .catch((error) => {
    console.error("[verify] account lifecycle pool shutdown failed", error);
    process.exitCode = 1;
  });
