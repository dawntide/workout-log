# 에이전트 참고 자료

`AGENTS.md`에서 옮긴 상세 설명이다. 매 세션 읽지 않고, 해당 영역을 고치기 전에 읽는다. 규칙과 명령은 `AGENTS.md`가 정본이다.

## 패키지와 호스팅

- **모노레포**: 루트 pnpm 워크스페이스(`pnpm-workspace.yaml`) — `web` + `apps/api` + `apps/mcp` + `packages/core`, lockfile은 루트 1개. **clone 후 루트에서 `pnpm install` 1회**로 전 패키지 설치.
- **`packages/core` (@workout/core)**: web(Next.js)·apps/api(Hono)가 공유하는 프레임워크-무지 도메인/인프라 코드 — db(schema·client)·auth 코어·progression/program-engine·stats/home/export/import 서비스·순수 lib(session-key·bodyweight-load·program-store 등). source-only 패키지(web은 `transpilePackages`, apps/api는 tsx로 소비). **경계 규칙**: core는 next/react/DOM·요청 컨텍스트(쿠키) 무지 — userId·locale은 명시 인자, 쿠키/OAuth/RSC 어댑터(`user.ts`·`oauth-*`·messages.ts·bootstraps)는 web 잔류. 상세: [`packages/core/README.md`](../packages/core/README.md).
- **로컬 실행**: `pnpm -C web dev` (Next.js dev 서버), 접속 `http://localhost:3000`. Postgres 접속 정보는 `web/.env.local`의 `DATABASE_URL`로 전달. 배포는 Vercel(웹앱) + Supabase(Postgres).
  - ⚠️ **web 데이터 API는 apps/api(Hono 백엔드)가 처리**([`web/src/app/api/[...path]/route.ts`](../web/src/app/api/[...path]/route.ts)): 브라우저 `/api/*` same-origin 호출 → catch-all이 `wl_session` 쿠키를 `Authorization: Bearer`로 변환(동일 `auth_session` 토큰) + 앱 locale을 `Accept-Language`로 주입. **호스팅은 `APPS_API_BASE` 하나로 갈린다**:
    - **미설정 = 인프로세스 모드 — 현행 프로덕션**(2026-07-29 전환): web이 같은 Hono 앱을 `app.fetch()`로 직접 마운트(`@workout/api/app`) — 네트워크 홉·별도 프로세스 없음. **로컬에서도 apps/api를 안 띄우면 이 모드**라 데이터 라우트가 그대로 돈다. CI E2E도 이 모드.
    - **설정됨 = 프록시 모드**(별도 배포된 apps/api로 HTTP 포워딩; nightly E2E가 이 경로를 유지 검증): 로컬에서 쓰려면 apps/api 동반 실행 — `web/.env.local`에 `APPS_API_BASE=http://127.0.0.1:8787` + 별도 터미널 `cd apps/api && set -a; . ../../web/.env.local; set +a; DB_SCHEMA=dev pnpm dev`. **프로덕션 VPS(Lightsail) 배포는 내려가 있다**(서비스·Caddy disabled, 자산은 존치 — 되살리려면 `ilapi update`가 먼저, [`DEPLOY.md`](../apps/api/deploy/DEPLOY.md) 헤더 참조).
    - 두 모드는 요청 정규화가 동일해 **전환·롤백·재분리가 전부 env 하나**다. 이 성질은 CI 게이트 `pnpm -C apps/api lint:boundary`가 강제한다(규칙 2개: apps/api에 `@/`·next·react 금지 + node 서버 어댑터는 `src/index.ts` 전용) — **apps/api에서 next/react를 import하지 말 것**.
    - 인증은 모드 무관: **실제 로그인**으로 `wl_session` 쿠키 획득(prod에서 apps/api는 `WORKOUT_AUTH_USER_ID` fallback 없음). `auth`·`ops`·web잔류(stats migration-telemetry[FS결합, 마이그레이션 실행지]·page-bootstrap·health)은 web 자체 처리(구체적 route가 catch-all보다 우선; ux-snapshot은 apps/api로 이식됨). 상세: [`apps/api/deploy/DEPLOY.md`](../apps/api/deploy/DEPLOY.md), [아키텍처 레이어 모델](../web/docs/architecture-layers.md).

## 전체 문서 목록

| 문서 | 내용 |
|------|------|
| [디자인 가이드](../web/docs/design-guide.md) | 색상 토큰, 타이포그래피, 컴포넌트 규칙, 안티패턴, 43개 화면 체크리스트 |
| [구현 히스토리](../web/docs/implementation-changelog.md) | PR2~PR41 기반 IA 구조, 디자인 시스템, 모션, 비동기 UX, 자동 진행 등 전체 구현 맥락 |
| [로컬 개발 가이드](../web/docs/local-dev-after-clone-guide.md) | clone 후 세팅, 로컬 실행, 운영 스케줄러 설정 |
| [QA 테스트 가이드](../web/docs/qa-test-guide.md) | 라이트/헤비 유저 E2E 시나리오, 비동기 UX 연속성 체크리스트 |
| [프로그램 Seed 가이드](../web/docs/program-seed-guide.md) | 6개 근력 프로그램 canonical 규칙, seed 명령, 자동 진행 구현 상세 |
| [아키텍처 레이어 모델](../web/docs/architecture-layers.md) | 정식 레이어 흐름(app→widgets→features→primitives→lib→server), 의존 방향 규칙, 파사드, 린트 강제를 미루는 이유, **시스템 토폴로지(멀티프론트/단일백엔드 — web↔apps/api 프록시 cutover)** |
| [REF5 규범 사양서](ref5-program-spec.md) | 훈련 프로그램의 판정·진행·처방 규칙 정본(현재 v1.5). 변경은 §26 |
| [설계 색인](design.md) | 설계 정본 위치와 읽는 순서 |
| [결정 기록](decisions.md) | 날짜 / 결정 / 이유 / 대안과 버린 이유 |
| [REF5 근거 자료](research/ref5-evidence-2026-10/README.md) | 출처 341건·주장 24건 평가 원본. 새 프로그램·§26 근거 작업의 시작점 |
| [REF5 현재 기준 요약](notes/ref5-context.md) | 훈련 제약·열린 항목 요약(과거 핸드오프 3건 대체). 같은 폴더에 평가·스케줄·휴식타이머 푸시 노트 |
| [인계 문서](handoff.md) | 현재 상태·진행 중·다음 할 일·막힌 점 (덮어쓰기) |
| [전체 시스템 점검 2026-08](codebase-audit-2026-08.md) | **최신 감사**. 게이트 전수 실행 + prod DB 실측 + 프로덕션 블랙박스 확인. P0은 인증 폴백 비대칭(S1) 하나, 성능은 데이터 규모상 결론 유보. non-goal(가상화·DSL 4b·pg_stat 판단) 포함 |
| [전체 시스템 점검 2026-07](codebase-audit-2026-07.md) | 이전 감사 — monorepo 전체 구조/성능/보안 + 개선 계획(**전부 종결**). 진단 표는 이력으로 보존 |

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

## 관측성

- **관측성(저장 실패·UX 퍼널)**: 기록 저장은 API 라우트가 아니라 **서버 액션**([`submit-workout-log.ts`](../web/src/features/workout-log/actions/submit-workout-log.ts))이라 예외를 삼켜 `{success:false}`로 돌려준다 — uncaught가 아니므로 **Vercel 에러 그룹에 원리적으로 안 잡히고**, hobby 플랜은 런타임 로그를 보존하지 않는다(24시간 창도 0건). 사후에 남는 유일한 기록은 `ux_event_log`의 `workout_save_failed`(`stage`·`errorName`·`errorDigest`)다. **화면 문구가 계층을 가른다** — 서버 거부는 그 문구가 그대로 뜨고, 폴백(`운동기록 저장에 실패했습니다. (AbortError)`)은 전송 계층 실패다. 이벤트 이름은 [`workout-ux-event-names.ts`](../packages/core/src/observability/workout-ux-event-names.ts) **한 곳**에서만 정의하고, 카탈로그의 모든 이름은 emit 지점을 가져야 한다(가드 `web/scripts/workout-ux-event-emitters-guard.test.mjs`) — 소비처만 남고 emit이 사라져 퍼널 지표가 6개월간 0/0이었던 적이 있다. 기능이 없어지면 카탈로그·소비처에서 **함께** 지울 것.

## 클라이언트 API 캐시

[`web/src/lib/api.ts`](../web/src/lib/api.ts)의 캐시는 GET 하나를 캐시 키로 바꿀 때마다 다음 함정에 걸린다.

- **자동 무효화는 `apiMutate`(`apiPost`/`apiPut`/`apiPatch`/`apiDelete`)에만 걸린다.** 세션 저장은 서버 액션(`submitWorkoutLogAction`)이라 이 경로를 지나지 않는다. 저장으로 바뀌는 GET은 [`save.ts`](../web/src/features/workout-log/model/save.ts)의 `SAVE_INVALIDATED_CACHE_PREFIXES`로 직접 지운다.
- **IDB 웜업(`warmApiCacheFromIDB`)은 모든 엔트리를 이미 stale인 시각으로 복원한다.** 새 페이지 진입은 늘 stale 히트로 시작하고, `apiGet`은 옛 값을 먼저 돌려준 뒤 백그라운드로만 갱신한다. 갱신을 화면에 반영할 통로는 `onRevalidated` 콜백이고, 없으면 그 화면은 IDB 보존 한도(24시간)까지 옛 상태로 남을 수 있다.
- **응답 순서를 개인화해도 같은 함정이다.** body가 그대로여도 순서가 사용자 기록에 의존하면(예: `/api/exercises`의 "내가 기록한 종목 먼저") 저장 직후 낡은 순서가 굳는다. 이 경우는 `cachePolicy: "network-only"` + 서버 `Cache-Control: private, no-store`로 풀었다.
- **캐시 키를 다는 GET마다 확인할 것**: ① 그 상태를 바꾸는 쓰기가 `apiMutate`를 지나는가 ② stale 히트로 그려도 되는 화면인가(아니면 `onRevalidated`). 디바운스·호출부 메모리 캐시가 이미 요청을 줄이고 있으면 `network-only`가 답인 경우가 많다.
- "엔진(서버 처방)은 맞는데 안내 배너·판정 카드만 없다"면 이 경로를 먼저 의심한다. 이 회귀는 PR 게이트가 아니라 nightly 여정 스펙에서만 잡혔다.

## 데이터 내보내기·가져오기

- **export(`buildUserDataExport`)에 필터(`isArchived` 등)를 넣으면 스코프가 열린다.** import는 자식이 같은 파일 안의 부모만 가리키는지 검사하고 아니면 거부한다([`validateImportScope.ts`](../packages/core/src/import/validateImportScope.ts)). 부모를 거르면 그 부모를 가리키는 자식(예: `userId`로 조회하는 `generatedSession`)이 파일에 남아 정상 export가 거부된다. 자식은 부모 id로 조회해 스코프를 닫는 구조를 유지한다. 자체 user 컬럼 없이 부모로만 소유자가 정해지는 자식 테이블을 새로 만들면 `validateImportScope`의 규칙 목록에도 넣는다(테스트가 강제하지 않는다).

## 인증

- **Auth**: 이메일/비밀번호 + PBKDF2 해시 + `wl_session` httpOnly cookie 세션. `WORKOUT_AUTH_USER_ID`는 로컬/dev fallback으로만 유지 — **프로덕션 런타임에서는 web·apps/api 양쪽 다 기본 차단**이라 이 값만 배포 env에 들어가도 아무 일이 없다. 되살리려면 web은 명시 opt-in(`WORKOUT_WEB_ALLOW_ENV_AUTH=1`)이 따로 필요하고, apps/api는 production에서 플래그와 무관하게 닫혀 있다(`WORKOUT_API_ALLOW_ENV_AUTH=1`은 production 밖에서만 연다 — 아래 "env 폴백 비대칭"). E2E는 prod 빌드로 돌아 CI에서만 이 플래그를 세운다. 가입 시 dev 데이터 이전(`claimDevData` → `claimEnvFallbackData`)도 같은 조건으로 잠겨 있다(env를 직접 읽는 경로라 따로 건다). 상세: [`dev-fallback.ts`](../web/src/server/auth/dev-fallback.ts).
- **Auth 권한(role)**: `app_user.role` — `user`(기본)/`admin`/`test`, text + CHECK 제약. 세션 조회(`findActiveSession`)가 join으로 이미 실어 오므로 판정에 추가 쿼리가 없다. 강제 지점 3곳: **페이지**는 [`proxy.ts`](../web/src/proxy.ts)의 `ADMIN_PAGE_PREFIXES`가 렌더 전에 404로 접고(RSC `notFound()`만으로는 레이아웃이 먼저 스트리밍돼 상태가 200으로 굳는다), **API**는 `requireAdminUserId()`가 403, **UI 노출**은 `/api/auth/me`의 role. 승격은 수기 SQL(`update app_user set role='admin' where email=...`). 시드가 폴백 계정을 관리자로 올리는 것은 `WORKOUT_SEED_ADMIN_FALLBACK=1`일 때뿐 — E2E 레인만 세우고 **prod 시드 잡(db-seed.yml)은 세우지 않는다**(폴백 플래그가 새도 관리자가 되지 않게).
- **Auth 테스트 계정 전환(개발 모드)**: 관리자가 `/settings/debug`에서 자기 전용 테스트 계정으로 세션을 바꿔 **운영 환경에서 실데이터 없이** 확인한다. 신원 결정 경로(`findActiveSession`·`requireAuth`)는 손대지 않고 **진짜 세션을 발급해 쿠키만 스왑**한다 — 전환 중에는 문자 그대로 그 계정의 사용자라 데이터 API가 특수 처리 없이 돈다(apps/api 변경 0). 대상은 `role='test'` + 로그인 불가 센티널 계정으로 [`impersonation.ts`](../web/src/server/auth/impersonation.ts)가 관리자당 1개 자동 생성한다. 원래 신원은 `wl_admin_return` 쿠키(`session:<token>` 또는 env 폴백용 `env`)에 담고, **복귀 시 쿠키를 믿지 않고 서버가 관리자 세션을 재검증**한다. 라우트는 `POST /api/admin/impersonate{,/return}`(web 잔류, 쿠키를 굽는 일이라). ⚠️ 함정 둘: ①계정이 바뀌므로 **IDB·SW 캐시를 끝까지 지운 뒤** 리로드해야 한다([`local-app-state.ts`](../web/src/lib/local-app-state.ts)) — fire-and-forget으로 두면 웜업이 이전 계정 데이터를 복원한다. ②복귀 배너는 `position:sticky`+`z-index:100`이어야 한다. 온보딩이 `fixed`·`z-index:90` 오버레이라 흐름에 두면 **렌더는 되는데 가려져** 버튼이 안 눌린다(`toBeVisible()`은 이 회귀를 못 잡는다 — E2E가 클릭으로 잡는다).
- **Auth recovery**: `RESEND_API_KEY`, `RESEND_FROM`로 비밀번호 재설정/이메일 인증 링크 발송(`WORKOUT_APP_URL`은 OAuth 콜백에도 쓰이니 별도 유지). dev에서 Resend 미설정 시 서버 로그에 링크 출력. **UI는 `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED`(기본 off)로 게이트** — 프로덕션은 Resend 미설정이라 로그인 "비밀번호 잊음" 링크·이메일 인증 배너/설정 섹션·`/forgot-password`·`/reset-password` 페이지를 모두 숨긴다(코드는 유지). 활성화: 발송 도메인 인증 → `RESEND_*` + `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=1` 세팅 + 재배포(코드 변경 불필요). 상세 [`feature-flags.ts`](../web/src/lib/feature-flags.ts).
- **Auth OAuth**: Google 로그인(SDK 없이 fetch + PKCE 자체 구현, [`oauth-google.ts`](../web/src/server/auth/oauth-google.ts)). `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` 둘 다 설정 시 활성, redirect_uri는 `WORKOUT_APP_URL`(미설정 시 요청 origin) + `/api/auth/google/callback`. `auth_oauth_account` 테이블로 federated identity 연결. ⚠️ Vercel **preview는 도메인이 매 배포마다 달라** 고정 콜백과 어긋나 state 쿠키를 못 읽으므로(state_mismatch) `VERCEL_ENV==='preview'`에서 버튼을 자동 숨김 — preview는 이메일/비밀번호로 로그인 테스트, OAuth는 로컬/production에서 검증.
- **Auth API**: `/api/auth/{signup,login,logout,me,password}`, `/api/auth/google/{start,callback}`, `/api/auth/oauth/{status,accounts}`, `/api/auth/password/reset/{request,confirm}`, `/api/auth/email/verification/request`, `/api/auth/email/verify`.
- **Auth 경계는 세 층이다**: ① 대부분의 apps/api 라우터는 `use("*", requireAuth)`. ② `apps/api/src/routes/auth.ts`의 `/me`·`/logout`·`/login`·`/signup`·`/password/reset/request`는 `requireAuth` 없이 `sessionToken(c)`를 직접 읽는다. ③ `/api/auth/*` 상당수는 web의 자체 `route.ts`가 처리하고(구체 경로가 catch-all보다 우선) `Authorization`을 읽지 않고 `wl_session` 쿠키만 본다. 그래서 새 검사를 라우터 수준에 두면 새는 경로가 생긴다 — PAT 표면 강제를 `requireAuth` 안에 넣었을 때 `GET /api/auth/me`가 PAT로 200을 냈다. 앱 최상단(`app.use("*", enforceApiTokenSurface)`)에 걸고 등록 순서를 테스트로 고정한다(`api-token-surface.test.ts`: 미들웨어 인덱스 < 첫 구체 라우트).
- **프록시 헤더 규칙**: catch-all은 쿠키가 있을 때만 `Authorization`을 덮는다. 쿠키 없는 Bearer 요청은 그대로 통과하고(토큰 클라이언트는 web 도메인으로도 동작한다), 쿠키가 있으면 세션이 이긴다. E2E의 `page.request`는 브라우저 쿠키를 실으므로 토큰만 검증하려면 `playwright.request.newContext()`로 쿠키 없는 컨텍스트를 쓴다. 단언은 상태 코드가 아니라 "이 자격증명으로 내 신원이 서지 않는다"로 한다 — ③ 경로는 env 폴백이 열린 환경에서 200이 나온다.
- **env 폴백 비대칭**: web 폴백([`dev-fallback.ts`](../web/src/server/auth/dev-fallback.ts))은 production이 아니면 늘 열리고 production에서는 `WORKOUT_WEB_ALLOW_ENV_AUTH=1`일 때만 열린다. apps/api 폴백(`apps/api/src/auth.ts`)은 production에서 항상 닫히고 그 밖에서는 `WORKOUT_API_ALLOW_ENV_AUTH=1`일 때만 열린다. 그래서 prod 빌드로 도는 CI E2E에서 쿠키 없는 요청은 web 잔류 `/api/auth/me`는 통과하고 apps/api 라우트(`/api/settings` 등)는 401이다. 로컬에서는 이 차이가 안 보일 수 있다. 쿠키 없는 신원으로 apps/api 라우트를 두드리는 테스트·스크립트를 쓰지 말고, 실제 가입으로 쿠키를 얻거나 계정 둘 + 별도 request 컨텍스트로 나눈다. 401이 나오면 인가 버그보다 이 비대칭을 먼저 의심한다.
- **프로덕션 `/api/*` 프로브로는 라우트 존재를 증명할 수 없다**: 쿠키도 Bearer도 없는 요청은 [`proxy.ts`](../web/src/proxy.ts) 4단계가 401로 끊어 Hono까지 가지 않는다(없는 경로도 401). 라우트 등록·순서는 등록 테이블 테스트(`apps/api/src/routes/plans/route-order.test.ts` 등)로, 동작은 E2E로 확인한다. 프로덕션에서 401과 404가 갈리는 건 proxy 공개 목록의 경로(`/api/cron/*` 등)뿐이고, 미인증 401 프로브는 "미인증 요청이 막히는가"를 볼 때만 유효하다.

## 로컬 env (`web/.env.local`)

```bash
DATABASE_URL=postgres://app:<password>@127.0.0.1:5432/workoutlog  # 또는 Supabase pooler URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
WORKOUT_AUTH_USER_ID=00000000-0000-4000-8000-000000c1c1c1  # app_user.id(uuid) FK 대상 — uuid만 허용, seed가 이 계정 생성
NEXT_PUBLIC_DISABLE_SW=1
# NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=1  # (선택) 이메일 복구 UI 노출 — RESEND_*와 함께일 때만 켤 것
# WORKOUT_SEED_ADMIN_FALLBACK=1  # (선택) db:seed가 폴백 계정을 admin으로 승격 — 로컬에서 관리자 표면(디버그 도구)을 보려면
# DB_SCHEMA=dev   # (선택) prod 인스턴스의 dev 스키마로 격리 개발 시 — DATABASE_URL을 prod 풀러로 두고 함께 설정
```

Supabase 사용 시 풀러/다이렉트 URL은 [로컬 개발 가이드](../web/docs/local-dev-after-clone-guide.md) 참고. dev DB는 별도 프로젝트가 아니라 prod 인스턴스의 `dev` 스키마로 격리됨(`DB_SCHEMA=dev`) — CI/CD 동작은 [CI/CD 파이프라인 가이드](../web/docs/ci-cd-pipeline-guide.md) 참고. 브랜치/커밋 규칙은 [CONTRIBUTING.md](../CONTRIBUTING.md).

## 로컬 E2E

CI·nightly는 `PLAYWRIGHT_SERVER_MODE=prod`(prod 빌드)로 돈다. 로컬에서 `pnpm -C web test:e2e`를 그대로 돌리면 config의 webServer(`next dev --webpack`)가 서버를 띄운다. 작성 함정은 [QA 가이드 §8](../web/docs/qa-test-guide.md#8-e2e-작성-함정).

- **서버를 직접 띄우고 붙인다.** 로컬에서 관측된 사례로, webpack dev 경로가 `pg-connection-string`의 `Module not found: Can't resolve 'fs'`(체인 `instrumentation.ts` → `vercel-fluid-pool.ts` → `pg`)로 모든 요청에 500을 내 webServer가 타임아웃까지 기다렸다. `pg-native`·`ws`의 Module-not-found는 무해한 optional dep 경고다. `PLAYWRIGHT_BASE_URL`이 있으면 config가 webServer를 만들지 않는다.
  ```bash
  cd web && WORKOUT_DISABLE_RATE_LIMIT=1 pnpm exec next dev --turbo -H 127.0.0.1 -p 3100
  # /login이 200을 준 뒤
  cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test e2e/<spec> -g "<name>" --reporter=list
  ```
- **호스팅 모드**: `web/.env.local`에 `APPS_API_BASE`가 있으면 프록시 모드라 apps/api도 띄워야 한다(위 "패키지와 호스팅"; 안 띄우면 화면이 "Upstream unavailable"). 없으면 인프로세스 모드라 web dev 서버 하나로 된다. 워크트리처럼 `.env.local`을 새로 쓸 때는 `DATABASE_URL`·`DB_SCHEMA=dev`·`NEXT_PUBLIC_APP_URL`·`NEXT_PUBLIC_DISABLE_SW=1`만 두고 `WORKOUT_AUTH_USER_ID`는 넣지 않는다 — 넣으면 쿠키 없는 요청이 시드 계정으로 해석돼 `mode: "replace"` import 같은 파괴적 스펙이 그 계정을 지울 수 있다.
- **`WORKOUT_DISABLE_RATE_LIMIT=1`은 서버 프로세스에 붙인다.** 가입은 IP당 시간당 5회라 한 스펙에서 6번째 가입부터 429다. Playwright 쪽에 붙이면 효과가 없다. CI·nightly는 이미 세운다.
- **기능 플래그가 CI와 다르다.** config webServer와 CI는 `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED`를 켜고, `.env.local`에는 보통 없다(기본 off). 켜지면 미인증 계정에 이메일 인증 배너("인증 배너 닫기")가 떠 앵커 없는 `/닫기/` 매처가 그걸 잡는다(가드: `web/scripts/e2e-onboarding-matcher-guard.test.mjs`). nightly만 깨지는 스펙은 이 플래그를 켜고 띄워 재현한다. nightly는 여기에 prod 빌드 + 프록시 모드다(`e2e-nightly.yml`).
- **반복 실행은 prod 빌드로 한다.** dev 서버는 E2E를 반복하면 힙 4GB로도 OOM으로 죽고, 죽기 전부터 청크를 못 줘(`ChunkLoadError`) 하이드레이션이 조용히 깨진다 — 테스트가 "요소가 없다"로 실패해 스펙 버그처럼 보인다.
  ```bash
  cd web && DB_MIGRATE_ENABLED=0 pnpm build   # pnpm build는 migrate.mjs부터 돈다 — 기본은 건너뛴다
  cd web && WORKOUT_WEB_ALLOW_ENV_AUTH=1 WORKOUT_ALLOW_INSECURE_COOKIES=1 WORKOUT_DISABLE_RATE_LIMIT=1 pnpm start -H 127.0.0.1 -p 3100
  ```
  브랜치에 새 마이그레이션이 있어 적용해야 하면 먼저 `DB_SCHEMA=dev`인지 확인한다 — `DB_SCHEMA`가 비면 `public`(프로덕션)에 적용된다. `WORKOUT_ALLOW_INSECURE_COOKIES=1`이 없으면 prod 빌드가 세션 쿠키를 Secure로 구워 http에서 전부 401이다.
- turbopack은 `packages/core`의 TS 파싱 에러 뒤에는 소스를 되돌려도 500을 계속 낸다(`/api/health`까지). 서버를 재기동하고, 그래도 안 되면 `.next/cache`를 지운다. 서버를 멈춰도 포트를 잡은 자식 프로세스가 남을 수 있으니 포트로 PID를 찾아 종료한다.
- 아티팩트는 `web/test-results/`(gitignore됨)에 떨어진다. 실패 원인은 `error-context.md`(a11y 스냅샷)가 가장 빨리 보여 준다.
- 고침을 검증할 때는 고침을 무력화해 같은 스펙이 **의도한 문구로** 실패하는지 본다 — 500·429로 실패하면 negative check가 아니라 환경 사고다.
