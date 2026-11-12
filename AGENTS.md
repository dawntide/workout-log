# AGENTS.md

이 파일은 이 저장소에서 작업하는 모든 코딩 에이전트(Claude Code, Codex, Antigravity 등)가 공유하는 단일 지침이다. `CLAUDE.md`는 `@AGENTS.md` 한 줄만 두므로 **이 파일만 고친다**. 도구 전용 운영 규칙(모델 배정, 스레드 운용 등)은 여기에 넣지 않는다. 매 세션 필요하지 않은 상세는 [`docs/agent-reference.md`](docs/agent-reference.md)에 둔다.

# Workout Log — 에이전트 가이드

## 프로젝트 개요

멀티유저 근력 운동 기록 앱. Next.js 16 + React 19, TypeScript, Drizzle ORM + PostgreSQL, PWA. 배포는 Vercel(웹앱) + Supabase(Postgres).

- **구성**: 루트 pnpm 워크스페이스(`web`, `apps/api`, `apps/mcp`, `packages/core`), lockfile은 루트 1개. **clone 후 루트에서 `pnpm install` 1회.** 앱 코드는 `web/`(Next.js App Router), `packages/core`(@workout/core)는 web·apps/api가 공유하는 프레임워크-무지 코드다.
- **로컬 실행**: `pnpm -C web dev`, 접속 `http://localhost:3000`. Postgres 접속 정보는 `web/.env.local`의 `DATABASE_URL`.
- **데이터 API**: 브라우저 `/api/*`는 apps/api(Hono)가 처리한다. `APPS_API_BASE` 미설정이면 web이 같은 앱을 직접 마운트하는 인프로세스 모드로, **현행 프로덕션이자 로컬 기본값**이라 apps/api를 따로 띄우지 않아도 된다. 설정하면 별도 apps/api로 프록시한다. 프로덕션 VPS 배포는 내려가 있다.
- **경계**: core는 next/react/DOM·요청 컨텍스트(쿠키)를 모른다(userId·locale은 명시 인자). **apps/api에서 `@/`·next·react를 import하지 말 것.** 둘 다 CI 게이트 `lint:boundary`가 강제한다.

호스팅 모드, 인증, 관측성, 경로 구조, 로컬 env, 전체 문서 목록은 [`docs/agent-reference.md`](docs/agent-reference.md)에 있다. 해당 영역을 고치기 전에 읽는다.

## 작업 규칙 (도구 공통)

- **시작할 때**: 이 파일 → [`docs/handoff.md`](docs/handoff.md)(현재 상태·진행 중·막힌 점) 순으로 읽는다. 이유가 필요한 결정은 [`docs/decisions.md`](docs/decisions.md)에서 먼저 찾고, 거기 있는 결정·폐기한 방식을 뒤집기 전에 멈추고 보고한다.
- **⚠️ 의무 — 인계 기록**: 작업을 마치거나 중단할 때 `docs/handoff.md`를 갱신하고(덮어쓰기), 설계 결정을 했으면 `docs/decisions.md`에 이유와 함께 추가한다(날짜 / 결정 / 이유 / 대안과 버린 이유). 시도했다가 버린 방식도 같은 곳에 남긴다. 도구마다 메모리가 따로 있어 저장소에 없는 맥락은 다른 도구가 볼 수 없다.
- **설계 정본**: REF5 훈련 프로그램은 [`docs/ref5-program-spec.md`](docs/ref5-program-spec.md)(정본 순서는 스펙 §2: 스펙 → `packages/core/src/program-engine/ref5.ts` → 테스트 → 세션 스냅샷 → UI 문구), 구조·레이어는 [`web/docs/architecture-layers.md`](web/docs/architecture-layers.md). 설계 정본의 위치는 [`docs/design.md`](docs/design.md)(색인)에 모여 있다.
- **설계 영향 작업**(상태 모델·모듈 경계·데이터 구조·API 계약·REF5 규칙 변경)은 구현 전에 수정안(스펙은 §26 변경관리 형식, 한 번에 한 요소)을 먼저 제안하고 사용자 승인을 받는다. 설계 변경이 없는 기능 추가·버그 수정은 바로 진행한다. 구현 중 설계와 다르게 해야 할 이유가 생기면 임의로 바꾸지 말고 멈춰서 보고한다.
- **브랜치·PR**: 기본 브랜치에서 브랜치를 따고, 작업당 draft PR 1개. 머지, force-push, CI 설정 변경은 사용자 승인 후에만 한다.
- **스테이징**: `git add -A` 금지(남은 스크래치 파일·다른 세션의 편집이 섞인다). 경로로 담고 커밋 전 `git diff --cached`를 `--stat`이 아니라 내용으로 읽는다.
- **완료 전 검증**: 완료라고 하기 전에 해당하는 lint·typecheck·테스트·빌드를 실행하고 결과 요약을 마지막 보고에 붙인다(명령은 아래 "자주 쓰는 명령").
- **접근 불가 시**: 필요한 저장소·시크릿·API에 접근할 수 없으면 무엇이 없는지 밝히고 멈춘다. mock이나 추측으로 대체하지 않는다.
- **보고**: 분석·조사 결과는 확인된 사실과 추정을 구분한다.
- **감사·계획 문서의 항목은 착수 전에 grep·`git log -S`로 재검증한다**(몇 주면 낡고, 닫힌 항목이 열린 채 남기도 한다). 죽은 항목은 종결 근거를 문서에 남긴다. 컬럼에 정책을 붙일 땐 그 테이블을 읽는 지점을 전수 분류해 가드로 굳힌다(`warmup-exclusion-guard`).
- **REF5 판정은 완화하지 않는다**: FAIL 0·HOLD ≤1·볼륨 veto 기준을 느슨하게 만드는 변경(예정 디로드 추가, 피로를 `EXTERNAL`로 분류하기 등)은 사용자가 명시하기 전에는 하지 않는다. 근거: [`docs/decisions.md`](docs/decisions.md).
- **운영 DB 쓰기 금지(에이전트)**: 기록 정정은 앱 UI 또는 사용자가 직접 실행하는 가드된 SQL로만 한다. 읽기 전용 조회는 허용.

### 함정 (실제로 틀렸던 것들)

- **세션 평가 쿼리는 반드시 `user_id::text LIKE '6f47ec53%'`(Dev 계정)로 거른다.** `f7e726df…`는 합성 데이터를 매일 재생하는 데모 계정이라 섞이면 결과가 오염된다. 상태는 `plan_runtime_state.state`, 세트는 `workout_log` ⨝ `workout_set`.
- **체중은 상수 75로 기록된다.** 사용자가 세션 체중을 입력하지 않고 실제 체중도 거의 그대로라 지금은 대체로 맞다(2026-10-16). 감량을 시작하면 실측 입력이 필요하다(스펙 §10.1·§20: 창 시작 때 `목표 총중량 − 계산 체중`으로 추가중량을 잠근다).
- **하드 SQ는 하이바**(로우바 아님, 스펙 §3.2).
- **CI 러너는 `ubuntu-24.04` 고정.** `ubuntu-latest`(26.04)는 Playwright 1.58.2 chromium 미지원 + 새 `pg_dump`의 `SET transaction_timeout`이 PG16 복원을 깬다.
- **피로·그라인딩은 `EXTERNAL`이 아니다**(스펙 §11.1–§11.3). "너무 피곤해서 시작 못 함"의 정식 밸브는 시작 시점의 MICRO 선택(§8-1)이다.
- **새 프로그램·§26 근거 작업**은 기존 근거 자료(출처 341건·주장 24건)에서 시작한다. 위치는 `docs/research/ref5-evidence-2026-10/README.md`.
- **E2E는 로컬 통과 ≠ CI 통과**(DB 데이터·기능 플래그·서버 모드가 다르다). 쓰기 전에 [QA 가이드 §8](web/docs/qa-test-guide.md#8-e2e-작성-함정), 로컬 실행 전에 `docs/agent-reference.md` "로컬 E2E"를 읽는다.
- **수기 마이그레이션은 prod·dev 두 벌의 `meta/_journal.json`에 등재해야 적용된다.** 빠뜨려도 `db:migrate`는 성공으로 끝나고 `pnpm -C web test:unit`이 잡는다. 상세: [CI/CD 가이드](web/docs/ci-cd-pipeline-guide.md) `db-migrate.yml`.
- **NULL이 기본값인 컬럼의 제외 필터는 `IS DISTINCT FROM`**(`<>`는 NULL 행을 전부 떨어뜨린다). 단일 함수로 두고(`excludeWarmupSets()`) `.toSQL()`로 단언한다.

## 핵심 문서

- UI: [디자인 가이드](web/docs/design-guide.md), [프리미티브 규칙](web/src/components/v2/primitives/README.md)
- 로컬 세팅: [로컬 개발 가이드](web/docs/local-dev-after-clone-guide.md), 브랜치·커밋: [CONTRIBUTING.md](CONTRIBUTING.md), CI: [CI/CD 가이드](web/docs/ci-cd-pipeline-guide.md)
- 시험·시드: [QA 테스트 가이드](web/docs/qa-test-guide.md), [프로그램 Seed 가이드](web/docs/program-seed-guide.md)
- 최신 감사: [전체 시스템 점검 2026-08](docs/codebase-audit-2026-08.md)

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
- **SWR 무효화**: 자동 무효화는 `apiMutate` 계열에만 걸리고(서버 액션 저장은 `save.ts`가 직접 지운다) IDB 웜업은 늘 stale로 시작한다. GET에 캐시 키를 달거나 순서를 개인화하기 전에 `docs/agent-reference.md` "클라이언트 API 캐시"를 읽는다.
- **관측성**: 기록 저장 실패는 서버 액션이 `{success:false}`로 돌려줘 Vercel 에러 그룹에 안 잡히고, 사후 기록은 `ux_event_log`의 `workout_save_failed`뿐이다. 이벤트 이름은 [`workout-ux-event-names.ts`](packages/core/src/observability/workout-ux-event-names.ts) **한 곳**에서만 정의하고 모든 이름에 emit 지점을 둔다. 기능이 없어지면 카탈로그·소비처에서 **함께** 지울 것.
- **`console.error`는 예상 못 한 예외에만**(여정 E2E가 실패로 센다). 입력 거부 같은 정상 경로는 텔레메트리만 남기고(`shouldLogSaveFailure`), 가드를 느슨하게 고치지 않는다.
- **Auth**: 이메일/비밀번호 + `wl_session` httpOnly cookie, Google OAuth. `WORKOUT_AUTH_USER_ID`는 로컬/dev fallback이고 프로덕션에서는 기본 차단이다. 해제 플래그(`WORKOUT_WEB_ALLOW_ENV_AUTH`, `WORKOUT_API_ALLOW_ENV_AUTH`)는 CI E2E에서만 세우고, prod 시드 잡(db-seed.yml)에 `WORKOUT_SEED_ADMIN_FALLBACK`을 세우지 않는다. 권한·테스트 계정 전환·복구·OAuth를 고치기 전에 [`docs/agent-reference.md`](docs/agent-reference.md)의 인증 절을 읽는다.
- **인증 경계는 한 겹이 아니다**(라우터마다 `requireAuth`가 다르고 `/api/auth/*` 상당수는 web이 쿠키로 처리). 새 인증·인가 검사는 apps/api `app.use("*", ...)` 최상단에 건다. 상세: `docs/agent-reference.md` 인증 절.
- **라우트 네이밍**: 설계 문서의 `/workout-record` → 실제 구현 `/workout/log`, `/stats-1rm` → `/stats`.
