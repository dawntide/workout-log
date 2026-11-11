import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { logError } from "@workout/core/observability/logger";
import { readMigrationLedgerSnapshot } from "@/server/db/migrationLedger";
import { withApiLogging } from "@/server/observability/apiRoute";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import pkg from "../../../../package.json";

const MIGRATIONS_DIR = path.join(process.cwd(), "src/server/db/migrations");
const MIGRATION_FILE_PATTERN = /^\d+_.+\.sql$/;

type HealthCheckResult = {
  ok: boolean;
  mode: "basic" | "deep";
  ts: string;
  version: string;
  checks: {
    db: boolean;
    requiredTables: {
      requested: string[];
      missing: string[];
    };
    migrations?: {
      localCount: number;
      appliedCount: number;
      pending: number;
      tableQualifiedName: string | null;
      latestAppliedAt: string | null;
      latestAppliedHash: string | null;
    };
  };
  error?: string;
};

/** 무인증 엔드포인트라 테이블마다 나가는 쿼리 수를 묶는다. */
const MAX_REQUIRED_TABLES = 20;

function parseRequiredTables(raw: string | null) {
  const parsed = (raw ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => /^[a-zA-Z0-9_]+$/.test(token));
  if (parsed.length === 0) return ["program_template"];
  return Array.from(new Set(parsed)).slice(0, MAX_REQUIRED_TABLES);
}

async function readLocalMigrationCount() {
  const files = await readdir(MIGRATIONS_DIR).catch(() => []);
  return files.filter((file) => MIGRATION_FILE_PATTERN.test(file)).length;
}

async function getMissingTables(requiredTables: string[]) {
  const missing: string[] = [];
  for (const table of requiredTables) {
    const row = await db.execute<{ regclass: string | null }>(
      sql`select to_regclass(${`public.${table}`}) as regclass`,
    );
    const exists = Boolean(row.rows[0]?.regclass);
    if (!exists) missing.push(table);
  }
  return missing;
}

async function GETImpl(req: Request) {
  const locale = await resolveRequestLocale();
  const version = process.env.APP_VERSION ?? pkg.version ?? "unknown";
  const ts = new Date().toISOString();

  try {
    const { searchParams } = new URL(req.url);
    const deepCheck = searchParams.get("checkMigrations") === "1";
    const requiredTables = parseRequiredTables(searchParams.get("requiredTables"));

    await db.execute(sql`select 1`);

    const missingTables = await getMissingTables(requiredTables);

    if (!deepCheck) {
      const payload: HealthCheckResult = {
        ok: missingTables.length === 0,
        mode: "basic",
        ts,
        version,
        checks: {
          db: true,
          requiredTables: {
            requested: requiredTables,
            missing: missingTables,
          },
        },
        error: missingTables.length > 0 ? (locale === "ko" ? "필수 테이블이 누락되었습니다." : "Required tables are missing.") : undefined,
      };
      return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
    }

    const [localCount, migrationLedger] = await Promise.all([
      readLocalMigrationCount(),
      readMigrationLedgerSnapshot(),
    ]);

    const appliedCount = migrationLedger.appliedCount;
    const pending = migrationLedger.tableQualifiedName ? Math.max(0, localCount - appliedCount) : localCount;

    const ok = missingTables.length === 0 && pending === 0;
    const payload: HealthCheckResult = {
      ok,
      mode: "deep",
      ts,
      version,
      checks: {
        db: true,
        requiredTables: {
          requested: requiredTables,
          missing: missingTables,
        },
        migrations: {
          localCount,
          appliedCount,
          pending,
          tableQualifiedName: migrationLedger.tableQualifiedName,
          latestAppliedAt: migrationLedger.latestAppliedAt,
          latestAppliedHash: migrationLedger.latestAppliedHash,
        },
      },
      error: ok
        ? undefined
        : missingTables.length > 0
          ? (locale === "ko" ? "필수 테이블이 누락되었습니다." : "Required tables are missing.")
          : migrationLedger.tableQualifiedName
            ? (locale === "ko" ? "적용 대기 중인 마이그레이션이 있습니다." : "Pending migrations were detected.")
            : (locale === "ko" ? "마이그레이션 메타데이터 테이블이 없습니다." : "The migration metadata table is missing."),
    };

    return NextResponse.json(payload, { status: ok ? 200 : 503 });
  } catch (error: unknown) {
    // 무인증 응답에 예외 문구(SQL·접속 정보)를 싣지 않는다. 상세는 로그에만 남긴다.
    logError("api.health_check_failed", { error });
    const payload: HealthCheckResult = {
      ok: false,
      mode: "deep",
      ts,
      version,
      checks: {
        db: false,
        requiredTables: {
          requested: ["program_template"],
          missing: ["program_template"],
        },
      },
      error: locale === "ko" ? "DB 점검에 실패했습니다." : "The DB health check failed.",
    };
    return NextResponse.json(payload, { status: 503 });
  }
}

export const GET = withApiLogging(GETImpl);
