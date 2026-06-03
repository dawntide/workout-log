import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[seed-sync] DATABASE_URL is not set");
  process.exit(1);
}

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function toShortHash(value) {
  return value.slice(0, 12);
}

function parseTrackedFiles(raw) {
  const values = (raw ?? "src/server/db/seed.ts")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

const maxAttempts = parsePositiveInt(process.env.DB_SEED_CHECK_MAX_ATTEMPTS, 20);
const retryDelayMs = parsePositiveInt(process.env.DB_SEED_CHECK_RETRY_DELAY_MS, 1500);
// Bound each connection attempt so an unreachable DB fails fast instead of
// hanging on the OS TCP timeout (~133s per attempt → ~45min across all retries).
const connectTimeoutMs = parsePositiveInt(process.env.DB_SEED_CONNECT_TIMEOUT_MS, 10000);
const useAdvisoryLock = process.env.DB_SEED_USE_ADVISORY_LOCK !== "0";
const advisoryLockId = parsePositiveInt(process.env.DB_SEED_LOCK_ID, 872342);
const advisoryLockMaxWaitMs = parsePositiveInt(process.env.DB_SEED_LOCK_MAX_WAIT_MS, 180000);
const advisoryLockPollMs = parsePositiveInt(process.env.DB_SEED_LOCK_POLL_MS, 1500);
const seedKey = (process.env.DB_SEED_KEY ?? "base").trim() || "base";
const seedRunner = (process.env.DB_SEED_RUNNER ?? "default-runner").trim() || "default-runner";
const seedHost = (process.env.HOSTNAME ?? os.hostname() ?? "").trim() || null;
const trackedFiles = parseTrackedFiles(process.env.DB_SEED_TRACKED_FILES);

if (trackedFiles.length < 1) {
  console.error("[seed-sync] no tracked files configured");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class SeedLockTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "SeedLockTimeoutError";
  }
}

function buildSeedSignature(files) {
  const hash = createHash("sha256");

  for (const relativeFilePath of files) {
    const filePath = path.resolve(process.cwd(), relativeFilePath);
    if (!existsSync(filePath)) {
      throw new Error(`[seed-sync] tracked seed file not found: ${filePath}`);
    }

    hash.update(`file:${relativeFilePath}\n`);
    hash.update(readFileSync(filePath));
    hash.update("\n");
  }

  return {
    hash: hash.digest("hex"),
    trackedFiles: files,
  };
}

async function waitForDb(pool) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      console.log(`[seed-sync] database not ready (${attempt}/${maxAttempts}), retrying...`);
      await sleep(retryDelayMs);
    }
  }
}

async function ensureSeedStateTable(pool) {
  await pool.query(`
    create table if not exists seed_run_state (
      seed_key text primary key,
      seed_hash text not null,
      tracked_files jsonb not null default '[]'::jsonb,
      runner text not null,
      host text,
      applied_at timestamp with time zone not null default now(),
      details jsonb not null default '{}'::jsonb
    )
  `);
}

async function readSeedState(pool) {
  const result = await pool.query(
    `
      select seed_hash, tracked_files, runner, host, applied_at
      from seed_run_state
      where seed_key = $1
      limit 1
    `,
    [seedKey],
  );

  return result.rows[0] ?? null;
}

async function readBaseDataCounts(pool) {
  const result = await pool.query(`
    select
      (select count(*)::int from program_template) as program_template_count,
      (select count(*)::int from exercise) as exercise_count
  `);

  const row = result.rows[0] ?? {};
  return {
    programTemplateCount: Number(row.program_template_count ?? 0),
    exerciseCount: Number(row.exercise_count ?? 0),
  };
}

async function upsertSeedState(pool, input) {
  await pool.query(
    `
      insert into seed_run_state (
        seed_key,
        seed_hash,
        tracked_files,
        runner,
        host,
        applied_at,
        details
      )
      values ($1, $2, $3::jsonb, $4, $5, now(), $6::jsonb)
      on conflict (seed_key)
      do update
      set seed_hash = excluded.seed_hash,
          tracked_files = excluded.tracked_files,
          runner = excluded.runner,
          host = excluded.host,
          applied_at = excluded.applied_at,
          details = excluded.details
    `,
    [
      seedKey,
      input.seedHash,
      JSON.stringify(input.trackedFiles),
      seedRunner,
      seedHost,
      JSON.stringify(input.details),
    ],
  );
}

async function acquireAdvisoryLock(client) {
  if (!useAdvisoryLock) return 0;

  const startedAt = Date.now();
  while (Date.now() - startedAt < advisoryLockMaxWaitMs) {
    const result = await client.query("select pg_try_advisory_lock($1) as locked", [advisoryLockId]);
    if (result.rows[0]?.locked === true) {
      const waitMs = Date.now() - startedAt;
      console.log(`[seed-sync] advisory lock acquired: ${advisoryLockId} (wait ${waitMs}ms)`);
      return waitMs;
    }

    console.log(`[seed-sync] advisory lock busy, retrying... (${advisoryLockId})`);
    await sleep(advisoryLockPollMs);
  }

  throw new SeedLockTimeoutError(
    `[seed-sync] failed to acquire advisory lock ${advisoryLockId} within ${advisoryLockMaxWaitMs}ms`,
  );
}

async function releaseAdvisoryLock(client, lockHeld) {
  if (!useAdvisoryLock || !lockHeld) return;

  try {
    await client.query("select pg_advisory_unlock($1) as unlocked", [advisoryLockId]);
    console.log(`[seed-sync] advisory lock released: ${advisoryLockId}`);
  } catch (error) {
    console.warn("[seed-sync] failed to release advisory lock", error);
  }
}

async function runSeedScript() {
  // Prefer pre-compiled JS if a build step produced it; otherwise run seed.ts via tsx.
  const compiledPath = path.resolve(process.cwd(), "scripts/seed-compiled.cjs");
  const seedScriptPath = path.resolve(process.cwd(), "src/server/db/seed.ts");

  let scriptArgs;
  if (existsSync(compiledPath)) {
    scriptArgs = [compiledPath];
  } else {
    if (!existsSync(seedScriptPath)) {
      throw new Error(`[seed-sync] seed script not found: ${seedScriptPath}`);
    }
    const tsxCliPath = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    if (!existsSync(tsxCliPath)) {
      throw new Error(`[seed-sync] tsx cli not found: ${tsxCliPath}`);
    }
    scriptArgs = [tsxCliPath, seedScriptPath];
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, scriptArgs, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          `[seed-sync] seed failed (code=${code ?? "null"}, signal=${signal ?? "none"})`,
        ),
      );
    });
  });
}

export async function syncSeedIfNeeded() {
  const signature = buildSeedSignature(trackedFiles);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: connectTimeoutMs });
  let lockClient = null;
  let lockHeld = false;
  let lockWaitMs = 0;

  try {
    await waitForDb(pool);
    await ensureSeedStateTable(pool);

    lockClient = await pool.connect();
    lockWaitMs = await acquireAdvisoryLock(lockClient);
    lockHeld = true;

    const baseCounts = await readBaseDataCounts(pool);
    const existingState = await readSeedState(pool);
    const reasons = [];

    console.log(
      `[seed-sync] counts program_template=${baseCounts.programTemplateCount}, exercise=${baseCounts.exerciseCount}`,
    );

    if (baseCounts.programTemplateCount === 0 || baseCounts.exerciseCount === 0) {
      reasons.push("empty-base-data");
    }

    if (!existingState) {
      reasons.push("seed-state-missing");
    } else if (existingState.seed_hash !== signature.hash) {
      reasons.push("seed-hash-changed");
    }

    if (reasons.length < 1) {
      console.log(
        `[seed-sync] seed skipped (hash unchanged: ${toShortHash(signature.hash)}, seed_key=${seedKey})`,
      );
      return {
        changed: false,
        reason: "hash-unchanged",
        seedHash: signature.hash,
      };
    }

    console.log(
      `[seed-sync] running db seed (reasons=${reasons.join(",")} hash=${toShortHash(signature.hash)} seed_key=${seedKey})`,
    );
    await runSeedScript();

    const seededCounts = await readBaseDataCounts(pool);
    await upsertSeedState(pool, {
      seedHash: signature.hash,
      trackedFiles: signature.trackedFiles,
      details: {
        appVersion: process.env.APP_VERSION ?? null,
        reasons,
        lockWaitMs,
        countsBefore: baseCounts,
        countsAfter: seededCounts,
      },
    });

    console.log(
      `[seed-sync] seed completed (hash=${toShortHash(signature.hash)} program_template=${seededCounts.programTemplateCount} exercise=${seededCounts.exerciseCount})`,
    );

    return {
      changed: true,
      reason: reasons.join(","),
      seedHash: signature.hash,
    };
  } finally {
    if (lockClient) {
      await releaseAdvisoryLock(lockClient, lockHeld);
      lockClient.release();
    }
    await pool.end();
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  syncSeedIfNeeded().catch((error) => {
    console.error("[seed-sync] failed", error);
    process.exit(1);
  });
}
