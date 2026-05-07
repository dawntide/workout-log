# Workout Log — Claude Code 가이드

## 프로젝트 개요

멀티유저 근력 운동 기록 앱. Next.js 16 + React 19, TypeScript, Drizzle ORM + PostgreSQL, PWA.

- **앱 코드**: `web/` 디렉터리 (Next.js App Router)
- **인프라**: `infra/` 디렉터리
- **로컬 실행**: 저장소 루트에서 `./dev up` (Docker), 접속 `http://localhost:3000`

## 핵심 문서

| 문서 | 내용 |
|------|------|
| [디자인 가이드](web/docs/design-guide.md) | 색상 토큰, 타이포그래피, 컴포넌트 규칙, 안티패턴, 43개 화면 체크리스트 |
| [구현 히스토리](web/docs/implementation-changelog.md) | PR2~PR41 기반 IA 구조, 디자인 시스템, 모션, 비동기 UX, 자동 진행 등 전체 구현 맥락 |
| [로컬 개발 가이드](web/docs/local-dev-after-clone-guide.md) | clone 후 세팅, Docker/non-Docker 실행, 운영 스케줄러 설정 |
| [QA 테스트 가이드](web/docs/qa-test-guide.md) | 라이트/헤비 유저 E2E 시나리오, 비동기 UX 연속성 체크리스트 |
| [프로그램 Seed 가이드](web/docs/program-seed-guide.md) | 6개 근력 프로그램 canonical 규칙, seed 명령, 자동 진행 구현 상세 |

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
# 개발 서버 (Docker)
./dev up

# DB 마이그레이션 + 시드
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo-plans   # 샘플 플랜 포함

# 테스트
pnpm test:progression     # 자동 진행 로직 유닛 테스트
pnpm test:e2e             # Playwright E2E

# 빌드
pnpm build
```

## 코드 규칙 요약

- **No-Line Rule**: 1px 테두리 대신 배경색 전환으로 계층 구분
- **터치 영역**: 모든 인터랙티브 요소 최소 44×44px
- **표면 토큰**: `bg-white` 직접 사용 금지 → `--token-card-surface` 등 공유 토큰 사용
- **SWR 캐시**: 데이터 fetch는 `apiGet`/`apiPost` (lib/api.ts) 사용
- **Auth**: 이메일/비밀번호 + PBKDF2 해시 + `wl_session` httpOnly cookie 세션. `WORKOUT_AUTH_USER_ID`는 로컬/dev fallback으로만 유지.
- **Auth recovery**: `RESEND_API_KEY`, `RESEND_FROM`, `WORKOUT_APP_URL`로 비밀번호 재설정/이메일 인증 링크 발송. dev에서 Resend 미설정 시 서버 로그에 링크 출력.
- **Auth API**: `/api/auth/{signup,login,logout,me,password}`, `/api/auth/password/reset/{request,confirm}`, `/api/auth/email/verification/request`, `/api/auth/email/verify`, `/api/me/security/events`.
- **라우트 네이밍**: 설계 문서의 `/workout-record` → 실제 구현 `/workout/log`, `/stats-1rm` → `/stats`
