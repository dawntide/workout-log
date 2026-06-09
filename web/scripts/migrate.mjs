import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { config as loadDotenv } from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

function preloadEnvFile(relativePath, originalEnvKeys) {
  const absolutePath = path.join(projectRoot, relativePath);
  const result = loadDotenv({ path: absolutePath, processEnv: {}, quiet: true });
  if (result.error || !result.parsed) return;

  for (const [key, value] of Object.entries(result.parsed)) {
    if (originalEnvKeys.has(key)) continue;
    process.env[key] = value;
  }
}

const originalEnvKeys = new Set(Object.keys(process.env));
preloadEnvFile(".env", originalEnvKeys);
preloadEnvFile(".env.local", originalEnvKeys);

const migrateEnabled = process.env.DB_MIGRATE_ENABLED !== "0";
const connectionString = process.env.DATABASE_URL;

// DB_SCHEMA가 설정되면(예: "dev") 해당 스키마 전용 마이그레이션 폴더/추적 테이블을
// 쓴다. drizzle.config.ts와 동일한 규칙이어야 drizzle-kit/이 스크립트가 같은 이력을 본다.
const dbSchema = (process.env.DB_SCHEMA ?? "").trim() || null;
const migrationsFolder = dbSchema
  ? `./src/server/db/migrations-${dbSchema}`
  : "./src/server/db/migrations";
const migrationsSchema = dbSchema ? `drizzle_${dbSchema}` : "drizzle";

if (!migrateEnabled) {
  console.log("[migrate] DB_MIGRATE_ENABLED=0, skipping migrations");
  process.exit(0);
}

if (!connectionString) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

const maxAttempts = parsePositiveInt(process.env.DB_MIGRATE_MAX_ATTEMPTS, 30);
const delayMs = parsePositiveInt(process.env.DB_MIGRATE_RETRY_DELAY_MS, 2000);
// Bound each connection attempt so an unreachable DB fails fast instead of
// hanging on the OS TCP timeout (~133s per attempt) across every retry.
const connectTimeoutMs = parsePositiveInt(process.env.DB_MIGRATE_CONNECT_TIMEOUT_MS, 10000);
const useAdvisoryLock = process.env.DB_MIGRATE_USE_ADVISORY_LOCK !== "0";
const advisoryLockId = parsePositiveInt(process.env.DB_MIGRATE_LOCK_ID, 872341);
const advisoryLockMaxWaitMs = parsePositiveInt(process.env.DB_MIGRATE_LOCK_MAX_WAIT_MS, 180000);
const advisoryLockPollMs = parsePositiveInt(process.env.DB_MIGRATE_LOCK_POLL_MS, 1500);
const telemetryEnabled = process.env.DB_MIGRATE_TELEMETRY_ENABLED !== "0";
const migrateRunner = (process.env.DB_MIGRATE_RUNNER ?? "default-runner").trim() || "default-runner";
const migrateHost = (process.env.HOSTNAME ?? os.hostname() ?? "").trim() || null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class MigrationLockTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationLockTimeoutError";
  }
}

function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function toErrorCode(error) {
  if (!error || typeof error !== "object") return null;
  if (typeof error.code === "string" && error.code) return error.code;
  const cause = error.cause;
  if (cause && typeof cause === "object" && typeof cause.code === "string" && cause.code) {
    return cause.code;
  }
  return null;
}

async function waitForDatabase(pool) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      console.log(`[migrate] database not ready (${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }
}

async function ensureTelemetryTable(pool) {
  await pool.query(`
    create table if not exists migration_run_log (
      id bigserial primary key,
      run_id text not null,
      runner text not null,
      host text,
      status text not null,
      error_code text,
      message text,
      started_at timestamp with time zone not null default now(),
      finished_at timestamp with time zone,
      lock_wait_ms integer not null default 0,
      details jsonb not null default '{}'::jsonb
    )
  `);
  await pool.query(`
    create unique index if not exists migration_run_log_run_id_uq
      on migration_run_log (run_id)
  `);
  await pool.query(`
    create index if not exists migration_run_log_started_idx
      on migration_run_log (started_at desc)
  `);
  await pool.query(`
    create index if not exists migration_run_log_status_started_idx
      on migration_run_log (status, started_at desc)
  `);
}

async function insertTelemetryRun(pool, runId) {
  if (!telemetryEnabled) return false;
  try {
    await ensureTelemetryTable(pool);
    await pool.query(
      `
      insert into migration_run_log (
        run_id,
        runner,
        host,
        status,
        details
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
      [
        runId,
        migrateRunner,
        migrateHost,
        "RUNNING",
        JSON.stringify({
          pid: process.pid,
          advisoryLock: {
            enabled: useAdvisoryLock,
            lockId: advisoryLockId,
            maxWaitMs: advisoryLockMaxWaitMs,
            pollMs: advisoryLockPollMs,
          },
          retry: {
            maxAttempts,
            delayMs,
          },
        }),
      ],
    );
    return true;
  } catch (error) {
    console.warn("[migrate] telemetry init failed, continuing without telemetry", error);
    return false;
  }
}

async function finishTelemetryRun(pool, runId, summary) {
  if (!telemetryEnabled) return;
  try {
    await pool.query(
      `
      update migration_run_log
      set status = $2,
          error_code = $3,
          message = $4,
          finished_at = now(),
          lock_wait_ms = $5,
          details = coalesce(details, '{}'::jsonb) || $6::jsonb
      where run_id = $1
    `,
      [
        runId,
        summary.status,
        summary.errorCode,
        summary.message,
        summary.lockWaitMs,
        JSON.stringify(summary.details ?? {}),
      ],
    );
  } catch (error) {
    console.warn("[migrate] telemetry finalize failed", error);
  }
}

async function acquireAdvisoryLock(client) {
  if (!useAdvisoryLock) return 0;

  const start = Date.now();
  while (Date.now() - start < advisoryLockMaxWaitMs) {
    const result = await client.query("select pg_try_advisory_lock($1) as locked", [advisoryLockId]);
    if (result.rows[0]?.locked === true) {
      const waitMs = Date.now() - start;
      console.log(`[migrate] advisory lock acquired: ${advisoryLockId} (wait ${waitMs}ms)`);
      return waitMs;
    }
    console.log(`[migrate] advisory lock busy, retrying... (${advisoryLockId})`);
    await sleep(advisoryLockPollMs);
  }

  throw new MigrationLockTimeoutError(
    `[migrate] failed to acquire advisory lock ${advisoryLockId} within ${advisoryLockMaxWaitMs}ms`,
  );
}

async function releaseAdvisoryLock(client, lockHeld) {
  if (!useAdvisoryLock || !lockHeld) return;
  try {
    await client.query("select pg_advisory_unlock($1) as unlocked", [advisoryLockId]);
    console.log(`[migrate] advisory lock released: ${advisoryLockId}`);
  } catch (error) {
    console.warn("[migrate] failed to release advisory lock", error);
  }
}

const pool = new Pool({ connectionString, connectionTimeoutMillis: connectTimeoutMs });
// dev 스키마 격리: 모든 연결의 search_path를 해당 스키마 우선으로 둔다. drizzle migrate의
// DDL은 스키마 한정이지만, 텔레메트리(migration_run_log)·advisory lock 등 직접 쿼리가
// dev 스키마에 적용되도록 보장한다. db-migrate는 DIRECT(session) 연결이라 SET이 유지됨.
if (dbSchema) {
  pool.on("connect", (client) => {
    client.query(`SET search_path TO "${dbSchema}", public`);
  });
}
const db = drizzle(pool);
const runId = randomUUID();
let telemetryActive = false;
let lockWaitMs = 0;
const runStartedAt = Date.now();
let finalStatus = "SUCCESS";
let finalErrorCode = null;
let finalMessage = "migrations applied";

try {
  console.log(`[migrate] run started (${runId})`);
  if (!migrateEnabled) {
    finalStatus = "SKIPPED";
    finalMessage = "DB_MIGRATE_ENABLED=0, skipping migrations";
    console.log("[migrate] DB_MIGRATE_ENABLED=0, skipping migrations");
  } else {
    await waitForDatabase(pool);
    telemetryActive = await insertTelemetryRun(pool, runId);

    const lockClient = await pool.connect();
    let lockHeld = false;
    try {
      lockWaitMs = await acquireAdvisoryLock(lockClient);
      lockHeld = useAdvisoryLock;
      await migrate(db, { migrationsFolder, migrationsSchema, migrationsTable: "__drizzle_migrations" });
      console.log("[migrate] migrations applied");
    } finally {
      await releaseAdvisoryLock(lockClient, lockHeld);
      lockClient.release();
    }
  }
} catch (error) {
  if (error instanceof MigrationLockTimeoutError) {
    finalStatus = "LOCK_TIMEOUT";
  } else {
    finalStatus = "FAILED";
  }
  finalErrorCode = toErrorCode(error);
  finalMessage = toErrorMessage(error);
  console.error("[migrate] failed to apply migrations", error);
  process.exitCode = 1;
} finally {
  if (telemetryActive) {
    await finishTelemetryRun(pool, runId, {
      status: finalStatus,
      errorCode: finalErrorCode,
      message: finalMessage,
      lockWaitMs,
      details: {
        durationMs: Date.now() - runStartedAt,
      },
    });
  }
  console.log(`[migrate] run finished (${runId}) status=${finalStatus}`);
  await pool.end();
}
