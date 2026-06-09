import 'dotenv/config';
import type { Config } from "drizzle-kit";

// DB_SCHEMA가 설정되면(예: "dev") 그 스키마 전용 마이그레이션 폴더/추적 테이블을
// 쓴다. prod 인스턴스 하나에 dev 스키마를 공존시키되 마이그레이션 이력이 서로
// 침범하지 않도록 분리한다. 미설정(prod)이면 기존 경로/스키마를 그대로 사용.
const schemaName = process.env.DB_SCHEMA?.trim() || undefined;

export default {
  schema: "./src/server/db/schema.ts",
  out: schemaName
    ? `./src/server/db/migrations-${schemaName}`
    : "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
  migrations: {
    // 추적 테이블이 저장될 스키마. dev는 drizzle_dev로 분리해 prod 이력과 격리.
    schema: schemaName ? `drizzle_${schemaName}` : "drizzle",
    table: "__drizzle_migrations",
  },
} satisfies Config;