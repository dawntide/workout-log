# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Workout Log — Claude Code 가이드

## 프로젝트 개요

멀티유저 근력 운동 기록 앱. Next.js 16 + React 19, TypeScript, Drizzle ORM + PostgreSQL, PWA.

- **앱 코드**: `web/` 디렉터리 (Next.js App Router)
- **로컬 실행**: `pnpm -C web dev` (Next.js dev 서버), 접속 `http://localhost:3000`. Postgres 접속 정보는 `web/.env.local`의 `DATABASE_URL`로 전달. 배포는 Vercel(웹앱) + Supabase(Postgres).

## 핵심 문서

| 문서 | 내용 |
|------|------|
| [디자인 가이드](web/docs/design-guide.md) | 색상 토큰, 타이포그래피, 컴포넌트 규칙, 안티패턴, 43개 화면 체크리스트 |
| [구현 히스토리](web/docs/implementation-changelog.md) | PR2~PR41 기반 IA 구조, 디자인 시스템, 모션, 비동기 UX, 자동 진행 등 전체 구현 맥락 |
| [로컬 개발 가이드](web/docs/local-dev-after-clone-guide.md) | clone 후 세팅, 로컬 실행, 운영 스케줄러 설정 |
| [QA 테스트 가이드](web/docs/qa-test-guide.md) | 라이트/헤비 유저 E2E 시나리오, 비동기 UX 연속성 체크리스트 |
| [프로그램 Seed 가이드](web/docs/program-seed-guide.md) | 6개 근력 프로그램 canonical 규칙, seed 명령, 자동 진행 구현 상세 |
| [아키텍처 레이어 모델](web/docs/architecture-layers.md) | 정식 레이어 흐름(app→widgets→features→primitives→lib→server), 의존 방향 규칙, 파사드, 린트 강제를 미루는 이유 |

## 주요 경로

```
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
│   └── api/                # API Routes
├── components/ui/          # 공유 UI 컴포넌트
├── server/
│   ├── auth/               # PBKDF2, cookie session, reset/verify token, event log
│   ├── email/              # Resend fetch 기반 발송 헬퍼
│   ├── db/schema.ts        # Drizzle 스키마
│   └── progression/        # 자동 진행 비즈니스 로직
└── lib/
    ├── api.ts              # SWR 캐시 HTTP 클라이언트
    └── settings/           # 설정 관리 + rollback
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
pnpm -C web test:unit            # progression + settings + auth + import 등 핵심 유닛
pnpm -C web test:progression     # 자동 진행 로직만
pnpm -C web test:e2e             # Playwright E2E (전체)
pnpm -C web test:async-ux:continuity   # 비동기 UX 연속성 단일 시나리오

# 빌드 (migrate 후 next build 실행)
pnpm -C web build
```

단일 테스트는 `tsx --test <path>` 직접 호출 (예: `pnpm -C web exec tsx --test src/server/progression/reducer.test.ts`).

## 코드 규칙 요약

- **Primitive-First Assembly**: 카드/버튼/네비행은 [`@/components/v2/primitives`](web/src/components/v2/primitives/) V2 컴포넌트 조합으로만 (`V2Card`, `V2PrimaryBtn`, `V2NavRow` 등). inline `<div style={...}>`로 같은 역할 재구현 금지 — 자세한 규칙은 [`web/src/components/v2/primitives/README.md`](web/src/components/v2/primitives/README.md).
- **No-Line Rule**: 1px 테두리 대신 배경색 전환(`--v2-paper` → `--v2-paper-2/3`)으로 계층 구분. divider는 `V2Hairline`.
- **토큰만 사용**: 색상은 `--v2-*`, spacing은 4-pt 그리드(`--v2-s-1..9`), radius는 `--v2-r-*`. hex 하드코딩 / 비-4pt 값 금지.
- **터치 영역**: 모든 인터랙티브 요소 최소 44×44px.
- **아이콘**: Material Symbols Outlined (`<span className="material-symbols-outlined">name</span>`)만. custom SVG UI 아이콘 금지.
- **SWR 캐시**: 데이터 fetch는 `apiGet`/`apiPost` ([web/src/lib/api.ts](web/src/lib/api.ts)) 사용.
- **Auth**: 이메일/비밀번호 + PBKDF2 해시 + `wl_session` httpOnly cookie 세션. `WORKOUT_AUTH_USER_ID`는 로컬/dev fallback으로만 유지.
- **Auth recovery**: `RESEND_API_KEY`, `RESEND_FROM`, `WORKOUT_APP_URL`로 비밀번호 재설정/이메일 인증 링크 발송. dev에서 Resend 미설정 시 서버 로그에 링크 출력.
- **Auth API**: `/api/auth/{signup,login,logout,me,password}`, `/api/auth/password/reset/{request,confirm}`, `/api/auth/email/verification/request`, `/api/auth/email/verify`, `/api/me/security/events`.
- **라우트 네이밍**: 설계 문서의 `/workout-record` → 실제 구현 `/workout/log`, `/stats-1rm` → `/stats`.

## 로컬 env (`web/.env.local`)

```bash
DATABASE_URL=postgres://app:app@127.0.0.1:5432/workoutlog  # 또는 Supabase pooler URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
WORKOUT_AUTH_USER_ID=local-user
NEXT_PUBLIC_DISABLE_SW=1
# DB_SCHEMA=dev   # (선택) prod 인스턴스의 dev 스키마로 격리 개발 시 — DATABASE_URL을 prod 풀러로 두고 함께 설정
```

Supabase 사용 시 풀러/다이렉트 URL은 [로컬 개발 가이드](web/docs/local-dev-after-clone-guide.md) 참고. dev DB는 별도 프로젝트가 아니라 prod 인스턴스의 `dev` 스키마로 격리됨(`DB_SCHEMA=dev`) — CI/CD 동작은 [CI/CD 파이프라인 가이드](web/docs/ci-cd-pipeline-guide.md) 참고. 브랜치/커밋 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md).
