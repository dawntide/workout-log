import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

declare global {
  var __dbPool: Pool | undefined;
}

// PERF: 개발/프로덕션 모두 전역에 풀을 저장해 서버리스 컨테이너 재사용 시 재연결 방지.
// 서버리스(Vercel) 환경에서 컨테이너가 warm이면 기존 풀을 그대로 씀 → 콜드 스타트 연결 비용 절감.
// max — Vercel 서버리스는 인스턴스당 5(기본)면 Promise.all 병렬 쿼리가 큐 대기 없이 실행됨.
//       apps/api는 전 트래픽을 받는 상시 단일 프로세스라 5로는 동시성에서 병목 → 배포 env에서
//       DB_POOL_MAX를 크게(예: 20) 설정. Supabase 풀러 최대 연결 한도 내에서 조정할 것.
// keepAlive: true — TCP 연결 재사용으로 reconnect 오버헤드 제거 (특히 cold start 후 첫 쿼리)
// statement_timeout — 런어웨이 쿼리가 커넥션을 무한 점유하지 못하도록(opt-in). export/rebuild 등
//       긴 작업이 있어 기본은 비활성(0); 배포에서 DB_STATEMENT_TIMEOUT_MS로 상한을 준다.
type WorkoutDb = ReturnType<typeof drizzle>;

let database: WorkoutDb | null = null;

export function getDb(): WorkoutDb {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const poolMax = Number(process.env.DB_POOL_MAX ?? 5);
  const statementTimeoutMs = Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 0);
  const pool =
    global.__dbPool ??
    new Pool({
      connectionString,
      max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      ...(Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0
        ? { statement_timeout: statementTimeoutMs }
        : {}),
    });

  global.__dbPool = pool;
  database = drizzle(pool);
  return database;
}

/**
 * Backwards-compatible lazy facade. Existing services can keep `db.select()`
 * while importing the module no longer reads env vars or creates a Pool during
 * `next build` and pure unit-test discovery.
 */
export const db = new Proxy({} as WorkoutDb, {
  get(_target, property) {
    const resolved = getDb();
    const value = Reflect.get(resolved, property, resolved) as unknown;
    return typeof value === "function" ? value.bind(resolved) : value;
  },
});
