import { config as loadDotenv } from "dotenv";

/**
 * CLI/툴 스크립트용 로컬 env 로더 — `import "dotenv/config"` 대신 쓴다.
 *
 * `dotenv/config`는 `.env`만 읽는다. 이 리포의 로컬 설정은 `.env.local`이고(CLAUDE.md·
 * [로컬 개발 가이드](../../../docs/local-dev-after-clone-guide.md)) `.env`는 아예 없어서,
 * clone 직후 문서대로 `pnpm -C web db:seed`를 돌리면 `DATABASE_URL is not set`으로 죽었다.
 *
 * 우선순위는 `web/scripts/migrate.mjs`와 같다:
 * - `.env.local` → `.env` 순 (앞선 파일의 값이 이긴다)
 * - **이미 있는 `process.env`는 덮지 않는다** — CI·배포는 DATABASE_URL을 진짜 환경변수로
 *   넘기므로 로컬 파일이 그걸 가로채면 안 된다.
 *
 * 경로는 cwd 기준(`dotenv/config`와 동일). 소비자는 전부 `web`의 pnpm 스크립트라 cwd가
 * 항상 `web/`다. Next.js 런타임은 자체적으로 `.env.local`을 읽으므로 이 모듈이 필요 없다.
 */
loadDotenv({ path: [".env.local", ".env"], quiet: true });
