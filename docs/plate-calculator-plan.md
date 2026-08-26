# 플레이트 계산기 구현 계획 (M1-2)

> 상태: **완료** (계획 2026-08-19 → 구현 PR #677, 2026-08-24). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §3 M1-2. 선행 [`rest-timer-plan.md`](rest-timer-plan.md)(M1-1)와 독립 — 병행 가능.
>
> **확정된 설계 결정** (2026-08-19 사용자 선택):
> 1. **표시 대상** — 운동 카탈로그에 **장비 필드를 추가**한다. 자중 판정 함수만으로는 부족하기 때문(§2.3). 바벨·플레이트로드 머신에만 계산기를 노출.
> 2. **진입점** — **운동 카드에 아이콘 칩 1개**, 열면 시트에 **그 운동의 전 세트 분해를 한 번에** 표시. 램프 처방(세트마다 무게가 다른 경우)이 자연히 커버되고, 세트 행 5열 그리드를 건드리지 않는다.

## 1. 문제와 목표

조사한 12개 앱 중 플레이트 계산기가 없는 곳은 우리뿐이다(Strong PRO·Hevy·Liftosaur·Boostcamp·Alpha Progression 전원 보유). Boostcamp는 세트마다 "측당 몇 장"을 표시해 무거운 시도 사이의 암산을 없앤다.

우리에게는 이미 **무게를 조립 가능한 값으로 라운딩하는 엔진**이 있다(최소 원판 증분 설정 + 종목별 규칙). 없는 것은 **그 무게를 실제 원판 조합으로 분해해 보여주는 표시 계층**뿐이다.

**목표**
1. 처방 무게를 `바 무게 + 사이드별 원판 조합`으로 분해해 보여준다.
2. 보유 원판으로 정확히 만들 수 없으면 **가장 가까운 조립 가능한 무게**를 함께 제시한다(Alpha Progression 패턴).
3. 계산기가 무의미한 종목(자중·덤벨·케이블 스택)에는 노출하지 않는다.

**비목표**
- 저장·스냅 경로 연결 — 계산기는 **표시 전용**이다. 라운딩은 기존 `snapWeightToIncrementKg`가 이미 하고 있고, REF5 스냅샷은 불변이라 재적용 대상이 아니다(§2.4).
- 좌우 비대칭 로딩, 체인·밴드, 파운드 단위 원판.
- 사용자 생성 운동의 장비를 DB에 저장하는 것(§7 결정 2).

**성공 기준**: 바벨 종목 카드에서 탭 1회로 그 운동의 전 세트 원판 조합을 볼 수 있고, 보유 원판으로 못 만드는 무게는 그 사실이 드러난다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 라운딩 엔진은 있고, 분해는 없다

- [`program-engine/round.ts:4`](../packages/core/src/program-engine/round.ts) `roundToNearest2p5(v)` — 파일 전체가 9줄, export 1개, **2.5 하드코딩이라 증분 파라미터를 받지 않는다**. 분해 로직에 재사용 불가.
  - ⚠️ 동명의 로컬 사본이 [`use-program-store-start-program-controller.ts:124`](../web/src/features/program-store/model/use-program-store-start-program-controller.ts)에, 유사 함수 `snapTo2p5`가 [`failure-protocol-sheet.tsx:52`](../web/src/components/ui/failure-protocol-sheet.tsx)에 **중복 정의**돼 있다.
- [`settings/workout-preferences.ts:379-384`](../packages/core/src/settings/workout-preferences.ts) `snapWeightToIncrementKg` — 호출처 **단 1곳**([`weight-rules.ts:19`](../web/src/lib/workout-record/weight-rules.ts)).
- `resolveMinimumPlateIncrement`([:332-377](../packages/core/src/settings/workout-preferences.ts))의 4단 우선순위(id → 이름(id 없는 규칙 우선) → 이름(아무 규칙) → 기본값)와 `parseMinimumPlateRules`/`serializeMinimumPlateRules`([:248-270](../packages/core/src/settings/workout-preferences.ts))는 **바 무게·원판 인벤토리 설정에 1:1 복제 가능**.
- `plate-breakdown|plateBreakdown|PlateCalculator` grep **0건** — 기존 구현 전무.

### 2.2 장비·바·원판 개념은 코드에 없다

- `equipment|barWeight|plateInventory|availablePlates` 전 리포 grep **0건**.
- [`exercise/catalog.ts`](../packages/core/src/exercise/catalog.ts) `ExerciseCatalogItem = { name, category, aliases }` — 장비 필드 없음. `category`는 `"Legs"`/`"Chest"` 같은 **부위** 문자열이다.
- [`db/schema.ts:288-299`](../packages/core/src/db/schema.ts) `exercise` 테이블 = `id, name, category, createdAt`. 장비 컬럼 없음.
- 저장은 기존 `prefs.*` key/value로 충분 — **DB 마이그레이션 불필요**(M1-1 §2.4와 동일 근거).

### 2.3 자중 판정만으로는 부족하다 — 결정 1의 근거

[`bodyweight-load.ts:46-57`](../packages/core/src/bodyweight-load.ts) `isBodyweightExerciseName`은 **순수 이름 문자열 매칭**이고 매칭 대상이 `pull-up / pull up / chin-up / chin up / 풀업 / 친업` 뿐이다. 따라서 Lat Pulldown(케이블 스택)·Bicep Curl(덤벨)·Leg Curl(머신) 등은 전부 `false`로 나와 계산기가 뜬다.

[`plan-view.ts:118`](../web/src/features/plans-manage/model/plan-view.ts)에 "카드 라벨(`Pull`)은 `isBodyweightExerciseName`과 매칭되지 않으므로 키로 판별한다"는 주석이 이미 있다 — **이름 매칭의 한계를 기록한 선례**다.

### 2.4 REF5는 표시만 허용

[`weight-rules.ts:58`](../web/src/lib/workout-record/weight-rules.ts)이 `if (sourceDraft.session.ref5) return sourceDraft;`로 **REF5 스냅샷에는 사용자 무게 규칙을 재적용하지 않는다**(스냅샷 불변 원칙). 계산기는 표시 전용이므로 REF5 세션에서도 보여줄 수 있으나, **저장·스냅 경로와는 절대 연결하지 않는다.**

별개로 REF5의 진행 그리드([`ref5.ts`](../packages/core/src/program-engine/ref5.ts) `REF5_DEFAULT_GRID_KG`)는 **진행 전용**이고 `minimumPlateRules`와 완전히 분리된 축이다. 두 시스템을 연결하는 코드는 없으며, 이번에도 연결하지 않는다. (v1.3이 잠깐 두었던 OHP 1.25kg 마이크로 그리드는 철회됐다 — 그 그리드가 실제 원판으로 조립 불가였다는 것이 두 축을 분리해 둔 대가다.) (⚠️ `Ref5SessionType = "NORMAL"|"MICRO"`([`ref5.ts:52`](../packages/core/src/program-engine/ref5.ts))는 **세션 유형**이며 무게 그리드와 무관 — 이름이 겹치니 주의.)

### 2.5 이미 계산되지만 아무도 안 쓰는 슬롯

[`workout-log-atoms.ts:102-103`](../web/src/features/workout-log/store/workout-log-atoms.ts)의 `WorkoutSessionExerciseCard`에 **`minimumPlateIncrementKg`·`showMinimumPlateInfo` 두 필드가 이미 정의·계산**([:116](../web/src/features/workout-log/store/workout-log-atoms.ts))돼 있으나 **렌더 소비처가 0건**이다. → 분해 결과를 여기에 얹으면 파생 계층을 새로 만들지 않아도 된다.

### 2.6 진입점과 시트 템플릿

- 진입점 최유력: [`workout-exercise-card.tsx:394-403`](../web/src/features/workout-log/ui/workout-exercise-card.tsx) `PrescriptionInline`(처방 칩) 바로 옆 [:412-421](../web/src/features/workout-log/ui/workout-exercise-card.tsx)에 **`ChipButton icon="restart_alt"`(권장값) 선례**가 있고 같은 flex-wrap 컨테이너다.
- 읽기 전용 정보 시트 템플릿: [`workout-log-summary-sheet.tsx`](../web/src/features/workout-log/ui/workout-log-summary-sheet.tsx)(572줄) — `<BottomSheet headless height="92dvh">` + 헤더 블록 + 스크롤 본문 + `<section aria-label>` 단위. **입력 위젯·footer·primaryAction 없음** → 그대로 본뜬다.
- 설정 값 선택: [`number-picker-sheet.tsx:9-23`](../web/src/components/ui/number-picker-sheet.tsx) `NumberPickerSheet` + `WheelPicker` 재사용.
- 표시 토큰: `--v2-c-weight`(무게), `--v2-c-info`/`--v2-c-warning` 등 domain 토큰은 [`v2-tokens.css`](../web/src/styles/v2-tokens.css)에 **light(:32-41) / dark media(:138-147) / 명시 dark(:179-188) 3벌**로 정의된다 — 새 토큰을 만든다면 3벌 모두 추가해야 한다. ⚠️ `--v2-w-*`는 **폰트 굵기**이지 무게가 아니다.
- [`target-weight-chip.tsx:15-21`](../web/src/components/v2/target-weight-chip.tsx) `TargetWeightChip`에 **`weightSuffix` prop이 이미 있어** 분해 요약 문자열 병기에 쓸 수 있다.

### 2.7 테스트 관례

- [`generateSession.rounding.test.ts`](../packages/core/src/program-engine/generateSession.rounding.test.ts)(28줄) — `node:test` + `node:assert/strict` 인라인, 픽스처 미사용.
- 골든 픽스처 방식은 TS↔Go 파리티용: [`fixtures.test.ts`](../packages/core/src/fixtures.test.ts) ↔ [`golden_fixtures_test.go`](../apps/tui/internal/ui/golden_fixtures_test.go), JSON 스키마는 최상위 `__doc` 설명 + 케이스명별 `{입력…, expected}` 배열([`fixtures/bodyweight-load.json`](../packages/core/fixtures/bodyweight-load.json)).
- core는 exports map `"./*": "./src/*.ts"`라 **새 파일을 만들면 등록 없이** `@workout/core/plate-breakdown`으로 import된다.

## 3. 설계

### 3.1 장비 분류 (PR1)

```ts
type ExerciseEquipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "unknown";
```
- `ExerciseCatalogItem`에 `equipment` 필드를 **additive**로 추가하고 33종을 태깅한다.
- **플레이트 계산기 노출 조건 = `barbell`**. 플레이트로드 머신(Leg Press 등)은 논쟁의 여지가 있으므로 1차는 `machine`으로 두고 노출하지 않는다(§7 결정 1).
- 해석 함수 `resolveExerciseEquipment({ exerciseId, exerciseName })` — 카탈로그 이름·별칭 매칭, 미스는 `"unknown"`.
- **사용자 생성 운동은 `"unknown"` → 계산기 노출**(허용 쪽). 이름이 카탈로그 별칭과 겹치면 자동으로 분류된다. DB 컬럼은 추가하지 않는다(§7 결정 2).
- 이 필드는 향후 프로그램 스토어 장비 필터·통계 분해에도 재사용 가능하다.

### 3.2 분해 알고리즘 (PR2)

`packages/core/src/plate-breakdown.ts` (신설, 순수·DOM 무지):

```ts
type PlateInventory = { barWeightKg: number; platesKg: number[] };  // platesKg는 내림차순 정규화
type PlateBreakdown =
  | { kind: "exact";      perSide: number[]; totalKg: number }
  | { kind: "nearest";    perSide: number[]; totalKg: number; requestedKg: number }
  | { kind: "below-bar";  barWeightKg: number; requestedKg: number };

function breakdownPlates(targetKg: number, inventory: PlateInventory): PlateBreakdown;
```

- **greedy 내림차순**: `perSideKg = (target - bar) / 2`에서 큰 원판부터 채운다. 표준 원판 세트(25/20/15/10/5/2.5/1.25)는 greedy가 최적해와 일치한다.
- 정확히 못 만들면 **가장 가까운 조립 가능 무게**(greedy가 도달한 값)를 `kind: "nearest"`로 반환. 이 값이 요청보다 낮을 수도 높을 수도 있으므로 둘 다 계산해 더 가까운 쪽을 택한다.
- `target < bar`면 `"below-bar"` — 빈 바보다 가벼운 처방(초보자 프로그램에서 실제로 발생).
- 원판 개수 제한(count)은 **1차 범위 밖** — 인벤토리는 "보유 원판 종류" 목록으로만 다룬다. 무한 개수 가정.

### 3.3 설정 (PR3)

| 키 | 타입 | 기본 |
|---|---|---|
| `prefs.plate.barWeightKg` | number | `20` |
| `prefs.plate.inventoryJson` | string(JSON) | `[25,20,15,10,5,2.5,1.25]` |

- `SETTINGS_KEYS`·`WorkoutPreferences`·`readWorkoutPreferences`·`toDefaultWorkoutPreferences`에 추가하고 **`DEFAULT_SETTINGS` 2곳**([`settings-snapshot.ts:18-32`](../packages/core/src/services/settings/settings-snapshot.ts), [`apps/api/src/routes/settings.ts:33-47`](../apps/api/src/routes/settings.ts))에 모두 반영한다.
- 화면은 `/settings/plate-inventory`. 바 무게는 `NumberPickerSheet`, 원판 목록은 체크 토글(고정 후보 목록 + 커스텀 추가).
- 새 하위 라우트이므로 [`settings/layout.tsx:14-26`](../web/src/app/settings/layout.tsx) `modalTitleFromPathname` 분기 + `AppCopy.settings.modalTitles` ko/en 추가가 **필수**.

### 3.4 표시 (PR4)

- 카드 처방 칩 줄에 `ChipButton icon="fitness_center"` 추가(기존 `restart_alt` 칩과 동일 패턴). `equipment !== "barbell"`이면 렌더하지 않는다.
- 시트 내용: 운동명 헤더 → **세트별 행**. 각 행 = `세트 n · 60kg` + `바 20 + 20·10·2.5 / 측` + 조립 불가 시 `→ 57.5kg로 가능` 배지.
- 웜업 처방이 생기면(M1-3) 자연히 같은 목록에 포함된다.
- 분해 결과는 §2.5의 미사용 카드 슬롯에 파생시켜 렌더 시점 계산을 피한다.

## 4. 안전장치

- **G1. 골든 픽스처** — `packages/core/fixtures/plate-breakdown.json`을 `__doc` + 케이스 배열 형식으로 작성. 케이스: 표준 조합, 1.25 필요, 조립 불가(→nearest), 빈 바 미만, 빈 인벤토리, 바만 있는 경우, 홀수 무게. TS 유닛이 이를 소비한다.
- **G2. 라운딩 엔진과의 정합** — `snapWeightToIncrementKg`로 스냅된 무게가 인벤토리로 조립 가능한지 교차 검증하는 테스트. 불일치하면 설정 화면에서 안내할 근거가 된다(예: 최소 증분 1.25인데 1.25 원판 미보유).
- **G3. 노출 규칙 테스트** — 33종 카탈로그 전수에 대해 `resolveExerciseEquipment`가 기대값을 내는지. 자중·덤벨·케이블에서 칩이 렌더되지 않음을 컴포넌트 테스트 또는 E2E로 확인.
- **G4. 렌더 검증** — Playwright로 시트를 실제로 열어 확인, 14종 테마에서 `test:a11y:contrast`·`test:theme`.

## 5. PR 분해 (4개)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `feat(core): 운동 카탈로그에 장비 종류를 추가한다` | `ExerciseEquipment` 타입 + `ExerciseCatalogItem.equipment` + 33종 태깅 + `resolveExerciseEquipment`. UI 없음. | 낮 | core 유닛(G3), `lint:boundary`, ⚠️ `catalog.ts`는 이미 **seed 추적 파일**이므로 [`db-seed.yml`](../.github/workflows/db-seed.yml) 갱신 불필요 |
| **2** | `feat(core): 원판 분해 계산기를 추가한다` | `plate-breakdown.ts` + 골든 픽스처 + 유닛. 소비자 없음. | 낮 | G1·G2 |
| **3** | `feat(settings): 바 무게와 보유 원판을 설정한다` | 설정 키 2개(+`DEFAULT_SETTINGS` 2곳) + `/settings/plate-inventory` + modalTitles ko/en | 낮 | `test:settings:policy`, 롤백 수동 확인 |
| **4** | `feat(workout-log): 세트별 원판 분해를 보여준다` | 카드 칩 + 시트 + 카드 슬롯 파생 | 중 | G3·G4, `lint:design` |

**TUI**: 스키마 변경이 없으므로(설정은 기존 key/value, 장비는 코드 상수) **UI 후행** — M1 마일스톤 말미 슬롯에서 today 버퍼에 텍스트 분해를 추가할지 판단한다.

**선택적 정리(별건)**: §2.1의 중복 3건(`roundToNearest2p5` 로컬 사본, `snapTo2p5`, 카드 파생 이중 구현)은 이 마일스톤과 도메인이 같으나 위험도가 달라 별도 `chore` PR로 분리한다.

## 6. 리스크 / 하지 말 것

1. **계산기를 저장·스냅 경로에 연결하지 말 것.** 표시 전용이다. 라운딩은 이미 `snapWeightToIncrementKg`가 하고 REF5는 스냅샷 불변이다.
2. **`roundToNearest2p5`를 재사용하려 하지 말 것** — 2.5 하드코딩이라 인벤토리 기반 분해에 쓸 수 없다.
3. **REF5 MICRO와 원판 인벤토리를 연결하지 말 것** — 서로 다른 축이고, 연결하면 OHP 진행 그리드가 사용자 설정에 흔들린다.
4. **`category`를 장비로 오해하지 말 것** — 부위 문자열이다.
5. **세트 행 5열 그리드를 건드리지 말 것** — 결정 2가 카드 진입점을 택한 이유가 이것이다. 로깅 입력 동선에 영향을 주면 M1-1의 "1탭 완료"와 충돌한다.
6. **새 색 토큰은 3벌 동시 추가** — light / dark media / 명시 dark. 한 벌만 넣으면 특정 테마에서 색이 사라진다.
7. **원판 개수 제한을 1차에 넣지 말 것** — 인벤토리 UI가 급격히 복잡해지고, 실사용에서 종류가 없는 경우가 개수가 부족한 경우보다 훨씬 흔하다.

## 7. 결정 사항

1. **플레이트로드 머신(Leg Press 등)에 노출할 것인가** → **1차 미노출.** 기구마다 다르고(스택식 vs 플레이트식) 카탈로그가 이를 구분하지 못한다. `machine` 태그를 세분화하는 것은 후속.
2. **사용자 생성 운동의 장비를 DB에 저장할 것인가** → **하지 않는다.** `exercise` 테이블에 컬럼을 추가하면 마이그레이션 2벌 + 운동 CRUD UI 변경이 따라오는데, 이름이 카탈로그 별칭과 겹치면 자동 분류되므로 실익이 작다. 커스텀 운동이 많아지면 재검토.
3. **바 무게의 종목별 오버라이드** → **1차 미포함.** 최소 원판 규칙과 같은 구조로 나중에 additive 확장 가능하다. 대부분 사용자는 바가 하나다.
4. **단위(lb) 지원** → 범위 밖. 앱 전체가 kg 단일 단위로 동작한다.
