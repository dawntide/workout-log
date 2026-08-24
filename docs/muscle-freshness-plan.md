# 근육 신선도 시각화 계획 (M5)

> 상태: **계획 확정, 미착수** (2026-08-19). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §7.
> **선행 조건**: [`exercise-catalog-plan.md`](exercise-catalog-plan.md)(M3)의 근육 매핑 커버리지 ≥ 90%. 확충된 종목이 `Other`로 떨어지면 신선도 표시가 의미를 잃는다.
> **순서 의존**: [`set-type-plan.md`](set-type-plan.md)(M1-3)이 먼저 가야 한다 — 웜업 세트가 볼륨에서 빠진 뒤에 계산해야 이중 왜곡이 없다.
>
> **유령 확인 결과** (2026-08-19): 신선도·회복 추정 코드는 **없다**(`freshness|heatmap` grep 0건 — `recovery` 히트는 전부 Texas Method의 **회복일**이라 무관). 다만 **재사용할 자산이 둘 있다**: 근육군 매핑([`category-to-muscle.ts`](../packages/core/src/muscle-groups/category-to-muscle.ts))과 **막대형 히트맵 컴포넌트**([`home-goal-section.tsx:85`](../web/src/widgets/goal-aware/home-goal-section.tsx) `MuscleVolumeHeatmap`).

## 1. 문제와 목표

Fitbod는 근육군별 신선도(0~100%)를 히트맵으로 보여주고 운동 옆에 "triceps 91% fresh"를 병기한다. 이것은 **"오늘 뭘 해야 하나"에 답하는 유일한 시각화**이고, 우리에게는 없다.

우리는 재료를 이미 갖고 있다 — 근육군 9종 매핑과 세션별 볼륨 집계. 없는 것은 **시간 감쇠 모델**과 그 표시다.

**목표**
1. 근육군별 신선도를 결정론 모델로 추정한다.
2. 홈/통계에서 부위별 신선도를 한눈에 본다.
3. 모델 파라미터를 사용자가 열람·조정할 수 있다 — **"왜 이 숫자인가"를 설명하는 것이 우리 정체성**이다.

**비목표**
- ML·개인화 학습 — 결정론 유지(로드맵 §1). Fitbod의 ML 회복 모델을 흉내내지 않는다.
- HRV·수면 연동 — 네이티브/웨어러블 영역.
- 신체 지도(body map) SVG — 1차 제외(§7 결정 2).
- 신선도를 **처방에 반영** — 표시 전용이다. 진행 엔진은 결정론을 유지한다.

**성공 기준**: 어제 다리를 했으면 Quad 신선도가 낮게, 2주 쉰 부위는 100%로 표시되고, 그 계산 근거를 화면에서 확인할 수 있다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 근육군 매핑 — 9종 + 2단 폴백

[`muscle-groups/category-to-muscle.ts`](../packages/core/src/muscle-groups/category-to-muscle.ts):
- `MuscleGroup`([:1-10](../packages/core/src/muscle-groups/category-to-muscle.ts)): Quad·Hamstring·Glute·Back·Chest·Shoulder·Arm·Core·**Other**
- `resolveMuscleContribution(exerciseName, category)`([:116-131](../packages/core/src/muscle-groups/category-to-muscle.ts)): 이름 정확 매칭(`EXERCISE_CONTRIBUTIONS`) → 카테고리 매핑(`CATEGORY_PRIMARY`) → `{ Other: 1.0 }`
- `MuscleContribution = Partial<Record<MuscleGroup, number>>` — **가중치 분배**가 이미 모델링돼 있다(한 운동이 여러 부위에 기여).

### 2.2 볼륨 집계 — 신선도의 입력

[`muscle-volume-aggregate.ts`](../packages/core/src/stats/muscle-volume-aggregate.ts):
- 입력 `MuscleVolumeInputRow = { weekStart, exerciseName, category, weightKg, reps, meta }`([:22-29](../packages/core/src/stats/muscle-volume-aggregate.ts))
- ⚠️ **주 단위(`weekStart`)로 버킷된다** — 신선도는 **일 단위 경과 시간**이 필요하므로 이 집계를 그대로 쓸 수 없다. 별도 조회가 필요하다(§3.2).
- 서비스 [`muscle-volume-service.ts:20`](../packages/core/src/stats/muscle-volume-service.ts) `fetchMuscleVolume({ userId, from, to, rangeDays })` → `MuscleVolumeResult { from, to, rangeDays, weekly, totals }`, `getStatsCache`/`setStatsCache` 사용.

### 2.3 재사용할 표시 컴포넌트

[`home-goal-section.tsx:85`](../web/src/widgets/goal-aware/home-goal-section.tsx) `MuscleVolumeHeatmap`:
- `goal === "hypertrophy"`일 때만 홈에 렌더된다([:53-54](../web/src/widgets/goal-aware/home-goal-section.tsx)).
- 구조: `V2Card` + `GoalCardHeader` + **부위별 가로 막대**(`widthPct = max(4, round(tonnage/max*100))`) + 빈 상태 문구. `MUSCLE_GROUP_LABEL_KO`/`_EN` 라벨 맵 사용.
- **이름은 "Heatmap"이지만 실제로는 막대 리스트**다 — 신선도 게이지도 같은 형태가 자연스럽고(§7 결정 2), 라벨·빈 상태·로케일 처리를 그대로 재사용할 수 있다.

## 3. 설계

### 3.1 모델 — 파라미터 공개형 결정론 감쇠

```
freshness(group, now) = clamp01( 1 - Σ_sessions  load_share(group, s) / capacity(group) × decay(now - s.performedAt) )
decay(Δt) = max(0, 1 - Δt / recoveryHours(group))
```
- `load_share`: 세션의 각 세트를 `resolveMuscleContribution`으로 부위별 분배한 톤수 합.
- `capacity`: 부위별 기준 부하. **최근 8주 해당 부위 주간 평균 볼륨**을 기준으로 정규화한다(절대 톤수는 사람마다 달라 무의미).
- `recoveryHours`: 기본 **144시간(6일)** — Fitbod의 공개 파라미터를 초기값으로 삼되 **설정에서 조정 가능**하게 한다.
- 전부 순수 함수: `packages/core/src/stats/muscle-freshness.ts` (신설).

**우리다움**: 모델 식과 파라미터를 UI에서 열람할 수 있게 한다. Fitbod·SHRED가 "추천 근거를 설명하지 않는다"고 비판받는 지점([`judgment-history-and-roadmap-plan.md`](judgment-history-and-roadmap-plan.md) §0의 시장 관찰과 같은 논리)을 정면으로 뒤집는다.

### 3.2 데이터 조회

`fetchMuscleFreshness({ userId, now, lookbackDays })`:
- `workout_set` × `workout_log`을 **일 단위**로 조회한다(주 버킷이 아님, §2.2 주의).
- ⚠️ **웜업 제외**(M1-3 선행) — 웜업이 섞이면 신선도가 과소평가된다.
- `resolveLoggedTotalLoadKg`로 자중 종목 총부하를 환산한다(기존 관례).
- `lookbackDays`는 `recoveryHours` 최댓값 + 여유(기본 14일)면 충분하다.
- 캐시: `stats_cache` metric `"muscle_freshness_v1"`. **단 신선도는 시간 함수라 캐시 TTL이 짧아야 한다** — 조회 결과(원시 부하 목록)를 캐시하고 **감쇠 계산은 매번** 하는 편이 옳다(§7 결정 3).

### 3.3 표시

- **위치**: 홈 Today 덱 또는 통계 덱. `MuscleVolumeHeatmap`과 **같은 카드 패턴**의 게이지 리스트(부위명 + 막대 + %).
- **색**: 신선(≥70%) `--v2-c-success` / 보통(30~70%) `--v2-c-warning` / 피로(<30%) `--v2-c-danger`. 시맨틱 색이라 액센트와 별개다.
- **근거 열람**: 카드 헤더의 아이콘 → 시트에 모델 식·파라미터·부위별 최근 기여 세션 목록. 여기서 `recoveryHours`를 조정한다.
- 운동 카드 옆 신선도 배지는 **1차 제외** — 로깅 화면이 이미 조밀하고(M1-1·M1-2가 같은 영역을 쓴다) 정보 과밀 위험이 크다.

## 4. 안전장치

- **G1. 감쇠 모델 유닛** — 경계: 기록 0건(전 부위 100%), 당일 고볼륨(하한), `recoveryHours` 경과 직후(정확히 100%), 미래 시각 입력, 음수 방지.
- **G2. 웜업 제외 확인**(M1-3 이후) — 웜업 세트가 신선도를 낮추지 않는지.
- **G3. `Other` 비율 리포트** — 신선도 계산에 들어간 세트 중 `Other`로 분류된 비율. **10%를 넘으면 M3 매핑을 먼저 보강**한다(선행 조건 검증).
- **G4. 시간 의존 테스트** — `now`를 주입 가능한 인자로 두고 고정 시각으로 단언한다. `Date.now()` 직접 호출 금지(M1-1과 같은 원칙).
- **G5. 렌더·테마** — Playwright 확인 + `test:a11y:contrast`(신선/보통/피로 3색이 14종 테마에서 구분되는지).

## 5. PR 분해 (3개, 순서 고정)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `feat(core): 근육 신선도 추정 모델을 추가한다` | `muscle-freshness.ts` 순수 함수 + 일 단위 조회 + 유닛. UI 없음. | 중 | G1·G4 |
| **2** | `feat(stats): 부위별 신선도를 표시한다` | 게이지 리스트(`MuscleVolumeHeatmap` 패턴) + 3색 시맨틱 + 빈 상태 | 낮 | G3·G5, `lint:design` |
| **3** | `feat(stats): 신선도 계산 근거를 연다` | 근거 시트(모델 식·파라미터·기여 세션) + `recoveryHours` 설정 | 낮 | `test:settings:policy` |

**TUI**: 순수 UI라 **후행** — M5 말미 슬롯에서 stats 버퍼에 텍스트 게이지 추가를 판단한다(`theme.Blocks`가 미사용 상태로 예약돼 있다).

## 6. 리스크 / 하지 말 것

1. **주 단위 볼륨 집계를 재사용하지 말 것** — `MuscleVolumeInputRow`는 `weekStart` 버킷이라 일 단위 경과 시간을 못 준다. 별도 조회가 필요하다.
2. **M1-3(세트 타입) 없이 착수하지 말 것** — 웜업이 섞이면 신선도가 과소평가되고, 나중에 고치면 사용자가 본 수치가 바뀐다.
3. **M3 매핑 커버리지를 확인하지 않고 착수하지 말 것** — 확충 종목이 `Other`로 몰리면 부위별 신선도가 거짓말을 한다(G3).
4. **감쇠 결과를 캐시하지 말 것** — 시간 함수라 캐시가 곧 거짓이 된다. 원시 부하만 캐시하고 감쇠는 매번 계산한다.
5. **처방에 반영하지 말 것** — 표시 전용이다. 진행 엔진에 신선도를 넣으면 결정론이 깨지고 "왜 이 무게인지"를 설명할 수 없게 된다.
6. **신체 지도 SVG를 1차에 넣지 말 것** — custom SVG는 디자인 규칙상 지양이고, 게이지 리스트가 터미널 미학과도 정합한다.
7. **`Date.now()`를 함수 내부에서 부르지 말 것** — 테스트가 불가능해진다.

## 7. 결정 사항

1. **`recoveryHours` 기본값** → **144시간(6일)**. Fitbod의 공개 파라미터를 초기값으로 삼고 설정에서 조정 가능하게 한다. 근거를 UI에 명시한다.
2. **게이지 리스트 vs 신체 지도** → **게이지 리스트**. `MuscleVolumeHeatmap`이 이미 같은 형태이고, custom SVG 지양 규칙·터미널 미학과 정합한다. 지도는 후속 검토.
3. **캐시 전략** → 원시 부하 조회만 `stats_cache`(`muscle_freshness_v1`), 감쇠 계산은 요청마다. TTL은 짧게.
4. **운동 카드 신선도 배지** → 1차 제외. M1-1·M1-2가 같은 영역을 쓰므로 정보 과밀을 피한다.
5. **`Other` 부위 표시** → 목록에서 숨기되 근거 시트에는 노출한다. 사용자가 매핑 공백을 인지할 수 있어야 한다.
