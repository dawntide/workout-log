# 체중 시계열 구현 계획 (M2-1)

> 상태: **계획 확정, 미착수** (2026-08-19). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §4 M2-1. M1과 독립 — 병행 가능.
>
> **⚠️ 로드맵 초안의 표현 1건을 정정한다**: "`validateImportScope`에 등재" — `body_measurement`는 **자체 `userId` 컬럼을 가지므로 ScopeRule 대상이 아니다**(§2.5). 그 파일의 규칙은 "자체 user 컬럼 없이 부모로만 소유자가 정해지는" 자식 테이블용이며 `plan`·`workoutLog`도 규칙이 없다. 실제로 필요한 것은 `rewriteUserId` 적용과 **export 등재**다.
>
> **확정된 설계 결정**:
> 1. **시계열은 명시 기록만 담는다.** 설정의 단일 체중값은 계산 폴백으로 유지하고(행동 변화 최소화), 기록이 없으면 차트는 빈 상태다.
> 2. **차트는 기존 e1RM 차트를 일반화해 재사용**한다 — 래퍼가 이미 차트를 `ReactNode`로 주입받는 seam을 갖고 있다(§2.4).
> 3. **정확도 이득의 핵심은 strength score와 asymptote monitor**다 — 이 둘만 "현재 체중을 과거에 적용"하고 있다(§2.3).

## 1. 문제와 목표

체중은 지금 **설정의 단일 현재값**이다. 그런데 앱은 이 값을 두 곳에서 **과거 데이터에 소급 적용**한다: strength score의 체중 대비 배율과 asymptote monitor의 PULL 노출 환산. 6개월 전 세션의 e1RM을 오늘 체중으로 나누고 있으므로, 체중이 변한 사용자에게는 지표가 틀린다.

반면 세트 저장 시 `meta.bodyweightKg`를 이미 스탬프하고 있어서 **대부분의 통계는 이미 시점 체중을 쓴다**(§2.3). 즉 인프라는 절반쯤 준비돼 있고, 없는 것은 ① 체중 이력 자체와 ② 그 이력을 소급 계산에 쓰는 경로다.

**목표**
1. 체중을 날짜별로 기록하고 추이를 본다.
2. strength score·asymptote monitor가 **세션 시점 체중**을 쓴다.
3. 기존 단일값 경로(처방 시드·저장 스탬프)는 그대로 둔다 — 그쪽은 "오늘 체중"이 맞다.

**비목표**
- 체지방률·둘레·진행 사진 — 로드맵 §9에서 비채택.
- 체중 자동 동기화(HealthKit 등) — 네이티브 전용.
- 설정의 단일 체중값 제거 — 처방 시드와 저장 스탬프가 이 값을 쓰고, 그게 옳다(§2.3).

**성공 기준**: 체중을 두 시점에 기록하면 추이 차트가 그려지고, strength score가 각 세션 시점 체중으로 계산된다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 `prefs.bodyweight.kg` — 단일값의 현재 배선

- 진실원: [`workout-preferences.ts:76`](../packages/core/src/settings/workout-preferences.ts) `bodyweightKg: number | null`, 키 [:93](../packages/core/src/settings/workout-preferences.ts), 기본값 [:103](../packages/core/src/settings/workout-preferences.ts) `DEFAULT_BODYWEIGHT_KG = null`, 파싱 [:286-288](../packages/core/src/settings/workout-preferences.ts)(0 이하면 null).
- ⚠️ **기본값 불일치**: core는 `null`인데 `DEFAULT_SETTINGS` 2곳([`settings-snapshot.ts:25`](../packages/core/src/services/settings/settings-snapshot.ts), [`apps/api/src/routes/settings.ts:40`](../apps/api/src/routes/settings.ts))과 more-screen 행([`bodyweight-row.tsx:14`](../web/src/widgets/more-screen/bodyweight-row.tsx))은 **70**이다. 병합 스냅샷을 읽는 경로는 실질적으로 "미설정 = 70kg"을 본다. → 결정 1이 이 문제를 우회한다(시계열은 명시 기록만).
- 쓰기 4곳: [`bodyweight-row.tsx:55-66`](../web/src/widgets/more-screen/bodyweight-row.tsx), [`v2-onboarding.tsx:69-73`](../web/src/components/v2/v2-onboarding.tsx), [`use-bodyweight-check.ts:63`](../web/src/features/workout-log/model/use-bodyweight-check.ts), TUI [`settings.go:39`](../apps/tui/internal/ui/settings.go).
- 읽기: 훅 [`use-bodyweight.ts:12-28`](../web/src/lib/settings/use-bodyweight.ts), atom [`workout-log-atoms.ts:16`](../web/src/features/workout-log/store/workout-log-atoms.ts), 서버 부트스트랩 다수.

### 2.2 체중 확인 배너 — 시계열의 자연스러운 입력 지점

[`use-bodyweight-check.ts`](../web/src/features/workout-log/model/use-bodyweight-check.ts)가 **14일 stale + 세션에 자중 종목 존재**일 때 배너를 띄운다([:42-49](../web/src/features/workout-log/model/use-bodyweight-check.ts), 상수 [:11](../web/src/features/workout-log/model/use-bodyweight-check.ts) `BODYWEIGHT_CHECK_STALE_MS`). "업데이트"든 "유지"든 `markChecked()`가 시각을 남겨 14일간 재노출을 막는다([:51-57](../web/src/features/workout-log/model/use-bodyweight-check.ts)).

⚠️ `prefs.bodyweight.checkedAtMs`는 **`SETTINGS_KEYS`에도 `DEFAULT_SETTINGS`에도 없는 떠돌이 키**다. 최초에는 `Number(undefined) || 0` 이 되어 항상 stale로 평가된다(의도된 동작이긴 하다). 시계열 도입 시 이 배너가 "기록 추가" 경로가 되므로 함께 정리한다.

(별건) [`bodyweight-load.ts:62-73`](../packages/core/src/bodyweight-load.ts) `sessionHasBodyweightAmrap`은 정의만 있고 게이트에 쓰이지 않는다(더 넓은 `sessionHasBodyweightExercise`로 대체).

### 2.3 이미 시점 체중을 쓰는 경로 vs 그렇지 않은 경로

**이미 옳은 경로 (수정 불필요)** — 전부 `resolveLoggedTotalLoadKg`([`bodyweight-load.ts:131-141`](../packages/core/src/bodyweight-load.ts))가 `meta.totalLoadKg`를 읽는다:
[`e1rm-service.ts:198`](../packages/core/src/stats/e1rm-service.ts) · [`prs-service.ts:162`](../packages/core/src/stats/prs-service.ts) · [`bundle-service.ts:85`](../packages/core/src/stats/bundle-service.ts) · [`muscle-volume-aggregate.ts:49`](../packages/core/src/stats/muscle-volume-aggregate.ts) · [`home-service.ts:640`](../packages/core/src/home/home-service.ts) · [`personal-records.ts:100`](../packages/core/src/services/workout-log/personal-records.ts) · [`reducer.ts:548`](../packages/core/src/progression/reducer.ts) · [`get-exercise-detail-bootstrap.ts:93`](../web/src/server/services/exercises/get-exercise-detail-bootstrap.ts) · [`apps/api/routes/stats.ts:323`](../apps/api/src/routes/stats.ts) · [`v2-session-summary.model.ts:184`](../web/src/components/v2/v2-session-summary.model.ts) · TUI [`bodyweight.go:51-59`](../apps/tui/internal/ui/bodyweight.go)

**`meta.bodyweightKg`를 직접 읽는 유일한 선례**: [`last-session-summary.ts:55-57`](../web/src/lib/workout-record/last-session-summary.ts) `extractBodyweightKg` + 폴백 결합 [:169](../web/src/lib/workout-record/last-session-summary.ts). → **시계열 조회 헬퍼의 계약 모델**로 삼는다.

**현재값을 과거에 적용하는 곳 — 이번에 고칠 대상**:
1. [`asymptote-monitor.ts:105-119`](../packages/core/src/program-engine/asymptote-monitor.ts) `aggregateDriverExposures(rows, bodyweightKg)` — [:117](../packages/core/src/program-engine/asymptote-monitor.ts)이 **하나의 현재 체중을 180일치 전 PULL 노출에 적용**한다. [:41-45](../packages/core/src/program-engine/asymptote-monitor.ts) `exposureE1rm`이 `resolveLoggedTotalLoadKg`를 우회해 직접 더하는 **유일한 갈래**다([`set-type-plan.md`](set-type-plan.md) §2.1에도 같은 사실이 기록돼 있다). 진입점 [`asymptote-monitor-service.ts:60`](../packages/core/src/stats/asymptote-monitor-service.ts).
2. [`strength-score-service.ts:183`](../packages/core/src/stats/strength-score-service.ts) per-lift `bodyweightRatio`, [:191](../packages/core/src/stats/strength-score-service.ts) `totalBodyweightRatio` — **과거 최고 e1RM ÷ 현재 체중**. 로드맵이 말한 정확도 효용의 핵심.
   ⚠️ [:73-78](../packages/core/src/stats/strength-score-service.ts) **캐시 파라미터에 `bodyweightKg`가 들어간다** → 시계열 전환 시 캐시 키를 재설계해야 한다.

**현재값이 맞는 곳 (건드리지 말 것)**: 처방→입력 시드 `prescriptionToExternalLoadKg`([`weight-rules.ts:34`](../web/src/lib/workout-record/weight-rules.ts), [`editor-actions.ts:124`](../web/src/features/workout-log/model/editor-actions.ts)), 저장 스탬프([`model.ts:1365-1368`](../web/src/lib/workout-record/model.ts)), REF5 시작 입력([`ref5-integration.ts:112-129`](../packages/core/src/program-engine/ref5-integration.ts)).

### 2.4 차트 재사용 가능성

- [`e1rm-interactive-chart.tsx`](../web/src/features/stats/ui/e1rm-interactive-chart.tsx) `E1RMInteractiveChart` — props [:18-30](../web/src/features/stats/ui/e1rm-interactive-chart.tsx), 스크럽 로직([:6-16](../web/src/features/stats/ui/e1rm-interactive-chart.tsx), 포인터 [:88-99](../web/src/features/stats/ui/e1rm-interactive-chart.tsx))은 **도메인 무관**.
- 재사용 장벽 4개: `point.e1rm` 하드코딩([:48](../web/src/features/stats/ui/e1rm-interactive-chart.tsx)·[:58](../web/src/features/stats/ui/e1rm-interactive-chart.tsx)·[:110](../web/src/features/stats/ui/e1rm-interactive-chart.tsx)), aria-label "1RM 추이 차트"([:87](../web/src/features/stats/ui/e1rm-interactive-chart.tsx)), PR 배지 블록([:153-184](../web/src/features/stats/ui/e1rm-interactive-chart.tsx)), 색 토큰 `--v2-c-onerm`([:84](../web/src/features/stats/ui/e1rm-interactive-chart.tsx)).
- **seam은 이미 있다**: 래퍼 [`stats-1rm-chart-section.tsx:16-26`](../web/src/features/stats/ui/stats-1rm-chart-section.tsx)이 `chart: React.ReactNode`를 주입받는다.
- 기간 프리셋: [`stats-1rm-controls.tsx:128-133`](../web/src/features/stats/ui/stats-1rm-controls.tsx) 7D/1M/3M/ALL = 7·30·90·365, 타입 [`stats-1rm-types.ts:50`](../web/src/features/stats/model/stats-1rm-types.ts) `RangePreset`.
- 배치 후보: [`stats-screen.tsx`](../web/src/widgets/stats-screen/stats-screen.tsx) — `WeeklyVolumeSection`·`AsymptoteMonitorSection`·`GoalSection`이 이미 같은 패턴으로 나열돼 있다.

### 2.5 새 테이블 체인 — 그리고 선례가 남긴 함정

순서: **스키마 → 마이그레이션 2벌 → export → shape 검증 → import → 삭제 → API 라우트 → 서비스**

| 단계 | 위치 |
|---|---|
| 스키마 | [`db/schema.ts`](../packages/core/src/db/schema.ts) — `table(...)` 헬퍼([:29](../packages/core/src/db/schema.ts), `DB_SCHEMA` 분기), userId FK 선례 [:75](../packages/core/src/db/schema.ts) |
| 마이그레이션 | [`migrations/`](../web/src/server/db/migrations)(최신 `0027`) + [`migrations-dev/`](../web/src/server/db/migrations-dev)(최신 `0010`) 각각 SQL + `meta/_journal.json` + snapshot. 생성 `pnpm -C web db:generate` |
| export | [`userExport.ts`](../packages/core/src/export/userExport.ts) — `UserDataExport` [:16-30](../packages/core/src/export/userExport.ts), 쿼리 [:44-125](../packages/core/src/export/userExport.ts) |
| shape 검증 | [`validateExportShape.ts:24-33`](../packages/core/src/import/validateExportShape.ts) 배열 키 목록 |
| import | [`userImport.ts`](../packages/core/src/import/userImport.ts) — `rewriteUserId` [:67-72](../packages/core/src/import/userImport.ts), `loadExistingCounts` [:105-183](../packages/core/src/import/userImport.ts), `buildSummary` [:189-199](../packages/core/src/import/userImport.ts), insert [:302-363](../packages/core/src/import/userImport.ts) |
| 삭제 | [`deleteUserData.ts`](../packages/core/src/data/deleteUserData.ts) `deleteUserDomainData()` — 계정 삭제와 replace import 양쪽이 쓴다 |
| API | [`apps/api/src/routes/`](../apps/api/src/routes) 신설 + [`app.ts`](../apps/api/src/app.ts) `app.route(...)` 등록. web은 캐치올 프록시라 라우트 신설 불필요 |

✅ **선례 함정 (해소됨)**: `planRuntimeState`는 `deleteUserData.ts`에는 있는데 `userExport.ts`에는 없어서, replace import가 **삭제만 하고 복원하지 않았다**.
고친 방법은 **export 등재가 아니라 import 후 재계산**이다 — 파생 상태라 파일의 옛 값을 되살리면 방금 갈아끼운 로그와 어긋난다.
`userImport.ts`가 삽입 뒤 플랜마다 `rebuildAutoProgressionForPlan`을 돌리고, `export-import-coverage.test.ts`가 이 테이블을 `recomputed`로 분류해
"export에 등재하는 것은 고침이 아니라 회귀"임을 강제한다. **새 테이블은 이 경로가 아니라 export/import 양쪽 등재(`portable`)가 정답이며, 왕복 테스트를 DoD에 넣는다.**

## 3. 설계

### 3.1 테이블

```
body_measurement
  id          uuid PK defaultRandom
  userId      uuid NOT NULL -> app_user.id (onDelete: cascade)
  kind        text NOT NULL default 'weight'
  valueKg     numeric(6,2) mode:number NOT NULL
  measuredAt  timestamptz NOT NULL
  createdAt   timestamptz NOT NULL defaultNow
  uniqueIndex(userId, kind, measuredAt)
  index(userId, kind, measuredAt desc)
```
- `kind`는 확장 여지로 남긴다. 값은 하나뿐이지만 **테이블을 나중에 추가하면 §2.5 체인을 또 밟아야 하므로** 컬럼 하나가 훨씬 싸다.
- `uniqueIndex(userId, kind, measuredAt)`로 같은 시각 중복 기록을 막고 upsert를 가능하게 한다.

### 3.2 시점 체중 조회 계약

`packages/core/src/stats/bodyweight-timeline.ts` (신설, 순수):
```ts
type BodyweightPoint = { measuredAt: Date; valueKg: number };
// 정렬된 배열에서 asOf 이전(포함) 최신 값. 없으면 null.
function bodyweightAsOf(points: BodyweightPoint[], asOf: Date): number | null;
```
- 소비처는 세션 날짜별로 이 함수를 호출한다. **기록이 없으면 null → 호출자가 설정 단일값으로 폴백**한다(결정 1).
- [`last-session-summary.ts:55-57`](../web/src/lib/workout-record/last-session-summary.ts)의 `extractBodyweightKg` + 폴백 패턴과 같은 형태다.

### 3.3 소급 적용 (PR3)

- **strength score**: [:183](../packages/core/src/stats/strength-score-service.ts)·[:191](../packages/core/src/stats/strength-score-service.ts)의 분모를 "해당 best e1RM이 나온 세션 시점 체중"으로 교체. 캐시 파라미터([:73-78](../packages/core/src/stats/strength-score-service.ts))에서 `bodyweightKg`를 빼고 **체중 기록의 최신 시각(또는 개수+최신값 해시)**로 대체한다 — 체중을 기록할 때마다 캐시가 무효화되어야 한다.
- **asymptote monitor**: `aggregateDriverExposures`에 단일 `bodyweightKg` 대신 조회 함수(또는 시점 배열)를 넘긴다. [:41-45](../packages/core/src/program-engine/asymptote-monitor.ts) `exposureE1rm`이 `resolveLoggedTotalLoadKg`를 우회하는 문제도 이 기회에 정리한다(§7 결정 3).
- 체중 기록 CRUD는 [`apps/api/src/routes/settings.ts:180`](../apps/api/src/routes/settings.ts)와 동일하게 `invalidateStatsCacheForUser`를 호출한다.

### 3.4 차트 일반화 (PR2)

- `E1RMInteractiveChart`를 `{ points, valueAccessor, ariaLabel, colorToken, badges? }` 형태로 일반화하거나, 공통 내부 컴포넌트를 뽑고 e1RM·체중 두 래퍼를 둔다. **PR 배지 블록은 e1RM 전용이므로 옵션으로 내린다.**
- 색은 `--v2-c-weight`(무게 도메인 토큰)를 쓴다.
- 입력 UI: stats 화면 섹션 헤더의 "기록" 액션 → `NumberPickerSheet` 또는 `NumberKeypadField`. 체중 확인 배너(§2.2)의 "업데이트"도 같은 기록 경로로 수렴시킨다.

## 4. 안전장치

- **G1. export/import 왕복** — `planRuntimeState` 함정의 재발 방지. 체중 기록 2건을 만들고 export → 새 계정으로 import → 2건 복원 확인. `insertCounts`에 0이 아닌 값이 나오는지 단언한다.
- **G2. 계정 삭제** — `deleteUserDomainData`에 등재됐는지. 누락 시 고아 행이 남는다. 기존 검증 스크립트 `pnpm -C web db:verify:account-lifecycle` 활용.
- **G3. 시점 조회 유닛** — `bodyweightAsOf` 경계: 기록 0건, asOf가 첫 기록보다 이전, 같은 날 2건, 정렬 안 된 입력.
- **G4. 소급 계산 변경분 명시** — strength score는 **수치가 바뀐다**(그게 목적). 체중 기록이 없는 사용자는 불변임을 단언하고, 기록이 있으면 시점 체중이 쓰이는지 단언한다.
- **G5. 캐시 무효화** — 체중 기록 후 strength score가 재계산되는지. 캐시 파라미터 변경을 빠뜨리면 "기록했는데 지표가 안 바뀜"이 된다.
- **G6. 마이그레이션 2벌** — `migration-journal-guard` 통과, dev본의 스키마 접두사 확인.

## 5. PR 분해 (3개, 순서 고정)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `feat(db): 체중 기록 테이블을 추가한다` | 스키마 + 마이그레이션 2벌 + **export/import/삭제 3곳** + API 라우트 + `bodyweightAsOf` 순수 함수. UI 없음. | 중 | G1·G2·G3·G6 |
| **2** | `feat(stats): 체중 추이 차트와 기록 입력을 추가한다` | 차트 일반화 + stats 섹션 + 기록 시트 + 배너 경로 수렴 | 낮 | `lint:design`, `test:theme`, E2E 1건 |
| **3** | `feat(stats): 시점 체중을 강도 지표에 적용한다` | strength score + asymptote monitor 전환 + **캐시 파라미터 재설계** | **높** | G4·G5, core 전체, `test:progression` |

**TUI**: 스키마·API가 바뀌므로 **PR1에서 필드 수용**(체중 기록 조회/추가 명령). 차트는 후행 — M2 말미 슬롯에서 stats 버퍼 스파크라인 추가를 판단한다.

## 6. 리스크 / 하지 말 것

1. **`userExport.ts` 등재를 빠뜨리지 말 것** — `planRuntimeState`가 정확히 이 함정에 빠졌었다(§2.5). 삭제·import에만 넣으면 replace import가 데이터를 조용히 날린다. `body_measurement`는 파생이 아니라 사용자가 입력한 원본이므로 재계산이라는 도피처가 없다 — 반드시 export에 넣어야 한다.
2. **`deleteUserDomainData` 등재를 빠뜨리지 말 것** — 계정 삭제가 고아 행을 남긴다(GDPR 경로).
3. **`validateImportScope`에 규칙을 추가하지 말 것** — 자체 `userId` 컬럼이 있는 테이블은 그 파일의 대상이 아니다. 필요한 건 `rewriteUserId`다.
4. **설정 단일값을 제거하지 말 것** — 처방 시드·저장 스탬프·REF5 시작 입력이 "오늘 체중"을 쓰고, 그게 옳다.
5. **strength score 캐시 파라미터를 그대로 두지 말 것** — `bodyweightKg`가 키에 박혀 있어서, 시계열로 바꾸면 키가 변하지 않아 구 값이 계속 반환된다.
6. **`exposureE1rm`의 우회를 무심코 확장하지 말 것** — asymptote monitor만 `resolveLoggedTotalLoadKg`를 우회한다. 시점 체중을 넣는 김에 이 비대칭을 늘리지 않는다.
7. **`measuredAt`을 date로 좁히지 말 것** — 같은 날 아침·저녁 기록 수요가 있고, `timestamptz`가 세션 시각과의 비교에도 자연스럽다.

## 7. 결정 사항

1. **`kind` 컬럼을 둘 것인가** → **둔다.** 값은 하나지만 새 테이블을 추가하는 비용(§2.5 체인 8단계)이 컬럼 하나보다 훨씬 크다.
2. **미설정 표현** → 시계열은 명시 기록만 담고, 미설정 시 차트는 빈 상태. `DEFAULT_SETTINGS`의 70은 계산 폴백으로 유지한다(§2.1의 불일치는 알려진 흠으로 남기되 이번에 건드리지 않는다).
3. **`exposureE1rm`의 우회를 정리할 것인가** → **PR3에서 함께 정리**한다. 시점 체중을 넣는 작업이 어차피 이 함수를 건드리므로 두 번 만지지 않는다.
4. **체중 기록 삭제·수정 UI** → 1차는 추가와 목록만. 수정은 같은 `measuredAt`에 upsert로 흡수된다.
