# CI/CD 파이프라인 가이드

GitHub Actions + Vercel 기반 배포 파이프라인 구조, 설정 방법, 운영 팁 정리.

---

## 목차

1. [파이프라인 전체 구조](#1-파이프라인-전체-구조)
2. [워크플로우별 역할](#2-워크플로우별-역할)
3. [생성/수정된 파일 목록](#3-생성수정된-파일-목록)
4. [초기 설정 체크리스트](#4-초기-설정-체크리스트)
5. [브랜치 보호 규칙](#5-브랜치-보호-규칙)
6. [환경변수 및 Secrets](#6-환경변수-및-secrets)
7. [E2E 테스트 전략](#7-e2e-테스트-전략)
8. [실패 분석 방법](#8-실패-분석-방법)
9. [운영 팁](#9-운영-팁)

---

## 1. 파이프라인 전체 구조

```
PR 열림 / 푸시
    │
    ▼
┌─────────────────────────────────────────────┐
│  ci.yml  (PR 필수 게이트)                   │
│                                             │
│  ① quality                                 │  ~3분
│     lint · typecheck · unit tests           │
│         │                                   │
│    ┌────┴────┐                              │
│    ▼         ▼                              │
│  ② build   ③ e2e-smoke                    │  ~8분 (병렬)
│  next build  PostgreSQL + next dev          │
└─────────────────────────────────────────────┘
    │  (3개 checks 모두 통과해야 main 머지 가능)
    ▼  (main 머지 후 자동 실행)
┌─────────────────────────────────────────────┐
│  db-migrate.yml                             │
│  prod + dev Supabase DB 마이그레이션        │
└─────────────────────────────────────────────┘
    ▼
┌─────────────────────────────────────────────┐
│  deploy.yml                                 │
│  Vercel production 배포 완료 대기/확인      │
└─────────────────────────────────────────────┘

별도 실행:
  e2e-preview.yml   Vercel Preview 배포 성공 시 자동 실행 (필수 아님)
  db-backup.yml     nightly 04:00 KST — Supabase 백업
```

### 핵심 원칙

- **main 진입 전 차단**: 배포 직전이 아니라 PR 단계에서 품질 문제를 막는다.
- **smoke 우선**: PR 필수 체크는 핵심 페이지 렌더링 확인 수준으로 제한한다. 레거시 디자인/비주얼 회귀 테스트는 v2 디자인 시스템 전환 이후 제거했다.
- **Vercel은 배포에만 집중**: 테스트 순서와 게이트는 GitHub Actions가 통제한다.

---

## 2. 워크플로우별 역할

### `ci.yml` — 메인 CI (PR 필수)

| Job | 내용 | 소요시간 |
|-----|------|---------|
| `quality` | lint · typecheck · unit tests | ~3분 |
| `build` | `next build` 검증 (`DB_MIGRATE_ENABLED=0`) | ~8분 |
| `e2e-smoke` | PostgreSQL 서비스 + dev 서버 + smoke 테스트 | ~10분 |

- `quality` 통과 후 `build`와 `e2e-smoke`가 병렬 실행된다.
- 세 job 모두 통과해야 main 머지가 가능하다.
- `concurrency` 설정으로 같은 브랜치의 이전 실행은 자동 취소된다.

### `e2e-preview.yml` — Vercel Preview E2E (선택)

- Vercel이 GitHub에 `deployment_status: success` 이벤트를 보낼 때 자동 실행된다.
- `Preview` 환경에만 반응한다 (Production 배포는 무시).
- Vercel Deployment Protection 우회를 위해 `x-vercel-protection-bypass` 헤더를 사용한다.
- PR 필수 체크가 아니므로 실패해도 머지를 막지 않는다. 단, 운영 환경과 동일한 빌드에서 E2E를 검증하는 데 유용하다.

### `db-migrate.yml` — DB 마이그레이션 (main 머지 후)

- `CI` 워크플로우가 main 브랜치에서 성공했을 때만 실행된다.
- prod와 dev 두 환경에 병렬 마이그레이션한다. 둘 다 **같은 prod 인스턴스**(`SUPABASE_DIRECT_URL`)를 쓰되, dev는 `DB_SCHEMA=dev` matrix로 prod 인스턴스의 `dev` 스키마에 격리 적용한다(별도 dev 프로젝트는 Supabase free plan의 활성 2개 제한으로 폐기). advisory lock id를 prod/dev로 분리해 같은 인스턴스에서의 충돌을 피한다.
- dev 스키마용 마이그레이션은 `web/src/server/db/migrations-dev/`에 별도 생성하며, 추적 테이블은 `drizzle_dev` 스키마로 분리된다. 자세한 격리 설계는 [reference 메모리/PR #392·#393] 참고.

### `db-seed.yml` — 시드 동기화 (마이그레이션 후)

- `db-migrate`가 main에서 성공하면 실행된다. prod(`public`)·dev(`dev`) 두 스키마를 각각 다른 advisory lock으로 시드한다.
- `pnpm db:seed:sync`([`seed-if-needed.mjs`](../scripts/seed-if-needed.mjs))는 **추적 파일들의 해시**를 `seed_run_state` 테이블과 비교해, 달라졌을 때만 실제 시드를 돌린다(그 외에는 NO-OP).
- **추적 파일은 `DB_SEED_TRACKED_FILES`로 명시한다.** 기본값은 `seed.ts` 하나뿐인데, seed의 내용은 그 파일이 import하는 카탈로그·blueprint·슬롯 키 헬퍼·라운딩이 함께 결정한다. seed.ts를 건드리지 않고 그쪽만 바꾸면 해시가 그대로라 **prod 시드가 조용히 스킵된다**(로그에 `seed skipped (hash unchanged)`만 남는다). 그래서 워크플로가 의존 파일까지 열거한다.
- seed는 upsert 기반이라 재실행이 안전하다. 목록에 파일을 더 넣어 불필요하게 한 번 더 도는 비용(~1분)보다, 빠뜨려서 반영이 누락되는 쪽이 훨씬 비싸다. **seed.ts에 import를 추가하면 이 목록도 함께 갱신할 것.**
- 시드 반영 확인은 실행 로그의 `program_template` / `exercise` 카운트로 한다(`counts ... → seed completed ...`).

### `deploy.yml` — 배포 확인 (마이그레이션 후)

- `db-migrate` 완료 후 실행된다.
- Vercel API를 폴링해서 해당 commit SHA의 production 배포가 `READY` 상태가 될 때까지 대기한다.
- ⚠️ `db-seed`와 **순서가 보장되지 않는다**(둘 다 `db-migrate`를 트리거로 삼는 별도 워크플로). 새 시드 데이터에 의존하는 코드를 배포할 때는 잠깐 동안 코드만 먼저 살아 있을 수 있다.

---

## 3. 생성/수정된 파일 목록

```
.github/workflows/
  ci.yml                 신규 — 메인 CI 파이프라인
  e2e-preview.yml        신규 — Vercel Preview URL E2E
  db-migrate.yml         수정 — 트리거 워크플로우를 CI로 변경

web/
  package.json           수정 — typecheck, test:unit 스크립트 추가
  playwright.config.ts   수정 — Vercel bypass 헤더 지원 추가
  e2e/smoke.spec.ts      신규 — 핵심 페이지 smoke 테스트
```

---

## 4. 초기 설정 체크리스트

처음 이 파이프라인을 적용하거나 새 환경에 세팅할 때 따르는 순서.

```
□ Step 1: 파일들을 commit하고 push
□ Step 2: GitHub Secrets에 VERCEL_AUTOMATION_BYPASS_SECRET 추가 (아래 참고)
□ Step 3: Vercel → Deployment Protection → Automation Bypass 활성화
□ Step 4: 테스트 PR을 열어 CI 3개 job 모두 통과하는지 확인
□ Step 5: CI 통과 확인 후 Branch Protection Rule 적용
□ Step 6: e2e-preview.yml 동작 확인 (Vercel Preview 생성 후 Actions 탭 확인)
```

---

## 5. 브랜치 보호 규칙

GitHub → Repository Settings → Branches → `main` → Edit

```
☑ Require a pull request before merging
☑ Require status checks to pass before merging
  ☑ Require branches to be up to date before merging

  Required status checks (정확한 이름으로 입력):
    CI / Lint · Typecheck · Unit Tests
    CI / Build
    CI / E2E Smoke

☑ Do not allow bypassing the above settings
```

> **주의**: status check 이름은 `ci.yml`의 `jobs.<id>.name` 필드와 정확히 일치해야 한다.
> 워크플로우 이름(`name: CI`) + ` / ` + job 이름(`name: Lint · Typecheck · Unit Tests`) 형식.

---

## 6. 환경변수 및 Secrets

### GitHub Secrets

GitHub → Repository Settings → Secrets and variables → Actions

| Secret | 설명 | 사용처 |
|--------|------|--------|
| `SUPABASE_DIRECT_URL` | prod DB 직접 연결 URL (prod=`public`, dev=`dev` 스키마 공용) | db-migrate.yml, db-seed.yml |
| ~~`SUPABASE_DEV_DIRECT_URL`~~ | 폐기 — dev는 prod 인스턴스의 `dev` 스키마로 이전(`DB_SCHEMA=dev` matrix로 대체) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | 백업 스토리지 업로드용 | db-backup.yml |
| `VERCEL_TOKEN` | Vercel API 인증 토큰 | deploy.yml |
| `VERCEL_PROJECT_ID` | Vercel 프로젝트 ID | deploy.yml |
| `VERCEL_TEAM_ID` | Vercel 팀 ID (개인 계정이면 불필요) | deploy.yml |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview 배포 보호 우회 키 | e2e-preview.yml |

### `VERCEL_AUTOMATION_BYPASS_SECRET` 발급 방법

1. Vercel Dashboard → 해당 프로젝트 → Settings
2. Deployment Protection 섹션
3. Protection Bypass for Automation → Enable
4. 생성된 시크릿 값을 복사해서 GitHub Secret에 저장

### CI 전용 환경변수 (Secrets 불필요, workflow에 하드코딩)

| 변수 | 값 | 설명 |
|------|-----|------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/workout_log_ci` | CI용 PostgreSQL |
| `WORKOUT_AUTH_USER_ID` | `ci-user` | 싱글유저 앱의 테스트 유저 ID |
| `DB_MIGRATE_ENABLED` | `0` | build job에서 migrate.mjs 스킵 |
| `NEXT_TELEMETRY_DISABLED` | `1` | Next.js 텔레메트리 비활성화 |

---

## 7. E2E 테스트 전략

### smoke.spec.ts — PR 필수 게이트

`web/e2e/smoke.spec.ts`에 위치. 목적은 **배포 직전 크리티컬 에러 차단**이다.

검증 항목:
- 홈(`/`), 운동 기록(`/workout/log`), 통계(`/stats`), 플랜(`/plans`), 설정(`/settings`) 페이지가 500 없이 렌더링됨
- `Application error` 텍스트 미노출 (React 에러 바운더리 미발동)
- `/api/health` 500/503 없음
- 홈 → 운동 기록 기본 내비게이션 동작

**의도적으로 테스트하지 않는 것**: UX 상세 인터랙션, 비주얼 회귀, 디자인 토큰 준수. 이것들은 별도 spec에서 검증한다.

### DB 상태 전략

CI 환경에서 E2E는 운영 DB와 완전히 격리된다.

```
GitHub Actions services.postgres (PostgreSQL 16)
  → pnpm db:migrate (스키마 적용)
  → pnpm db:seed (WORKOUT_AUTH_USER_ID=ci-user 기준 seed 데이터)
  → Playwright 실행
```

- seed 데이터는 `ci-user` userId 기준으로 생성된다.
- 테스트 간 DB 상태 초기화는 하지 않는다 — smoke 테스트는 읽기 위주라 충돌이 없다.
- 복잡한 write 테스트가 필요해지면 `beforeEach`에서 특정 테이블을 truncate하는 방식으로 확장한다.

### Vercel Preview E2E (`e2e-preview.yml`)

PR마다 Vercel이 Preview 배포를 생성하면 GitHub `deployment_status` 이벤트가 발생한다.
이 이벤트를 받아 Preview URL을 `PLAYWRIGHT_BASE_URL`로 주입해서 같은 smoke 테스트를 실행한다.

```
Vercel Preview 배포 완료
    → deployment_status: success (environment: Preview)
    → e2e-preview.yml 실행
    → PLAYWRIGHT_BASE_URL = https://workout-log-<hash>.vercel.app
    → x-vercel-protection-bypass 헤더로 인증 우회
    → smoke.spec.ts 실행
```

### Flaky 방지 설정

`playwright.config.ts` 기준:

| 설정 | 값 | 효과 |
|------|-----|------|
| `retries` | `2` (CI) | 일시적 실패 자동 재시도 |
| `fullyParallel` | `false` | 테스트 순서 안정화 |
| `trace` | `on-first-retry` | 재시도 시 trace 저장 |
| dev 서버 timeout | `180,000ms` | 느린 CI 서버 대응 |

---

## 8. 실패 분석 방법

### Artifact 위치

Actions 탭 → 실패한 run → Artifacts 섹션

| Artifact 이름 | 내용 |
|--------------|------|
| `playwright-smoke-<run_id>-<attempt>` | CI smoke 실패 시 |
| `playwright-preview-<deployment_id>-<attempt>` | Preview E2E 실패 시 |
| `playwright-artifacts-<run_id>` | 디자인 컴플라이언스 실패 시 |

### 분석 절차

```
1. Artifact 다운로드 후 압축 해제
2. playwright-report/index.html 브라우저로 열기
3. 실패한 테스트 클릭 → Trace 탭에서 단계별 스크린샷/네트워크 확인
4. test-results/<test-name>/에 screenshot.png, trace.zip 존재
5. trace.zip은 https://trace.playwright.dev 에서 열기 가능
```

### 자주 나오는 실패 패턴

| 증상 | 원인 | 조치 |
|------|------|------|
| `Timeout waiting for server` | Next.js dev 서버가 180s 내 미기동 | `PLAYWRIGHT_WEB_SERVER_TIMEOUT` 늘리거나 서버 startup 로그 확인 |
| `500` 응답 | DB 연결 실패 또는 마이그레이션 누락 | CI 로그에서 `db:migrate` / `db:seed` 단계 확인 |
| `Application error` 텍스트 노출 | React 에러 바운더리 발동 | Playwright trace에서 console 에러 확인 |
| Vercel bypass 오류 | `VERCEL_AUTOMATION_BYPASS_SECRET` 미설정 또는 만료 | Vercel 프로젝트에서 새 시크릿 재생성 |

---

## 9. 운영 팁

### 캐시 전략

- **pnpm 의존성**: `pnpm-lock.yaml` 해시 기반 → lockfile 변경 시 자동 무효화
- **Playwright 브라우저**: `pnpm-lock.yaml` 해시 기반 → Playwright 버전 변경 시만 재다운로드
- **Next.js 빌드 캐시**: `pnpm-lock.yaml` + `src/**/*.{ts,tsx,css}` 해시 기반 → 소스 변경 시 부분 무효화

캐시 문제가 의심될 때 수동 무효화:
Actions 탭 → Caches → 해당 캐시 삭제 후 재실행.

### CI 시간 단축 팁

- `quality` 실패 시 `build`/`e2e-smoke`가 시작하지 않아서 불필요한 분을 절약한다.
- `build`와 `e2e-smoke`는 병렬 실행된다 — 두 job 중 느린 쪽이 전체 시간을 결정한다.
- PR 코드가 `web/` 외 경로만 변경한 경우 CI가 실행되지 않는다 (`paths` 필터).

### 롤백

main 머지 후 문제가 발견된 경우:

```bash
# 이전 commit으로 revert PR 생성
git revert <broken-commit-sha>
git push origin revert-branch
# PR 열기 → CI 통과 후 머지 → Vercel이 자동 재배포
```

Vercel에서 직접 이전 배포로 즉시 롤백하는 것도 가능하다:
Vercel Dashboard → Deployments → 이전 production 배포 → `...` → Promote to Production

### nightly 실패 대응

`db-backup.yml`이 nightly에 실패하면:
- GitHub → Actions 탭에서 실패 알림 이메일 수신
- 단순 flaky라면 수동 재실행으로 확인
- 지속 실패면 Supabase 연결/권한/스케줄 상태를 점검

### `e2e-preview.yml` 미동작 시 체크포인트

1. Vercel ↔ GitHub 앱 연동 여부: GitHub → Settings → Integrations → Applications
2. `deployment_status` 수신 여부: GitHub → repo Settings → Webhooks
3. `github.event.deployment.environment` 값이 정확히 `Preview`인지 확인 (대소문자 구분)
4. `VERCEL_AUTOMATION_BYPASS_SECRET`이 GitHub Secrets에 등록됐는지 확인
