# 판정 이력 확장과 주차 로드맵 공개 계획 (M4)

> 상태: **계획 확정, 미착수** (2026-08-19). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §5.
>
> ## 🔴 로드맵 M4-1은 이미 구현된 항목이었다 — 재정의함
>
> 로드맵은 "REF5만 판정 카드를 갖고 다른 family는 요약 행 수준"이라고 적었으나, **실측 결과 전 family의 판정 근거 표출이 이미 완성돼 있다**:
>
> - [`feedback-catalog.ts`](../packages/core/src/progression/feedback-catalog.ts)(671줄)가 **`reason` → 사용자 문구의 단일 진실원**이다. 서버가 로케일 문구까지 조립해 내려주고 web·TUI가 같은 payload를 렌더한다(클라이언트별 문구 복제 금지).
> - reducer가 이미 family별로 구조화된 `reason`을 생산한다 — GZCLP `stage-down:1->2`·`reset:stage-exhausted:*0.85`, Texas `reset:intensity-fail:*0.9`, nSuns `increase:amrap-{n}reps:+{x}kg`, Greyskull `reset:*{f}`, 블록형 `hold:block-failure` 등([`reducer.ts:657-933`](../packages/core/src/progression/reducer.ts)).
> - `plan_progress_event`에 `reason`·`beforeState`·`afterState`·`meta` 컬럼이 **이미 있다**([`schema.ts:385-403`](../packages/core/src/db/schema.ts)). 로드맵이 "additive로 확장"하자던 계약이 이미 존재한다.
> - 커버리지가 문서로 명문화돼 있다 — [`program-feedback-coverage.md`](../web/docs/program-feedback-coverage.md)의 패밀리별 표출 표에 Manual·SS/StrongLifts·Greyskull·Texas·GZCLP·Operator·5/3/1·Asymptote·REF5·REF5 창 판정이 **전부** 등재돼 있고, 피드백이 답해야 할 네 질문(결과·이유·다음 행동·선택 변경 효과)까지 규정돼 있다.
> - 검증도 완비: `feedback-catalog.test.ts`, `progression-choice.test.ts`, `progression_choice_test.go`, `ref5_judgment_card_test.go`, E2E `all-programs-protocol-journey.spec.ts`·`ref5-user-journey.spec.ts`. 2026-07-17 심층 13/13 + REF5 11/11 통과.
>
> 즉 **벤치마킹 결론("시장의 어떤 진행 엔진도 '왜'를 설명하지 않는다")은 맞지만, 우리는 이미 그 차별점을 갖고 있다.** M4-1은 신규 개발이 아니라 **종결 처리** 대상이고, 이 문서가 그 근거다.
>
> **재정의된 실제 갭 (§2.2)**: 누적 판정 **이력**이 REF5 전용이다. 카드는 직전 판정 1건만 보여주고, 누적 목록은 REF5 엔진 상태(`ref5Status.recentChanges`)에서만 나온다. 비-REF5 family는 이력 화면이 없다 — `/plans/history` 라우트는 제거되어 `/calendar`로 리다이렉트한다.
>
> **규모 재산정: M4-1 L → S~M** (판정 근거 신규 개발 없음, 이력 UI 확장만). M4-2는 로드맵대로 M.

## 1. 문제와 목표

**M4-1(재정의)**: 판정 근거는 다 있는데 **지나간 판정을 되짚을 수 없다**. 카드는 다음 세션을 시작하면 소멸하고(수명 설계상 의도된 동작), 누적 이력은 REF5만 있다. "지난 두 달 동안 스쿼트가 몇 번 리셋됐나"를 답할 화면이 없다.

**M4-2**: 프로그램의 미래 처방을 미리 볼 수 없다. JuggernautAI는 블록 구성·디로드 위치를 처음부터 끝까지 열람하게 하면서 "미래 무게는 당일 재계산"을 계약으로 명시한다. **우리는 결정론 엔진이라 더 강하게 갈 수 있다** — 현 상태 기준 확정 처방을 보여줄 수 있고, 이는 AI 앱이 흉내 못 내는 속성이다.

**목표**
1. 전 family의 누적 판정 이력을 한 화면에서 최신순으로 본다.
2. 프로그램 시작 전에 전체 주차×세션×세트 처방을 열람한다.
3. 진행 중 플랜의 남은 주차 로드맵을 현 상태 기준으로 전개해 본다.

**비목표**
- 판정 근거 문구·카탈로그 신규 작성 — **이미 있다**(§0). 새 family를 추가할 때 카탈로그 항목을 넣는 것은 그 family의 작업이다.
- REF5의 `recentChanges`를 공통 모델로 통합 — REF5는 판정을 `meta.changes`에 싣는 별도 계보다(§2.3). 통합은 이득 대비 위험이 크다.
- 미래 처방의 복수 시나리오(성공/실패 분기) — 1차는 "현 상태 유지" 단일 전개.

**성공 기준**: 플랜 상태 화면에서 프로그램 종류와 무관하게 최근 판정 목록이 보이고, 프로그램 상세에서 마지막 주차까지 처방이 전개된다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 판정 근거 파이프라인 — 완성된 구조

```
reducer          reason 문자열 + targetDecisions[]  (reducer.ts:657-933)
   ↓
plan_progress_event   reason·beforeState·afterState·meta  (schema.ts:385-403)
   ↓
feedback-catalog      로케일 문구 조립 (671줄, buildCatalogRow·fallbackRow)
   ↓
apps/api              progression.feedback 페이로드
   ↓
web 판정 카드 / TUI foot 라인   — 같은 payload를 그대로 렌더
```
- 반환 타입: [`reducer.ts:93-99`](../packages/core/src/progression/reducer.ts) `ReduceProgressionResult = { nextState, eventType, reason, didAdvanceSession, targetDecisions, outcomes }`.
- 결정 단위: [`reducer.ts:82-91`](../packages/core/src/progression/reducer.ts) `TargetDecision = { key?, target, progressionTarget?, outcome, eventType, reason, before, after }`.
- 미등록 `reason`은 eventType 기반 기본 문구로 폴백하도록 설계돼 있어([`feedback-catalog.ts:96`](../packages/core/src/progression/feedback-catalog.ts) `fallbackRow`) **새 reason이 추가돼도 표출이 깨지지 않는다.**
- 노이즈 정책까지 규정돼 있다: 블록 중간 성공 streak HOLD는 카드를 만들지 않고, REF5의 MAINTAIN은 표출한다.

### 2.2 실제 갭 — 누적 이력이 REF5 전용

- REF5: [`ref5-status.ts:120`](../packages/core/src/program-engine/ref5-status.ts) `recentChanges: state.progressionChanges.slice(-8)` → web [`ref5-status-panel.tsx:184`](../web/src/widgets/plans-manage-screen/ref5-status-panel.tsx) "최근 판정", TUI Programs 버퍼 `CHG` 섹션(5건 상한).
- 비-REF5: [`last-events.ts:21`](../packages/core/src/progression/last-events.ts) `readLastTargetEvents(planId)`가 최근 20 이벤트를 훑어 **target별 "마지막 변동" 하나씩만** Map으로 반환한다(`{ lastDeltaKg, lastEventType }`). 소비처는 [`apps/api/src/routes/plans/progression.ts:199`](../apps/api/src/routes/plans/progression.ts)·[:338](../apps/api/src/routes/plans/progression.ts) — **"현재 작업 무게 칩"의 델타 배지용**이고 이력 목록이 아니다.
- ⚠️ `/plans/history` 라우트는 **제거되어 `/calendar`로 리다이렉트**한다([`page.tsx`](../web/src/app/plans/history/page.tsx) 전문이 `redirect("/calendar")`). 로드맵·인벤토리가 "플랜 수행 이력 화면"으로 적은 것은 부정확하다.
- 즉 필요한 것은 **`plan_progress_event`를 최신순으로 읽어 카탈로그 문구로 렌더하는 목록**이다. 데이터·문구 조립은 이미 있으므로 조회 함수와 UI만 추가된다.

### 2.3 REF5는 데이터 계보가 다르다 (건드리지 말 것)

[`program-feedback-coverage.md`](../web/docs/program-feedback-coverage.md)의 경고: REF5 완료 리듀서는 판정을 `meta.targetDecisions`가 아니라 **`meta.changes`(`Ref5ProgressionChange[]`)**에 싣고, 공통 카탈로그 대신 `buildRef5ProgressReport`가 조립한다. 문서는 "새 패밀리를 추가할 때 판정이 어느 meta 필드에 실리는지 먼저 확인할 것 — 계보가 어긋나면 카탈로그 항목을 넣어도 카드가 빈 채로 만들어진다(REF5가 실제로 그 상태였다)"고 기록한다.

→ 이력 목록은 **두 계보를 모두 읽되 통합하지 않는다**(§7 결정 1).

### 2.4 주차 시뮬레이션의 재료는 이미 순수 함수다

[`generateSession.ts:2006-2029`](../packages/core/src/program-engine/generateSession.ts):
```ts
export type PreviewSessionInput = {
  planType: "SINGLE" | "COMPOSITE" | "MANUAL";
  planParams: unknown;
  runtimeState: unknown;
  rootVersion?: { definition: unknown; defaults?: unknown } | null;
  rootTemplateSlug?: string | null;
  modules?: Array<{ target, params, version, templateSlug? }>;
  week: number;
  day: number;   // (선언 순서상 week 다음)
};
export function previewSessionExercises(input: PreviewSessionInput): PlannedExercise[]
```
- **DB를 건드리지 않는 순수 함수**이고 `week`·`day`를 명시 지정할 수 있다 → N주 전개의 기반이 이미 있다.
- 내부 첫 동작이 [`mergePlanParamsWithRuntimeState(planParams, runtimeState)`](../packages/core/src/program-engine/generateSession.ts)이므로, **runtimeState를 복제해 반복 적용**하면 미래 주차를 시뮬레이션할 수 있다.
- 총 주차 수: DSL의 `schedule.weeks`([`program-dsl/schema.ts:91`](../packages/core/src/program-dsl/schema.ts) — `weeks`·`sessionsPerWeek` 모두 optional). 표시 문구 헬퍼는 [`program-store/model.ts:333`](../packages/core/src/program-store/model.ts) `cycleText`·[:338](../packages/core/src/program-store/model.ts) `cycleDetailText`.
- ⚠️ `weeks`가 optional이므로 **주차 수를 모르는 프로그램이 있다**(무한 LP 계열). 전개 상한을 UI가 정해야 한다(§7 결정 3).

## 3. 설계

### 3.1 판정 이력 목록 (M4-1 잔여)

**조회** — core에 신설 `packages/core/src/progression/event-history.ts`:
```ts
type JudgmentHistoryRow = {
  eventId: string; createdAt: string; eventType: string;
  programSlug: string; reason: string | null;
  rows: ProgressReportRow[];   // feedback-catalog가 조립한 target별 문구
};
async function readJudgmentHistory(planId: string, limit: number): Promise<JudgmentHistoryRow[]>;
```
- `plan_progress_event`를 `createdAt desc`로 읽고 각 이벤트를 **기존 `buildCatalogRow`/`buildRef5ProgressReport`에 그대로 통과**시킨다. 문구 로직을 복제하지 않는 것이 핵심이다.
- 노이즈 정책을 재사용한다 — 카드에서 생략하는 HOLD는 이력에서도 생략할지 §7 결정 2.
- REF5 이벤트는 `meta.changes` 계보라 조립 함수만 갈라지고 반환 타입은 같다.

**표시** — `/plans/manage` 플랜 상세 시트에 "판정 이력" 섹션. REF5 패널의 "최근 판정"([`ref5-status-panel.tsx:184`](../web/src/widgets/plans-manage-screen/ref5-status-panel.tsx))과 **같은 자리·같은 시각 언어**를 쓰고, REF5 플랜에서는 기존 패널이 그 역할을 계속한다.

### 3.2 주차 로드맵 전개 (M4-2)

**시뮬레이션** — `packages/core/src/program-engine/roadmap.ts` (신설, 순수):
```ts
type RoadmapWeek = { week: number; days: Array<{ day: number; exercises: PlannedExercise[] }> };
function simulateRoadmap(input: PreviewSessionInput & { weeks: number }): RoadmapWeek[];
```
- `previewSessionExercises`를 (week, day) 격자로 반복 호출한다. **runtimeState는 고정**(현 상태 유지 전개) — 판정 의존 진행을 시뮬레이션하지 않는다.
- 이 선택의 이유: 성공 가정 시뮬레이션은 사용자가 실제로 받을 무게와 어긋날 수 있고, 어긋난 미래를 보여주면 신뢰를 역으로 깎는다. **"현 상태 기준"이 정직한 계약**이다.
- 캐시하지 않는다(순수 계산, 입력이 곧 키).

**표시 2곳**
- `/program-store/detail`: 프로그램 시작 전 1RM/TM 입력값 기준 전개. 주차 아코디언(더보기 접힘)으로 긴 목록을 흡수한다.
- `/plans/manage`: 진행 중 플랜의 남은 주차. 현재 주차를 강조하고 그 이후를 전개한다.
- 두 화면 모두 캡션을 단다: **"현 상태 기준 처방이며, AMRAP·판정 결과에 따라 갱신됩니다."**
- 디로드·테스트 주차는 행에 배지(정의에서 판별 가능한 경우만).

## 4. 안전장치

- **G1. 1주차 일치** — `simulateRoadmap`의 (week=현재, day=다음)이 **실제 생성 세션과 바이트 동일**한지. 대표 3 family(GZCLP·5/3/1·Operator)로 확인한다. 어긋나면 시뮬레이션이 거짓말을 하는 것이다.
- **G2. 문구 복제 금지 확인** — 이력 목록이 `feedback-catalog`를 경유하는지. 새 문구 리터럴이 추가되지 않았음을 리뷰 체크리스트로 고정한다(커버리지 문서의 "클라이언트별 문구 복제 금지" 원칙).
- **G3. 두 계보 렌더** — REF5 플랜과 비-REF5 플랜 양쪽에서 이력이 채워지는지. REF5는 `meta.changes`, 나머지는 `meta.targetDecisions`.
- **G4. 주차 미정 프로그램** — `schedule.weeks`가 없는 프로그램에서 전개가 무한 루프에 빠지지 않고 상한에서 멈추는지.
- **G5. 렌더 검증** — Playwright로 아코디언을 실제로 열어 확인, 14종 테마.

## 5. PR 분해 (4개)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **0** | `docs: 판정 근거 표출을 종결 처리한다` | 로드맵 M4-1을 "이미 완료"로 정정하고 근거를 기록. 코드 변경 없음. **이 문서 자체가 산출물**. | 없 | — |
| **1** | `feat(plans): 판정 이력을 전 프로그램에서 본다` | core `readJudgmentHistory` + API + `/plans/manage` 섹션. 문구는 기존 카탈로그 경유. | 낮 | G2·G3 |
| **2** | `feat(program): 주차 로드맵을 시뮬레이션한다` | core `simulateRoadmap` 순수 함수 + 유닛. UI 없음. | 중 | G1·G4 |
| **3** | `feat(program-store): 전체 주차 처방을 미리 본다` | 상세·플랜 화면 주차 아코디언 + 계약 캡션 + 디로드 배지 | 낮 | G5, `lint:design`, `test:theme` |

**순서**: PR0 → PR1은 독립. PR2 → PR3은 순서 고정(시뮬레이션 없이 UI 불가).

**TUI**: PR1의 이력은 Programs 버퍼에 REF5 `CHG` 섹션이 이미 있으므로 **같은 자리를 비-REF5로 확장**(스키마 무변경, API 응답 확장이라 동시). PR3의 주차 전개는 세로 공간 제약이 커서 **후행 판단** — M4 말미 슬롯.

## 6. 리스크 / 하지 말 것

1. **판정 근거 문구를 새로 만들지 말 것.** `feedback-catalog.ts`가 단일 진실원이고 web·TUI가 같은 payload를 쓴다. 클라이언트에 문구 리터럴을 추가하면 이중 유지보수가 시작된다.
2. **REF5 계보를 공통 모델로 통합하지 말 것**(§2.3). 커버리지 문서가 "계보가 어긋나면 카드가 빈 채로 만들어진다(REF5가 실제로 그 상태였다)"고 실패 이력을 남겼다.
3. **미래 주차를 "성공 가정"으로 시뮬레이션하지 말 것** — 실제 받을 무게와 어긋나면 신뢰를 깎는다. 현 상태 고정 전개 + 명시 캡션이 정직한 계약이다.
4. **`schedule.weeks`가 있다고 가정하지 말 것** — optional이며 무한 LP 계열은 없다. 상한 없는 루프는 곧 브라우저 정지다.
5. **이력에 노이즈 HOLD를 그대로 쏟지 말 것** — 카드의 노이즈 정책을 이력에도 적용하지 않으면 블록 중간 streak HOLD가 목록을 가득 채운다.
6. **`readLastTargetEvents`를 이력 조회로 재사용하지 말 것** — target별 마지막 변동 하나씩만 주는 Map이고 용도가 칩 배지다. 이력은 이벤트 단위 조회가 필요하다.
7. **`/plans/history` 라우트를 되살리지 말 것** — 의도적으로 제거돼 `/calendar`로 리다이렉트한다. 이력은 플랜 상세 시트 안에 둔다.

## 7. 결정 사항

1. **REF5와 공통 계보를 통합할 것인가** → **하지 않는다.** 조립 함수만 분기하고 반환 타입을 맞춘다. 통합 이득이 위험보다 작다(§2.3의 실패 이력).
2. **이력에 노이즈 HOLD를 포함할 것인가** → **카드와 같은 정책을 적용한다**(생략). 다만 "전체 보기" 토글로 원본 이벤트를 볼 수 있게 남긴다 — 디버깅과 신뢰 양쪽에 쓸모가 있다.
3. **주차 수를 모르는 프로그램의 전개 상한** → **12주.** 대부분의 블록 프로그램이 12주 이내이고(Rippler·J&T 2.0이 12주), 무한 LP는 12주면 사용자가 패턴을 파악하기 충분하다. 상한 도달 시 "이후 주차는 같은 규칙이 반복됩니다" 문구를 단다.
4. **판정 이력의 표시 개수** → 최근 20건 + 더보기. REF5 `recentChanges`가 8건인 것은 엔진 상태에 저장되는 제약 때문이고, DB 조회에는 그 제약이 없다.
5. **M4-1 종결을 어떻게 남길 것인가** → **이 문서 §0**과 로드맵 §5의 교정 블록. 착수했다가 "이미 있네"를 반복하지 않도록 근거(파일·줄·테스트)를 함께 기록한다.
