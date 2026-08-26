# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

# Workout Log — Codex 가이드

## 프로젝트 개요

멀티유저 근력 운동 기록 앱. Next.js 16 + React 19, TypeScript, Drizzle ORM + PostgreSQL, PWA.

- **앱 코드**: `web/` 디렉터리 (Next.js App Router)
- **모노레포**: 루트 pnpm 워크스페이스(`pnpm-workspace.yaml`) — `web` + `apps/api` + `packages/core`, lockfile은 루트 1개. **clone 후 루트에서 `pnpm install` 1회**로 전 패키지 설치.
- **`packages/core` (@workout/core)**: web(Next.js)·apps/api(Hono)가 공유하는 프레임워크-무지 도메인/인프라 코드 — db(schema·client)·auth 코어·progression/program-engine·stats/home/export/import 서비스·순수 lib(session-key·bodyweight-load·program-store 등). source-only 패키지(web은 `transpilePackages`, apps/api는 tsx로 소비). **경계 규칙**: core는 next/react/DOM·요청 컨텍스트(쿠키) 무지 — userId·locale은 명시 인자, 쿠키/OAuth/RSC 어댑터(`user.ts`·`oauth-*`·messages.ts·bootstraps)는 web 잔류. 상세: [`packages/core/README.md`](packages/core/README.md).
- **로컬 실행**: `pnpm -C web dev` (Next.js dev 서버), 접속 `http://localhost:3000`. Postgres 접속 정보는 `web/.env.local`의 `DATABASE_URL`로 전달. 배포는 Vercel(웹앱) + Supabase(Postgres).
  - ⚠️ **web 데이터 API는 apps/api(Hono 백엔드)가 처리**([`web/src/app/api/[...path]/route.ts`](web/src/app/api/[...path]/route.ts)): 브라우저 `/api/*` same-origin 호출 → catch-all이 `wl_session` 쿠키를 `Authorization: Bearer`로 변환(동일 `auth_session` 토큰) + 앱 locale을 `Accept-Language`로 주입. **호스팅은 `APPS_API_BASE` 하나로 갈린다**:
    - **미설정 = 인프로세스 모드 — 현행 프로덕션**(2026-07-29 전환): web이 같은 Hono 앱을 `app.fetch()`로 직접 마운트(`@workout/api/app`) — 네트워크 홉·별도 프로세스 없음. **로컬에서도 apps/api를 안 띄우면 이 모드**라 데이터 라우트가 그대로 돈다. CI E2E도 이 모드.
    - **설정됨 = 프록시 모드**(별도 배포된 apps/api로 HTTP 포워딩; nightly E2E가 이 경로를 유지 검증): 로컬에서 쓰려면 apps/api 동반 실행 — `web/.env.local`에 `APPS_API_BASE=http://127.0.0.1:8787` + 별도 터미널 `cd apps/api && set -a; . ../../web/.env.local; set +a; DB_SCHEMA=dev pnpm dev`. **프로덕션 VPS(Lightsail) 배포는 내려가 있다**(서비스·Caddy disabled, 자산은 존치 — 되살리려면 `ilapi update`가 먼저, [`DEPLOY.md`](apps/api/deploy/DEPLOY.md) 헤더 참조).
    - 두 모드는 요청 정규화가 동일해 **전환·롤백·재분리가 전부 env 하나**다. 이 성질은 CI 게이트 `pnpm -C apps/api lint:boundary`가 강제한다(규칙 2개: apps/api에 `@/`·next·react 금지 + node 서버 어댑터는 `src/index.ts` 전용) — **apps/api에서 next/react를 import하지 말 것**.
    - 인증은 모드 무관: **실제 로그인**으로 `wl_session` 쿠키 획득(prod에서 apps/api는 `WORKOUT_AUTH_USER_ID` fallback 없음). `auth`·`ops`·web잔류(stats migration-telemetry[FS결합, 마이그레이션 실행지]·page-bootstrap·health)은 web 자체 처리(구체적 route가 catch-all보다 우선; ux-snapshot은 apps/api로 이식됨). 상세: [`apps/api/deploy/DEPLOY.md`](apps/api/deploy/DEPLOY.md), [아키텍처 레이어 모델](web/docs/architecture-layers.md).

## 핵심 문서

| 문서 | 내용 |
|------|------|
| [디자인 가이드](web/docs/design-guide.md) | 색상 토큰, 타이포그래피, 컴포넌트 규칙, 안티패턴, 43개 화면 체크리스트 |
| [구현 히스토리](web/docs/implementation-changelog.md) | PR2~PR41 기반 IA 구조, 디자인 시스템, 모션, 비동기 UX, 자동 진행 등 전체 구현 맥락 |
| [로컬 개발 가이드](web/docs/local-dev-after-clone-guide.md) | clone 후 세팅, 로컬 실행, 운영 스케줄러 설정 |
| [QA 테스트 가이드](web/docs/qa-test-guide.md) | 라이트/헤비 유저 E2E 시나리오, 비동기 UX 연속성 체크리스트 |
| [프로그램 Seed 가이드](web/docs/program-seed-guide.md) | 6개 근력 프로그램 canonical 규칙, seed 명령, 자동 진행 구현 상세 |
| [아키텍처 레이어 모델](web/docs/architecture-layers.md) | 정식 레이어 흐름(app→widgets→features→primitives→lib→server), 의존 방향 규칙, 파사드, 린트 강제를 미루는 이유, **시스템 토폴로지(멀티프론트/단일백엔드 — web↔apps/api 프록시 cutover)** |
| [전체 시스템 점검 2026-08](docs/codebase-audit-2026-08.md) | **최신 감사**. 게이트 전수 실행 + prod DB 실측 + 프로덕션 블랙박스 확인. P0은 인증 폴백 비대칭(S1) 하나, 성능은 데이터 규모상 결론 유보. non-goal(가상화·DSL 4b·pg_stat 판단) 포함 |
| [전체 시스템 점검 2026-07](docs/codebase-audit-2026-07.md) | 이전 감사 — monorepo 전체 구조/성능/보안 + 개선 계획(**전부 종결**). 진단 표는 이력으로 보존 |

## 주요 경로

```
packages/core/src/           # @workout/core — web·apps/api 공유(프레임워크-무지)
├── db/                      # Drizzle 스키마·클라이언트·ops·seed (마이그레이션 실행지는 web)
├── auth/                    # PBKDF2, session(+policy), rate-limit, reset/verify token, event log
├── progression/             # 자동 진행 리듀서·상태 (+progress-events)
├── program-engine/          # 세션 생성·asymptote·라운딩
├── stats/ home/ export/ import/ data/  # 데이터 서비스 (locale·userId 명시 인자)
├── settings/                # workout-preferences 순수부 (SETTINGS_KEYS·normalize)
└── session-key.ts bodyweight-load.ts program-store/ ...  # 순수 lib + Go/TS golden fixtures(../fixtures)

web/src/
├── app/                    # Next.js App Router 페이지
│   ├── workout/log/        # 운동 기록 메인 (/workout/log)
│   ├── login/ signup/      # 이메일/비밀번호 인증
│   ├── forgot-password/    # 비밀번호 재설정 요청
│   ├── reset-password/     # 토큰 기반 새 비밀번호 설정
│   ├── onboarding/         # v2 온보딩
│   ├── stats/              # 통계 + 1RM 추이 (/stats)
│   ├── program-store/      # 프로그램 스토어
│   ├── plans/              # 플랜 관리
│   ├── settings/           # 설정 (iOS Settings 패턴)
│   └── api/                # API Routes (auth·ops·프록시 — 데이터 라우트는 apps/api)
├── components/ui/          # 공유 UI 컴포넌트
├── server/
│   ├── auth/user.ts        # 쿠키 세션 → userId 어댑터 (next/headers; core는 쿠키 무지)
│   ├── auth/oauth-*.ts     # Google OAuth 브라우저 플로우
│   ├── db/migrations/      # 마이그레이션 폴더 + migrate.mjs 실행지 (스키마는 core)
│   └── services/*/get-*-bootstrap.ts  # RSC 페이지 부트스트랩 (core 서비스에 userId·locale 주입)
└── lib/
    ├── api.ts              # SWR 캐시 HTTP 클라이언트
    ├── i18n/messages.ts    # 앱 카피 카탈로그 + resolveRequestLocale (react 의존 — web 전용)
    └── settings/           # 설정 관리 + rollback + workout-preferences DOM 어댑터(core 재export)
```

## 자주 쓰는 명령

```bash
# 개발 서버 (web 디렉터리에서 실행하거나 -C 옵션 사용)
pnpm -C web dev

# DB 마이그레이션 + 시드
pnpm -C web db:migrate
pnpm -C web db:seed
pnpm -C web db:seed:demo-plans   # 샘플 플랜 포함

# Lint / 타입 / 디자인 린트 (PR 전 필수)
pnpm -C web lint
pnpm -C web typecheck
pnpm -C web lint:design          # Hard Rule 위반 차단 (No-Line, primitive-first 등)

# 테스트
pnpm -C packages/core test       # core 전체 유닛(도메인 엔진·auth·stats·golden fixture — find 글롭)
pnpm -C web test:unit            # web 잔류 유닛(settings 정책·워크아웃 레코드 등)
pnpm -C web test:progression     # 자동 진행 로직만 (core 경로 위임)
pnpm -C web test:e2e             # Playwright E2E (전체)
pnpm -C web test:async-ux:continuity   # 비동기 UX 연속성 단일 시나리오

# core 경계 린트 (core 내 @/·next·react import 차단 — CI 게이트)
pnpm -C packages/core lint:boundary

# apps/api 경계 린트 (apps/api 내 @/·next·react 차단 + node 서버 어댑터를 index.ts에 가둠 — CI 게이트)
# 인프로세스로 마운트돼도 언제든 다시 분리 배포할 수 있는 상태를 유지한다. Windows에서도 실행됨.
pnpm -C apps/api lint:boundary

# 빌드 (migrate 후 next build 실행)
pnpm -C web build
```

단일 테스트는 `tsx --test <path>` 직접 호출 (예: `pnpm -C packages/core exec tsx --test src/progression/reducer.test.ts`).

## 코드 규칙 요약

- **Primitive-First Assembly**: 카드/버튼/네비행은 [`@/components/v2/primitives`](web/src/components/v2/primitives/) V2 컴포넌트 조합으로만 (`V2Card`, `V2PrimaryBtn`, `V2NavRow` 등). inline `<div style={...}>`로 같은 역할 재구현 금지 — 자세한 규칙은 [`web/src/components/v2/primitives/README.md`](web/src/components/v2/primitives/README.md).
- **No-Line Rule**: 1px 테두리 대신 배경색 전환(`--v2-paper` → `--v2-paper-2/3`)으로 계층 구분. divider는 `V2Hairline`.
- **토큰만 사용**: 색상은 `--v2-*`, spacing은 4-pt 그리드(`--v2-s-1..9`), radius는 `--v2-r-*`. hex 하드코딩 / 비-4pt 값 금지.
- **터치 영역**: 모든 인터랙티브 요소 최소 44×44px.
- **아이콘**: 웹 UI는 Material Symbols Outlined (`<span className="material-symbols-outlined">name</span>`)만. custom SVG UI 아이콘 금지. `apps/tui`의 터미널 글리프는 독립 클라이언트 규칙을 따른다.
- **테마 경계**: 웹 테마는 동일한 컴포넌트 트리·레이아웃을 유지하고 색상 토큰만 교체한다. 테마별 조건부 화면·셸·컴포넌트 포크 금지.
- **SWR 캐시**: 데이터 fetch는 `apiGet`/`apiPost` ([web/src/lib/api.ts](web/src/lib/api.ts)) 사용.
- **Auth**: 이메일/비밀번호 + PBKDF2 해시 + `wl_session` httpOnly cookie 세션. `WORKOUT_AUTH_USER_ID`는 로컬/dev fallback으로만 유지 — **프로덕션 런타임에서는 web·apps/api 양쪽 다 기본 차단**이라 이 값만 배포 env에 들어가도 아무 일이 없다. 되살리려면 명시 opt-in이 따로 필요하다(web `WORKOUT_WEB_ALLOW_ENV_AUTH=1` · apps/api `WORKOUT_API_ALLOW_ENV_AUTH=1`). E2E는 prod 빌드로 돌아 CI에서만 이 플래그를 세운다. 상세: [`dev-fallback.ts`](web/src/server/auth/dev-fallback.ts).
- **Auth 권한(role)**: `app_user.role` — `user`(기본)/`admin`/`test`, text + CHECK 제약. 세션 조회(`findActiveSession`)가 join으로 이미 실어 오므로 판정에 추가 쿼리가 없다. 강제 지점 3곳: **페이지**는 [`proxy.ts`](web/src/proxy.ts)의 `ADMIN_PAGE_PREFIXES`가 렌더 전에 404로 접고(RSC `notFound()`만으로는 레이아웃이 먼저 스트리밍돼 상태가 200으로 굳는다), **API**는 `requireAdminUserId()`가 403, **UI 노출**은 `/api/auth/me`의 role. 승격은 수기 SQL(`update app_user set role='admin' where email=...`). 시드가 폴백 계정을 관리자로 올리는 것은 `WORKOUT_SEED_ADMIN_FALLBACK=1`일 때뿐 — E2E 레인만 세우고 **prod 시드 잡(db-seed.yml)은 세우지 않는다**(폴백 플래그가 새도 관리자가 되지 않게).
- **Auth recovery**: `RESEND_API_KEY`, `RESEND_FROM`로 비밀번호 재설정/이메일 인증 링크 발송(`WORKOUT_APP_URL`은 OAuth 콜백에도 쓰이니 별도 유지). dev에서 Resend 미설정 시 서버 로그에 링크 출력. **UI는 `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED`(기본 off)로 게이트** — 프로덕션은 Resend 미설정이라 로그인 "비밀번호 잊음" 링크·이메일 인증 배너/설정 섹션·`/forgot-password`·`/reset-password` 페이지를 모두 숨긴다(코드는 유지). 활성화: 발송 도메인 인증 → `RESEND_*` + `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=1` 세팅 + 재배포(코드 변경 불필요). 상세 [`feature-flags.ts`](web/src/lib/feature-flags.ts).
- **Auth OAuth**: Google 로그인(SDK 없이 fetch + PKCE 자체 구현, [`oauth-google.ts`](web/src/server/auth/oauth-google.ts)). `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` 둘 다 설정 시 활성, redirect_uri는 `WORKOUT_APP_URL`(미설정 시 요청 origin) + `/api/auth/google/callback`. `auth_oauth_account` 테이블로 federated identity 연결. ⚠️ Vercel **preview는 도메인이 매 배포마다 달라** 고정 콜백과 어긋나 state 쿠키를 못 읽으므로(state_mismatch) `VERCEL_ENV==='preview'`에서 버튼을 자동 숨김 — preview는 이메일/비밀번호로 로그인 테스트, OAuth는 로컬/production에서 검증.
- **Auth API**: `/api/auth/{signup,login,logout,me,password}`, `/api/auth/google/{start,callback}`, `/api/auth/oauth/{status,accounts}`, `/api/auth/password/reset/{request,confirm}`, `/api/auth/email/verification/request`, `/api/auth/email/verify`.
- **라우트 네이밍**: 설계 문서의 `/workout-record` → 실제 구현 `/workout/log`, `/stats-1rm` → `/stats`.

## 로컬 env (`web/.env.local`)

```bash
DATABASE_URL=postgres://app:app@127.0.0.1:5432/workoutlog  # 또는 Supabase pooler URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
WORKOUT_AUTH_USER_ID=00000000-0000-4000-8000-000000c1c1c1  # app_user.id(uuid) FK 대상 — uuid만 허용, seed가 이 계정 생성
NEXT_PUBLIC_DISABLE_SW=1
# NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=1  # (선택) 이메일 복구 UI 노출 — RESEND_*와 함께일 때만 켤 것
# WORKOUT_SEED_ADMIN_FALLBACK=1  # (선택) db:seed가 폴백 계정을 admin으로 승격 — 로컬에서 관리자 표면(디버그 도구)을 보려면
# DB_SCHEMA=dev   # (선택) prod 인스턴스의 dev 스키마로 격리 개발 시 — DATABASE_URL을 prod 풀러로 두고 함께 설정
```

Supabase 사용 시 풀러/다이렉트 URL은 [로컬 개발 가이드](web/docs/local-dev-after-clone-guide.md) 참고. dev DB는 별도 프로젝트가 아니라 prod 인스턴스의 `dev` 스키마로 격리됨(`DB_SCHEMA=dev`) — CI/CD 동작은 [CI/CD 파이프라인 가이드](web/docs/ci-cd-pipeline-guide.md) 참고. 브랜치/커밋 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md).
