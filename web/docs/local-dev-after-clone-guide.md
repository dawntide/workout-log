# Git Clone 직후 로컬 개발 가이드

배포는 Vercel(웹앱) + Supabase(Postgres) 조합으로 운영합니다. 로컬에서는 Vercel과 동일한 환경 변수를 `.env.local`에 채워두고 Next.js dev 서버를 실행합니다.

## 0) 대상 경로
개발 대상은 `web` 앱입니다.

```bash
git clone <repo-url>
cd workout-log
```

## 1) 사전 조건
- Node.js (프로젝트 권장 버전)
- pnpm
- Postgres 16+ (로컬 인스턴스 또는 Supabase 등 원격 DB)

## 2) 환경 변수 (`web/.env.local`)
Vercel 환경과 동일하게 풀러를 분리해 두 개의 URL을 설정합니다.

```bash
DATABASE_URL="postgresql://postgres.[프로젝트ID]:[비밀번호]@aws-[리전].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[프로젝트ID]:[비밀번호]@aws-[리전].pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_APP_URL=http://localhost:3000
WORKOUT_AUTH_USER_ID=00000000-0000-4000-8000-000000c1c1c1  # uuid만 허용 — 도메인 user_id가 app_user.id를 FK 참조, seed가 이 계정 생성
NEXT_PUBLIC_DISABLE_SW=1
```

로컬 Postgres를 직접 띄우는 경우에는 `DATABASE_URL=postgres://app:app@127.0.0.1:5432/workoutlog` 형태로 사용할 수 있습니다.

> `db:*` CLI 스크립트와 `drizzle.config.ts`는 [`src/server/db/load-env.ts`](../src/server/db/load-env.ts)로
> `.env.local` → `.env` 순서로 이 파일을 읽습니다. **셸에 이미 있는 환경변수가 항상 이깁니다** —
> CI·배포는 `DATABASE_URL`을 진짜 환경변수로 넘기므로 로컬 파일이 그걸 가로채지 않습니다.

## 3) 실행

```bash
cd web
pnpm install
pnpm run dev:check
pnpm db:migrate
pnpm db:seed
pnpm dev
```

접속:
- 앱: `http://localhost:3000`

기본 `pnpm db:seed`는 템플릿/운동 카탈로그만 세팅합니다. 검증용 샘플 플랜까지 넣고 싶으면 `pnpm db:seed:demo-plans`를 사용하세요.

## 4) 형상관리(버전관리)
팀 공통 규칙은 [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)를 참고하세요.

권장 방식:
1. 기능 단위 브랜치 생성
2. 변경 파일 확인
3. 관련 파일만 스테이징
4. 의미 있는 단위로 커밋
5. PR 생성

예시:

```bash
git checkout -b docs/local-dev-onboarding
git status
git add web/docs/local-dev-after-clone-guide.md web/README.md
git commit -m "docs: add post-clone local dev onboarding guide"
git push -u origin docs/local-dev-onboarding
```

주의:
- `.env.local` 같은 로컬 비밀값 파일은 커밋하지 않습니다.

---

## 5) 운영 스케줄러 설정

### UX 이벤트 로그 보존 정리

`ux_event_log`는 append-only 이벤트 스트림이라 스스로 줄지 않는다. 보존 기간이 지난 행은
스케줄러가 지운다 — **[`web/vercel.json`](../vercel.json)의 `crons`가 매일 20:00 UTC(=05:00 KST)에
`GET /api/cron/ux-events-cleanup`을 호출**한다. 세션 prune 크론과 같은 규약이다(아래 참고):
Vercel Cron은 GET만 보내고 `CRON_SECRET`을 Bearer로 붙이며, **미설정 시 라우트가 401로 거부**한다
(파괴적 엔드포인트라 fail-closed). Hobby 플랜은 크론이 하루 1회까지, 실행 시각은 지정 시각의
±59분이다 — 보존 정리에는 충분하다.

삭제 구현은 [`packages/core/src/data/ux-event-retention.ts`](../../packages/core/src/data/ux-event-retention.ts)
한 곳에 있고 크론 라우트와 아래 CLI가 같은 함수를 부른다. 따라서 두 경로의 보존 기준이 갈라지지 않는다.
세션 prune과 달리 **호스팅 모드(`APPS_API_BASE`)와 무관**하다 — 라우트가 web에 있고 web이 직접 DB를
치므로 프록시/인프로세스 어느 쪽이든 이 크론 하나만 돈다.

**환경 변수** (크론·CLI 공통):
```bash
UX_EVENTS_RETENTION_DAYS=120   # 기본 보존 기간 (일). 양의 정수가 아니면 120으로 되돌림
UX_EVENTS_CLEANUP_DRY_RUN=1    # dry-run 모드 — "1"일 때만. 삭제 없이 대상 행 수만 센다
```

**dry-run으로 먼저 확인**:
```bash
UX_EVENTS_CLEANUP_DRY_RUN=1 pnpm --dir web run db:cleanup:ux-events
```

수동 실행(크론 밖에서 즉시 돌릴 때):
```bash
pnpm --dir web run db:cleanup:ux-events
```

> `DB_SCHEMA=dev`를 설정하면 CLI도 `dev` 스키마의 `ux_event_log`를 본다(앱의 나머지 쿼리와 동일).
> 마이그레이션 전 DB처럼 테이블이 없으면 실패가 아니라 무작업으로 넘어간다.

### 만료 세션 prune

`auth_session`의 만료 행은 sliding 만료(#495)로도 사라지지 않아 스케줄러가 지운다. 호스팅 모드에
따라 **둘 중 하나만** 돈다:

- **인프로세스(Vercel) — 현행** — [`web/vercel.json`](../vercel.json)의 `crons`가 매일 19:30 UTC(=04:30 KST)에
  `GET /api/cron/session-prune`을 호출. Vercel 프로젝트에 **`CRON_SECRET` 환경변수 필수**(Vercel이
  Bearer로 붙여준다). 미설정 시 라우트가 401로 거부한다 — 파괴적 엔드포인트라 fail-closed.
- **분리 배포(VPS)** — `ironlog-session-prune.timer`가 `POST /api/ops/sessions/prune`을 호출.
  **2026-07-29 인프로세스 전환과 함께 disabled.** 상세는 [`apps/api/deploy/DEPLOY.md`](../../apps/api/deploy/DEPLOY.md) §5.5.

> ⚠️ **cron 라우트를 새로 만들면 [`web/src/proxy.ts`](../src/proxy.ts)의 `PUBLIC_PATH_PREFIXES`를 확인할 것.**
> 목록에 없는 `/api/*`는 쿠키 없는 호출자(=cron)가 라우트에 닿기도 전에 미들웨어에서 401이 된다.
> 로컬·CI는 `WORKOUT_AUTH_USER_ID` fallback으로 통과해 **프로덕션에서만 드러난다**(#638 실제 사고).
> [`web/src/proxy.test.ts`](../src/proxy.test.ts)가 `app/api/cron/*`를 스캔해 가드한다.

로컬에서 토큰 없이 ops 라우트를 호출하려면 `WORKOUT_OPS_ALLOW_NO_TOKEN=1`을 명시적으로 설정한다.
