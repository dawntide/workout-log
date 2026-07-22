# Workout Log — 전체 시스템 점검 및 개선 계획 (2026-07)

> **작성일**: 2026-07-02 · **범위**: monorepo 전체 — `web/`(Next.js 16 프론트+잔류 API), `apps/api/`(Hono 백엔드), `apps/tui/`(Go ironlog), DB 스키마/쿼리, CI/CD, 배포 토폴로지.
> **방법**: 영역별 병렬 정밀 탐색(프론트엔드·백엔드/프록시/인증·DB 스키마/핫패스·테스트/CI/부채·TUI) + 게이트 직접 실행 검증. 모든 핵심 주장은 `file:line`으로 근거를 표기한다.
> **이전 감사**: [codebase-audit-2026-05.md](../web/docs/codebase-audit-2026-05.md) (web 단독 범위) — §7에서 후속 상태를 추적한다.
>
> **⚠️ 이 문서는 2026-07-02 시점의 진단이다.** 개선 계획(§5)은 2026-07-22 재확인 기준 **거의 전부 실행 완료**됐고,
> 각 항목에 ✅ 근거를 달아 두었다. 지금 열려 있는 일만 보려면 [§우선순위 요약](#우선순위-요약)의 진행 상태 박스를 볼 것 —
> **남은 것은 god-component 분해와 DB 멀티유저 격리(의도적 이월) 둘뿐**이다. 발견 당시의 진단 표(§4)는 이력으로 보존한다.

---

## 1. TL;DR

**코드 위생과 구조 설계는 상위권, 리스크는 코드 바깥(운영 경계)에 있다.**

- 게이트 직접 실행 결과 전부 통과: web `typecheck` ✓ · `lint`(경고 0) ✓ · apps/api `typecheck` ✓ · TUI `go build`+`go vet` ✓.
- 코드 위생: TODO/FIXME/HACK **0건**, `@deprecated` 0건, eslint-disable 단 5건(전부 `react-hooks/exhaustive-deps`), 디자인 린트 baseline **전항목 0**, 죽은 코드 정리 활발(#482·#483).
- 실제 위험은 세 곳에 집중: **① apps/api 공개 인증 엔드포인트의 보안 공백**(rate limit 부재, ops fail-open), **② CI가 web만 지키는 게이트 사각지대**(apps/api CI 0, TUI 테스트 미편입, e2e 13/14 미게이트), **③ 사용 기간에 비례해 느려지는 DB 핫패스**(전체 이력 스캔, 인덱스 누락, 렌더-시-쓰기).
  → **셋 다 해소됨**(2026-07-22 재확인). ①은 §5.1, ②는 §4.2 재확인 박스, ③은 §5.2를 볼 것.

규모: web 444 TS 파일 / 8.5만 줄 · apps/api 4.5천 줄(엔드포인트 53개) · TUI Go 9.5천 줄(31 소스 + 21 테스트 파일) · 총 1,168 커밋.

### 우선순위 요약

> **진행 상태 (2026-07-22 전수 재확인)**: 아래 P0~P3가 **전부 반영 완료**되었다. 코드에서 직접 확인한
> 근거는 각 항목의 "현재" 칸과 §4.2·§4.3·§5에 적었다. **남은 것은 두 가지뿐** — god-component 분해(§5.4-4)와
> DB 멀티유저 격리(§7, 의도적 이월). R8(사전 커밋 훅)은 미도입이나, 근거였던 CI 사각지대 R1~R3이 닫혀 위험도가 내려갔다.

| 우선도 | 작업 | 노력 | 현재 |
|---|---|---|---|
| ~~P0 즉시~~ | apps/api login/signup rate limit 재장착 + ops fail-closed | S | ✅ 완료 — `enforceAuthRateLimit`(auth.ts:44) · `opsTokenOk` fail-closed(ops.ts) |
| ~~P0 즉시~~ | CI에 apps/api typecheck job + TUI `go test`/`go vet` job 추가 (릴리스 태그 포함) | S | ✅ 완료 — PR 체크 `apps/api Typecheck` · `TUI Build · Vet · Test` |
| ~~P1 다음~~ | 인덱스 2개 추가 + PR 감지 lookback 제한 + 렌더-시-쓰기 완화 | M | ✅ 완료 — `0018_perf_plan_scoped_indexes.sql` · `personal-records.ts`(동결+lookback) · `onConflictDoUpdate` |
| ~~P1 다음~~ | `/health` DB 핑 + apps/api 에러 경계(`app.onError`) + systemd 유닛 수정 | S | ✅ 완료 — `index.ts:32`(DB 핑)·`:82`(onError) · `ExecStart=…/tsx src/index.ts` |
| **완료 2026-07-16** | 웹 terminal 테마·전용 셸·폰트 자산 제거 | M | `app-shell.tsx` · `font-stylesheet-loader.tsx` |
| ~~P2 그다음~~ | e2e 스펙 CI 편입(nightly) + Go/TS 파리티 golden fixture | M | ✅ 완료 — `e2e-nightly.yml`이 22스펙 전체 실행 · `packages/core/fixtures` |
| ~~P3 중기~~ | `packages/core` 추출, PBKDF2 상향, 세션 슬라이딩 만료 | L | ✅ 완료 — #497~#503 · `ITERATIONS = 600_000` · `auth/session-policy.ts` |
| **남음** | god-component 분해(§5.4-4) — `v2-more-page` 1041줄 · `workout-log-screen` 930줄 | M | 진행 중 — `plans-manage`는 ✅ 완료(982줄 1파일 → `widgets/plans-manage-screen` 9파일, 최대 245줄) |
| **하지 말 것** | 프록시 토폴로지 재설계(수용된 구조적 비용), 레이어 린트 error 강제(선행 부채 존재) | — | §4.5 (레이어 린트는 부채 해소 후 2026-07-06 강제 전환됨) |

---

## 2. 시스템 토폴로지 (검증 결과)

```
브라우저 ──/api/* (wl_session 쿠키)──▶ Vercel: web catch-all 프록시 ──Bearer──▶ Lightsail(서울): Caddy→Hono(tsx) ──▶ Supabase
TUI(ironlog) ──────────────── Bearer 직결 ───────────────────────────────────────┘
RSC 페이지 9개 ────── @/server 직접 import (프록시 안 거침) ─────────────────────▶ Supabase
```

- **프론트는 SPA가 아니다**: 39개 페이지 중 9개가 RSC에서 `@/server` 직접 fetch 후 `<Suspense>` 스트리밍(RSC 셸 + 클라이언트 아일랜드). `"use client"` 182 파일은 첫 Suspense 경계 아래 인터랙티브 트리.
- **프록시**(`web/src/app/api/[...path]/route.ts`): 쿠키→Bearer 변환, hop-by-hop 헤더 정리, 본문 스트리밍(`duplex:"half"`), 55초 타임아웃, 재시도 없음. 데이터 요청당 Vercel 함수 호출 1회 + 서울행 크로스 리전 TLS + 세션 검증 SELECT 1회가 추가되는 구조적 비용은 단일 백엔드 통합의 대가로 **수용 중**.
- **apps/api**: Hono 서브앱 14개, 엔드포인트 53개(+health). `@/*`→`../../web/src/*` 별칭으로 web 서버 모듈 **35개**를 런타임 재사용, prod에서 **tsx 인터프리트 실행**(컴파일 게이트 없음).
- **레이어 모델 준수**: 실 위반은 문서에 이미 기록된 상향 import 1건(`components/v2/v2-home-dashboard.tsx:31-32` → widgets)과 cross-feature 1건(workout-log→progression), server→features 런타임 import 1건(§7)뿐. `@/server` 참조 ~25건은 type-only로 무해.

---

## 3. 검증된 강점 (지킬 것)

- **의존성 극소**: 런타임 deps 9개. 차트(수제 SVG)·날짜·폼·데이터페칭 라이브러리 전무. React Compiler(prod), `optimizePackageImports`, AVIF, 정적 자산 1년 캐싱.
- **수제 SWR 캐시**(`web/src/lib/api.ts`): inflight dedupe(refcount+abort 전파)·LRU 180개·IDB 복원(pre-aged)·prefix 무효화. 수준급 구현. 단, 읽기 소비처는 ~2곳(주 데이터가 SSR이므로 정상).
- **데이터 무결성**: 로그 저장+세트 교체+진행 상태+캐시 무효화 단일 트랜잭션(`upsert-log.ts:143-268`). 로그 목록은 커서 페이지네이션(base64 `(performedAt,id)`, max 100).
- **마이그레이션 운영**: advisory lock(폴링+타임아웃) + `migration_run_log` 텔레메트리 + pending 감지 시 503 — 잘 만들어진 시스템.
- **서비스 워커**: precache 3개 URL만(비대화 위험 없음), `/api/*` network-only(인증 데이터 미캐시), 버전드 정리.
- **TUI 코드 품질**: 버퍼별 모델 분리(god model 아님, 예외는 `log.go` 1,288줄), 삼킨 에러 6건 전부 의도적 주석, HTTP 전부 `tea.Cmd`로 UI 논블로킹, 스냅샷+동작+파리티 테스트 21파일.
- **문서 정확성**: CLAUDE.md·docs 주장 스팟체크 전항목 실제와 일치.

---

## 4. 발견 사항 (우선순위별)

### 4.1 P0 — 보안

| # | 문제 | 위치 |
|---|---|---|
| S1 | **apps/api 공개 `POST /api/auth/login`·`signup`에 rate limit·origin 검사 전무.** web 네이티브 라우트는 10회/분 IP + 5회/분 email 제한이 있으나, 같은 계정 DB를 쓰는 `https://3-37-203-76.sslip.io`는 무제한 — credential stuffing·가입 남용에 노출. Bearer 적응 때 의도적으로 제거된 이력 있음("Rate limiting is intentionally omitted") | `apps/api/src/routes/auth.ts:59,112` · `apps/api/src/lib/http.ts:52-53` · 대조: `web/src/app/api/auth/login/route.ts:37-70` |
| S2 | **ops 엔드포인트 fail-open**: `WORKOUT_OPS_TOKEN` 미설정 시 파괴적 `POST /sessions/prune`이 무방비 | `apps/api/src/routes/ops.ts:20-26` |
| S3 | PBKDF2 **250k** 반복(OWASP PBKDF2-SHA256 권고 ~600k 미달). 세션 30일 고정 TTL, 로테이션·슬라이딩 만료 없음, 만료 행 정리는 수동 prune뿐 | `web/src/server/auth/password.ts:9-13` · `session.ts:7,37-51` |
| S4 | TUI self-update **체크섬 soft-fail**: `checksums.txt` fetch 실패/파일명 불일치 시 검증 없이 설치. 서명(cosign/minisign) 없음 → 전송 손상만 방어, 릴리스 자산 변조는 미방어 | `apps/tui/internal/selfupdate/selfupdate.go:143-149` |

S1은 web에 이미 있는 `@/server/auth/rate-limit` 재장착으로 해결(신규 코드 거의 불필요). S2는 미설정 시 401 반환으로 뒤집으면 한 줄.

### 4.2 P1 — CI 사각지대 · 신뢰성

> **2026-07-22 재확인: R1~R7 전부 해소.** PR 체크가 `Lint · Typecheck · Unit Tests` · `packages/core Typecheck · Test` ·
> `apps/api Typecheck` · `TUI Build · Vet · Test` · `E2E Smoke` · `Next.js Client Bundle Budget`로 확장됐고,
> 전체 e2e는 `e2e-nightly.yml`이 돌린다. R4·R5(`index.ts:82`·`:32`), R6(systemd ExecStart), R7(`api/client.go`)도 반영 완료.
> **R8(사전 커밋 훅)만 미도입** — 다만 근거였던 "CI가 R1~R3 구멍을 가짐"이 사라져 복합 리스크는 해소됐다.
> 아래 표는 발견 당시(2026-07-02) 기록으로 남긴다.

**CI 현황** (`.github/workflows/`): `ci.yml`이 PR에서 lint·lint:design·typecheck·유닛 3스크립트(35개 파일 전부, #481 검증 완료)·e2e smoke 1개를 게이트. 그 외 전부 미게이트:

| # | 문제 | 위치 |
|---|---|---|
| R1 | **apps/api CI 0** — typecheck 스크립트가 있는데 어떤 워크플로도 실행 안 함, 테스트 0개. web/src 모듈 35개를 import + prod tsx 실행이라 **web 서버 리팩터가 프로덕션 백엔드를 소리 없이 깨뜨릴 수 있음**. 유일한 간접 검증(TUI live_test 19개)도 CI 밖 | `ci.yml` paths 필터 · `apps/api/package.json` |
| R2 | **TUI Go 테스트 21파일 CI 미실행** — `ci.yml`은 web 경로만, `tui-release.yml`은 `go test`/`go vet` 단계 없이 GoReleaser만 실행 → 깨진 바이너리가 태그로 배포 가능 | `.github/workflows/tui-release.yml:28-33` |
| R3 | **Playwright 14스펙 중 13개 미게이트** — CI·preview 모두 `smoke.spec.ts`만. auth-recovery·data-export-import·oauth·pr-history·workout-log-rpe·stats-1rm-async-continuity 등 스펙은 존재하나 안 돎 | `ci.yml:116` · `_e2e-external.yml:22` |
| R4 | apps/api **에러 경계 부실**: `requireAuth`·`apiLogger`에 try/catch 없음, `app.onError`/`notFound` 미등록 → DB 순단이 비구조화·미로깅 500으로 유출 | `apps/api/src/auth.ts:29-37` · `src/index.ts` |
| R5 | **`/health`가 DB를 안 봄** — DB 사망 시에도 200 → 모니터·`ilapi status` false-positive | `apps/api/src/index.ts:29` |
| R6 | **커밋된 systemd 유닛 그대로는 부팅 실패**: `ExecStart=pnpm start`는 sandbox deps-check로 exit 1, 실 prod는 tsx 직접 실행(DEPLOY.md에만 기록) | `apps/api/deploy/ironlog-api.service:25` · `DEPLOY.md:6-9` |
| R7 | **TUI 세션 만료 UX**: 데이터 로드 중 401을 "이메일 또는 비밀번호가 올바르지 않습니다"로 오표시, `loggedOutMsg` 미발행 → 로그인 화면 복귀 없이 표류 | `apps/tui/internal/ui/login.go:163` · 대조 `frame.go:21` |
| R8 | 사전 커밋 훅 없음 — 모든 강제가 CI 전용인데 그 CI가 R1~R3의 구멍을 가짐(복합 리스크) | — |

### 4.3 P2 — DB 성능 ("오래 쓸수록 느려지는" 패턴)

> **2026-07-22 재확인: D1~D4·D6·D7 전부 해소** (§5.2 참조). D5는 아래 표대로 "절반 해소·나머지 설계상 유지",
> D8은 해소. 아래 표는 발견 당시(2026-07-02) 기록으로 남긴다.

핫패스 인덱스 커버리지는 대체로 양호(`workout_log(user_id, performed_at)` 복합이 대부분을 받침). 문제는 스캔 범위와 쓰기 패턴:

| # | 문제 | 위치 |
|---|---|---|
| D1 | **로그 상세 GET마다 전체 이력 스캔**: PR 감지 쿼리에 날짜 하한·LIMIT 없음 — 수년 치 데이터에서 선형 증가 | `apps/api/src/routes/logs.ts:209-226` |
| D2 | **인덱스 누락 2건**: ① `workout_log(user_id, plan_id, performed_at)` 복합 — 플랜 스코프 핫패스(`findLogIdForDate`, `fetchRecentLogsServer`, rebuild) 다수, ② `plan_progress_event(log_id)` 단독 — 로그 목록의 진행 이벤트 조회가 seq scan | `load-workout-log-context.ts:46,110,132` · `apps/api/src/routes/logs.ts:396-411` |
| D3 | **읽기 렌더마다 대형 JSONB 쓰기**: 홈·운동기록 SSR이 매번 `generated_session.snapshot`을 full-row SELECT 후 재기록. 비트랜잭션 read-then-write → `(plan_id, session_key)` unique 레이스 | `generateSession.ts:1782-1807` · `home-service.ts:295-301` |
| D4 | **무제한 in-JS 집계**: PR 목록·근육 볼륨이 LIMIT 없이 전 행을 Node로 집계. 플랜 관리 화면은 `max(performed_at)` 하나를 위해 유저 **전체 workout_log** 로드(SQL groupBy면 될 일) | `prs-service.ts:125-138` · `muscle-volume-service.ts:47-66` · `get-plans-for-manage.ts:52-62` |
| D5 | 🔶 **절반 해소·나머지는 설계상 유지(2026-07-20 재확인)**: 이벤트 재구축은 이미 **멀티로우 배치 INSERT**로 바뀜(`autoProgression.ts:674` `values(eventRows)` 1회). stats_cache 유저 전체 DELETE는 잔존하나 **의도된 정확성 선택** — 로그 1건이 e1rm·volume·prs·strength-summary·muscle-volume을 모두 바꾸므로 메트릭 단위 무효화는 stale을 만든다. 반복 읽기는 in-process 메모리 캐시가 흡수(`cache.ts:6-14`). 남는 건 무효화 직후 동시 요청의 중복 재계산(single-flight)뿐이며, 1인 사용 트래픽에선 측정 가능한 비용이 아님 | `autoProgression.ts:674` · `cache.ts:113-120` |
| D6 | **풀 `max:5`** — Vercel 서버리스용 튜닝인데 apps/api는 전 트래픽을 받는 상시 단일 프로세스. `statement_timeout` 미설정 | `web/src/server/db/client.ts:17-26` |
| D7 | `GET /api/stats/strength-summary` N+1: 상위 N종목마다 최대 1000행 쿼리 (2026-05 감사에서 이월, §7) | `apps/api/src/routes/stats.ts:215-240` |
| D8 | ✅ **해소(2026-07-20)**: 스냅샷 누락(0004–0010·0013)은 무해로 판명 — `drizzle-kit generate` 실측 결과 "No schema changes"(최신 스냅샷 0022가 현 schema.ts와 일치, 0023·0024는 데이터 전용 마이그레이션). 실제 결함은 **저널 0013 타임스탬프 역전 → prod 영구 스킵**이었다: drizzle은 루프 진입 전 읽은 `max(created_at)` **하나**와만 비교하므로(`pg-core/dialect.js`) `when`이 더 낮은 항목은 기존 DB에서 영원히 건너뛴다. 빈 DB는 전부 적용하므로 **CI는 통과하고 prod만 조용히 누락**. 실측: prod `__drizzle_migrations` 24행(저널 25개)·`created_at=1743548400000` 부재 = 0013 미적용, 인덱스는 수동 생성으로 존재. 타임스탬프 교정 + `scripts/migration-journal-guard.test.mjs`(단조 증가·idx 연속·저널↔.sql 양방향)를 `test:unit`에 편입해 재발 차단 | `web/src/server/db/migrations/meta/_journal.json` · `web/scripts/migration-journal-guard.test.mjs` |

### 4.4 P3 — 프론트 성능

| # | 문제 | 위치 |
|---|---|---|
| F1 | ✅ **해소(2026-07-16)**: 웹 terminal 테마와 조건부 셸을 제거해 `AppShell`이 단일 컴포넌트 트리만 렌더 | `components/app-shell.tsx` · `app/layout.tsx` |
| F2 | ✅ **해소(2026-07-20)**: useEffect 주입 자체는 의도된 설계(렌더 블로킹 회피)라 유지하고, `ReactDOM.preload`로 **다운로드 시작만 HTML 파싱 시점으로 이동**. preload는 렌더 블로킹이 아니라 FCP 이득은 보존되고, "하이드레이션 이후에야 요청" 지연만 제거. 실측(dev, /login) 요청 시작 236ms→78–104ms. URL은 `lib/fonts.ts` 단일 소스(preload↔stylesheet URL/CORS 불일치 시 이중 다운로드) | `components/font-stylesheet-loader.tsx` · `lib/fonts.ts` · `app/layout.tsx` |
| F3 | 미가상화 성장 리스트: PR 히스토리·플랜 관리·캘린더 최근 로그 (가상화는 운동 카탈로그만) | `pr-history-screen.tsx:265` · `plans-manage-content.tsx:985` |
| F4 | ✅ **기우로 판명(2026-07-20)**: `analyze:bundle` 산출물 실측 결과 `messages.ts`의 클라이언트 그래프 기여는 **전 라우트 0.0KB**(`/`·`/calendar`·`/program-store`·`/settings`·`/login`). `LocaleShell`이 서버에서 활성 로케일 copy만 prop으로 넘겨 카탈로그가 클라이언트로 넘어가지 않음. 조치 불필요 | `web/src/lib/i18n/messages.ts` · `app/layout.tsx:59-75` |

### 4.5 P4 — 구조 부채 (방향 관리 대상)

- ~~**apps/api→web 65 import 결합**~~ ✅ **해소(2026-07-03, #497~#503)**: `packages/core`(@workout/core) 추출 완료 — 루트 pnpm 워크스페이스 + source-only 패키지. apps/api의 web/src import **65→0**, `@/*` alias·DOM lib 제거. core 경계 린트(`lint:boundary`) CI 게이트.
- **Go/TS 복제 드리프트 이미 시작**: session-key는 Go가 TS 4개 kind 중 일부만 커버(plain-date 라벨 누락, 정규식 3개 verbatim 복제), bodyweight 키워드 리스트 두 언어 리터럴 중복, `buildSessionKey`는 사실상 3벌(TS lib·apps/api 재사용·Go 복제). **공용 golden fixture(JSON)를 양쪽 테스트가 읽게** 하면 CI에서 드리프트 검출(R2 선행 필요). | `apps/tui/internal/ui/session_label.go:9-13` ↔ `web/src/lib/session-key.ts:35-38` · `bodyweight.go:25` ↔ `bodyweight-load.ts:26-33`
- **god-component**: `v2-session-summary.tsx`(1,423줄) · `plans-manage-content.tsx`(1,403줄, app/ 레이어에 뮤테이션+로직+렌더 동거) · TUI `log.go`(1,288줄, ~24필드 구조체). 분리 후보이나 응집도는 있음.
- **`any` 201곳**(`: any` 179 + `as any` 22) — `no-explicit-any`가 eslint에서 꺼져 있어 집계조차 안 되는 상태. tsconfig는 `strict`만(추가 hardening 플래그 없음).
- **레이어 린트 error 강제 불가 상태 유지**: `v2-home-dashboard` 상향 import(문서 기록됨) + cross-feature 1건 + server→features 런타임 import 1건(§7)이 선행 부채.
- TUI 소소 (2026-07-20 재확인): export 파일 0644는 ✅ **해소**(`securefile.WriteFile` 0o600). `.goreleaser.yaml` prod URL은 **의도된 설계**(릴리스 바이너리 기본 서버를 ldflags로 주입, 주석 명시) — 부채 아님. `archiveName` 수동 복제는 ✅ **가드로 차단**: `goreleaser_contract_test.go`가 `.goreleaser.yaml`의 name_template을 실제로 렌더해 `archiveName()`과 대조한다(기존 `TestArchiveName`은 기대값이 하드코딩이라 코드와 함께 틀려도 통과했다 — 템플릿이 바뀌면 릴리스는 멀쩡한데 설치된 바이너리만 전부 404 나는 침묵 실패였음).

---

## 5. 개선 계획

### 5.1 1단계 ✅ **완료** (P0 전부 + R4~R6, PR #484)

1. ~~apps/api auth 라우트에 rate limit 재장착 (S1)~~ ✅ `enforceAuthRateLimit`(login 10/분·IP, signup 5/시간·IP)
2. ~~`opsTokenOk` fail-closed (S2)~~ ✅ 토큰 미설정 시 거부(`WORKOUT_OPS_ALLOW_NO_TOKEN=1`만 예외)
3. ~~`/health`에 DB 핑 + `app.onError` 등록 (R5·R4)~~ ✅ `apps/api/src/index.ts:32`·`:82`
4. ~~`ironlog-api.service` ExecStart 수정 (R6)~~ ✅ `ExecStart=…/node_modules/.bin/tsx src/index.ts`
5. ~~CI: apps/api typecheck job + TUI `go test`/`go vet` job (R1·R2)~~ ✅ PR 체크에 상시 노출

### 5.2 2단계 ✅ **완료** (D1~D4·D6·D7)

1. ~~인덱스 추가: `workout_log(user_id, plan_id, performed_at)` · `plan_progress_event(log_id)` (D2)~~ ✅ `migrations/0018_perf_plan_scoped_indexes.sql`(PR #485)
2. ~~PR 감지에 lookback 윈도우 + LIMIT (D1)~~ ✅ `packages/core/src/services/workout-log/personal-records.ts` — `gte(performedAt, fromPerformedAt)` 윈도우 + `getOrFreezePersonalRecords` 동결(삭제 시 무효화 후 lazy 재계산)
3. ~~`get-plans-for-manage` 전체 로그 로드 → SQL `max() groupBy` (D4)~~ ✅ `max(workoutLog.performedAt)` + `groupBy(planId)`로 plan당 1행
4. ~~`generateAndSaveSession` → `INSERT … ON CONFLICT` (D3)~~ ✅ `onConflictDoUpdate`(generateSession.ts, PR #487)
5. ~~strength-summary N+1 배치화 (D7)~~ ✅ `inArray` 2쿼리 + `Promise.all` · rebuild 이벤트 배치 INSERT는 D5에서 이미 해소
6. ~~apps/api용 `DB_POOL_MAX` + `statement_timeout` (D6)~~ ✅ `packages/core/src/db/client.ts:26,38`

### 5.3 3단계 — 그다음 (체감 성능 + 게이트 완성)

1. ~~terminal 테마 첫 렌더 분기 수정~~ — 테마 제거로 해소 (F1, 2026-07-16)
2. ~~폰트 로딩 정리: Pretendard·Material Symbols `<link>` 선주입/preload 검토~~ ✅ 완료(F2, 2026-07-20)
3. ~~e2e 13스펙 CI 편입 — 최소 nightly 스케줄 (R3)~~ ✅ 완료 — `e2e-nightly.yml`이 필터 없이 전체(현재 22스펙) 실행
4. ~~Go/TS 파리티 golden fixture (session-key·bodyweight)~~ ✅ 완료 — `packages/core/fixtures`
5. ~~TUI 401 → `loggedOutMsg` 발행 + 에러 문구 분리 (R7) · self-update 체크섬 hard-fail (S4)~~ ✅ 완료 — `api/client.go`(`IsUnauthorized`·`sessionExpired`) · `selfupdate.go`(SHA256 hard-fail)
6. ~~PR 히스토리 가상화 (F3)~~ ✅ 완료(PR #490) · ~~i18n 번들 확인~~ ✅ 확인 완료·기우(F4) · ~~마이그레이션 meta 스냅샷 보수~~ ✅ 완료(D8, 2026-07-20)

### 5.4 4단계 — 중기 (상업화/확장 대비)

1. ~~`packages/core` 추출~~ ✅ **완료(2026-07-03, #497~#503)** — 7개 PR 점진 추출: 워크스페이스 인프라 → 순수 lib(+Go/TS golden fixture, Stage 3 잔여 흡수) → db → auth → 도메인 엔진 → 서비스(locale 명시 인자화) → alias 제거/경계 린트. 부수 수정: TUI trimNum 정밀도, getHomeData 쿠키 스냅샷 오용(TUI 홈 설정 미반영).
2. ~~PBKDF2 600k 상향 + 로그인 시 점진 재해시, 세션 슬라이딩 만료·자동 prune (S3)~~ ✅ 완료 — `auth/password.ts`(`ITERATIONS = 600_000`, 해시 포맷에 iterations 내장 → 검증 시 점진 재해시) · `auth/session-policy.ts`(sliding IDLE_TTL)
3. ~~`no-explicit-any` warn 승격 · 레이어 린트 error 강제~~ ✅ **완료(2026-07-06, #509·#510)** — any warn 승격(85건 가시화, 점진 감축은 계속), 레이어 부채 3건+승격 중 발견 1건(widgets→app loading) 해소 후 방향 린트 error 강제(type-only·테스트 예외). 상세: [architecture-layers.md](../web/docs/architecture-layers.md) "강제 현황".
4. god-component 분해: ~~`plans-manage-content` 로직의 `features/*/model` 이동부터~~ ✅ **plans-manage 완료** — 로직은 `features/plans-manage/model`(순수 모델 + 컨트롤러 훅), 뷰는 `widgets/plans-manage-screen`(화면·시트·섹션 4개·공용 행)으로 분해해 `app/` 레이어에서 뮤테이션+로직+렌더 동거를 해소했다. 남은 대상은 `v2-more-page`(1,041줄)·`workout-log-screen`(930줄).

---

## 6. 하지 말 것 (명시적 non-goal)

- **프록시 토폴로지 재설계 금지**: Vercel 홉 비용은 단일 백엔드·멀티프론트 통합의 수용된 대가. 측정된 병목이 나오기 전까지 유지.
- **레이어 린트 즉시 error 강제 금지**: 선행 부채 3건(§4.5) 해소가 먼저 — 2026-05 감사 결론 유지.
- **밴드 보조(음수 부하) 재론 금지**: 2026-07-01 의도적 미지원 확정(재론 시 별도 `assistKg` 필드 접근).

---

## 7. 2026-05 감사 후속 추적

| 5월 지적 | 현재 상태 |
|---|---|
| 죽은 zustand `/workout/[sessionId]` 서브트리 + zustand/immer 의존 | ✅ **해결** — deps에서 제거 확인, import 0건 |
| 죽은 offline-queue 인프라 | ✅ **해결** — `lib/offline-queue.ts` 삭제됨 |
| PWA 유명무실(SW·manifest 부재) | ✅ **해결** — `app/sw.js/route.ts`(버전드 동적 SW) + `app/manifest.ts` 구현 |
| `server/→features/` 역방향 의존 (`weight-rules`) | ✅ **해결(2026-07-22 재확인)** — `load-workout-log-context.ts`에 `@/features/*` import 0건. 레이어 방향 린트 error 강제(2026-07-06, #509·#510)로 재발도 차단됨 |
| `/api/stats/strength-summary` N+1 | ✅ **해결(2026-07-22 재확인)** — `inArray` 배치 2쿼리 + `Promise.all`로 전환(본 문서 D7·§5.2-5) |
| DB 레벨 멀티유저 격리 부재 (`user_id` text, appUser FK 0) | ❌ **이월** — 스키마 변화 없음. 1인 사용 맥락에서 위험 낮음 판정 유지, 상업화 시 재평가 |
| `cacheComponents`(PPR) 채택 결정 | ✅ **결정 완료** — 의도적 비활성(`next.config.ts:22-25`, 사유 주석) |

---

## 부록 A. 핫패스 인덱스 커버리지 (요약)

| 핫패스 | WHERE/ORDER | 인덱스 | 판정 |
|---|---|---|---|
| Stats 1RM 추이 (`e1rm-service.ts:134`) | user+기간+종목, limit 5000 | `(user_id, performed_at)` ✓ | OK |
| 볼륨 시리즈 (`volume-series-service.ts:122`) | user+기간, SQL 집계 | ✓ | OK |
| PR 목록 (`prs-service.ts:125`) | user+기간, **LIMIT 없음** | ✓ | 행수 무제한 (D4) |
| 로그 목록 (`apps/api logs.ts:339`) | user+커서, max 100 | ✓ | OK (모범) |
| 로그 상세 PR 감지 (`logs.ts:209`) | user+performed_at<X, **하한·LIMIT 없음** | 절반만 | **전체 스캔 (D1)** |
| 진행 이벤트 조회 (`logs.ts:396`) | `log_id` inArray | **없음** | **seq scan (D2)** |
| 플랜 스코프 날짜 조회 (`load-workout-log-context.ts:110`) | user+plan+performed_at | 복합 없음 | **누락 (D2)** |
| 플랜 관리 (`get-plans-for-manage.ts:52`) | user 전체 로그 → JS max | ✓지만 전행 로드 | D4 |
| progression-state/cycle-overview (`apps/api plans.ts`) | id·uq 조회 | ✓ | OK (연산 무거움, DB 아님) |

## 부록 B. 수치 스냅샷 (2026-07-02)

- 게이트: web typecheck ✓ / lint 경고 0 ✓ / apps/api typecheck ✓ / TUI build+vet ✓
- 테스트: web 유닛 35파일(CI 전부 게이트, #481) · e2e 14스펙(CI 1개) · apps/api 0 · TUI Go 21파일(CI 0)
- 위생: TODO/FIXME/HACK 0 · eslint-disable 5 · `any` 201(web)+6(api) · 디자인 린트 baseline 전항목 0
- 최대 파일: `generateSession.ts` 1,946 · `v2-session-summary.tsx` 1,423 · `plans-manage-content.tsx` 1,403 · TUI `log.go` 1,288
- DB: 테이블 18(+auth) · 마이그레이션 18(meta 스냅샷 9개 누락) · 풀 max 5
- 커밋: 1,168 (2026-02 이후 월평균 ~230)
