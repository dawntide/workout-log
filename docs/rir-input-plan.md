# RIR 입력 옵션과 평균 RPE 교정 계획 (M2-2)

> 상태: **계획 확정, 미착수** (2026-08-19). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §4 M2-2. 규모 S~M. M1·M2-1과 독립.
>
> **⚠️ 로드맵/조사 전제 1건 정정**: TUI에 RPE용 `@` **키 바인딩은 없다**. `@`는 렌더링 접두 글리프이고([`log_view.go:253`](../apps/tui/internal/ui/log_view.go)) 이동은 `l`/`right`/`tab` 순환이다([`log_update.go:104`](../apps/tui/internal/ui/log_update.go)·[:250](../apps/tui/internal/ui/log_update.go)).
>
> **확정된 설계 결정** (2026-08-19 사용자 선택):
> 1. **RIR은 0~5로 클램프해 `rpe` 컬럼에 변환 저장**한다(`rpe = 10 - rir`). 실사용 범위가 0~5이므로 저장값은 5~10만 나오고, **REF5가 센티널로 쓰는 `rpe: 0`과 절대 겹치지 않는다**(§2.4). DB·export·통계 전부 무변경.
> 2. **평균 RPE의 0 희석 버그를 이 마일스톤에서 함께 고친다**(§2.3) — 같은 RPE 도메인이고, RIR 토글을 올리면 새 입력이 그 버그에 겹쳐 보이게 된다.

## 1. 문제와 목표

Boostcamp·JuggernautAI는 RPE와 RIR을 둘 다 받고, Alpha Progression은 RIR 중심이다. 우리는 RPE만 받는다. RIR(Reps In Reserve)은 같은 정보를 반대 방향으로 표현할 뿐이라 **저장 계층을 바꿀 필요가 없다** — 입력·표시 계층의 번역 문제다.

그런데 조사 중 별개의 버그가 드러났다: 웹이 **미입력 RPE를 `0`으로 전송**하고([`model.ts:1422`](../web/src/lib/workout-record/model.ts) `rpe: rpePerSet[index] ?? 0`), upsert가 `null`/`undefined`만 null로 매핑하며([`upsert-log.ts:826`](../packages/core/src/services/workout-log/upsert-log.ts) `rpe: s.rpe ?? null`), 평균 RPE 쿼리에 `rpe > 0` 필터가 없다([`get-exercise-detail-bootstrap.ts:122`](../web/src/server/services/exercises/get-exercise-detail-bootstrap.ts)). 결과적으로 **평균 RPE가 0으로 희석**된다. REF5는 canonical 세트를 `rpe: 0`으로 명시 생성하므로([`ref5-auto-progression.ts:468`](../packages/core/src/progression/ref5-auto-progression.ts)) REF5 사용자에게 특히 심하다.

**목표**
1. 설정 토글 하나로 세트 강도 입력을 RPE ↔ RIR로 전환한다.
2. 미입력이 `0`이 아니라 `NULL`로 저장되고, 평균 RPE가 실제 입력값만 집계한다.
3. 하드코딩된 RPE 문구를 i18n으로 회수한다.

**비목표**
- SHRED식 3단 난이도 프리셋(여유/적당/한계) — 아이디어로만 남긴다(§7 결정 3).
- 진행 판정에 RPE/RIR 반영 — 리듀서는 현재 RPE를 **전혀 읽지 않는다**(§2.5). 오토레귤레이션 도입은 별개 과제다.
- REF5의 `rpe: 0` 센티널 제거 — 결정 1이 이를 우회하므로 건드리지 않는다.
- 처방(planned) RPE 계열 변경 — 로그 RPE와 별개 계통이다(§2.6).

**성공 기준**: 설정에서 RIR을 켜면 세트 행 3번째 셀이 RIR로 입력·표시되고, 저장된 값은 기존 통계와 그대로 호환되며, 평균 RPE가 미입력 세트에 희석되지 않는다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 입력·저장·표시 전 경로

| 계층 | 위치 |
|---|---|
| 세트 행 셀 | [`workout-set-row.tsx:211-221`](../web/src/features/workout-log/ui/workout-set-row.tsx) — `CellInput`, `color="var(--v2-c-warning)"`, `allowDecimal`, `readOnly={Boolean(exercise.ref5)}`([:220](../web/src/features/workout-log/ui/workout-set-row.tsx)) |
| 값 파생 | [:70-74](../web/src/features/workout-log/ui/workout-set-row.tsx) `rpeRaw` — 0 이하/비유한은 빈 문자열, 정수면 정수 표기 |
| 입력 핸들러 | [:118-136](../web/src/features/workout-log/ui/workout-set-row.tsx) `handleRpeChange` — 숫자·점만, `clamp(0,10)`, **0.5 스냅** |
| 포커스 체인 | [:42](../web/src/features/workout-log/ui/workout-set-row.tsx) `rpeRef`, [:44-53](../web/src/features/workout-log/ui/workout-set-row.tsx) 등록 (필드명 `"rpe"`) |
| 칼럼 헤더 | [`workout-exercise-card.tsx:523`](../web/src/features/workout-log/ui/workout-exercise-card.tsx) — ⚠️ **`RPE` 리터럴 하드코딩**(옆의 "중량"·"반복"은 [:517](../web/src/features/workout-log/ui/workout-exercise-card.tsx)·[:520](../web/src/features/workout-log/ui/workout-exercise-card.tsx)에서 로케일 분기가 있다) |
| 액션 | [`editor-actions.ts:36`](../web/src/features/workout-log/model/editor-actions.ts) `CHANGE_SET_RPE`, [:180-192](../web/src/features/workout-log/model/editor-actions.ts) `patchSetRpeAtIndex`, [:206](../web/src/features/workout-log/model/editor-actions.ts)·[:227](../web/src/features/workout-log/model/editor-actions.ts) 배열 동기화 |
| 모델(병렬 배열) | [`model.ts:15`](../web/src/lib/workout-record/model.ts) `rpePerSet: number[]`, [:391-410](../web/src/lib/workout-record/model.ts) `normalizeRpePerSetArray`(**없으면 0으로 채움**), [:1422](../web/src/lib/workout-record/model.ts) 전송 |
| 저장 | [`upsert-log.ts:826`](../packages/core/src/services/workout-log/upsert-log.ts) `rpe: s.rpe ?? null` |
| DB | [`schema.ts:437-440`](../packages/core/src/db/schema.ts) `numeric("rpe", {precision:3, scale:1})` — 주석에 "0.5 steps" 명시. 마이그레이션 `0022_fractional-rpe.sql` / dev `0005_fractional-rpe.sql`, 테스트 [`schema.rpe.test.ts`](../packages/core/src/db/schema.rpe.test.ts) |
| CSV | [`userExport.ts:178`](../packages/core/src/export/userExport.ts) 헤더, [:199](../packages/core/src/export/userExport.ts) 행 |
| E2E | [`workout-log-rpe.spec.ts`](../web/e2e/workout-log-rpe.spec.ts) — [:121](../web/e2e/workout-log-rpe.spec.ts)이 **미입력→null을 기대**한다(현재 동작과 어긋나는지 PR1에서 확인) |
| TUI | [`log_model.go:18-22`](../apps/tui/internal/ui/log_model.go) `colRPE`, 검증 [`log_update.go:495-501`](../apps/tui/internal/ui/log_update.go)(1~10, 0.5 단위, 한국어 에러), 렌더 [`log_view.go:253`](../apps/tui/internal/ui/log_view.go)·[:255](../apps/tui/internal/ui/log_view.go), REF5 감춤 [:250-251](../apps/tui/internal/ui/log_view.go) |

### 2.2 미입력이 0으로 저장되는 체인 (실측 확인)

```
web:  rpe: rpePerSet[index] ?? 0        (model.ts:1422)   ← 미입력이 0이 된다
      normalizeRpePerSetArray가 없으면 0으로 채움 (model.ts:391-410)
api:  rpe: s.rpe ?? null                (upsert-log.ts:826) ← 0은 0으로 통과
DB:   workout_set.rpe = 0
```

### 2.3 평균 RPE 쿼리에 필터가 없다

[`get-exercise-detail-bootstrap.ts:122`](../web/src/server/services/exercises/get-exercise-detail-bootstrap.ts)가 `avg(workoutSet.rpe)`를 계산하는데, where 절([:126-134](../web/src/server/services/exercises/get-exercise-detail-bootstrap.ts))에는 `weightKg is not null`·`reps is not null`만 있고 **`rpe > 0`(또는 `is not null`)이 없다.** 렌더는 [`exercise-detail-screen.tsx:455-466`](../web/src/widgets/exercise-detail-screen/exercise-detail-screen.tsx).

→ §2.2의 0들이 그대로 평균에 들어간다. 이것이 결정 2의 근거다.

### 2.4 REF5의 `rpe: 0` 센티널 — 결정 1의 근거

[`ref5-auto-progression.ts:149-159`](../packages/core/src/progression/ref5-auto-progression.ts) `Ref5CanonicalWorkoutSet`은 **`rpe: 0`을 리터럴 타입으로 고정**한다(실측 확인). 생성 [:468](../packages/core/src/progression/ref5-auto-progression.ts), 읽기 [:870](../packages/core/src/progression/ref5-auto-progression.ts). UI 차단 [`workout-set-row.tsx:220`](../web/src/features/workout-log/ui/workout-set-row.tsx), TUI 차단 [`log_view.go:250-251`](../apps/tui/internal/ui/log_view.go).

즉 REF5는 "값 없음"을 `null`이 아니라 **`0`으로 표현**한다. 만약 RIR을 무제한으로 받아 `rpe = 10 - rir`로 저장하면 `rir=10 → rpe=0`이 되어 REF5 센티널과 구별 불가해진다. **RIR을 0~5로 클램프하면 저장값이 5~10이라 충돌이 원천 차단된다.**

### 2.5 진행 판정은 RPE를 읽지 않는다

[`reducer.ts`](../packages/core/src/progression/reducer.ts) 전체에 `rpe` 문자열이 **0건**이다. → **RIR 도입이 진행 엔진에 미치는 영향은 없다.** 이 사실이 M2-2를 규모 S로 유지시킨다.

### 2.6 처방 RPE는 별개 계열

[`program-dsl/schema.ts:29`](../packages/core/src/program-dsl/schema.ts) `rpe`, [`snapshot.ts:56`](../packages/core/src/program-engine/snapshot.ts), `plannedSetMeta.rpePerSet`, [`workout-exercise-card.tsx:229`](../web/src/features/workout-log/ui/workout-exercise-card.tsx) `planRpePerSet`, 표기 [`workout-notation/format.ts:58-61`](../packages/core/src/workout-notation/format.ts)(`rpe > 0`일 때만). **이 계열은 건드리지 않는다** — 처방은 프로그램이 정하고, 사용자 입력 방식과 무관하다.

### 2.7 i18n — RPE 문구가 카탈로그에 없다

[`messages.ts`](../web/src/lib/i18n/messages.ts)에 RPE 항목이 **0건**이다. 전부 인라인 리터럴/삼항이다:

| 위치 | 내용 |
|---|---|
| [`workout-set-row.tsx:216`](../web/src/features/workout-log/ui/workout-set-row.tsx) | `ariaLabel` — 영어 고정, 미번역 |
| [`workout-exercise-card.tsx:523`](../web/src/features/workout-log/ui/workout-exercise-card.tsx) | 칼럼 헤더 리터럴 |
| [`exercise-detail-screen.tsx:313-317`](../web/src/widgets/exercise-detail-screen/exercise-detail-screen.tsx) | 세트별 표기 (ko·en 동일) |
| 같은 파일 [:456](../web/src/widgets/exercise-detail-screen/exercise-detail-screen.tsx)·[:461-462](../web/src/widgets/exercise-detail-screen/exercise-detail-screen.tsx) | "평균 RPE" / 빈 상태 문구 |
| [`workout-notation/components.tsx:67`](../web/src/lib/workout-notation/components.tsx)·[:95](../web/src/lib/workout-notation/components.tsx) | 인라인 표기 |
| [`core/workout-notation/format.ts:6`](../packages/core/src/workout-notation/format.ts)·[:58-61](../packages/core/src/workout-notation/format.ts) | 표기 생성 |
| TUI [`log_update.go:498`](../apps/tui/internal/ui/log_update.go) | 한국어 고정 검증 에러 |

→ 라벨이 조건부로 바뀌어야 하므로 **i18n 키 신설 + 하드코딩 6~8곳 회수**가 이 마일스톤의 실질 작업량이다.

### 2.8 설정 토글 선례 — `LanguageRow`

단위(kg/lb) 설정은 존재하지 않으므로(앱 전체 kg 고정) 가장 가까운 선례는 로케일이다: [`language-row.tsx:30-41`](../web/src/widgets/more-screen/language-row.tsx) `useSettingRowMutation` + [:43](../web/src/widgets/more-screen/language-row.tsx) normalize + [:52-65](../web/src/widgets/more-screen/language-row.tsx) 낙관적 적용·롤백 + [:70-90](../web/src/widgets/more-screen/language-row.tsx) `V2NavRow` + `OptionList`.

core enum normalizer 선례: [`workout-preferences.ts:166-174`](../packages/core/src/settings/workout-preferences.ts) `normalizeTrainingGoal` — `normalizeIntensityInput`은 이것을 1:1 복제한다.

**옵션이 2개뿐이라 별도 화면 없이 more-screen 인라인 행으로 충분**하다 → `modalTitleFromPathname`·`modalTitles` 추가가 불필요하다(M1 계획서들과 다른 점).

## 3. 설계

### 3.1 설정

| 키 | 타입 | 기본 |
|---|---|---|
| `prefs.intensityInput` | `"RPE" \| "RIR"` | `"RPE"` |

`SETTINGS_KEYS`·`WorkoutPreferences`·`readWorkoutPreferences`·`toDefaultWorkoutPreferences` + **`DEFAULT_SETTINGS` 2곳**([`settings-snapshot.ts`](../packages/core/src/services/settings/settings-snapshot.ts), [`apps/api/src/routes/settings.ts`](../apps/api/src/routes/settings.ts)). web은 `export *` 재export라 무수정. TUI는 [`settings.go:36-41`](../apps/tui/internal/ui/settings.go) `settingDefs`에 행 하나.

### 3.2 변환 규칙 (순수 함수)

`web/src/lib/workout-record/intensity.ts` 또는 core `settings` 인접에 신설:
```ts
// 표시: 저장된 rpe -> 화면 값
function toDisplayIntensity(rpe: number | null, mode: "RPE" | "RIR"): number | null;
//   RPE 모드: rpe 그대로 (0/null -> null)
//   RIR 모드: rpe > 0 이면 10 - rpe, 아니면 null
// 입력: 화면 값 -> 저장할 rpe
function toStoredRpe(input: number | null, mode: "RPE" | "RIR"): number | null;
//   RPE 모드: clamp(0..10), 0.5 스냅, 0이면 null
//   RIR 모드: clamp(0..5),  0.5 스냅, rpe = 10 - rir  (결과 5..10)
```
- **핵심**: 두 모드 모두 **미입력을 `null`로 반환**한다. 이것이 §2.2 체인을 끊는다.
- `handleRpeChange`([`workout-set-row.tsx:118-136`](../web/src/features/workout-log/ui/workout-set-row.tsx))의 clamp·스냅 로직이 이 함수로 이동한다.

### 3.3 미입력을 NULL로 (결정 2의 절반)

- [`model.ts:1422`](../web/src/lib/workout-record/model.ts)를 `rpe: toStoredRpe(...)` 로 바꿔 **0 대신 null**을 보낸다.
- [`normalizeRpePerSetArray`](../web/src/lib/workout-record/model.ts)의 "없으면 0으로 채움"은 **화면 상태 표현이므로 유지**한다(빈 셀 = 0). 경계는 전송 시점 한 곳에서만 번역한다.
- ⚠️ REF5 경로는 canonical 세트를 서버에서 생성하므로 이 변경의 영향을 받지 않는다(`rpe: 0` 유지).
- 기존 DB에 쌓인 `0`은 **마이그레이션으로 건드리지 않는다** — §3.4의 쿼리 필터가 이를 흡수하고, REF5의 `0`과 구별할 방법이 없기 때문이다(§7 결정 2).

### 3.4 평균 RPE 쿼리 교정 (결정 2의 나머지)

[`get-exercise-detail-bootstrap.ts`](../web/src/server/services/exercises/get-exercise-detail-bootstrap.ts)의 where 절에 `rpe > 0`을 추가한다. `avg()`는 NULL을 자동 제외하므로 신규 데이터는 필터 없이도 옳지만, **기존 0들과 REF5의 0을 걸러내려면 명시 필터가 필요**하다.

RIR 모드에서는 표시만 `10 - avg`로 번역한다(평균의 선형 변환이라 수학적으로 안전).

## 4. 안전장치

- **G1. 변환 왕복 유닛** — `toStoredRpe`/`toDisplayIntensity`가 서로 역함수인지. 경계: RPE 0·10, RIR 0·5, 0.5 단위, 범위 초과 입력, null.
- **G2. 센티널 비침범 단언** — RIR 모드의 어떤 입력도 `rpe = 0`을 만들지 않음을 단언한다. 이것이 결정 1의 안전성을 기계로 고정한다.
- **G3. 미입력 NULL 회귀** — 세트를 무게·반복만 채워 저장했을 때 DB `rpe`가 `null`인지. 기존 E2E [`workout-log-rpe.spec.ts:121`](../web/e2e/workout-log-rpe.spec.ts)이 이미 이를 기대하므로 **현재 통과 여부를 먼저 확인**한다(통과 중이라면 §2.2 체인의 어딘가가 이미 0을 걸러내고 있다는 뜻이므로 진단을 갱신해야 한다).
- **G4. 평균 RPE 교정 확인** — 미입력 세트가 섞인 운동에서 평균이 실제 입력값만 반영하는지. REF5 세션 데이터로도 확인한다.
- **G5. 모드 전환 E2E** — 설정에서 RIR로 바꾼 뒤 세트 행 라벨·입력·표시가 전환되고, 저장 후 다시 RPE로 바꿨을 때 같은 세트가 원래 값으로 보이는지.
- **G6. TUI 검증 일치** — Go 쪽 검증 범위([`log_update.go:495-501`](../apps/tui/internal/ui/log_update.go))가 모드에 맞게 동작하는지. `go build/vet/test`.

## 5. PR 분해 (3개)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `fix(stats): 미입력 RPE가 평균을 희석하던 것을 고친다` | 전송 시점 0→null + 평균 RPE 쿼리에 `rpe > 0` 필터. **RIR과 무관하게 단독 머지 가능하고, 먼저 가야 한다.** | 낮 | G3·G4, 기존 RPE E2E |
| **2** | `feat(settings): 강도 입력을 RPE와 RIR 중에서 고른다` | 설정 키 + normalize + `DEFAULT_SETTINGS` 2곳 + more-screen 인라인 행(`LanguageRow` 패턴) + TUI 설정 행 | 낮 | `test:settings:policy`, 롤백 수동 확인 |
| **3** | `feat(workout-log): 세트 강도를 RIR로 입력한다` | 변환 순수 함수 + 세트 행 셀·헤더 전환 + **i18n 키 신설 및 하드코딩 6~8곳 회수** + 운동 상세 표기 + TUI 라벨·검증 | 중 | G1·G2·G5·G6, `lint:design` |

**순서 근거**: PR1이 먼저 가야 PR3의 새 입력이 기존 버그 위에 얹히지 않는다.

**TUI**: 설정 키는 스키마가 아니라 값이므로 **PR2에서 행 추가**(동시), 라벨·검증 전환은 PR3(UI 후행 정책의 예외 — 같은 PR에서 하는 게 싸다).

## 6. 리스크 / 하지 말 것

1. **RIR을 0~5 밖으로 열지 말 것** — `rir=10`이 `rpe=0`이 되어 REF5 센티널과 충돌한다. 클램프가 결정 1의 안전성 근거 전부다.
2. **`normalizeRpePerSetArray`의 0 채움을 바꾸지 말 것** — 그건 화면 상태 표현이다. 번역은 전송 경계 한 곳에서만 한다.
3. **기존 DB의 0을 마이그레이션으로 정리하려 하지 말 것** — REF5가 의도적으로 넣은 0과 웹이 실수로 넣은 0을 구별할 방법이 없다. 쿼리 필터로 흡수한다.
4. **REF5 canonical 타입의 `rpe: 0`을 건드리지 말 것** — 결정 1이 이를 우회하는 이유다.
5. **처방 RPE 계열을 함께 바꾸지 말 것**(§2.6) — 처방은 프로그램 소유이고 표시 규칙도 다르다.
6. **진행 판정에 RPE를 연결하지 말 것** — 리듀서가 RPE를 안 읽는 현재 상태가 결정론 엔진의 단순성을 지킨다. 오토레귤레이션은 별개 과제다.
7. **i18n 회수를 미루지 말 것** — 라벨이 조건부가 되는 순간 하드코딩은 버그가 된다. PR3에서 한 번에 정리한다.

## 7. 결정 사항

1. **RIR 저장 방식** → 0~5 클램프 + `rpe = 10 - rir` 변환 저장(§2.4). 저장 스키마·통계·export 무변경.
2. **기존 DB의 0 정리** → **하지 않는다.** REF5의 의도적 0과 구별 불가하므로 쿼리 필터로 흡수한다(§3.3).
3. **SHRED식 3단 난이도 프리셋(여유/적당/한계)** → 이번 범위 밖. RIR 토글을 써 보고 "숫자 입력 자체가 부담인가"가 확인되면 그때 RIR 위의 얇은 프리셋 층으로 추가한다.
4. **모드를 세트별로 기록할 것인가** → **하지 않는다.** 저장값은 항상 RPE 스케일이고 모드는 표시 설정일 뿐이다. 세트별 기록은 통계·CSV·TUI로 복잡도가 전파되는 반면 이득이 없다.
5. **평균 RPE 교정을 M2-2에 포함할 것인가** → **포함한다**(PR1). 같은 도메인이고, RIR 토글이 버그를 더 눈에 띄게 만든다.
