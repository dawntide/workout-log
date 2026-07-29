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

`ux_event_log` 테이블 정리 작업을 스케줄로 실행해 저장소가 무한 증가하지 않도록 합니다.

**기본 환경 변수**:
```bash
UX_EVENTS_RETENTION_DAYS=120   # 기본 보존 기간 (일)
UX_EVENTS_CLEANUP_DRY_RUN=1    # dry-run 모드 (실제 삭제 없음)
```

**dry-run으로 먼저 확인**:
```bash
UX_EVENTS_CLEANUP_DRY_RUN=1 pnpm --dir web run db:cleanup:ux-events
```

> ⚠️ **현재 스케줄되어 있지 않습니다.** `db:cleanup:ux-events` 스크립트만 있고, 이를 호출하는
> cron/워크플로/API 라우트는 리포에 없습니다(과거 이 문서는 `/api/ops/cleanup` + Vercel Cron이
> "현재 운영 환경"이라고 적었지만 그런 라우트도 cron 항목도 존재하지 않습니다). 보존 정리는
> 당분간 위 명령을 수동 실행해야 하며, 자동화는 별도 작업으로 남아 있습니다.

수동 실행:
```bash
pnpm --dir web run db:cleanup:ux-events
```

### 만료 세션 prune

`auth_session`의 만료 행은 sliding 만료(#495)로도 사라지지 않아 스케줄러가 지운다. 호스팅 모드에
따라 **둘 중 하나만** 돈다:

- **인프로세스(Vercel)** — [`web/vercel.json`](../vercel.json)의 `crons`가 매일 19:30 UTC(=04:30 KST)에
  `GET /api/cron/session-prune`을 호출. Vercel 프로젝트에 **`CRON_SECRET` 환경변수 필수**(Vercel이
  Bearer로 붙여준다). 미설정 시 라우트가 401로 거부한다 — 파괴적 엔드포인트라 fail-closed.
- **분리 배포(VPS)** — `ironlog-session-prune.timer`가 `POST /api/ops/sessions/prune`을 호출.
  상세는 [`apps/api/deploy/DEPLOY.md`](../../apps/api/deploy/DEPLOY.md) §5.5.

로컬에서 토큰 없이 ops 라우트를 호출하려면 `WORKOUT_OPS_ALLOW_NO_TOKEN=1`을 명시적으로 설정한다.
