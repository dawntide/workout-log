# DB 멀티유저 격리 마이그레이션 계획

> 상태: **dev 리허설 완료·검증 통과** (2026-07-23). 코드/마이그레이션 스테이징됨(미커밋). **prod 적용은 미실행**(별도 승인 게이트).
> 근거 감사: [`codebase-audit-2026-07.md`](codebase-audit-2026-07.md) §7 — "DB 레벨 멀티유저 격리 부재(`user_id` text, appUser FK 0)".
>
> **구현 상태:**
> - ✅ `schema.ts`: 7개 도메인 `user_id` + `owner_user_id` → `uuid` + FK(app_user, cascade). `ux_event_log`는 `text` 유지.
> - ✅ dev 마이그레이션 `migrations-dev/0008` 저작·**적용·검증**: 컬럼 uuid화, FK 8개(cascade), 잔여 non-uuid/orphan 0, FK 거부·cascade 실동작 PASS.
> - ✅ prod 마이그레이션 `migrations/0025` 저작(**fail-loud 가드** + `USING ::uuid`, canonical 계정 미seed). **미적용.** ⚠️ prod엔 `0007`의 테넌트 복합 FK `generated_session_plan_user_fk`(`(plan_id,user_id)`→`plan(id,user_id)`, schema.ts 미반영 raw SQL)가 있어, 타입 변경 전 `DROP` → 양쪽 uuid화 후 **재생성**해야 함. **dev 스키마는 squash로 이 제약이 없어 리허설이 못 잡음 → CI(prod 전체 체인)가 발견**(E2E Smoke, 42804).
> - ✅ `seed.ts`: fallback 기본값 canonical uuid + 해당 app_user seed. 코어 테스트 472/472, web typecheck 통과.
> - ✅ `.env.local`·docs(CLAUDE/AGENTS/README/local-dev/qa)·`verifyProgramWorkflows` fallback을 canonical uuid로 표준화.
> - ⏭️ **prod 게이트**: public 사전점검(승인) → 레거시/orphan 정합 → `migrations/0025` 적용(=prod 배포). CI 검증 스크립트(idempotency·account-lifecycle)는 자체 app_user 생성 패턴이라 FK 호환.
> - ⏭️ **후속 PR**: auth 계열 FK(§3 2차 배치), `ux_event_log` nullable-user 재설계(선택).

## 1. 문제

앱은 이미 멀티유저다. 모든 도메인 테이블에 `user_id`가 있고 쿼리는 전부 `where userId = ...`로 필터한다 — **애플리케이션 레벨 격리는 동작**한다. 빠진 것은 **DB 레벨 강제** 두 가지다.

1. **타입 불일치**: 도메인 테이블 `user_id`는 `text`, 실제 사용자 `app_user.id`는 `uuid`.
2. **FK 0건**: `user_id`가 `app_user.id`를 참조하지 않는다. DB가 값을 검증하지 않으므로 코드 버그로 인한 잘못된/고아 `user_id`를 막지 못한다.

이미 있는 방어는 [`account_deletion_tombstone`](../packages/core/src/db/schema.ts) 트리거(삭제 후 고아 데이터 재생성 차단)뿐이다. 참조 무결성·cascade 삭제·타입 정합성은 없다.

**왜 지금 하나(상업화 무관):** `text→uuid` 타입 변경 + 백필 + FK 추가는 **행 수가 적을수록 압도적으로 싸고 안전**하다. 데이터가 불어난 뒤엔 같은 작업이 다운타임·백필 리스크가 큰 작업이 된다. "실사용자 생기면 그때"는 정확히 반대 타이밍.

## 2. dev 리허설 사전점검 결과 (실데이터)

dev 스키마(app_user 190행, 대부분 seed 테스트 계정)에 read-only 스캔을 돌린 결과:

| 테이블 | user 컬럼 | total | non-uuid | orphan-uuid |
|---|---|---:|---:|---:|
| plan | user_id | 198 | **18** (`local-user`) | 0 |
| plan_runtime_state | user_id | 167 | **4** (`local-user`) | 0 |
| generated_session | user_id | 809 | **20** (`local-user`) | 0 |
| workout_log | user_id | 773 | **40** (`local-user`) | 0 |
| plan_progress_event | user_id | 1008 | **24** (`local-user`) | 0 |
| stats_cache | user_id | 12 | **12** (`local-user`) | 0 |
| user_setting | user_id | 212 | **7** (`local-user`) | **1** (`1c77de4f…`) |
| ux_event_log | user_id | 6236 | **6236** (`__anonymous_web_vitals__` 6220, `local-user` 16) | 0 |
| program_template | owner_user_id | 18 | 0 | 0 |

**리허설이 이론 계획이 놓쳤을 3가지를 잡아냄:**

1. **`ux_event_log`의 `__anonymous_web_vitals__` 6,220행** — [`ANONYMOUS_WEB_VITAL_USER_ID`](../packages/core/src/observability/web-vital-event.ts). 공개 엔드포인트 `/api/ux-events/public`로 들어오는 **인증 없는** Core Web Vitals 텔레메트리. 유저에 못 묶는다. → **`ux_event_log`는 FK 대상에서 제외.**
2. **`user_setting`의 고아 uuid 1행** (`1c77de4f-558e-4b9b-b888-5bf15a69dcc0`) — 유효 uuid지만 `app_user`에 없음. FK 추가 전 정리 필요.
3. **`local-user`** — 로컬 dev fallback(`WORKOUT_AUTH_USER_ID=local-user`)이 8개 테이블에 산재. uuid도 아니고 app_user 행도 없음. FK 전 표준화 필요.

> prod(public) 스키마 사전점검은 **아직 미실행**(실데이터라 별도 승인 게이트). prod는 `WORKOUT_AUTH_USER_ID` 미설정이라 `local-user` 행은 없어야 하지만, auth 도입 이전의 레거시 fallback 행(예: `dev`)·고아 uuid 존재 가능성은 prod 사전점검으로 반드시 확인.

## 3. 범위

**FK 적용 (7개 도메인 테이블):** `user_id text NOT NULL` → `uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE`
`plan` · `plan_runtime_state` · `generated_session` · `workout_log` · `plan_progress_event` · `stats_cache` · `user_setting`

**FK 적용 (nullable):** `program_template.owner_user_id text` → `uuid NULL REFERENCES app_user(id) ON DELETE CASCADE` (PUBLIC 템플릿은 owner=null로 무영향, fork는 owner 삭제 시 함께 삭제).

**제외:** `ux_event_log` — 익명 sentinel 때문에 `text` 유지. (후속 옵션: user 컬럼을 nullable로 재설계해 익명은 NULL 저장 — 별도 과제.)

**2차 배치(선택, 같은 마이그레이션 또는 후속):** auth 계열 `user_id`도 개념상 `app_user.id` 참조 — `auth_session` · `password_reset_token` · `email_verification_token` · `auth_oauth_account` · `auth_event_log`(nullable). 모두 `ON DELETE CASCADE`로 계정 삭제 시 세션/토큰 자동 정리. 로그인마다 쓰는 테이블이라 리허설로 성능 영향 확인 후 결정.

## 4. 선결 과제 & 해결

### 4.1 Fallback userId 표준화 ⚠️ 로컬 워크플로 변경
`local-user`/`dev` 같은 non-uuid fallback을 **canonical uuid로 통일**하고 그 uuid로 `app_user` 행을 seed한다. CI는 이미 `00000000-0000-4000-8000-000000c1c1c1`를 쓰므로 이를 표준으로 채택.
- [`seed.ts`](../packages/core/src/db/seed.ts) 기본값 `"dev"` → canonical uuid, 해당 `app_user` 행 idempotent seed.
- 문서/`.env` 예시(`local-dev-after-clone-guide.md`, `web/README.md`, CLAUDE.md)의 `WORKOUT_AUTH_USER_ID=local-user` → canonical uuid.
- [`claim-fallback.ts`](../packages/core/src/auth/claim-fallback.ts)는 그대로 동작(canonical uuid → 신규 가입 uuid로 UPDATE 이동).

### 4.2 고아 데이터 정리
사전점검에서 나온 고아 uuid(user_setting 1행 등)는 소유자가 없으므로 **삭제**. prod는 자동 삭제 대신 **fail-loud → 수동 검토** 원칙(정체불명 데이터를 마이그레이션이 임의 삭제하지 않음).

### 4.3 account-lifecycle 상호작용
`ON DELETE CASCADE`는 **추가 안전망**일 뿐 주 삭제 경로가 아니다. 현재 계정 삭제([`auth.ts`](../apps/api/src/routes/auth.ts) delete tx + [`deleteUserDomainData`](../packages/core/src/data/deleteUserData.ts))는 `app_user` 행을 **드롭하지 않고** tombstone만 남기므로 cascade가 의도치 않게 발화하지 않는다. → **확인 필요:** 어떤 코드 경로도 데이터 보존 의도로 `app_user`를 삭제하지 않을 것(현재 코드상 없음).

## 5. 마이그레이션 단계 (스키마별 · dev 먼저 → prod 승인 후)

- **Phase 0 (코드, DB 무변경):** `schema.ts`에서 대상 컬럼 `text`→`uuid` + `.references(() => appUser.id, { onDelete: "cascade" })`. canonical `app_user` seed. fallback uuid 표준화(§4.1). *(`uuid()`도 TS에선 string이라 런타임 코드 무변경 — non-uuid 값만 DB에서 거부됨.)*
- **Phase 1 (read-only 사전점검):** `node web/scripts/preflight-userid.mjs`(public) / `DB_SCHEMA=dev …`(dev) — non-uuid·고아 스캔, blocker 0이면 exit 0. **prod는 이 시점에 별도 승인.**
- **Phase 2 (데이터 정합, 마이그레이션 내 DML, 가드):**
  1. canonical `app_user` 존재 보장(`insert … on conflict do nothing`).
  2. 알려진 fallback 문자열 재할당: `update <t> set user_id = '<canonical-uuid>' where user_id in ('local-user','dev')` (8개 테이블).
  3. 고아 정리: dev는 삭제, **prod는 fail-loud**.
- **Phase 3 (DDL, 테이블당 단일 트랜잭션):**
  ```sql
  alter table <t> alter column user_id type uuid using user_id::uuid;
  alter table <t> add constraint <t>_user_id_app_user_fk
    foreign key (user_id) references app_user(id) on delete cascade;
  ```
- **Phase 4 (검증):** FK 존재 확인, smoke, `claim-fallback`/`verifyAccountLifecycle` 그린 확인.

## 6. 리허설 절차 (핵심 함정: 스키마별 SQL 2벌)

dev 스키마는 **별도 마이그레이션 폴더**(`web/src/server/db/migrations-dev/`)와 추적 테이블(`drizzle_dev`)을 쓴다([`migrate.mjs`](../web/scripts/migrate.mjs), [`drizzle.config.ts`](../web/drizzle.config.ts)). 즉 SQL을 **dev용(`dev.` 한정)·prod용(무한정) 2벌**로 저작해야 한다.

1. `migrations-dev/0008_*.sql`(dev.- 한정) 저작 → `DB_SCHEMA=dev pnpm -C web db:migrate`(또는 `node scripts/migrate.mjs`) → 관찰·수정.
2. dev 통과 후 `migrations/0025_*.sql`(무한정) 저작. **prod 미적용.**
3. prod 게이트: public 사전점검(승인) → prod 고아/레거시 정합안 확정 → 적용.

## 7. 리스크 / 롤백

- 마이그레이션당 단일 트랜잭션 → 실패 시 클린 롤백. 데이터 적어 타입 변경/역변경 빠름(`type text using user_id::text` + drop constraint로 역전 가능).
- `ux_event_log` 제외로 익명 텔레메트리 무영향.
- `ON DELETE CASCADE` 도입: `app_user` 삭제가 도메인 데이터로 전파됨 — 데이터 보존 의도로 `app_user`를 드롭하는 경로가 없음을 재확인(§4.3).

## 8. 결정 필요 (진행 전)

1. **§4.1 fallback uuid 표준화** — 로컬 dev `.env`/문서의 `WORKOUT_AUTH_USER_ID=local-user`를 canonical uuid로 바꾸는 워크플로 변경. 승인 시 Phase 0 착수.
2. **auth 2차 배치(§3)** 포함 여부 — 같은 마이그레이션 vs 후속 PR.
