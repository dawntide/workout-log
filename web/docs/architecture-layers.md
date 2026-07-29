# 아키텍처 레이어 모델

이 문서는 `web/src` 코드의 **정식(canonical) 레이어 모델**을 명문화한다. 2026-05 코드베이스 감사([codebase-audit-2026-05.md](./codebase-audit-2026-05.md))에서 부분적 FSD + 전통 레이아웃이 혼재하지만 라이브 코드는 하나의 일관된 흐름을 따른다는 점이 확인되었고, 그 흐름을 기준으로 삼는다.

> ✅ 레이어 방향은 **ESLint로 `error` 강제된다**(2026-07-06, `eslint.config.mjs`의 `@typescript-eslint/no-restricted-imports` — 아래 "강제 현황" 참고). type-only import와 테스트 파일은 예외.

## 레이어 흐름 (위 → 아래로만 의존)

```
app/                  Next.js 라우트, SSR 부트스트랩, 페이지 셸
  ↓
widgets/              화면 단위 조립 (workout-log-screen, stats-screen, calendar-screen 등)
  ↓
features/*/           기능 슬라이스 — model(상태/로직) + ui + store(jotai atoms)
  ↓
components/v2/primitives   공유 UI 커널 (V2Card, V2PrimaryBtn, V2NavRow 등)
  ↓
lib/                  순수 도메인/유틸 커널 (프레임워크·DB 비종속, 테스트로 고정)
  ↓
server/               DB(Drizzle) 접근 + 서버 도메인 엔진 (progression, program-engine)
```

**핵심 규칙**

1. **의존은 위에서 아래로만.** 아래 레이어가 위 레이어를 import하면 안 된다.
   - 특히 `server/`는 최하위 레이어다. `server/`가 `features/`·`widgets/`를 import하면 **역방향 위반**이다. (예: 과거 `server/services/workout-log/load-workout-log-context.ts`가 `features/workout-log/model/weight-rules`를 import했던 건 → 공유 커널이므로 `lib/workout-record/weight-rules.ts`로 이전해 해소함.)
2. **공유 코드의 집은 `lib/` 하나.** 둘 이상의 레이어/슬라이스가 쓰는 순수 로직은 `features/`가 아니라 `lib/`에 둔다. `lib/`는 React/Next/Drizzle에 의존하지 않는 순수 함수가 원칙이다.
3. **UI 재구현 금지(Primitive-First).** 카드/버튼/네비행은 `components/v2/primitives` 조합으로만. 자세한 규칙은 [`components/v2/primitives/README.md`](../src/components/v2/primitives/README.md) 및 [design-guide.md](./design-guide.md).
4. **기능 간 횡단 import 지양.** 한 `features/A`가 다른 `features/B`의 내부를 직접 import하지 말 것. 공유가 필요하면 `lib/`로 내린다.

## 파사드 레이어 (`entities/`, `shared/api/`)

`entities/workout-record`, `shared/api`는 **얇은 re-export 배럴**이다. 실체는 모두 `lib/`에 있다(예: `entities/workout-record` → `@/lib/workout-record/model`·`entry-state`). 따라서:

- `lib/` 내부 코드는 파사드(`@/entities/*`)를 거치지 말고 **실체(`@/lib/...`)를 직접 import**한다 (lib→entities→lib 우회 방지).
- `features/`·`widgets/`·`app/`에서는 파사드를 써도 무방하다.

## 강제 현황 — 레이어 ESLint `error` (2026-07-06 승격)

`eslint.config.mjs`가 레이어별 glob에 `@typescript-eslint/no-restricted-imports`를 `error`로 건다:
widgets→app, features→widgets/app, `components/v2/primitives`→상향 전부, lib→상향 전부+파사드(`@/entities`·`@/shared`), server→상향 전부.
**예외 2가지**: ① `import type`(런타임 의존 아님 — `allowTypeImports`) ② `*.test.ts(x)`(런타임 그래프 밖).

승격 전 해소한 선행 부채(감사 2026-07 §4.5의 3건 + 승격 작업 중 발견 1건):
- `v2-home-dashboard` 화면 조립기 → `widgets/home-dashboard/`로 이동 (components/v2는 primitives 커널만).
- `features/workout-log` → `features/progression/ui/target-weight-chip` 횡단 import → 칩을 `components/v2/`로 하강(공용 프레젠테이셔널).
- `server/…/load-workout-log-context` → features 런타임 import → `last-session-summary`·`query-context`·`workout-log-types`를 `lib/workout-record/`로 하강(weight-rules 선례), feature 쪽 `model/types`는 재export 셸.
- `widgets/workout-log-screen` → `@/app/workout/log/loading` 상향 import(승격 중 발견) → 스켈레톤을 widget으로 내리고 route `loading.tsx`는 재export.

## 후속 과제

- 정규 FSD 전면 전환(빈 `entities/`·`shared/` 실제 구현, `lib/` 세그먼트 슬라이싱)은 1인 앱 비용 대비 효과가 낮아 **하지 않는다**(감사 결론).
- 기능 간 횡단 import(features/A→features/B) 전면 금지는 per-slice 룰 생성이 필요해 미도입 — 규칙 4로 지양 유지, 위반 발견 시 lib 하강.

## 시스템 토폴로지 — 멀티프론트 / 단일 백엔드 (2026-06 cutover)

위 레이어 모델은 `web/src` **한 패키지 내부**의 의존 방향이다. 공유 백엔드 로직은 **`@workout/core`(`packages/core`)로 물리 추출 완료**(2026-07, #497~#503): db 스키마/클라이언트·auth 코어·progression/program-engine·stats/home/export/import 서비스·순수 lib이 core에 있고, web과 `apps/api`(Hono)가 pnpm 워크스페이스 패키지로 같은 코드를 소비한다 — **백엔드 로직은 코드 1벌**(중복 없음), apps/api의 web/src import는 0(구 `@/*` alias 제거).

> 🛑 **아래 그림은 2026-07-29 이전(프록시 모드)의 배치다.** 현재 프로덕션은 **인프로세스 모드**라
> apps/api가 별도 호스트가 아니라 web(Vercel) 함수 **안에서** 돈다 — lightsail 상자와 그리로 가는
> HTTPS 화살표는 없다고 보면 된다. 그림을 남겨두는 이유는 nightly E2E가 이 배치를 매일 검증하고
> 있어 언제든 되돌아갈 수 있기 때문이다. 전환 스위치는 아래 §호스팅 모드 스위치.

의존 방향: `web → @workout/core ← apps/api` (core는 next/react/DOM·요청 컨텍스트 무지 — userId·locale 명시 인자, `lint:boundary` CI 게이트). 쿠키 세션 어댑터(`server/auth/user.ts`)·OAuth·RSC 부트스트랩·i18n 카피(`lib/i18n/messages.ts`)는 web 잔류.

```
                                클라이언트
       ┌────────────────────────────┴───────────────────────────┐
   브라우저 (web 앱)                                    ironlog (Go TUI)
       │                                          ※ lightsail에서 tmux로 실행
       │ /api/*  (same-origin,                            │ Authorization: Bearer
       │  httpOnly wl_session 쿠키)                        │ → http://127.0.0.1:8787
       ▼                                                  │   (같은 호스트, TLS 우회)
┌─────────────────────────────┐                          │
│  web — Next.js 16            │                          │
│  Vercel (서울 / icn1)         │                          │
│                             │                          │
│  ① catch-all 프록시          │──── 쿠키→Bearer ─────┐    │
│     app/api/[...path]       │                      │    │
│  ② auth·ops·미이식 route     │──── 직접 ───┐        │ HTTPS (sslip.io)
│  ③ SSR 9 RSC (페이지 렌더)   │──── 직접 ───┤        │    │
└─────────────────────────────┘            │        ▼    ▼
                                           │   ┌──────────────────────────┐
                                           │   │  apps/api — Hono          │
                                           │   │  AWS lightsail (서울)      │
                                           │   │  Caddy :443 → Hono :8787   │
                                           │   │  systemd 상시가동           │
                                           │   │  = @workout/core 소비       │
                                           │   └────────────┬─────────────┘
                                           │ 직접            │ 직접
                                           ▼                ▼
                              ┌────────────────────────────────────┐
                              │  Supabase Postgres                  │
                              │  ap-northeast-2 (서울) · public 스키마│
                              └────────────────────────────────────┘
```

> ⚠️ 위 그림의 ironlog 화살표는 **VPS에서 `ilapi cutover local`로 돌릴 때**의 경로다. 릴리스
> 바이너리의 기본 서버는 `.goreleaser.yaml`의 ldflags `defaultBase`가 박아 넣는 **web(Vercel)
> 오리진**이고, 그때 ironlog는 apps/api로 직결하지 않고 브라우저와 같은 문으로 들어온다 —
> 인증은 web의 auth route에 **쿠키**로(클라이언트가 쿠키 jar와 Bearer를 함께 들고 다닌다,
> [`client.go`](../../apps/tui/internal/api/client.go)의 `SetSessionToken`), 데이터는 catch-all로.
> `assertSameOrigin`은 Origin 헤더가 없으면 통과시키므로(네이티브 클라이언트) CSRF 검사에
> 걸리지 않는다. 접속 서버는 `IRONLOG_API_URL`·저장된 서버 URL로 런타임에 바뀐다.

### web `/api/*` 요청 경로 (Next 라우팅: 구체적 route > catch-all `[...path]`)

| 요청 | 처리 | DB 접근 |
|------|------|---------|
| **데이터 33개** — logs·plans·stats·settings·exercises·home·export·templates·generated-sessions·program-versions·ux-events·me/import | **① catch-all 프록시** → apps/api | apps/api가 |
| **auth/\*** — login·signup·logout·me·password·sessions·OAuth·reset (쿠키 Set-Cookie·CSRF) | **② web route** | web 직접 |
| **web 잔류** — ops/\*·health·stats/migration-telemetry·stats/page-bootstrap | **② web route** | web 직접 |
| **페이지 SSR** — `/`·`/workout/log`·`/stats`·`/plans` … | **③ RSC가 `@/server` 직접 import** | web 직접 |

이식된 데이터 라우트의 `web/src/app/api/**/route.ts`는 삭제됐고, catch-all([`app/api/[...path]/route.ts`](../src/app/api/%5B...path%5D/route.ts))이 받아 apps/api로 넘긴다. auth·ops·미이식은 더 구체적인 route라 Next 라우팅상 자동 우선 → web이 직접 처리.

### 호스팅 모드 스위치 — 같은 백엔드, 두 가지 배치

apps/api는 **어디서 도는지와 무관**하게 같은 Hono 앱이다. 앱 정의([`apps/api/src/app.ts`](../../apps/api/src/app.ts))와 node 기동 엔트리([`index.ts`](../../apps/api/src/index.ts))가 갈라져 있어, catch-all이 `APPS_API_BASE` 하나로 배치를 고른다:

| `APPS_API_BASE` | 모드 | 경로 |
|---|---|---|
| 미설정 | **인프로세스** — **현행 프로덕션·CI E2E** | 브라우저 → web(Vercel) → `app.fetch()` — 네트워크 홉 없음 |
| 설정됨 | **프록시** — nightly E2E·로컬 선택 | 브라우저 → web(Vercel) → HTTP → 별도 배포된 apps/api |

**2026-07-29 인프로세스로 전환 완료.** Vercel에서 `APPS_API_BASE`를 제거했고, VPS(Lightsail)의
`ironlog-api`·전용 `caddy`는 stop + disable됐다(리포·유닛·`ilapi`는 롤백 자산으로 존치, 인스턴스는
다른 용도로 계속 사용 중). 되살리려면 `ilapi update`부터 — 정지 시점 리포가 낡아 코드↔DB 스큐를
재현한다. 상세는 [`DEPLOY.md`](../../apps/api/deploy/DEPLOY.md) 헤더.

두 모드는 요청을 **동일하게 정규화**한다(쿠키 → `Authorization: Bearer`, 앱 locale → `Accept-Language`). 핸들러는 자기가 어느 토폴로지에서 도는지 알 수 없고, 그래서 전환이 **코드 변경 없이 env 하나**다 — 인프로세스로 옮긴 뒤 문제가 생기면 같은 변수를 되돌리는 게 롤백이고, 나중에 다시 분리 배포하고 싶어질 때도 같은 레버다.

**CI가 두 모드를 나눠 맡는다**: [`ci.yml`](../../.github/workflows/ci.yml)의 E2E는 `APPS_API_BASE` 없이(=인프로세스, 프로덕션과 동일) 돌고, [`e2e-nightly.yml`](../../.github/workflows/e2e-nightly.yml)은 apps/api를 별도 프로세스로 띄워(=분리형) 전체 스위트를 돌린다. 그래서 다시 분리 배포하기로 해도 "지금도 되나?"를 새로 확인할 필요가 없다 — nightly가 매일 증명하고 있다.

이 성질을 유지하는 게 CI 게이트 [`pnpm -C apps/api lint:boundary`](../../apps/api/scripts/lint-boundary.mjs)다. 규칙 2개: **framework**(apps/api가 `@/`·next·react를 import하면 실패 — 인프로세스라고 프레임워크를 끌어다 쓰면 재분리가 env 변경이 아니라 리팩터가 된다), **server-entry**(node 서버 어댑터는 `index.ts` 전용 — app.ts 계보에 섞이면 web 서버리스 번들에 node 전용 서버가 끌려온다).

### 인증 — 토큰 1개로 통일

```
web 로그인 :  브라우저 → /api/auth/login (web route) → Set-Cookie: wl_session
web 데이터 :  브라우저 ─(쿠키)→ catch-all ─ Bearer <쿠키값> → apps/api ┐
ironlog    :  저장 토큰 ──────────────────── Bearer ──────→ apps/api ┤
                                                                     ▼
                          findActiveSession() — 셋 다 같은 auth_session 행
```

`wl_session`(쿠키값) = `Bearer`(토큰) = DB `auth_session` PK — **동일 토큰**이라 catch-all 프록시는 쿠키→헤더 **변환만** 할 뿐 교환이 없다. apps/api는 토큰을 응답 **body로만** 반환(Set-Cookie 안 함)하므로, 쿠키를 발급해야 하는 auth 라우트는 프록시 불가 → web 유지.

### 핵심 성질

- **백엔드 로직 1벌** — `server/`를 web(SSR·route)과 apps/api가 둘 다 import. 물리적으로 두 호스트에서 돌지만 코드 중복 없음.
- **web은 "프록시 + 직접 DB" 혼합** — 데이터 API만 apps/api로 위임, SSR/auth/미이식은 web이 직접 DB. 완전 분리(SSR까지 HTTP화)는 성능·단일점 후퇴라 의도적으로 안 함.
- **단일 의존점** — 프록시 모드에서 apps/api 다운 시 web 데이터 라우트는 502, 단 SSR 페이지·auth는 web 직접이라 생존. **현행 인프로세스 모드에서는 이 의존점 자체가 없다**(대신 web 함수가 DB를 직접 물고, 커넥션이 람다 수만큼 팬아웃 → 레이트리밋은 Upstash Redis로 공유, `UPSTASH_REDIS_REST_*`).
- **전부 서울 리전**(Vercel icn1 / Supabase ap-northeast-2, Upstash는 최근접 도쿄) — 프록시 홉이 있던 시절에도 레이턴시는 미미했다.
- **두 프론트의 접속 차이** — 릴리스 ironlog의 기본 서버는 **web(Vercel) 오리진**이라 브라우저와 같은 경로를 탄다(인증=쿠키, 데이터=catch-all). VPS에서 `ilapi cutover local`로 돌릴 때만 `127.0.0.1:8787` 직결(TLS 우회)이 된다. 즉 **인프로세스 전환에 TUI 코드 변경은 필요 없다** — 기본 서버를 그대로 두면 백엔드가 web 안으로 들어온 것만 달라진다.

> 배포·운영(systemd·Caddy·ilapi·env) 상세는 [`apps/api/deploy/DEPLOY.md`](../../apps/api/deploy/DEPLOY.md).
