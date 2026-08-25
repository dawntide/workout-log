# 세트 타입과 e1RM 단일화 구현 계획 (M1-3)

> ## ✅ 구현 완료 (2026-08-25) — PR #678 · #679 · #680 · #681
>
> 착수 시 전수 재조사에서 이 계획서의 사실 3건이 교정됐다. 다음 계획서를 쓸 때
> 참고할 것 — **표면 조사는 계획서를 쓴 시점의 스냅샷이고, 착수 때 다시 세야 한다.**
>
> | 계획서 | 실측 | 영향 |
> |---|---|---|
> | §2.2 "볼륨 집계 SQL 7곳 + JS 2곳" | `workout_set`을 읽는 쿼리는 **23개 파일** | 필터 대상 11파일 + 넣으면 안 되는 곳 10파일을 분류해야 했다(#681의 `warmup-exclusion-guard`가 그 분류를 강제한다) |
> | §2.2 근육군 볼륨은 JS 3단 수정 필요 | SQL에서 걸면 끝 | `MuscleVolumeInputRow` 미변경 |
> | §4 G5 "metric 문자열 bump 필수" | 읽기 10곳이 전부 TTL(90~300초) → **불필요** | 대신 "모든 stats_cache 읽기는 TTL을 넘긴다"를 가드로 고정 |
>
> 그 외 §3.1의 `exposureE1rm` → `resolveLoggedTotalLoadKg` 통일 제안도 채택하지 않았다
> (그 함수는 meta에 적힌 총부하를 읽는 용도인데 모니터 입력에는 meta가 없어 풀업에서
> 체중이 통째로 빠진다 — #678 본문 참조).

> 상태: **완료** (계획 2026-08-19 → 구현 2026-08-25). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §3 M1-3.
>
> **⚠️ 로드맵 초안의 사실 2건이 실측으로 뒤집혔다:**
> - e1RM 중복은 **4곳이 아니라 11곳**이고, 그중 3곳은 **공식이 서로 다르다**(§2.1). 따라서 로드맵의 "출력 불변 골든 비교" DoD는 성립하지 않는다.
> - `validateExportShape`는 **세트 필드 단위 검증을 하지 않는다**(§2.6). 로드맵이 "갱신 필수"로 적은 것은 오류이며, 실제로는 변경 불필요다.
>
> **확정된 설계 결정** (2026-08-19 사용자 선택 + 실측 근거):
> 1. **e1RM** — 흩어진 특례(1렙 정확값, 15렙 클램프, 음수 가드)를 **표준으로 승격**해 11곳을 통일한다. 수치가 더 정확해지는 대신 **기존 차트·PR 숫자 일부가 바뀐다**(의도된 변경).
> 2. **REF5** — REF5 세션에서는 **세트 타입을 비활성**한다. 검증기를 건드리지 않는다.
> 3. **저장 위치** — `meta` JSON이 아니라 **additive 컬럼 `set_type`**(§3.2 근거: SQL 집계가 7곳이라 jsonb는 인덱스를 못 탄다).

## 1. 문제와 목표

Strong의 세트 타입은 입력 편의 기능처럼 보이지만 실체는 **통계 정확도 장치**다: 웜업/드롭/실패 중 **웜업만 통계·차트에서 제외**한다. 우리 앱은 세트 타입이 없어서 지금 **웜업 세트가 볼륨과 e1RM을 오염시킨다**(사용자가 웜업을 기록한다면).

동시에, 세트 필터를 넣으려면 e1RM 계산이 흩어진 11곳에 각각 꽂아야 한다 — 그래서 **단일화가 선행 조건**이다.

**목표**
1. 세트에 `웜업 / 실패` 태그를 달 수 있다.
2. 웜업은 e1RM·볼륨·PR·근육군 볼륨·진행 판정 입력에서 **일관되게 제외**된다.
3. e1RM 계산이 core의 단일 함수로 수렴하고, 향후 필터·공식 변경이 한 곳에서 끝난다.

**비목표**
- 드롭세트·미오랩 전용 타입 — 프로그램 구성상 수요가 없다(로드맵 §9).
- `isExtra` 시맨틱 변경 — §2.4 참조. 현행이 옳다.
- 1RM 공식 선택(Brzycki 등) — 단일화가 문을 열어두지만 이번 범위 밖.
- REF5 검증기 완화.

**성공 기준**: 웜업으로 태그한 세트가 어떤 통계에도 잡히지 않고, e1RM을 계산하는 코드가 리포에 하나만 남는다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 e1RM(Epley) — 11곳, 공식 3종

| # | 위치 | 심볼 | 변형 |
|---|---|---|---|
| 1 | [`stats/e1rm-service.ts:31-33`](../packages/core/src/stats/e1rm-service.ts) | `epley1RM` | 가드 없음 |
| 2 | [`stats/bundle-service.ts:10-12`](../packages/core/src/stats/bundle-service.ts) | `epley1RM` | 가드 없음 |
| 3 | [`stats/prs-service.ts:13-15`](../packages/core/src/stats/prs-service.ts) | `epley1RM` | 가드 없음 |
| 4 | [`stats/strength-score-service.ts:36-38`](../packages/core/src/stats/strength-score-service.ts) | `epley1RM` | 가드 없음 |
| 5 | [`home/home-service.ts:268-270`](../packages/core/src/home/home-service.ts) | `epley1RM` | 가드 없음 |
| 6 | [`services/workout-log/personal-records.ts:19-23`](../packages/core/src/services/workout-log/personal-records.ts) | `epley` | `w<=0→0`, reps 무효 시 1 대체 |
| 7 | [`program-engine/asymptote-monitor.ts:35-38`](../packages/core/src/program-engine/asymptote-monitor.ts) | `epleyE1rm` (export) | `w<=0 \|\| reps<=0 → 0` |
| 8 | [`apps/api/src/routes/stats.ts:39-43`](../apps/api/src/routes/stats.ts) | `epley1RM` | **`reps===1 → weightKg`** |
| 9 | [`web/src/lib/workout-record/model.ts:518-523`](../web/src/lib/workout-record/model.ts) | `estimateE1rm` | **reps를 15로 클램프** |
| 10 | [`web/src/components/v2/v2-session-summary.model.ts:162-166`](../web/src/components/v2/v2-session-summary.model.ts) | `epleyEstimate` (export) | reps 최소 1 클램프 |
| 11 | [`apps/tui/internal/ui/log_model.go:213-223`](../apps/tui/internal/ui/log_model.go) | `setE1rm` | Go, 표시 전용 |

**자중 전처리 2계열**: #1~#6·#8~#10은 `resolveLoggedTotalLoadKg({exerciseName, weightKg, meta})`([`bodyweight-load.ts`](../packages/core/src/bodyweight-load.ts))로 총부하를 먼저 환산하고, **#7만 `bodyweightKg`를 직접 더한다**([`asymptote-monitor.ts:41-45`](../packages/core/src/program-engine/asymptote-monitor.ts) `exposureE1rm`). 단일 함수는 이 둘을 흡수해야 한다.

### 2.2 볼륨 집계 — SQL 7곳 + JS 2곳

**SQL `sum(weight_kg * reps)`** (웜업 제외를 `WHERE`에 넣어야 하는 지점):
- [`volume-series-service.ts:126`](../packages/core/src/stats/volume-series-service.ts)(시계열), [:156](../packages/core/src/stats/volume-series-service.ts)(perExercise)
- [`bundle-service.ts:44`](../packages/core/src/stats/bundle-service.ts) `fetchVolumeTonnage`
- [`home-service.ts:702`](../packages/core/src/home/home-service.ts)
- [`apps/api/src/routes/stats.ts:233`](../apps/api/src/routes/stats.ts), [:481](../apps/api/src/routes/stats.ts), [:490](../apps/api/src/routes/stats.ts)(ORDER BY), [:527](../apps/api/src/routes/stats.ts)(직전 기간)

**JS 루프** (필터 삽입이 쉬운 지점):
- [`muscle-volume-aggregate.ts:35-84`](../packages/core/src/stats/muscle-volume-aggregate.ts), 계산은 [:54](../packages/core/src/stats/muscle-volume-aggregate.ts). ⚠️ 입력 타입 `MuscleVolumeInputRow`([:22-29](../packages/core/src/stats/muscle-volume-aggregate.ts))에는 **`isExtra`조차 없다** → 타입·쿼리([`muscle-volume-service.ts:47-77`](../packages/core/src/stats/muscle-volume-service.ts))·집계 3단 수정.
- [`v2-session-summary.model.ts:201`](../web/src/components/v2/v2-session-summary.model.ts) `buildExerciseSummaries`

reps-only: [`endurance-service.ts:79`](../packages/core/src/stats/endurance-service.ts) `sum(reps)`.

### 2.3 `stats_cache` — 구 정의 payload가 남는다

위 서비스 전부 [`stats/cache.ts`](../packages/core/src/stats/cache.ts)의 `getStatsCache`/`setStatsCache`를 쓰고, **metric 문자열이 사실상 버전** 역할을 한다(`e1rm_best`, `prs`, `volume_series`, `bundle_v2`, `home_v2`, `muscle_volume_v1`, `strength_score_v1` — `_v2`·`_v1` 접미 선례 있음). 웜업 제외를 배포하면 DB에 구 정의 결과가 남으므로 **metric 문자열 bump가 필수**다. `invalidateStatsCacheForUser`([:113](../packages/core/src/stats/cache.ts))는 userId 단위 삭제만 한다.

### 2.4 `workout_set` 스키마와 `isExtra`의 의미

[`db/schema.ts:422-453`](../packages/core/src/db/schema.ts):
```
id, logId(→workout_log cascade), exerciseId(→exercise set null), exerciseName,
sortOrder, setNumber, reps, weightKg numeric(8,2), rpe numeric(3,1),
isExtra boolean NOT NULL default false, meta jsonb NOT NULL default {}
```
인덱스 4개 — `logId`, `exerciseId`, `exerciseName`, `lower(exerciseName)`. **`isExtra`·`meta` 인덱스 없음.**

**`isExtra`는 "사용자가 처방 밖에 추가한 **운동**"**이고 세트 타입과 다른 축이다. 생성은 운동 단위([`model.ts:1423`](../web/src/lib/workout-record/model.ts) `isExtra: exercise.badge === "ADDED"`), 소비는 **진행 판정**([`reducer.ts:520`](../packages/core/src/progression/reducer.ts)·[:593](../packages/core/src/progression/reducer.ts)·[:992](../packages/core/src/progression/reducer.ts))과 **PR 판정**([`personal-records.ts:98`](../packages/core/src/services/workout-log/personal-records.ts)·[:165](../packages/core/src/services/workout-log/personal-records.ts))에서 제외.

**볼륨 통계에는 포함된다 — 이것이 옳다.** 추가로 한 컬 3세트도 실제 훈련 볼륨이기 때문이다. "프로그램 진행 판정에서는 빼되 볼륨에는 넣는다"가 의도된 시맨틱이므로 **이번에 건드리지 않는다.**

`meta` 실사용 키: `memo, bodyweightKg, totalLoadKg, amrap, amrapDeferred, topSet, completed, progressionExcluded, plannedRef{...}, ref5{...}`.

### 2.5 진행 판정이 세트를 읽는 경로

- 계약 타입: [`reducer.ts:36-42`](../packages/core/src/progression/reducer.ts) `LoggedSetInput = { exerciseName, reps?, weightKg?, isExtra?, meta? }` — DB 행이 아니라 **축소 타입**.
- **어댑터가 병목**: [`autoProgression.ts:238-254`](../packages/core/src/progression/autoProgression.ts) `toLoggedSetRows(sets)`가 `isExtra`·`meta`만 통과시킨다. **여기에 새 필드를 추가하지 않으면 reducer는 세트 타입을 영영 못 본다.** DB select 3곳([:525-533](../packages/core/src/progression/autoProgression.ts)·[:622-634](../packages/core/src/progression/autoProgression.ts)·[:754-762](../packages/core/src/progression/autoProgression.ts))이 이 어댑터를 먹인다.
- 세트 순회 3곳: `collectTargetOutcomes`([:504-575](../packages/core/src/progression/reducer.ts)), `collectAsymptoteAmrapReps`([:581-611](../packages/core/src/progression/reducer.ts)), `hasLoggedProgramSet`([:991-995](../packages/core/src/progression/reducer.ts)) — 모두 `if (set.isExtra) continue` 가드를 이미 갖고 있다.
- 성공 판정: [`reducer.ts:118-127`](../packages/core/src/progression/reducer.ts) `setWasCompleted` — `meta.completed === true` 또는 `reps >= plannedReps`. **실패 태그를 신호로 쓴다면 여기가 지점.**

### 2.6 export / import

- [`import/validateExportShape.ts:1-39`](../packages/core/src/import/validateExportShape.ts) — `version` + 8개 배열 키의 **존재 여부만** 검사한다. **세트 필드 검증 없음** → 이번 변경으로 손댈 필요 없다(로드맵 오류 정정).
- [`import/validateImportScope.ts:48-142`](../packages/core/src/import/validateImportScope.ts) — 부모 FK 스코프 전용. **변경 불필요.**
- JSON export([`export/userExport.ts:99-106`](../packages/core/src/export/userExport.ts))는 `db.select()`(컬럼 미나열)라 **additive 컬럼이 자동 포함**되고, import 삽입([`userImport.ts:361-362`](../packages/core/src/import/userImport.ts))은 `typeof workoutSet.$inferInsert` 제네릭이라 **자동 반영**된다.
- **CSV export는 수동**: [`userExport.ts:166-181`](../packages/core/src/export/userExport.ts) `header` 배열에 컬럼을 추가해야 한다. **CSV importer는 존재하지 않으므로**(JSON 전용) 왕복 테스트 대상은 JSON뿐이다.

### 2.7 저장 / 복원 경로

- 저장: [`model.ts:1329-1439`](../web/src/lib/workout-record/model.ts) `toWorkoutLogPayload`. 세트 push는 [:1416-1425](../web/src/lib/workout-record/model.ts). ⚠️ `isExtra`([:1423](../web/src/lib/workout-record/model.ts))는 **운동 단위**라 그대로 쓸 수 없다 → 세트 단위 태그는 `repsPerSet`·`rpePerSet`·`weightKgPerSet`와 같은 **병렬 배열 `setTypePerSet`**이 필요하다(대응 `normalize*Array` 함수도 함께).
- 복원: [`model.ts:867-975`](../web/src/lib/workout-record/model.ts) `groupLoggedExercises`. ⚠️ 연속 판정 [`:901-905`](../web/src/lib/workout-record/model.ts) `isContinuation`은 `exerciseId + 이름 + setNumber` 기준인데, **여기에 세트 타입을 넣으면 웜업과 작업 세트가 별개 운동으로 쪼개진다.** 병합 분기([:907-916](../web/src/lib/workout-record/model.ts))에서 배열에 push하는 형태로만 손댄다.
- 최종 쓰기: [`upsert-log.ts:799-831`](../packages/core/src/services/workout-log/upsert-log.ts), 입력 타입 `WorkoutSetInput`([:50-60](../packages/core/src/services/workout-log/upsert-log.ts)).

### 2.8 REF5는 웜업 세트를 구조적으로 거부한다 — 결정 2의 근거

[`ref5-auto-progression.ts`](../packages/core/src/progression/ref5-auto-progression.ts) `canonicalizeRef5WorkoutLog`:
- [:301-303](../packages/core/src/progression/ref5-auto-progression.ts) — 세트 수가 처방 수와 **정확히 일치**해야 한다(`rows.length !== expectedSetCount` → 에러).
- [:359-361](../packages/core/src/progression/ref5-auto-progression.ts) — `isExtra === true`면 거부.
- [:149-159](../packages/core/src/progression/ref5-auto-progression.ts) `Ref5CanonicalWorkoutSet`은 `isExtra: false` / `rpe: 0` **리터럴 타입**.
- REF5 저장([`upsert-log.ts:453-459`](../packages/core/src/services/workout-log/upsert-log.ts))은 클라이언트 값을 버리고 canonical 세트를 insert하므로 태그가 있어도 소실된다.

또한 스펙 [§3.2(65-83행)](ref5-program-spec.md)이 "의도적 실패, 추가 반복, 성과 테스트 세트"를 이미 금지한다 → **REF5에서 세트 타입 비활성이 스펙과 정합**이다.

### 2.9 마이그레이션 관례

- 폴더 2벌: [`migrations/`](../web/src/server/db/migrations)(prod, 최신 `0027_…`) + [`migrations-dev/`](../web/src/server/db/migrations-dev)(dev, 최신 `0010_…`). **번호가 다르고 dev본은 `ALTER TABLE "dev"."workout_set"`처럼 스키마 접두사를 쓴다.**
- 분기: [`drizzle.config.ts:7-22`](../web/drizzle.config.ts) — `DB_SCHEMA` 설정 시 `migrations-${schema}` + 추적 테이블 `drizzle_${schema}`. [`scripts/migrate.mjs:35-41`](../web/scripts/migrate.mjs)이 같은 규칙을 복제.
- CI: [`db-migrate.yml`](../.github/workflows/db-migrate.yml) matrix 2개(lock_id 872341 / 872343).
- 가드: [`migration-journal-guard.test.mjs`](../web/scripts/migration-journal-guard.test.mjs) — journal `when` 엄격 증가·`idx` 순차·SQL↔journal 양방향 존재. (`0013_perf_indexes`가 prod에 영영 미적용된 사고가 주석에 기록돼 있다.)
- additive 선례: `migrations/0019_workout_log_personal_records.sql` = `ALTER TABLE … ADD COLUMN … jsonb;` **1줄**.

### 2.10 TUI

[`api/types.go:134-142`](../apps/tui/internal/api/types.go) `WorkoutSet`, [:147-156](../apps/tui/internal/api/types.go) `LoggedSet`, `SetMeta`([:48-52](../apps/tui/internal/api/types.go))의 `Extra map[string]json.RawMessage`가 **미지 meta 키를 무손실 보존**한다. → meta 방식이면 TUI 무변경이지만, **컬럼 방식이므로 두 struct에 필드를 명시 추가해야 한다.** 리플렉션 대조 테스트가 없으므로 CI가 누락을 못 잡는다(M1-1 §2.7과 동일한 함정).

## 3. 설계

### 3.1 e1RM 단일 함수 (PR1)

`packages/core/src/stats/e1rm.ts` (신설):
```ts
export function estimateE1rmKg(totalLoadKg: number, reps: number): number;
```
**표준 규칙**(흩어진 특례를 승격):
1. `totalLoadKg <= 0` 또는 `reps <= 0` → `0`
2. `reps === 1` → `totalLoadKg` (Epley는 1렙에서 3.3% 과대추정한다 — [`apps/api/routes/stats.ts:39-43`](../apps/api/src/routes/stats.ts)의 특례가 옳다)
3. `reps > 15` → `reps = 15`로 클램프 (고반복에서 Epley 신뢰도가 급락 — [`model.ts:518-523`](../web/src/lib/workout-record/model.ts)의 특례가 옳다)
4. 그 외 `totalLoadKg * (1 + reps / 30)`

자중 환산은 **호출자 책임**으로 유지한다(입력이 이미 `totalLoadKg`). #7 `exposureE1rm`은 자체 환산을 `resolveLoggedTotalLoadKg` 경유로 통일하되, 값이 달라지는지 반드시 확인한다.

**11곳 전환** — TS 10곳은 이 함수를 호출하고, Go(#11)는 같은 규칙을 구현하며 **골든 픽스처로 파리티를 강제**한다(기존 `session-key`·`bodyweight-load` 방식).

### 3.2 세트 타입 저장 = additive 컬럼

```sql
ALTER TABLE "workout_set" ADD COLUMN "set_type" text;   -- prod
ALTER TABLE "dev"."workout_set" ADD COLUMN "set_type" text;  -- dev
```
- 값: `'WARMUP' | 'FAILURE' | NULL`. **NULL = 작업 세트**(레거시 전부 포함 → 후방 호환).
- **컬럼을 택한 이유**: 볼륨 집계가 SQL 7곳에서 일어나는데(§2.2) `meta->>'setType'` 필터는 인덱스를 못 타고 매 행 jsonb 파싱 비용이 든다. 반면 컬럼은 `WHERE set_type IS DISTINCT FROM 'WARMUP'`으로 끝난다.
- 인덱스는 **넣지 않는다**. 필터는 항상 `logId` 인덱스로 좁혀진 뒤 적용되므로 선택도가 낮은 컬럼의 단독 인덱스는 이득이 없다.

### 3.3 웜업 제외의 일관 규칙

| 소비처 | 웜업 | 실패 |
|---|---|---|
| e1RM(추정 1RM·차트·PR) | **제외** | 포함 |
| 볼륨(총량·시계열·근육군) | **제외** | 포함 |
| 진행 판정(reducer) | **제외** | 포함 + `setWasCompleted`에 실패 신호 |
| 세션 요약 표시 | 표시하되 별도 구분 | 표시 |
| 세트 수 카운트(진행률 게이지) | **제외** | 포함 |

실패 태그는 통계에서 빼지 않는다 — 실패해도 든 무게와 반복은 실제 수행이기 때문이다. 진행 판정에서만 신호로 쓴다.

### 3.4 입력 UX

- 세트 행의 **세트 번호(첫 컬럼)를 탭** → 작은 메뉴(`작업 / 웜업(W) / 실패(F)`). Strong과 동일한 동선이며, M1-1이 마지막 컬럼(`✓`)을 쓰므로 충돌하지 않는다.
- 행 표시: 터미널 미학에 맞춰 번호 자리에 `W`/`F` 텍스트 태그 + 색 토큰(`--v2-c-warning` / `--v2-c-danger`).
- **REF5 세션에서는 메뉴를 열지 않는다**(결정 2). `exercise.ref5`가 있으면 세트 번호가 기존처럼 표시 전용.
- 자동 웜업 처방은 이번 범위 밖 — 사용자가 직접 태그한다.

## 4. 안전장치

- **G1. e1RM 변경분 명시 테스트** — "출력 불변"이 불가능하므로 **변하는 곳을 명시적으로 고정**한다. `reps=1`·`reps>15`·`w<=0` 경계에서 11곳이 **모두 같은 값**을 내는지 단언하고, 변경 전후 차이를 PR 본문에 표로 남긴다.
- **G2. Go/TS 파리티 골든** — `packages/core/fixtures/e1rm.json`(`__doc` + 케이스 배열)을 [`fixtures.test.ts`](../packages/core/src/fixtures.test.ts)와 [`golden_fixtures_test.go`](../apps/tui/internal/ui/golden_fixtures_test.go) 양쪽에서 소비.
- **G3. 웜업 제외 회귀** — 웜업 1세트 + 작업 3세트를 기록했을 때 볼륨·e1RM·PR·근육군 볼륨·진행 판정이 **작업 3세트만 반영**하는지 통합 테스트. SQL 7곳은 실 DB 쿼리로 확인한다.
- **G4. 왕복** — JSON export→import 후 `set_type` 보존, CSV 컬럼 존재, TUI `TestDraftRoundTrip`에 **단언 수동 추가**.
- **G5. 캐시 무효화** — metric 문자열 bump 후 구 캐시가 조회되지 않는지 확인.
- **G6. 진행 판정 replay** — 과거 로그(`set_type` NULL)와 신규 로그가 섞인 상태에서 `PATCH /api/logs/[logId]` 재계산이 동일 결과를 내는지.

## 5. PR 분해 (4개, 순서 고정)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `refactor(stats): e1RM 계산을 단일 함수로 모은다` | `stats/e1rm.ts` 신설 + TS 10곳 전환 + Go 1곳 규칙 일치 + 파리티 골든. **세트 타입과 무관하게 단독 머지 가능.** | 중 | G1·G2, core 전체, `test:progression`, web·apps/api typecheck |
| **2** | `feat(db): 세트 타입 컬럼을 추가한다` | 마이그레이션 2벌 + `schema.ts` + `WorkoutSetInput`/`upsert-log` + `setTypePerSet` 병렬 배열 + `toWorkoutLogPayload`/`groupLoggedExercises` + CSV 헤더 + **TUI struct 2곳**. UI 없음. | 중 | G4, `migration-journal-guard`, `go build/vet/test`, 왕복 |
| **3** | `feat(workout-log): 세트에 웜업·실패 태그를 단다` | 세트 번호 탭 메뉴 + 행 표시 + REF5 분기 + TUI 입력 키 | 중 | E2E, `lint:design`, `test:theme` |
| **4** | `feat(stats): 웜업 세트를 통계와 진행 판정에서 제외한다` | SQL 7곳 `WHERE` + JS 2곳 + `MuscleVolumeInputRow` 3단 + `toLoggedSetRows` + `setWasCompleted` 실패 신호 + **metric 문자열 bump** | **높** | G3·G5·G6 |

**REF5 스펙 문서 동반 갱신**(PR3에 포함): [§19.1(630행)](ref5-program-spec.md) 웜업 서술을 "기록 대상이 아니다"로 명확화, [§3.2(74-75행)](ref5-program-spec.md) 금지 목록에 세트 타입 비활성 명시, [§11.3(422행)](ref5-program-spec.md) 세트 수 엄격 일치의 근거 유지. ⚠️ **이 갱신을 강제하는 자동 가드는 없다**(§6-8) → PR 체크리스트로 관리.

## 6. 리스크 / 하지 말 것

1. **PR 순서를 바꾸지 말 것.** e1RM 단일화(PR1) 없이 웜업 필터(PR4)를 넣으면 11곳에 각각 꽂아야 하고, 그중 3곳은 공식이 달라 결과가 어긋난다.
2. **`toLoggedSetRows`를 빠뜨리지 말 것**([`autoProgression.ts:238-254`](../packages/core/src/progression/autoProgression.ts)) — 컬럼을 만들어도 이 어댑터가 통과시키지 않으면 진행 판정은 세트 타입을 못 본다. PR4의 최다 실패 지점.
3. **`isContinuation`에 세트 타입을 넣지 말 것**([`model.ts:901-905`](../web/src/lib/workout-record/model.ts)) — 웜업과 작업 세트가 별개 운동으로 쪼개진다.
4. **`isExtra` 시맨틱을 바꾸지 말 것** — 진행/PR에서 제외하고 볼륨에는 포함하는 현행이 옳다(§2.4).
5. **`meta`에 넣지 말 것** — SQL 집계 7곳에서 인덱스를 못 타고 파싱 비용이 붙는다.
6. **REF5 canonicalizer를 건드리지 말 것**(결정 2) — 세트 수 엄격 일치는 판정 무결성의 핵심 검증이다.
7. **`stats_cache` metric bump를 빠뜨리지 말 것** — 배포 후에도 구 정의 숫자가 그대로 보인다. 증상이 "일부 사용자만 안 바뀜"이라 진단이 어렵다.
8. **REF5 스펙 갱신을 자동 가드가 잡아줄 거라 기대하지 말 것** — 실측 결과 `ref5-program-spec.md` diff를 강제하는 CI 게이트는 **없다**([`ref5-protocol-bump-e2e-guard.mjs`](../web/scripts/ref5-protocol-bump-e2e-guard.mjs)는 프로토콜 **버전 값**이 바뀔 때 e2e 스펙 파일을 요구할 뿐이다). 수동 체크리스트로 관리.
9. **마이그레이션 dev본의 스키마 접두사를 빠뜨리지 말 것** — dev는 `"dev"."workout_set"`이다. prod SQL을 복사하면 조용히 잘못된 테이블을 건드린다.
10. **PR4를 한 번에 배포하며 캐시를 안 비우지 말 것** — G5를 배포 체크리스트에 넣는다.

## 7. 결정 사항

1. **컬럼 vs meta** → **컬럼**(§3.2). 로드맵이 단위 계획으로 미룬 결정을 여기서 확정한다.
2. **e1RM 표준 공식** → 1렙 정확값 + 15렙 클램프 + 음수 가드(§3.1). 수치 변경을 수용한다.
3. **REF5 세트 타입** → 비활성(§2.8).
4. **실패 태그를 통계에서 뺄 것인가** → **빼지 않는다**(§3.3). 실패해도 수행한 볼륨은 실재한다.
5. **웜업 자동 처방(프로그램이 웜업 세트를 생성)** → 이번 범위 밖. M1-1의 `restSeconds`처럼 DSL additive 확장으로 나중에 가능하며, 그때 웜업용 휴식 프리셋([`rest-timer-plan.md` §6-10](rest-timer-plan.md))도 함께 다룬다.
6. **`set_type` 인덱스** → 넣지 않는다(§3.2).
