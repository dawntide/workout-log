# Workout Log — 전체 시스템 점검 (2026-08)

> **작성일**: 2026-08-09 · **범위**: monorepo 전체 — `web/`(Next.js 16 프론트+잔류 API), `packages/core/`, `apps/api/`(Hono), `apps/tui/`(Go ironlog), DB 스키마/실측, CI/CD, 배포 토폴로지.
> **방법**: 게이트 전수 직접 실행 + prod DB 실측(`pg_stat_*`) + 프로덕션 블랙박스 확인 + 코드 정적 대조. 모든 주장은 `file:line`·실행 결과·쿼리 결과로 근거를 단다.
> **이전 감사**: [codebase-audit-2026-07.md](codebase-audit-2026-07.md) — 그 문서의 개선 계획은 **전부 종결**됐고, §6에서 후속을 추적한다.
> **직전 감사 이후 델타**: 커밋 **233개**(1,168 → 1,409). 무게중심은 DSL 타입 모델링(17) · TUI(13) · REF5(7) · core 리팩터(7)였다.

---

## 1. TL;DR

**코드 위생·게이트·구조는 이전 감사보다 더 좋아졌다. 새 위험은 딱 하나, 그것도 코드가 아니라 "env 하나로 인증이 사라질 수 있다"는 설계 비대칭이다.**

- **게이트 전수 통과**(직접 실행): web/core/apps-api `typecheck` ✓ · web `lint`·`lint:design` ✓ · core·apps-api `lint:no-any`·`lint:boundary` ✓ · core 유닛 **516개** ✓ · web 유닛 **152개** ✓ · TUI `go build`+`vet`+`test` ✓.
- **위생은 사실상 만점**: TODO/FIXME/HACK **0** · `@deprecated` **0** · `@ts-ignore`/`@ts-expect-error` **0** · `any` **0**(web은 eslint `error`, core·apps-api는 랫칫 CI 게이트) · eslint-disable 5(전부 `react-hooks/exhaustive-deps`) · 디자인 린트 baseline 전항목 0.
- **유일한 P0은 S1**: 로컬 개발용 인증 폴백(`WORKOUT_AUTH_USER_ID`)이 **apps/api에서는 이중으로 잠겨 있는데 web에서는 잠금이 전혀 없다**. 같은 리포·같은 env·정반대 정책이다. 프로덕션 실측상 지금은 안 켜져 있지만(아래 확인), 켜지는 순간 전 페이지·전 잔류 API가 무인증으로 열린다.
- **성능은 이번 감사에서 결론을 내리지 않는다** — prod가 **유저 2명 / 로그 64건 / 세트 695행**이라 `pg_stat`의 seq scan 수치로는 "인덱스 부족"과 "작아서 planner가 seq scan을 고른 것"을 구분할 수 없다. 대신 인덱스가 **실제 쿼리 표현식과 일치하는지**를 정적으로 대조했고, 일치한다.

### 우선순위 요약

| 우선도 | 작업 | 노력 | 근거 |
|---|---|---|---|
| **P0** | web 인증 폴백을 apps/api와 같은 수준으로 잠근다 (S1) | S | §3.1 |
| ~~P2~~ | ~~`migration_run_log` 보존 정책 (O1)~~ | S | ✅ **완료(2026-08-09, #664)** — §3.2 |
| **P3** | `apps/api/src/routes/plans.ts` 1,706줄 분해 (C1) | M | §3.3 |
| **하지 말 것** | pg_stat 수치로 인덱스 판단 · 리스트 가상화 재론 · DSL Phase 4b | — | §4 |

---

## 2. 시스템 토폴로지 (2026-08 현재)

7월 감사 이후 **가장 큰 구조 변화는 apps/api 호스팅 모드 전환**이다. 프록시 다이어그램은 더 이상 프로덕션이 아니다.

```
브라우저 ──/api/* (wl_session 쿠키)──▶ Vercel: web catch-all
                                         └─ app.fetch()로 Hono 앱 직접 마운트 (인프로세스) ──▶ Supabase
TUI(ironlog) ────────────────── Bearer ──▶ (같은 Vercel 엔드포인트) ────────────────────────┘
RSC 페이지 ─────────── @workout/core 직접 import (프록시 안 거침) ──────────────────────────▶ Supabase
```

- **인프로세스가 현행 프로덕션**(2026-07-29 전환, #634). `APPS_API_BASE` 미설정 = 인프로세스, 설정 = 프록시. **분리 배포 VPS는 내려가 있다**(서비스·Caddy disabled, 자산 존치).
- **두 모드를 CI가 나눠 증명한다**: PR 레인은 인프로세스([`ci.yml:255`](.github/workflows/ci.yml:255)), nightly는 apps/api를 동반 기동해 프록시 모드를 유지 검증(#636). 재분리가 env 하나로 가능한 상태가 **가드로 고정**돼 있다(`lint:boundary`).
- 규모: web **405 파일 / 65,671줄** · core **149 파일 / 33,629줄** · apps/api **16 파일 / 5,709줄**(엔드포인트 59) · TUI Go **90 파일 / 22,654줄**. 페이지 38개.

---

## 3. 발견 사항

### 3.1 P0 — S1: 인증 폴백이 web에서만 잠겨 있지 않다

`WORKOUT_AUTH_USER_ID`는 "쿠키가 없으면 이 유저로 친다"는 로컬 개발 편의 장치다. 문제는 **같은 env를 읽는 두 런타임의 정책이 정반대**라는 것이다.

| 런타임 | 코드 | 잠금 |
|---|---|---|
| apps/api | [`auth.ts:37-41`](apps/api/src/auth.ts:37) | **이중** — `NODE_ENV === "production"`이면 무조건 무시 + `WORKOUT_API_ALLOW_ENV_AUTH=1` 명시 opt-in까지 있어야 동작 |
| web (게이트) | [`proxy.ts:70-72`](web/src/proxy.ts:70) | **없음** — env가 비어있지만 않으면 쿠키 없이 통과 |
| web (신원 해석) | [`user.ts:69-70`](web/src/server/auth/user.ts:69) | **없음** — 세션이 없으면 env 값을 그대로 userId로 반환 |

apps/api 쪽 주석은 의도를 명시한다 — "merely setting WORKOUT_AUTH_USER_ID can never bypass API authentication in a deployment"([`auth.ts:33-35`](apps/api/src/auth.ts:33)). web 쪽은 같은 요구를 **주석으로만** 적어 뒀다: "프로덕션에서는 반드시 UNSET이어야 한다"([`user.ts:67`](web/src/server/auth/user.ts:67)). 즉 한쪽은 코드가 강제하고, 다른 쪽은 운영자 규율에 맡긴다.

**터지면 어디까지 가는가**: `tryAuthenticatedUserId`는 `requireAuthenticatedUserId`의 몸통이라 RSC 페이지 부트스트랩과 web 잔류 API가 전부 이 경로를 탄다. `DELETE /api/auth/account`([`route.ts:40`](web/src/app/api/auth/account/route.ts:40))도 포함된다. 게다가 `proxy.ts`가 먼저 통과시키므로 **로그인 화면조차 안 뜬다** — 조용히 남의 계정으로 앱이 열린다.

**지금 켜져 있는가 — 아니다.** 프로덕션 블랙박스 확인:

```
GET https://workout-log-two-bice.vercel.app/api/plans    → 401 {"error":"Unauthorized"}
GET .../api/logs · /api/settings · /api/home             → 401 (동일)
```

쿠키 없는 요청이 401이므로 Vercel 프로덕션에는 이 env가 **설정돼 있지 않다**. 따라서 실사고가 아니라 **잠재 위험**이다. 다만 위험도를 낮게 볼 이유는 없다: 이 변수는 `web/.env.local` 예시와 CLAUDE.md에 버젓이 있고, 프리뷰↔프로덕션 env 복사 한 번이면 켜지며, **켜져도 에러도 로그도 남지 않는다**.

**고칠 때 주의 — 단순 `NODE_ENV` 가드는 CI를 깬다.** E2E 스모크는 `PLAYWRIGHT_SERVER_MODE: prod`로 **프로덕션 빌드**를 띄우면서 `WORKOUT_AUTH_USER_ID`를 설정한다([`ci.yml:255-259`](.github/workflows/ci.yml:255)). 그래서 apps/api가 택한 방식(**NODE_ENV 차단 + 별도 opt-in 플래그**)을 그대로 옮기고 CI가 그 플래그를 세우는 게 맞다. 새 코드는 거의 필요 없다 — 이미 있는 패턴의 이식이다.

### 3.2 P2 — O1: `migration_run_log`만 보존 정책이 없다 ✅ **해소(2026-08-09, #664)**

> 기존 정리 크론에 편입했다(경로도 `/api/cron/ux-events-cleanup` → `/api/cron/telemetry-cleanup`으로
> 바뀌었다 — 대상이 둘이 되어 이름이 어긋났고, Hobby 플랜 크론 2개 제한 때문에 라우트를 나누지 않았다).
> 보존은 형제와 같은 120일. 소비자 lookback 상한(7일·1일)보다 훨씬 길다는 점을 테스트로 고정했다.
> 배포 후 새 경로 401·옛 경로 404를 확인했다. 아래는 발견 당시 기록이다.

prod 실측:

| 테이블 | 행 | 크기 | 보존 정책 |
|---|---|---|---|
| `migration_run_log` | **2,101** (DB 내 최다) | 1,472 kB | **없음** |
| `ux_event_log` | 435 | 312 kB | 120일 기본, env 조정, cron 실행([`ux-event-retention.ts:17`](packages/core/src/data/ux-event-retention.ts:17), #637) |

`migration_run_log`는 2026-02-26부터 쌓였고 최근 7일 43건(≈6/일)이다. 러너별로는 `default-runner` 981 · `github-actions-prod` 489 · `compose-migrate-job` 394 순이다. 코드 전체에 이 테이블의 delete/prune/retention이 **한 건도 없다**.

현재 속도면 연 ~2,200행 / ~1.5 MB라 성능 문제는 아니다. 지적하는 건 **비대칭**이다 — 같은 성격(운영 텔레메트리)의 형제 테이블은 이미 cron 정리를 받았는데 더 큰 쪽만 빠졌다. `ux-events-cleanup` cron에 얹으면 되는 수준이다.

### 3.3 P3 — C1: apps/api가 한 파일에 쏠려 있다

[`apps/api/src/routes/plans.ts`](apps/api/src/routes/plans.ts)가 **1,706줄**로, apps/api 전체 5,709줄의 **30%**다. 16개 파일짜리 패키지에서 한 파일이 3분의 1을 먹는 구조다. 7월 감사가 닫은 god-component 작업(#589~#591)과 같은 성격이며, 같은 처방(라우트 그룹별 분리)이 적용된다. 지금 당장의 결함은 아니고 방향 관리 대상이다.

참고로 전체 최대 파일은 도메인 엔진 쪽이다: `generateSession.ts` 2,144 · `ref5.ts` 2,089 · `seed.ts` 1,555. 이들은 엔진/데이터 성격이라 분해 대상이 아니다.

### 3.4 성능 — 이번 감사는 결론을 내리지 않는다

7월 감사의 D 시리즈(전체 이력 스캔·인덱스 누락·렌더-시-쓰기)는 전부 닫혔고, 그 뒤 #646~#648이 SSR 직렬 홉과 스냅샷 오염까지 정리했다. 이번에 새로 잡은 건 없다. **다만 그 "없음"의 신뢰도를 정직하게 적는다.**

prod 실측이 **유저 2 · 플랜 2 · 로그 64 · 세트 695행**이다. 이 규모에서 `pg_stat_user_tables`의 seq scan 수치는 진단에 쓸 수 없다 — 예를 들어 `plan`은 seq_scan 8,402 / idx_scan 1이지만 2행짜리 테이블이라 seq scan이 **정답인 플랜**이다. 같은 이유로 `idx_scan = 0`인 인덱스 37개도 "쓸모없음"의 증거가 아니다.

그래서 대신 **인덱스가 실제 쿼리와 문법까지 맞는지**를 정적으로 대조했고, 맞는다. 예: `workout_log`의 day/week/month 버킷 인덱스는 `date_trunc('week', performed_at at time zone 'UTC')` 표현식 인덱스인데([`schema.ts:356-367`](packages/core/src/db/schema.ts:356)), 통계 서비스 3곳이 **같은 표현식**을 쓴다([`volume-series-service.ts:114`](packages/core/src/stats/volume-series-service.ts:114) · [`muscle-volume-service.ts:45`](packages/core/src/stats/muscle-volume-service.ts:45) · [`endurance-service.ts:57`](packages/core/src/stats/endurance-service.ts:57)). 조준은 정확하다. 데이터가 쌓이면 planner가 알아서 쓸 것이다.

체감 로딩의 지배 요인은 여전히 **Vercel 콜드 스타트**이며 코드로 줄일 수 있는 몫은 #646~#648에서 이미 처리됐다(2026-07 감사 §5.5).

---

## 4. 하지 말 것 (이번 감사가 추가하는 non-goal)

- **pg_stat 수치로 인덱스를 판단하지 말 것** — 유저 2명 규모에서는 seq scan이 정상이고 `idx_scan=0`이 무죄다. 이 DB에서 인덱스 판단은 **쿼리↔인덱스 정적 대조**로만 한다. (§3.4)
- **리스트 가상화 재론 금지** — 2026-08-09 실측으로 종결. 캘린더 최근 로그는 `.slice(0, 5)` 고정, 플랜 관리는 유저당 최대 2개다(2026-07 감사 §4.4 F3).
- **DSL Phase 4b(스냅샷 소비자 READ 전환) 재론 금지** — 근거였던 `any` 잔여가 0이 됐고, 남은 읽기 3곳은 `SnapshotV3`로 타이핑하면 오히려 **거짓 좁힘**이 된다(home-service는 v3와 REF5 v4를 같은 경로로 받는다).
- 7월 감사의 non-goal은 그대로 유효하다: 프록시 토폴로지 재설계 금지, 밴드 보조(음수 부하) 재론 금지.

---

## 5. 검증된 강점 (지킬 것)

- **랫칫 문화가 자리잡았다**: `any` 랫칫(허용치가 실제보다 높아도 실패한다 — 헐거워지는 걸 막는다) · 마이그레이션 저널 가드 · 유닛 테스트 발견 가드 · 에이전트 가이드 스큐 가드 · REF5 프로토콜 범프↔스펙 동반 가드([`ci.yml:46`](.github/workflows/ci.yml:46)). **침묵 실패를 가드로 바꾸는 패턴**이 반복적으로 적용되고 있다.
- **CI 커버리지**: PR에서 6개 잡(quality · apps-api · core · bundle-budget · tui · e2e smoke)이 돌고, e2e smoke는 마이그레이션·멱등성·계정 수명주기·스냅샷 불변식까지 사전 검증한 뒤 prod 빌드로 렌더한다. 전체 e2e는 nightly.
- **fail-closed 일관성**: ops·cron 전부 Bearer 시크릿 미설정 시 **거부**([`ops.ts:9-12`](apps/api/src/routes/ops.ts:9) · [`cron/session-prune/route.ts:23`](web/src/app/api/cron/session-prune/route.ts:23)). 계정 삭제는 세션 + rate limit + 비밀번호 검증 + `confirmToken` 4중.
- **import 스코프 가드**: export가 내보내는 10개 테이블 중 부모로만 소유자가 정해지는 자식 전부(`planModules`·`planOverrides`·`generatedSessions`·`workoutLogs`·`workoutSets`·`templateVersions`)가 `validateImportScope`에 등록돼 있다(#644 회귀 차단).
- **의존성 절제**: web 런타임 deps 12개(워크스페이스 2개 포함). 실질 외부 deps는 `@tanstack/react-virtual`·`@vercel/functions`·`drizzle-orm`·`idb`·`jotai`·`next`·`pg`·`react`·`react-dom`·`tsx`.
- **프록시 공개 경로 주석**: [`proxy.ts:13-20`](web/src/proxy.ts:13)이 "왜 public인가"와 **과거 실제 사고(cron 누락)** 까지 적어 뒀다. 같은 실수가 반복되기 어렵게 만든 좋은 주석이다.

---

## 6. 2026-07 감사 후속 추적

| 7월 항목 | 현재 |
|---|---|
| P0 보안(S1~S4) | ✅ 전부 해소 — 이번 감사의 S1은 **새 항목**이며 7월 S1(apps/api rate limit)과 다르다 |
| P1 CI 사각지대(R1~R7) | ✅ 해소 |
| R8 사전 커밋 훅 | **미도입 유지** — `.husky` 없음, `core.hooksPath` 미설정. CI 커버리지가 넓어져 위험도는 계속 낮다. 편의성 항목으로만 남긴다 |
| P2 DB 핫패스(D1~D8) | ✅ 해소. D5(stats_cache single-flight)는 유저 2명 규모에서 여전히 미착수가 옳다 |
| P3 프론트(F1~F4) | ✅ 전부 종결 — F3은 2026-08-09 실측으로 닫힘 |
| `any` 감축 | ✅ **0건 도달**(2026-08-09, #660). 재유입은 eslint error + 랫칫 2개가 막는다 |
| god-component | ✅ 웹은 해소. apps/api `plans.ts`가 새로 부상(§3.3) |
| 인프라 미결(DEPLOY.md) | **그대로** — 에러 추적(Sentry) 미설정 · CORS 정책 · 시크릿 중앙관리 · TUI fleet 버전 추적 |

---

## 부록. 수치 스냅샷 (2026-08-09)

- 게이트: web/core/apps-api typecheck ✓ · web lint(경고 0)·lint:design ✓ · lint:no-any ×2 ✓ · lint:boundary ×2 ✓
- 테스트: core **516** · web 유닛 **152** · TUI Go 4패키지 ✓ · e2e smoke(PR) + 전체(nightly)
- 위생: TODO/FIXME/HACK **0** · `@deprecated` **0** · `@ts-ignore` **0** · `any` **0** · eslint-disable 5
- 규모: web 405파일/65,671줄 · core 149/33,629 · apps/api 16/5,709(엔드포인트 59) · TUI 90/22,654 · 커밋 1,409
- 최대 파일: `generateSession.ts` 2,144 · `ref5.ts` 2,089 · `plans.ts`(api) 1,706 · `seed.ts` 1,555 · `model.ts`(program-store) 1,441
- DB(prod): 유저 2 · 플랜 2 · 로그 64 · 세트 695 · 최다 행 `migration_run_log` 2,101
