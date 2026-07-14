import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { Client, type QueryResultRow } from "pg";

import { db } from "@workout/core/db/client";
import {
  appUser,
  workoutLog,
  workoutSet,
} from "@workout/core/db/schema";
import {
  upsertWorkoutLogService,
  WorkoutLogIdempotencyConflictError,
  type UpsertWorkoutLogInput,
} from "@workout/core/services/workout-log/upsert-log";

const STAGE_TIMEOUT_MS = 10_000;
const OBSERVATION_INTERVAL_MS = 20;

type BackendActivity = QueryResultRow & {
  pid: number;
  waitEventType: string | null;
  waitEvent: string | null;
  query: string;
};

type ConcurrentResult = Awaited<ReturnType<typeof upsertWorkoutLogService>>;

function timeoutAfter<T>(promise: Promise<T>, label: string, timeoutMs = STAGE_TIMEOUT_MS) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function wait(intervalMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, intervalMs);
  });
}

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is not set");
  return value;
}

function qualifiedTable(table: "workout_log" | "workout_set") {
  const schema = process.env.DB_SCHEMA?.trim();
  if (!schema) return `"${table}"`;
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(schema)) {
    throw new Error(`DB_SCHEMA is not a safe PostgreSQL identifier: ${schema}`);
  }
  return `"${schema}"."${table}"`;
}

function controlClient(role: string, marker: string) {
  return new Client({
    connectionString: databaseUrl(),
    application_name: `workout-idempotency-${role}-${marker.slice(0, 8)}`,
    connectionTimeoutMillis: 5_000,
    statement_timeout: STAGE_TIMEOUT_MS,
    query_timeout: STAGE_TIMEOUT_MS,
    keepAlive: true,
  });
}

async function configureControlClient(client: Client) {
  await client.query("set lock_timeout to '5s'");
  await client.query("set idle_in_transaction_session_timeout to '30s'");
}

function insertsInto(query: string, table: "workout_log" | "workout_set") {
  const target = new RegExp(
    `insert\\s+into\\s+(?:"[^"]+"\\.)?"${table}"`,
    "i",
  );
  return target.test(query);
}

async function readMutationBackends(observer: Client, userId: string) {
  const accountLockKey = `workout-account:${userId}`;
  const result = await observer.query<BackendActivity>(
    `select
       activity.pid::integer as "pid",
       activity.wait_event_type as "waitEventType",
       activity.wait_event as "waitEvent",
       activity.query
     from pg_stat_activity activity
     where activity.datname = current_database()
       and exists (
         select 1
         from pg_locks advisory
         where advisory.pid = activity.pid
           and advisory.locktype = 'advisory'
           and advisory.mode = 'ShareLock'
           and advisory.granted
           and advisory.objsubid = 1
           and advisory.classid::bigint =
             ((hashtext($1)::bigint >> 32) & 4294967295::bigint)
           and advisory.objid::bigint =
             (hashtext($1)::bigint & 4294967295::bigint)
       )
     order by activity.pid`,
    [accountLockKey],
  );
  return result.rows;
}

async function observeUntil<T extends object>(input: {
  observer: Client;
  userId: string;
  label: string;
  match: (rows: BackendActivity[]) => T | null;
}) {
  const deadline = Date.now() + STAGE_TIMEOUT_MS;
  let lastRows: BackendActivity[] = [];
  while (Date.now() < deadline) {
    lastRows = await timeoutAfter(
      readMutationBackends(input.observer, input.userId),
      `${input.label} observation query`,
      Math.min(2_000, Math.max(1, deadline - Date.now())),
    );
    const matched = input.match(lastRows);
    if (matched) return matched;
    await wait(OBSERVATION_INTERVAL_MS);
  }
  throw new Error(
    `${input.label} was not observed: ${JSON.stringify(
      lastRows.map(({ pid, waitEventType, waitEvent, query }) => ({
        pid,
        waitEventType,
        waitEvent,
        query,
      })),
    )}`,
  );
}

async function releaseGate(client: Client, open: boolean) {
  if (!open) return;
  await timeoutAfter(client.query("rollback"), "gate rollback", 3_000).catch(
    () => undefined,
  );
}

async function endControlClient(client: Client) {
  await timeoutAfter(client.end(), "control client shutdown", 3_000).catch(
    () => undefined,
  );
}

async function mutationRows(userId: string, clientMutationId: string) {
  return db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(
      and(
        eq(workoutLog.userId, userId),
        eq(workoutLog.clientMutationId, clientMutationId),
      ),
    );
}

async function assertSingleMutationRow(input: {
  userId: string;
  clientMutationId: string;
  expectedLogId: string;
}) {
  const rows = await mutationRows(input.userId, input.clientMutationId);
  assert.equal(rows.length, 1, `${input.clientMutationId}: expected exactly one row`);
  assert.equal(rows[0]?.id, input.expectedLogId);
}

async function cleanupVerificationUser(userId: string) {
  const ownedLogs = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(eq(workoutLog.userId, userId));
  const ownedLogIds = ownedLogs.map((row) => row.id);

  if (ownedLogIds.length > 0) {
    await db.delete(workoutSet).where(inArray(workoutSet.logId, ownedLogIds));
  }
  await db.delete(workoutLog).where(eq(workoutLog.userId, userId));
  await db.delete(appUser).where(eq(appUser.id, userId));

  if (ownedLogIds.length > 0) {
    const remainingSets = await db
      .select({ id: workoutSet.id })
      .from(workoutSet)
      .where(inArray(workoutSet.logId, ownedLogIds));
    assert.equal(remainingSets.length, 0, "cleanup left workout sets behind");
  }
  const [remainingLogs, remainingUsers] = await Promise.all([
    db
      .select({ id: workoutLog.id })
      .from(workoutLog)
      .where(eq(workoutLog.userId, userId)),
    db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, userId)),
  ]);
  assert.equal(remainingLogs.length, 0, "cleanup left workout logs behind");
  assert.equal(remainingUsers.length, 0, "cleanup left the test user behind");
}

/**
 * A SHARE lock lets both prior-row SELECTs pass but holds both service
 * transactions at workout_log INSERT. After observing both backends there, the
 * log gate opens while a second gate holds the winner at workout_set INSERT.
 * The losing INSERT must then expose its unique-index transaction wait.
 */
async function verifyConcurrentUniqueInsertRace(input: {
  marker: string;
  userId: string;
  serviceInput: UpsertWorkoutLogInput;
}): Promise<[ConcurrentResult, ConcurrentResult]> {
  const configuredPoolMax = Number(process.env.DB_POOL_MAX ?? 5);
  if (Number.isFinite(configuredPoolMax) && configuredPoolMax > 0) {
    assert.ok(
      configuredPoolMax >= 2,
      "the concurrency verifier requires DB_POOL_MAX >= 2",
    );
  }

  const logGate = controlClient("log-gate", input.marker);
  const setGate = controlClient("set-gate", input.marker);
  const observer = controlClient("observer", input.marker);
  let logGateOpen = false;
  let setGateOpen = false;
  let settledRequests:
    | Promise<PromiseSettledResult<ConcurrentResult>[]>
    | undefined;

  try {
    await timeoutAfter(
      Promise.all([logGate.connect(), setGate.connect(), observer.connect()]),
      "control client connections",
    );
    await timeoutAfter(
      Promise.all([
        configureControlClient(logGate),
        configureControlClient(setGate),
        configureControlClient(observer),
      ]),
      "control client configuration",
    );

    await timeoutAfter(logGate.query("begin"), "workout_log gate begin");
    logGateOpen = true;
    await timeoutAfter(
      logGate.query(`lock table ${qualifiedTable("workout_log")} in share mode`),
      "workout_log gate lock",
    );

    await timeoutAfter(setGate.query("begin"), "workout_set gate begin");
    setGateOpen = true;
    await timeoutAfter(
      setGate.query(`lock table ${qualifiedTable("workout_set")} in share mode`),
      "workout_set gate lock",
    );

    const requests = [
      Promise.resolve().then(() => upsertWorkoutLogService(input.serviceInput)),
      Promise.resolve().then(() => upsertWorkoutLogService(input.serviceInput)),
    ] as const;
    settledRequests = Promise.allSettled(requests);

    const reachedInsert = await observeUntil({
      observer,
      userId: input.userId,
      label: "both requests waiting at workout_log INSERT",
      match: (rows) => {
        const waiters = rows.filter(
          (row) =>
            row.waitEventType === "Lock" &&
            row.waitEvent?.toLowerCase() === "relation" &&
            insertsInto(row.query, "workout_log"),
        );
        return new Set(waiters.map((row) => row.pid)).size === 2
          ? { waiters }
          : null;
      },
    });
    const insertingPids = new Set(reachedInsert.waiters.map((row) => row.pid));
    assert.equal(
      insertingPids.size,
      2,
      "both service backends must reach the INSERT before releasing the gate",
    );

    await timeoutAfter(logGate.query("commit"), "workout_log gate release");
    logGateOpen = false;

    const uniqueRace = await observeUntil({
      observer,
      userId: input.userId,
      label: "unique-index conflict wait",
      match: (rows) => {
        const winner = rows.find(
          (row) =>
            row.waitEventType === "Lock" &&
            row.waitEvent?.toLowerCase() === "relation" &&
            insertsInto(row.query, "workout_set"),
        );
        const contender = rows.find(
          (row) =>
            row.waitEventType === "Lock" &&
            ["transactionid", "spectoken"].includes(
              row.waitEvent?.toLowerCase() ?? "",
            ) &&
            insertsInto(row.query, "workout_log"),
        );
        if (!winner || !contender || winner.pid === contender.pid) return null;
        if (!insertingPids.has(winner.pid) || !insertingPids.has(contender.pid)) {
          return null;
        }
        return { winner, contender };
      },
    });

    console.log(
      `[verify] observed unique-index race: winner pid ${uniqueRace.winner.pid} held before workout_set INSERT; contender pid ${uniqueRace.contender.pid} waited on ${uniqueRace.contender.waitEvent}`,
    );

    await timeoutAfter(setGate.query("commit"), "workout_set gate release");
    setGateOpen = false;

    const settled = await timeoutAfter(
      settledRequests,
      "concurrent idempotency requests",
    );
    const [first, second] = settled;
    if (first.status === "rejected") throw first.reason;
    if (second.status === "rejected") throw second.reason;
    return [first.value, second.value];
  } finally {
    await Promise.allSettled([
      releaseGate(logGate, logGateOpen),
      releaseGate(setGate, setGateOpen),
    ]);
    await Promise.allSettled([
      endControlClient(logGate),
      endControlClient(setGate),
    ]);
    if (settledRequests) {
      await timeoutAfter(
        settledRequests,
        "concurrent requests after gate cleanup",
      ).catch(() => undefined);
    }
    await endControlClient(observer);
  }
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
  const userId = randomUUID();
  const sequentialKey = `verify-sequential-${marker}`;
  const concurrentKey = `verify-concurrent-${marker}`;
  const performedAt = new Date("2026-07-14T12:34:56.000Z");
  let userCreated = false;

  const baseInput: Omit<UpsertWorkoutLogInput, "clientMutationId"> = {
    userId,
    timezone: "UTC",
    locale: "en",
    performedAt,
    durationMinutes: 45,
    notes: `idempotency verification ${marker}`,
    tags: ["ci", "idempotency"],
    sets: [
      {
        exerciseName: `Idempotency Verification ${marker}`,
        setNumber: 1,
        reps: 5,
        weightKg: 100,
        rpe: 7,
        isExtra: false,
        meta: { source: "verifyWorkoutLogIdempotency" },
      },
    ],
  };

  try {
    await db.insert(appUser).values({
      id: userId,
      email: `idempotency-${marker}@example.invalid`,
      passwordHash: "ci-integration-test-only",
      displayName: "Idempotency CI verifier",
    });
    userCreated = true;

    const sequentialInput = {
      ...baseInput,
      clientMutationId: sequentialKey,
    };
    const sequentialFirst = await upsertWorkoutLogService(sequentialInput);
    const sequentialRetry = await upsertWorkoutLogService(sequentialInput);

    assert.equal(
      sequentialRetry.log.id,
      sequentialFirst.log.id,
      "sequential retry must return the original log ID",
    );
    await assertSingleMutationRow({
      userId,
      clientMutationId: sequentialKey,
      expectedLogId: sequentialFirst.log.id,
    });

    await assert.rejects(
      () =>
        upsertWorkoutLogService({
          ...sequentialInput,
          notes: `${baseInput.notes} changed`,
        }),
      (error: unknown) => error instanceof WorkoutLogIdempotencyConflictError,
      "reusing a key for a different payload must raise an idempotency conflict",
    );
    await assertSingleMutationRow({
      userId,
      clientMutationId: sequentialKey,
      expectedLogId: sequentialFirst.log.id,
    });

    const concurrentInput = {
      ...baseInput,
      clientMutationId: concurrentKey,
    };
    const concurrentResults = await verifyConcurrentUniqueInsertRace({
      marker,
      userId,
      serviceInput: concurrentInput,
    });

    assert.equal(
      concurrentResults[1]?.log.id,
      concurrentResults[0]?.log.id,
      "concurrent retries must return the same log ID",
    );
    await assertSingleMutationRow({
      userId,
      clientMutationId: concurrentKey,
      expectedLogId: concurrentResults[0]!.log.id,
    });

    console.log("[verify] workout log idempotency ok");
  } finally {
    if (userCreated) {
      await timeoutAfter(
        cleanupVerificationUser(userId),
        "verification row cleanup",
      );
    }
  }
}

main()
  .catch((error) => {
    console.error("[verify] workout log idempotency failed", error);
    process.exitCode = 1;
  })
  .then(async () => {
    if (!global.__dbPool) return;
    await timeoutAfter(global.__dbPool.end(), "database pool shutdown", 5_000);
  })
  .catch((error) => {
    console.error("[verify] workout log idempotency pool shutdown failed", error);
    process.exitCode = 1;
  });
