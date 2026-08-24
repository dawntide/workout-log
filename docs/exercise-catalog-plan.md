# 운동 카탈로그 확충 계획 (M3)

> 상태: **계획 확정, 미착수** (2026-08-19). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §6.
>
> ## ⚠️ 로드맵의 아키텍처 전제가 틀렸다 — 설계 전면 교체
>
> 로드맵은 "확장 카탈로그를 **정적 JSON으로 번들** → 클라 검색 → 사용자 소유 exercise 행으로 **인스턴스화**"를 설계했다(2계층 카탈로그, 번들 크기 주의, 지연 로드). **실제 아키텍처는 완전히 다르다**:
>
> ```
> EXERCISE_CATALOG (코드 상수 33종)
>    ↓ seed.ts:1222  for (const item of EXERCISE_CATALOG)
> exercise 테이블 (전역 공유, userId 없음, exercise_name_uq)
>    ↓ GET /api/exercises?query=&limit=   서버 LIKE 검색 + alias 조인
> 클라이언트는 결과만 받는다 (SearchSelectCombobox)
> ```
>
> 따라서:
> - **정적 JSON 번들이 불필요하다** → 번들 예산([`check-bundle-budget.mjs`](../web/scripts/check-bundle-budget.mjs), 라우트별 290~345KB) **무영향**. 로드맵의 "코드 스플릿·지연 로드" 우려가 통째로 사라진다.
> - **2계층 카탈로그·인스턴스화가 불필요하다** — `exercise` 테이블이 이미 전역 공유이고 사용자 추가도 같은 테이블에 `onConflictDoNothing`으로 들어간다([`exercises.ts:96-120`](../apps/api/src/routes/exercises.ts)). 격리할 대상이 없다.
> - **검색이 이미 서버 사이드**라 종수가 늘어도 클라이언트가 받는 양은 `limit`(기본 20, 최대 200)로 고정이다.
>
> **규모 재산정: L → M.** 실질 작업은 "카탈로그 배열을 늘리고 타입을 감당 가능하게 만드는 것"이다.
>
> **새로 드러난 진짜 함정**: `ExerciseCatalogItem.name`이 **`EXERCISE_NAMES` 리터럴 유니온에 묶여 있다**(§2.2). 870종을 그대로 넣으면 타입이 폭발하고 seed의 `EXERCISE_NAMES.xxx` 참조 규약이 무너진다.

## 1. 문제와 목표

운동 DB가 **33종**이다(실측). 경쟁 앱은 Hevy 400+, Alpha Progression 795(전부 실사 영상), JEFIT 1,400+다. 시연 자료도 없다(`videoUrl`·`imageUrl`·설명 텍스트 전부 부재).

**목표**
1. 오픈 카탈로그를 통합해 수백 종 규모로 확충한다.
2. 새 운동에도 근육군 매핑이 붙어 볼륨 통계가 동작한다.
3. 종수가 늘어도 검색·선택 UX가 무너지지 않는다.

**비목표**
- 시연 영상·이미지 번들 — 라이선스와 용량 문제. 외부 링크로 대체(§7 결정 3).
- 한국어명 전면 번역 — 큐레이션 코어 33종만 유지(§3.4).
- `exercise` 테이블에 소유자 개념 도입 — 개인 도구이고 현재 전역 공유가 정상 동작한다.
- 운동별 상세 설명 원문 번역.

**성공 기준**: 운동 추가 검색에서 수백 종이 잡히고, 새로 고른 운동으로 기록해도 근육군 볼륨에 정상 반영된다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 데이터 흐름 — 코드 상수 → seed → 전역 DB → 서버 검색

- 카탈로그: [`exercise/catalog.ts`](../packages/core/src/exercise/catalog.ts) — `EXERCISE_NAMES`([:1](../packages/core/src/exercise/catalog.ts)), `ExerciseCatalogItem`([:38-42](../packages/core/src/exercise/catalog.ts)), `EXERCISE_CATALOG`([:57-242](../packages/core/src/exercise/catalog.ts), **33개**), `canonicalExerciseNameForInput`([:245](../packages/core/src/exercise/catalog.ts)), `LEGACY_EXERCISE_NAME_FALLBACKS`([:45](../packages/core/src/exercise/catalog.ts)).
- 카테고리 실측 분포: Legs 9 · Back 7 · Chest 5 · Arm 5 · Shoulder 4 · Olympic Lift 1 · Glute 1.
- seed: [`seed.ts:1222`](../packages/core/src/db/seed.ts) `for (const item of EXERCISE_CATALOG)`, 카운트 보고 [:1540](../packages/core/src/db/seed.ts).
- 테이블: [`schema.ts:288-299`](../packages/core/src/db/schema.ts) `exercise = { id, name, category, createdAt }` + `uniqueIndex("exercise_name_uq")`. **`userId` 없음 = 전역 공유.**
- 검색: [`exercises.ts:25-50`](../apps/api/src/routes/exercises.ts) `GET /` — `query` LIKE(이름·카테고리) + `exerciseAlias` 조인, `limit` 1~200(기본 20).
- 생성: [`exercises.ts:96-120`](../apps/api/src/routes/exercises.ts) `POST /` — 이름·카테고리만, `onConflictDoNothing`. 수정 [:237](../apps/api/src/routes/exercises.ts), 삭제 [:319](../apps/api/src/routes/exercises.ts), 별칭 [:150](../apps/api/src/routes/exercises.ts), 카테고리 목록 [:133](../apps/api/src/routes/exercises.ts).
- 클라이언트 검색 UI: [`add-exercise-sheet.tsx`](../web/src/features/workout-log/ui/add-exercise-sheet.tsx) → `SearchSelectCombobox`.

### 2.2 🔴 `EXERCISE_NAMES` 리터럴 유니온이 최대 제약

```ts
export type ExerciseCatalogItem = {
  name: (typeof EXERCISE_NAMES)[keyof typeof EXERCISE_NAMES];   // ← 리터럴 유니온
  category: string;
  aliases: readonly string[];
};
```
`EXERCISE_NAMES`는 `{ highBarBackSquat: "High-Bar Back Squat", ... }` 형태의 **키→표시명 상수 맵**이고, seed가 처방을 쓸 때 `EXERCISE_NAMES.highBarBackSquat`처럼 **심볼로 참조**한다(seed.ts에서 수십 회). 즉 이 상수는 두 역할을 겸한다:
1. **프로그램 처방의 안정적 식별자**(seed가 타입 검사와 함께 참조)
2. 카탈로그 항목의 이름 타입 제약

870종을 `EXERCISE_NAMES`에 넣으면 ① 리터럴 유니온이 870개로 불어나 타입체크가 느려지고 ② 프로그램이 실제로 쓰는 33종과 단순 수록 종목이 구분되지 않는다.

→ **두 역할을 분리해야 한다**(§3.2).

### 2.3 근육군 매핑은 이미 2단 폴백 구조

[`muscle-groups/category-to-muscle.ts`](../packages/core/src/muscle-groups/category-to-muscle.ts):
- `MuscleGroup` 9종([:1-10](../packages/core/src/muscle-groups/category-to-muscle.ts)): Quad·Hamstring·Glute·Back·Chest·Shoulder·Arm·Core·Other
- `resolveMuscleContribution(exerciseName, category)`([:116-131](../packages/core/src/muscle-groups/category-to-muscle.ts)): ① 운동 이름 정확 매칭(`EXERCISE_CONTRIBUTIONS`) → ② 카테고리 매핑(`CATEGORY_PRIMARY`) → ③ `{ Other: 1.0 }` 폴백
- 소비: [`muscle-volume-aggregate.ts:54`](../packages/core/src/stats/muscle-volume-aggregate.ts)

→ **새 운동이 들어와도 통계가 깨지지 않는다**(최악이 `Other` 집계). 다만 `Other`가 커지면 근육군 분석이 무의미해지므로 매핑 커버리지가 M3의 품질 지표다. **M5(근육 신선도)의 선행 조건이기도 하다.**

### 2.4 seed 추적과 재시드

[`db-seed.yml`](../.github/workflows/db-seed.yml)의 `DB_SEED_TRACKED_FILES`에 **`exercise/catalog.ts`가 이미 등재**돼 있다. 카탈로그를 바꾸면 해시가 변해 `pnpm db:seed:sync`가 실제 시드를 돌린다. seed는 upsert 기반이라 재실행이 안전하다.

## 3. 설계

### 3.1 소스 선정

| 후보 | 규모 | 라이선스 | 필드 |
|---|---|---|---|
| **free-exercise-db**(yuhonas) | ~870 | Unlicense(퍼블릭 도메인) | name, force, level, mechanic, **equipment**, **primaryMuscles**, **secondaryMuscles**, instructions, category, images |
| wger | 다수 | CC-BY-SA 계열(표기 의무) | 다국어 |

**1차 후보는 free-exercise-db** — 퍼블릭 도메인이라 표기 의무가 없고 `equipment`·`primaryMuscles`가 우리가 필요한 두 필드를 그대로 준다. 단위 계획 착수 시 라이선스 원문을 재확인한다(§7 결정 1).

### 3.2 타입 분리 — 프로그램 식별자와 수록 카탈로그

```ts
// 유지: 프로그램 처방이 참조하는 안정적 식별자 (33종, seed가 심볼로 참조)
export const EXERCISE_NAMES = { highBarBackSquat: "High-Bar Back Squat", ... } as const;
export type ProgramExerciseName = (typeof EXERCISE_NAMES)[keyof typeof EXERCISE_NAMES];

// 완화: 카탈로그 항목의 이름은 그냥 string
export type ExerciseCatalogItem = {
  name: string;                       // ← 리터럴 유니온 제약 해제
  category: string;
  aliases: readonly string[];
  equipment?: ExerciseEquipment;      // M1-2와 공용 (아래 §3.3)
  muscles?: MuscleContribution;       // 없으면 기존 2단 폴백
};
```
- **`EXERCISE_NAMES`는 33종 그대로 둔다.** seed의 `EXERCISE_NAMES.xxx` 참조가 전부 살아 있고 프로그램 처방의 타입 안전성도 유지된다.
- 카탈로그만 확장한다. "프로그램이 쓰는 운동"과 "고를 수 있는 운동"이 코드에서 구분되는 것은 **의미상으로도 옳다**.
- 컴파일 타임 가드: `EXERCISE_NAMES`의 모든 값이 `EXERCISE_CATALOG`에 존재하는지 유닛으로 단언한다(현재는 타입이 보장하던 것을 테스트로 대체).

### 3.3 M1-2(플레이트 계산기)와의 관계

[`plate-calculator-plan.md`](plate-calculator-plan.md) §3.1이 같은 `ExerciseCatalogItem`에 `equipment` 필드를 추가한다. **두 계획이 같은 파일을 건드리므로 순서를 정한다**:
- **M1-2를 먼저** 하면 33종에 장비를 붙이고, M3가 그 필드를 확장 종목까지 채운다.
- **M3를 먼저** 하면 M1-2는 이미 채워진 필드를 읽기만 한다.
- 어느 쪽이든 `ExerciseEquipment` 타입 정의는 **한 번만** 한다. 먼저 착수하는 쪽이 정의하고 다른 쪽은 소비한다.

### 3.4 변환과 큐레이션

- 소스 JSON → `EXERCISE_CATALOG` 항목으로 변환하는 **일회성 스크립트**를 `web/scripts/`에 두고, **산출물(TS 배열)을 커밋**한다. 런타임에 원본 JSON을 읽지 않는다 — core는 의존성 경량 원칙이고, seed 추적 해시도 산출물 기준이어야 한다.
- 변환 규칙:
  - `equipment`: 소스의 `equipment`를 우리 5종(`barbell|dumbbell|machine|cable|bodyweight`)으로 정규화, 미매칭은 `unknown`.
  - `muscles`: `primaryMuscles`(가중치 1.0 분배) + `secondaryMuscles`(0.3~0.5)를 우리 `MuscleGroup` 9종으로 매핑. 미매칭은 필드를 비워 **기존 2단 폴백에 맡긴다**.
  - `category`: 우리 기존 값(Legs/Back/Chest/Arm/Shoulder/Glute/Olympic Lift) 체계로 정규화.
  - `aliases`: 소스에 별칭이 없으므로 빈 배열. 기존 33종의 별칭은 **보존**한다.
- **이름 충돌**: 기존 33종과 이름이 겹치면 **기존 항목이 이긴다**(별칭·한국어명·근육 가중치가 큐레이션돼 있다). 스크립트가 충돌 목록을 출력하고 사람이 확인한다.
- i18n: 확장 종목은 영문명만. 한국어명은 기존 33종 유지(사용자 별칭으로 개인화 가능).

### 3.5 검색 UX

종수가 26배가 되면 "스쿼트"로 검색했을 때 결과가 쏟아진다.
- `GET /api/exercises`에 **카테고리·장비 필터 파라미터**를 추가한다(서버 LIKE에 조건 추가).
- 검색 시트에 필터 칩(부위·장비)을 얹는다.
- 정렬: **사용 이력이 있는 운동을 상단**에 올린다(내 기록에 등장한 운동 우선). 이게 없으면 매번 필터를 써야 한다.

## 4. 안전장치

- **G1. 프로그램 식별자 보존** — `EXERCISE_NAMES`의 33개 값이 전부 `EXERCISE_CATALOG`에 존재하는지 유닛. 타입 제약을 푸는 대신 이 테스트가 계약을 지킨다.
- **G2. 근육 매핑 커버리지 리포트** — 확장 카탈로그 중 `muscles`가 채워진 비율과 `Other`로 떨어지는 종목 수를 테스트가 출력한다. **목표 ≥ 90%**. M5의 선행 조건이므로 수치를 문서에 남긴다.
- **G3. 기존 33종 불변** — 확장 전후로 기존 항목의 `name`·`aliases`·`category`가 바이트 동일한지. 별칭이 깨지면 과거 기록의 운동 식별이 무너진다.
- **G4. seed 재시드 확인** — 카탈로그 해시 변경 → `db:seed:sync`가 실제로 도는지, upsert가 기존 행을 보존하는지(`exercise_name_uq` 충돌 처리).
- **G5. 검색 응답 크기** — `limit` 상한(200)에서 응답이 과대해지지 않는지. 필터 추가 후 대표 쿼리의 결과 수 확인.
- **G6. 번들 무영향 확인** — 카탈로그가 서버 전용 경로에만 있는지. 클라이언트 번들에 유입되면 예산(290~345KB)이 깨진다 — **`check-bundle-budget.mjs`가 이를 잡는다**.

## 5. PR 분해 (4개, 순서 고정)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `refactor(core): 프로그램 운동 식별자와 수록 카탈로그를 분리한다` | `ExerciseCatalogItem.name`을 `string`으로 완화 + `ProgramExerciseName` 타입 신설 + G1 유닛. **카탈로그 내용 무변경.** | 낮 | G1·G3, core 전체, typecheck 전 패키지 |
| **2** | `chore(core): 오픈 카탈로그 변환 스크립트를 추가한다` | `web/scripts/`에 변환기 + 충돌 리포트. 산출물 미커밋(스크립트만). | 낮 | 스크립트 dry-run |
| **3** | `feat(core): 운동 카탈로그를 오픈 소스 데이터로 확충한다` | 변환 산출물 커밋 + `muscles`·`equipment` 필드 + 라이선스 표기 + seed 재시드 | **중~높** | G2·G3·G4·G6 |
| **4** | `feat(exercises): 검색에 부위·장비 필터와 사용 이력 정렬을 넣는다` | API 필터 파라미터 + 시트 필터 칩 + 정렬 | 중 | G5, E2E |

**TUI**: 스키마 무변경(카탈로그는 코드 상수, 검색은 기존 API)이라 **PR4의 필터만 후행 판단** — exercises 버퍼에 필터가 필요한지는 실사용 후.

## 6. 리스크 / 하지 말 것

1. **`EXERCISE_NAMES`에 870종을 넣지 말 것** — 리터럴 유니온 폭발 + 프로그램이 쓰는 운동과 단순 수록 종목의 구분 소실. 33종 유지가 설계다.
2. **정적 JSON을 클라이언트 번들에 넣지 말 것** — 검색은 이미 서버 사이드다. 번들에 넣으면 예산이 깨지고 얻는 것이 없다.
3. **2계층 카탈로그·인스턴스화를 만들지 말 것** — `exercise` 테이블이 이미 전역 공유라 격리할 대상이 없다. 로드맵의 이 설계는 아키텍처 오해에서 나왔다.
4. **기존 33종을 덮어쓰지 말 것** — 별칭·한국어명·근육 가중치가 큐레이션돼 있고, 별칭이 깨지면 과거 기록의 운동 식별이 무너진다.
5. **원본 JSON을 런타임에 읽지 말 것** — 변환은 빌드 전 일회성이고 산출물만 커밋한다. seed 추적 해시도 산출물 기준이어야 한다.
6. **`muscles` 미매칭을 억지로 채우지 말 것** — 빈 필드는 기존 2단 폴백(`Other`)으로 안전하게 떨어진다. 잘못된 매핑이 빈 매핑보다 나쁘다.
7. **검색 필터 없이 확충하지 말 것**(PR4를 빠뜨리지 말 것) — 종수만 26배가 되면 운동 추가가 더 느려진다. 벤치마킹의 교훈은 "많이"가 아니라 "빨리 찾기"다.

## 7. 결정 사항

1. **소스** → free-exercise-db 1차 후보(Unlicense). 착수 시 라이선스 원문·데이터 품질을 재확인하고, 문제가 있으면 wger(CC-BY-SA, 표기 의무)로 전환한다.
2. **`EXERCISE_NAMES` 확장 여부** → **하지 않는다**(§3.2). 프로그램 식별자와 수록 카탈로그를 분리한다.
3. **시연 자료** → 번들하지 않는다. 소스의 `images`는 라이선스·용량 문제가 있고, 우리는 운동 상세에 **외부 검색 링크**(YouTube 등)로 대체한다. Liftosaur가 같은 방식이다.
4. **한국어명** → 확장 종목은 영문명만. 필요하면 사용자가 별칭으로 개인화한다(기존 alias 시스템).
5. **확충 규모** → 소스 전량(~870)을 넣되, 검색 필터(PR4)가 함께 가는 것을 전제로 한다. 부분 큐레이션은 기준을 정하는 비용이 확충 이득보다 크다.
6. **M1-2와의 순서** → 먼저 착수하는 쪽이 `ExerciseEquipment`를 정의한다(§3.3). 두 계획이 같은 파일을 건드리므로 동시 진행은 피한다.
