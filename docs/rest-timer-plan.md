# 휴식 타이머 구현 계획 (M1-1)

> 상태: **계획 확정, 미착수** (2026-08-19). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §3 M1-1.
>
> **규모 재산정: M → L.** 로드맵 초안은 "타이머만 얹으면 된다"를 전제했으나, 코드 실측 결과 **세트 완료라는 상호작용 자체가 없다**(§2.1). 사용자 결정으로 `✓` 컬럼을 탭 가능한 완료 버튼으로 승격하는 작업이 선행되면서 PR 5개 규모가 됐다.
>
> **확정된 설계 결정** (2026-08-19 사용자 선택):
> 1. **완료 모델** — `✓`를 탭 버튼으로 승격. 빈 칸이면 처방 reps를 채우고 완료 처리 + 타이머 시작. 기존 "직접 타이핑" 경로도 그대로 동작. **완료는 계속 reps 값에서 파생** → 스키마 변경 0.
> 2. **타이머 배치** — 새 부유 필을 만들지 않고 **기존 저장바(`SessionSaveBar`)에 편입**. 휴식 중에는 진행률 바 줄이 휴식 줄로 **전환**(높이 불변 → 레이아웃 시프트 0, `.app-main` 여백 상수 무변경).
> 3. **생존 범위** — 화면 스코프 jotai + **시작 타임스탬프를 sessionStorage에 복원용으로 기록**. 통계를 보고 돌아와도 남은 시간이 이어진다. 전역 store 도입 없음.

## 1. 문제와 목표

경쟁 앱 벤치마킹(12개 앱)의 1번 결론은 로깅 속도의 공식이 **프리필 → 체크 1탭 → 자동 타이머 → 화면 안 이력**이고, 조사한 모든 앱이 이를 갖췄다는 것이다. 우리 앱은 프리필(처방·PREV 표시)과 이력은 있으나 **체크와 타이머가 둘 다 없다**.

**목표**
1. 세트를 1탭으로 완료 처리할 수 있다.
2. 완료가 곧 휴식 타이머 시작이며, 목표 시간은 **처방 → 운동별 프리셋 → 전역 기본값** 순으로 해석된다.
3. REF5/Asymptote 문서에만 있는 휴식 처방(§2.5)이 실제로 타이머를 구동한다 — **"처방 구동형 타이머"가 우리식 차별화**(경쟁 앱은 전역/운동별 프리셋까지만).

**비목표 (명시적 제외)**
- 기기 푸시 알림·진동/햅틱·워치·위젯·Live Activities — 네이티브 전용이라 이번 벤치마킹 전제상 범위 밖. `web/docs/v2-next-pr-plan.md` §B3(휴식 타이머 햅틱/사운드)은 **이 계획이 대체·종결**하되 햅틱·SW push 항목은 폐기한다.
- 전면 프리필 모델 전환(입력칸에 처방값을 미리 채워두고 `✓`로 수락) — 사용자가 확인하지 않은 값이 기록되는 위험 때문에 비채택. 우리는 **빈 칸 유지 + 탭 시 채움**.
- 세트 타입(웜업/실패) 도입 — M1-3의 범위. 다만 §6-2의 상호작용 주의가 있다.
- 전역 상시 타이머(app-shell 마운트).

**성공 기준**: 세트 1개 완료가 **탭 1회**로 끝나고, 그 탭이 곧 휴식 시작이며, 화면을 벗어났다 돌아와도 남은 시간이 정확하다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 세트 완료 — **상호작용이 존재하지 않는다**

- 세트 행: [`workout-set-row.tsx:162-260`](../web/src/features/workout-log/ui/workout-set-row.tsx). 5컬럼 그리드 `[# | 중량 | 반복 | RPE | ✓]`, 상수 `ROW_GRID`가 [`workout-set-row.tsx:28`](../web/src/features/workout-log/ui/workout-set-row.tsx)과 [`workout-exercise-card.tsx:48`](../web/src/features/workout-log/ui/workout-exercise-card.tsx)에 **중복 정의**.
- **마지막 `✓` 컬럼([:222-259](../web/src/features/workout-log/ui/workout-set-row.tsx))은 `aria-hidden` `<span>`** — 버튼이 아니고 `onClick`도 없다. 리포 전체에 `checkbox`/`aria-checked`/`toggleComplete` 계열 0건.
- 완료는 reps 입력값에서 **파생**: `isComplete = hasReps && (!plannedReps || repsNum >= plannedReps)` ([:81](../web/src/features/workout-log/ui/workout-set-row.tsx)), `isFailure`는 [:80](../web/src/features/workout-log/ui/workout-set-row.tsx). 파생 헬퍼 `resolveWorkoutSetRepsEntry`([`ref5-outcome.ts:20-49`](../web/src/lib/workout-record/ref5-outcome.ts)), `isWorkoutSetCompleted`([`entry-state.ts:18-40`](../web/src/lib/workout-record/entry-state.ts)).
- 값 변경 액션 3개뿐: `CHANGE_WEIGHT`/`CHANGE_SET_REPS`/`CHANGE_SET_RPE` → [`editor-actions.ts:63`](../web/src/features/workout-log/model/editor-actions.ts) `buildExerciseActionUpdate`. PROGRAM 운동의 reps는 `draftAtom`과 `programEntryStateAtom` **양쪽**을 갱신([:162-179](../web/src/features/workout-log/model/editor-actions.ts)).
- 포커스 체인([`use-set-row-focus-chain.tsx`](../web/src/features/workout-log/model/use-set-row-focus-chain.tsx))은 **Enter 키에서만** `advanceFrom`을 호출한다([`workout-set-row.tsx:138-153`](../web/src/features/workout-log/ui/workout-set-row.tsx)). 값 변경에 반응하는 자동 이동은 없다.

### 2.2 타이머 — 웹·TUI 양쪽 다 없음

- 웹: `restTimer|휴식 타이머|AudioContext|navigator.vibrate|wakeLock` **전부 0건**.
- TUI: [`apps/tui/README.md:95`](../apps/tui/README.md)가 "휴식 게이지"를 기능으로 적고 있으나 **대응 구현이 없다**(`gauge|elapsed|time.Since` 0건). README를 넣은 커밋은 릴리스 문서 정비(#438)이고 기능 커밋이 없다. → **README도 이 계획에서 실제와 맞춘다.**
- 선행 이력: 폐기된 `/workout/log/keypad`(빠른 기록)에 타이머가 있었다([`v2-next-pr-plan.md:17`](../web/docs/v2-next-pr-plan.md)).

### 2.3 하단 레이어와 저장바

| 요소 | 파일 | positioning | z |
|---|---|---|---|
| BottomSheet | [`bottom-sheet.css:9`](../web/src/styles/components/bottom-sheet.css) | fixed | 9999 |
| Toast | [`toast.tsx:49`](../web/src/components/ui/toast.tsx) | fixed **top** | 100 |
| V2ActionDock(하단 네비) | [`action-dock.tsx:50`](../web/src/components/v2/primitives/action-dock.tsx) | fixed bottom | **40** |
| **SessionSaveBar** | [`session-save-bar.tsx`](../web/src/widgets/workout-log-screen/session-save-bar.tsx) → [`sticky-action-bar.tsx:12`](../web/src/components/ui/sticky-action-bar.tsx) | **sticky**, `bottom: calc(64px + safe-area + s-2)` (compact 48px) — [`app-page.css:351-370`](../web/src/styles/components/app-page.css) | (auto) |

- `.app-main { padding-bottom: calc(94px + safe-area) }` ([`layout.css:15`](../web/src/styles/layout.css)) — 콘텐츠 끝과 도크 사이 여유 **약 26px**. 저장바가 이미 이 슬롯을 점유 중이라 **부유 필을 추가하면 정면 충돌**한다(결정 2의 근거).
- 저장바는 이미 **세트 진행률 바**를 갖고 있다: `height: var(--v2-s-1)`, `--v2-accent`(완료 시 `--v2-c-success`), `role="progressbar"` + aria-valuenow. 소스는 `completedSetsCountAtom`/`totalSetsCountAtom`([`workout-log-atoms.ts:157-182`](../web/src/features/workout-log/store/workout-log-atoms.ts)).
- 도크·저장바는 `useNavScrollCompact()`([`use-nav-scroll-compact.ts:22`](../web/src/components/v2/use-nav-scroll-compact.ts))를 **공유 구독**해 함께 축소된다.

### 2.4 설정 시스템

- **DB 마이그레이션 불필요.** `user_setting(userId, key, value jsonb)` 단일 테이블([`schema.ts:482-502`](../packages/core/src/db/schema.ts)), PATCH `/api/settings`가 범용 key/value([`apps/api/src/routes/settings.ts:129-198`](../apps/api/src/routes/settings.ts)). 값은 **primitive만** 허용(`isSettingValue`, [:143](../apps/api/src/routes/settings.ts)) → 배열/객체는 **`...Json` 접미사 키에 JSON 문자열**로 저장하는 것이 규약.
- 진실원: [`packages/core/src/settings/workout-preferences.ts`](../packages/core/src/settings/workout-preferences.ts) — `SETTINGS_KEYS`([:86-96](../packages/core/src/settings/workout-preferences.ts)), `WorkoutPreferences`([:69-79](../packages/core/src/settings/workout-preferences.ts)), `readWorkoutPreferences`([:272-306](../packages/core/src/settings/workout-preferences.ts)), `toDefaultWorkoutPreferences`([:308-320](../packages/core/src/settings/workout-preferences.ts)).
- **`resolveMinimumPlateIncrement`([:332-377](../packages/core/src/settings/workout-preferences.ts))가 운동별 프리셋 해석의 1:1 템플릿**: exerciseId 정확일치 → 정규화 이름(id 없는 규칙 우선) → 같은 이름 아무 규칙 → 기본값. `parseMinimumPlateRules`/`serializeMinimumPlateRules`([:248-270](../packages/core/src/settings/workout-preferences.ts))도 그대로 복제 가능.
- web은 `export *` 재export([`web/src/lib/settings/workout-preferences.ts:1-4`](../web/src/lib/settings/workout-preferences.ts)) → **core에 추가하면 web은 수정 불필요**.
- 쓰기는 단일 경로: `useSettingRowMutation(...).commit()`([`use-setting-row-mutation.ts:61-181`](../web/src/lib/settings/use-setting-row-mutation.ts)) → `updateSetting`([`update-setting.ts:156-205`](../web/src/lib/settings/update-setting.ts), 낙관적 반영 + 실패 시 롤백).
- **⚠️ `DEFAULT_SETTINGS`가 2곳에 복제**돼 있다: [`settings-snapshot.ts:18-32`](../packages/core/src/services/settings/settings-snapshot.ts) + [`apps/api/src/routes/settings.ts:33-47`](../apps/api/src/routes/settings.ts). 새 키는 **양쪽 모두** 넣어야 한다.
- 화면 템플릿: `/settings/minimum-plate` 2파일([`page.tsx`](../web/src/app/settings/minimum-plate/page.tsx) RSC + [`minimum-plate-page-content.tsx`](../web/src/app/settings/minimum-plate/minimum-plate-page-content.tsx) 534줄 클라). 값 편집은 피커가 아니라 **`NumberKeypadField`**, 종목 선택은 검색 입력 + `role="listbox"`, 저장은 **배열 전체 재직렬화 + 낙관적 반영 후 실패 시 이전 JSON 복구**.
- 로깅 화면은 이미 `workoutPreferencesAtom`([`workout-log-atoms.ts:16`](../web/src/features/workout-log/store/workout-log-atoms.ts))을 갖고 있고, `sessionExerciseCardsAtom`([:108-120](../web/src/features/workout-log/store/workout-log-atoms.ts))이 카드별로 `resolveMinimumPlateIncrement`를 호출한다 → **휴식 프리셋 해석도 정확히 이 자리**.

### 2.5 휴식 처방 — 문서에만 존재

- REF5: [`docs/ref5-program-spec.md` §19.1(621-630행)](ref5-program-spec.md) — SQ H3/H2·BP·PULL 집중 3–5분 / SQ V·BP·PULL 볼륨·OHP 2–3분 / DL 2–4분 / 마이크로 2–3분.
- Asymptote: [`web/docs/asymptote-protocol.md`](../web/docs/asymptote-protocol.md) 세션 A(325-329행) SQ 3-5분·BP 2-3분·WPU 2-3분, 세션 B(340-344행), 세션 C(355-359행) SQ 60-90초. 같은 문서 570행이 **"휴식 타이머 (자동 시작)"을 UI 요구사항으로 이미 적고 있다**.
- **코드·seed·DB에는 값이 전혀 없다**(`restSeconds|restSec|rest_seconds` 코드 히트 0).

### 2.6 DSL과 세션 생성

- 세트 스키마: [`program-dsl/schema.ts:23-34`](../packages/core/src/program-dsl/schema.ts) `manualSetSchema`. 모든 오브젝트가 `.passthrough()`라 **미지 키는 이미 저장·왕복된다** — 다만 `z.infer` 타입에 안 잡혀 seed 리터럴·엔진이 타입 안전하게 읽지 못한다.
- 출력 타입: `PlannedSet`([`generateSession.ts:88-101`](../packages/core/src/program-engine/generateSession.ts)).
- **최대 병목: `mapManualSet`([:756-763](../packages/core/src/program-engine/generateSession.ts))** — 새 객체를 명시 조립하므로 **미지 필드를 드롭한다.** 여기를 고치지 않으면 DSL의 `restSeconds`가 세션에 절대 실리지 않는다.
- 골든: [`dsl-golden.test.ts`](../packages/core/src/program-engine/dsl-golden.test.ts) + [`fixtures/dsl/golden-logic.json`](../packages/core/fixtures/dsl/golden-logic.json). 대상은 **LOGIC(operator/531/asymptote) 7건뿐이고 `ref5`와 manual은 골든 밖**. 재생성: `UPDATE_DSL_GOLDEN=1 pnpm -C packages/core exec tsx --test src/program-engine/dsl-golden.test.ts`.
- conformance([`schema.test.ts`](../packages/core/src/program-dsl/schema.test.ts))는 **optional 필드 추가로는 깨지지 않는다** — `futureField` passthrough 단언([:70](../packages/core/src/program-dsl/schema.test.ts))이 선례.
- REF5는 별도 경로: [`ref5.ts:805-812`](../packages/core/src/program-engine/ref5.ts) `Ref5PrescriptionSet`, 생성 [`:1031-1043`](../packages/core/src/program-engine/ref5.ts), 매핑 [`ref5-integration.ts:341-387`](../packages/core/src/program-engine/ref5-integration.ts).

### 2.7 TUI

- 세트 타입 체인 5곳: [`api/plans.go:177`](../apps/tui/internal/api/plans.go) `PlannedSet` → [`ui/log_model.go:42`](../apps/tui/internal/ui/log_model.go) `setEntry` → [`ui/draft.go:23`](../apps/tui/internal/ui/draft.go) `draftSet` → [`draft.go:88`](../apps/tui/internal/ui/draft.go) `draftFromLog` → [`draft.go:236`](../apps/tui/internal/ui/draft.go) `loadFromDraft`. 소비 [`log_update.go:827`](../apps/tui/internal/ui/log_update.go).
- **⚠️ 리플렉션 기반 struct 대조 테스트가 없다** — Go에 필드를 빠뜨려도 CI가 못 잡는다. [`draft_test.go:63-104`](../apps/tui/internal/ui/draft_test.go) `TestDraftRoundTrip`에 **손으로 단언을 추가**해야 커버된다.
- tick은 `Frame`에만 있고([`frame.go:88-92`](../apps/tui/internal/ui/frame.go)) **활성 뷰에만 전달**된다 → 게이지를 tick 누적으로 만들면 버퍼 전환 시 시간이 멈춘다. 반드시 타임스탬프 파생.
- 게이지 재료 `theme.Blocks`/`theme.Shades`([`theme.go:37-41`](../apps/tui/internal/theme/theme.go))는 선언만 되고 미사용이며, [`chart.go:130`](../apps/tui/internal/ui/chart.go)이 `blockEighths`를 로컬 재선언해 쓰고 있다(중복).

## 3. 설계

### 3.1 타이머 코어 — 타임스탬프 파생, 카운트 누적 금지

```
restState = { exerciseId, setIndex, startedAtMs, targetSeconds } | null
remaining = targetSeconds - (now - startedAtMs)/1000
```
- `setInterval(250ms)`은 **리렌더만 유발**하고 값은 매번 `Date.now()`로 재계산한다. iOS 백그라운드 스로틀·탭 비활성에서 누적 카운터가 틀어지는 문제를 원천 차단.
- `visibilitychange`에서 즉시 재계산. 만료 판정도 파생값으로.
- 순수 함수는 `web/src/lib/workout-record/rest-timer.ts`(신설): `resolveRestSeconds(...)`, `remainingSeconds(state, nowMs)`, `formatRestClock(sec)`. **DOM·React 무지** → 유닛 테스트 대상.

### 3.2 목표 시간 해석 순서

1. **처방** — `PlannedSet.restSeconds`(PR5). 없으면
2. **운동별 프리셋** — `prefs.rest.presetsJson`, `resolveRestSecondsForExercise`가 `resolveMinimumPlateIncrement`와 동일한 4단 우선순위(id → 이름(id 없는 규칙 우선) → 이름(아무 규칙) → 기본). 없으면
3. **전역 기본값** — `prefs.rest.defaultSeconds`(기본 90초).

### 3.3 `✓` 탭 동작

| 상태 | 탭 결과 |
|---|---|
| reps 비어 있고 **처방 있음** | 처방 reps로 채움 → 파생 완료 → 타이머 시작 |
| reps 비어 있고 처방 없음, **직전 기록 있음** | 직전 기록 reps로 채움 → 완료 → 타이머 시작 *(§7 결정 1)* |
| reps 비어 있고 둘 다 없음 | 채우지 않고 **타이머만 시작** |
| reps 이미 있음 | 값 불변, **타이머 (재)시작** |

- **비파괴 원칙**: 탭으로 값을 지우지 않는다. 완료 취소는 기존대로 reps 칸을 비우면 된다.
- 액션은 신설하지 않고 기존 `CHANGE_SET_REPS`를 재사용한다(PROGRAM/USER 양쪽 갱신 경로가 이미 정합). 타이머 시작은 UI 계층에서 별도 호출.
- **REF5**: 중량·RPE는 `readOnly`이고 `CHANGE_WEIGHT/RPE/ADD_SET/REMOVE_SET/DELETE`는 무시되지만([`editor-actions.ts:70-80`](../web/src/features/workout-log/model/editor-actions.ts)) `CHANGE_SET_REPS`는 허용되므로 `✓` 탭이 그대로 동작한다. **PR2에서 REF5 세션으로 반드시 실측 확인.**
- 접근성: `<button aria-pressed={isComplete} aria-label="N세트 완료">`, 44×44 히트영역은 `v2-tap-44` 관례 사용. 현재 `aria-hidden`을 제거하므로 스크린리더 노출 문구를 새로 정의한다.

### 3.4 저장바 편입 (레이아웃 시프트 0)

- 휴식 중: 저장바의 **진행률 바 줄을 휴식 줄로 전환**. 구성 `[⏱ 01:23] [남은 시간 바] [+30s] [건너뛰기]`. 높이는 진행률 바와 동일하게 유지 → `.app-main` 패딩·`.app-sticky-action` bottom 상수 **무변경**.
- 휴식 종료·건너뛰기 시 진행률 바로 복귀.
- 색: 남은 시간 바는 `--v2-c-progress`(REF5 창 패널이 쓰는 토큰과 동일), 만료 순간 `--v2-c-success` 플래시 후 복귀.
- 모션: `--v2-d-1/2` + `--v2-e-out` (⚠️ 토큰 접두사는 `--v2-motion-*`가 **아니다**). `prefers-reduced-motion`은 전역 리셋이 아니라 스코프별 적용이므로([`v2-tokens.css:345`](../web/src/styles/v2-tokens.css) 등) 저장바 스코프에 **자체 미디어 블록을 명시**한다.

### 3.5 복원 (sessionStorage)

- 키: `workout-log.rest.v1.{persistenceKey}` — persistenceKey는 이미 조립돼 있다([`workout-log-screen.tsx:108-111`](../web/src/widgets/workout-log-screen/workout-log-screen.tsx), `{planId}:{date}:{sessionId|new}`).
- 값: `{ exerciseId, setIndex, startedAtMs, targetSeconds }`.
- 마운트 시 복원하되 `now - startedAtMs >= targetSeconds`면 폐기(만료 알림 재생 금지).
- **드래프트 스키마(`WorkoutDraftData`)는 건드리지 않는다** — 복원 호환성 검사(`isWorkoutDraftProtocolCompatible`)·마이그레이션 리스크를 피하고, 휴식은 본질적으로 탭 단위 휘발 상태다.

### 3.6 사운드 / Wake Lock

- 사운드: 에셋 없이 `OscillatorNode` 짧은 비프. **`✓` 탭 자체가 사용자 제스처**이므로 그 시점에 `AudioContext`를 lazy 생성·언락(모듈 싱글턴). 자동재생 정책 회피. 설정 `prefs.rest.soundEnabled`(기본 on).
- Wake Lock: `navigator.wakeLock.request("screen")`을 **로깅 화면 한정**으로 획득, unmount·`visibilitychange(hidden)`에서 release, 복귀 시 재획득. feature-detect 필수(미지원 브라우저 무동작). 설정 `prefs.rest.wakeLockEnabled`(**기본 off** — 배터리 영향).
- 어댑터 위치: DOM을 만지므로 `web/src/lib/settings/`(브라우저 어댑터 자리) 또는 `web/src/lib/workout-record/`. core에는 두지 않는다(core는 DOM 무지).

## 4. 안전장치

- **G1. 순수 로직 유닛** — `rest-timer.ts`(해석 우선순위·남은 시간·포맷)와 core `resolveRestSecondsForExercise`(4단 우선순위, `resolveMinimumPlateIncrement` 테스트를 그대로 대응 복제). 경계: 프리셋 0개, 이름만 있는 규칙, 처방 0/음수, 만료 직후.
- **G2. 시간 조작 테스트** — `Date.now()`를 주입 가능한 인자로 두고(`remainingSeconds(state, nowMs)`) 백그라운드 점프(예: +5분)를 시뮬레이션. "setInterval 누적이 아니다"를 기계로 증명한다.
- **G3. E2E 1시나리오** — `web/e2e/rest-timer.spec.ts`(신설): `✓` 탭 → reps 채워짐 + 저장바가 휴식 줄로 전환 → `+30s` 반영 → `건너뛰기` → 진행률 바 복귀. 기존 `test:settings:policy`([`update-setting.test.ts`](../web/src/lib/settings/update-setting.test.ts))에 새 키가 걸리는지도 확인.
- **G4. 골든 불변** — PR5 전까지 `dsl-golden.test.ts` 바이트 동일. PR5에서 REF5만 건드리면 골든은 여전히 불변(§2.6). LOGIC 배선은 별건으로 미룬다.
- **G5. 렌더 검증** — CI 통과 ≠ UI 검증. Playwright로 저장바 전환을 실제로 열어 확인하고, 14종 테마에서 `test:a11y:contrast` + `test:theme` 통과.

## 5. PR 분해 (5개, 각각 독립 머지)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `feat(settings): 휴식 시간 설정 키를 추가한다` | core `SETTINGS_KEYS` 4키(`prefs.rest.defaultSeconds`·`presetsJson`·`soundEnabled`·`wakeLockEnabled`) + `WorkoutPreferences` 필드 + `normalizeRestSeconds`/`parseRestPresets`/`serializeRestPresets` + **`resolveRestSecondsForExercise`** + `readWorkoutPreferences`/`toDefaultWorkoutPreferences` 반영 + **`DEFAULT_SETTINGS` 2곳**. UI 없음. | 낮 | core 유닛(G1), `lint:boundary`, web·apps/api typecheck |
| **2** | `feat(workout-log): 세트 완료를 탭 한 번으로 처리한다` | `✓` 컬럼을 버튼으로 승격(§3.3 표), a11y 라벨, `ROW_GRID` 중복 상수 단일화. **타이머 없음** — 단독으로 "1탭 완료" 가치. | 중 | E2E(탭→reps 채워짐), REF5 세션 실측, `lint:design` |
| **3** | `feat(workout-log): 휴식 타이머를 저장바에 편입한다` | `rest-timer.ts` 순수 로직 + 화면 스코프 atom + 저장바 줄 전환 + sessionStorage 복원 + 사운드(설정 없이 기본 on 하드코딩 아님 — PR1 키 소비) + `apps/tui/README.md` 허위 기재 정정. | 중 | G1·G2·G3·G5, `test:theme`, `test:a11y:contrast` |
| **4** | `feat(settings): 휴식 시간 기본값과 운동별 프리셋 화면을 만든다` | `/settings/rest-timer` 2파일(minimum-plate 복제) + more-screen "운동 설정" 섹션 행 + wake lock·사운드 토글(`V2Switch`, `prefs.autoSync` 패턴) + **`modalTitleFromPathname` 분기** + `AppCopy.settings.modalTitles` ko/en. | 낮 | `test:settings:policy`, 낙관적 롤백 수동 확인(`simulateFailure`) |
| **5** | `feat(program): 휴식 처방을 DSL과 REF5 세션에 싣는다` | `manualSetSchema.restSeconds?` + `PlannedSet.restSeconds?` + **`mapManualSet` 관통** + REF5 경로(`Ref5PrescriptionSet`→`ref5-integration`)에 §2.5 표의 값 배선 + seed 헬퍼 타입 + **TUI 5곳 필드 수용 + `TestDraftRoundTrip` 단언**. | 중~높 | conformance + **골든 바이트 동일**, `go build/vet/test`, REF5 스펙 가드 2종 |

**미루는 것**: LOGIC(operator/531/asymptote) 세트 빌더의 `restSeconds` 배선 — 골든 재생성이 필요하므로 별도 PR로 분리하고, Asymptote 문서(세션 A/B/C)의 값 반영과 함께 다룬다. TUI 휴식 게이지 UI는 TUI 정책(스키마 동시·UI 후행)에 따라 **M1 마일스톤 말미 슬롯**.

## 6. 리스크 / 하지 말 것

1. **`setInterval` 누적으로 시간을 재지 말 것.** 반드시 타임스탬프 차이. (모바일 백그라운드 스로틀에서 조용히 틀어진다.)
2. **`✓` 탭이 값을 지우게 하지 말 것.** 완료 취소는 reps 칸 편집으로만.
3. **부유 필을 새로 만들지 말 것.** 저장바가 이미 도크 위 슬롯을 점유하고 있어 `.app-main` 여백(94px)·`.app-sticky-action` bottom(64/48px) 상수를 동시에 손대야 하고, 375px 화면에서 도크 좌우 여백이 27px뿐이라 놓을 자리가 없다.
4. **`WorkoutDraftData` 스키마를 확장하지 말 것** — 복원 호환성 검사와 마이그레이션을 건드리게 된다. sessionStorage로 충분.
5. **`mapManualSet`을 빠뜨리지 말 것** — DSL에 필드를 넣어도 여기서 드롭되면 아무 일도 일어나지 않는다. PR5에서 가장 흔한 실패 지점.
6. **`DEFAULT_SETTINGS` 한쪽만 고치지 말 것** — core와 apps/api에 복제돼 있다.
7. **Go 필드 누락을 CI가 안 잡는다** — 리플렉션 대조 테스트가 없으므로 `TestDraftRoundTrip`에 단언을 손으로 추가해야 한다.
8. **REF5 프로토콜 버전을 범프하지 말 것** — `restSeconds`는 additive optional이라 범프 불필요하고, 범프하면 [`ref5-protocol-bump-e2e-guard.mjs`](../web/scripts/ref5-protocol-bump-e2e-guard.mjs)가 e2e 스펙 동반 수정을 요구한다.
9. **새 모듈에 상수를 두고 `seed.ts`가 값-import 하지 말 것** — [`seed-tracked-files-guard.test.mjs:75`](../web/scripts/seed-tracked-files-guard.test.mjs)가 즉시 실패한다. 이미 추적되는 `ref5.ts`에 두거나 `db-seed.yml`의 `DB_SEED_TRACKED_FILES`를 함께 갱신.
10. **M1-3(세트 타입)과의 상호작용**: 웜업 세트가 도입되면 "웜업 완료 후 휴식"의 목표 시간이 작업세트와 달라야 한다(Strong은 웜업용 프리셋을 따로 둔다). PR1의 프리셋 스키마에 **웜업용 필드를 미리 뚫어두지는 말고**, M1-3에서 additive로 확장한다.

## 7. 결정 사항

1. **처방·프리셋이 모두 없을 때 직전 기록 reps로 채울 것인가** → **채운다(권장).** Strong의 "Previous 탭 = 값 복사"와 동형이고, 카드가 이미 직전 세션 세트를 보유([`workout-exercise-card.tsx:102-132`](../web/src/features/workout-log/ui/workout-exercise-card.tsx))해 추가 조회가 없다. PR2에서 확정.
2. **전역 기본값** → **90초.** 폐기된 기획(`v2-next-pr-plan.md` §B3)은 3분을 전제했으나 그건 파워리프팅 기준이고, 우리 프로그램 구성(보조 운동 다수)에는 90초가 적절하다. 처방·프리셋이 있으면 어차피 덮인다.
3. **타이머 만료 후 자동 다음 세트 포커스 이동** → **하지 않는다.** 포커스 체인은 Enter 트리거로 유지. 만료 시 자동 포커스는 사용자가 화면을 안 보고 있을 때 예측 불가능한 키보드 팝업을 유발한다.
4. **`prevPerformanceMapAtom` 재사용 여부** → 사용하지 않는다. 그 atom은 소비처가 없고([별도 정리 대상](improvement-roadmap-2026-08.md)) 카드의 `previousSession` 로컬 계산이 실제 라이브 경로다.
