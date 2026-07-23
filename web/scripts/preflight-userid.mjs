// Read-only preflight for the user_id → uuid + app_user FK migration
// (0025 / migrations-dev/0008). Scans each target column for values that would
// block the migration: (a) not a valid uuid, or (b) a valid uuid with no matching
// app_user row. Prints per-table counts + samples. NEVER writes.
//
// Usage (from web/):
//   node scripts/preflight-userid.mjs            # public (prod) schema
//   DB_SCHEMA=dev node scripts/preflight-userid.mjs
//
// The prod migration (0025) is fail-loud: it RAISEs before any DDL if this scan
// would report anything non-zero, so run this against public and reconcile any
// findings (assign to a real app_user, or delete) BEFORE merging — merging
// triggers a prod build that applies the migration.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { config as loadDotenv } from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const original = new Set(Object.keys(process.env));
for (const rel of [".env", ".env.local"]) {
  const r = loadDotenv({ path: path.join(projectRoot, rel), processEnv: {}, quiet: true });
  if (r.parsed) for (const [k, v] of Object.entries(r.parsed)) if (!original.has(k)) process.env[k] = v;
}

const schema = (process.env.DB_SCHEMA ?? "").trim() || "public";
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("[preflight] DATABASE_URL is not set");
  process.exit(1);
}

const q = (t) => `"${schema}"."${t}"`;
const UUID_RE = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
// ux_event_log is intentionally excluded (anonymous __anonymous_web_vitals__ sentinel).
const targets = [
  ["plan", "user_id"],
  ["plan_runtime_state", "user_id"],
  ["generated_session", "user_id"],
  ["workout_log", "user_id"],
  ["plan_progress_event", "user_id"],
  ["stats_cache", "user_id"],
  ["user_setting", "user_id"],
  ["program_template", "owner_user_id"],
];

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
let blockers = 0;
try {
  console.log(`\n[preflight] schema: ${schema}`);
  const au = await pool.query(`select count(*)::int n from ${q("app_user")}`);
  console.log(`[preflight] app_user rows: ${au.rows[0].n}\n`);

  for (const [t, col] of targets) {
    const total = await pool.query(`select count(*)::int n from ${q(t)}`);
    // ::text keeps the scan valid whether the column is still text (pre-migration)
    // or already uuid (post-migration) — so this can also confirm a clean result after.
    const nonUuid = await pool.query(
      `select ${col} v, count(*)::int n from ${q(t)}
       where ${col} is not null and ${col}::text !~ $1 group by ${col} order by n desc limit 10`,
      [UUID_RE],
    );
    const orphan = await pool.query(
      `select ${col} v, count(*)::int n from ${q(t)}
       where ${col} is not null and ${col}::text ~ $1
         and ${col}::uuid not in (select id from ${q("app_user")})
       group by ${col} order by n desc limit 10`,
      [UUID_RE],
    );
    const nu = nonUuid.rows.reduce((s, r) => s + r.n, 0);
    const or = orphan.rows.reduce((s, r) => s + r.n, 0);
    blockers += nu + or;
    const flag = nu + or > 0 ? "  <-- BLOCKS MIGRATION" : "";
    console.log(`${t}.${col}  total=${total.rows[0].n}  nonUuid=${nu}  orphanUuid=${or}${flag}`);
    for (const r of nonUuid.rows) console.log(`   non-uuid: ${JSON.stringify(r.v)} x${r.n}`);
    for (const r of orphan.rows) console.log(`   orphan  : ${r.v} x${r.n}`);
  }

  console.log(
    blockers === 0
      ? "\n[preflight] OK — migration is a no-op on user ids; safe to apply."
      : `\n[preflight] ${blockers} blocking row(s) — reconcile before applying (see docs/db-multiuser-isolation-plan.md §4.2).`,
  );
  process.exitCode = blockers === 0 ? 0 : 2;
} catch (e) {
  console.error("[preflight] error:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
