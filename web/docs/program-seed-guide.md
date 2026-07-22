# 프로그램 Seed 가이드

> `program-seed-canonical-research.md` + `program-seed-validation-and-test.md` 통합본
> 최종 업데이트: 2026-03-04

---

## 목차

1. [채택 프로그램 목록](#1-채택-프로그램-목록)
2. [제외 항목](#2-제외-항목)
3. [구현 원칙](#3-구현-원칙)
4. [Seed 실행 명령](#4-seed-실행-명령)
5. [구현 내용](#5-구현-내용)
6. [수동 검증 체크리스트](#6-수동-검증-체크리스트)
7. [알려진 이슈](#7-알려진-이슈)

---

## 1. 채택 프로그램 목록

| # | 프로그램 | 타입 | 성격 |
|---|----------|------|------|
| 1 | Tactical Barbell Operator | LOGIC | 로직 검증용, 6주 파형(70/80/90/75/85/95) |
| 2 | Starting Strength LP | MANUAL | 초급 선형 증량, A/B 로테이션 |
| 3 | StrongLifts 5x5 | MANUAL | 초급 선형 증량, A/B 5x5 |
| 4 | Texas Method | MANUAL | 주간 강도 변화 (Volume/Recovery/Intensity) |
| 5 | GZCLP | MANUAL | Tier 구조 (T1/T2/T3), AMRAP 성격 |
| 6 | Greyskull LP | MANUAL | A/B 구조, 마지막 세트 AMRAP 5+ |
| 7 | Madcow 5x5 | MANUAL | 주간 램프(퍼센트 파생), 금요일 PR 트리플 |
| 8 | nSuns LP (5-Day) | MANUAL | %TM 고볼륨(T1 9세트 + T2 8세트), AMRAP 구간 증량 |
| 9 | Reddit PPL (6-Day) | MANUAL | 근비대 편향 6일 PPL, 메인만 LP + 보조 다수 |
| 10 | PHUL | MANUAL | 4일 상·하체 파워/근비대 분할, 파워데이만 LP |
| 11 | Tactical Barbell Fighter | LOGIC | 주 2일, 매 세션 4대 리프트 (Operator 파형 공유) |
| 12 | Tactical Barbell Zulu | LOGIC | 주 4일 A/B 교대, 전 종목 주 2회 (Operator 파형 공유) |

**선정 이유 요약**

| 성격 | 프로그램 |
|------|----------|
| LOGIC 템플릿 검증 | Tactical Barbell Operator |
| 초급 선형 증량형 | Starting Strength LP, StrongLifts 5x5 |
| 주간 강도 변화형 | Texas Method |
| Tier/Top-set 검증 | GZCLP |
| AMRAP 성격 검증 | Greyskull LP, GZCLP |

### 프로그램별 canonical 규칙 출처

| 프로그램 | 채택 규칙 요약 | 출처 |
|----------|---------------|------|
| Tactical Barbell Operator | 6주 파형, submax TM 기반, 3일 고빈도 | boostcamp.app, liftosaur.com |
| Starting Strength LP | A/B 로테이션, Squat 3x5, Press/Bench 교차, Deadlift 1x5 | startingstrength.com, outlift.com |
| StrongLifts 5x5 | A/B 로테이션, 주운동 5x5, B-day Deadlift 1x5 | stronglifts.com |
| Texas Method | Volume/Recovery/Intensity 3일, Intensity day top set 중심 | startingstrength.com, setforset.com |
| GZCLP | T1 저반복/고강도, T3 고반복 + AMRAP | boostcamp.app, liftosaur.com |
| Greyskull LP | 2x5 후 마지막 세트 5+ AMRAP, Deadlift 단일 고반복 | boostcamp.app, liftvault.com |
| Madcow 5x5 | 12.5% 간격 램프 → 5회 탑세트, 금 1×3 @102.5% + 백오프 1×8 @75%, 2주 연속 실패 시 ×0.9 | stronglifts.com, liftvault.com, powerliftingtowin.com |
| nSuns LP | TM=1RM×90%, T1 75/85/95 + 백오프 90→65, T2 50/60/70, 95% AMRAP reps로 TM 증량 | liftosaur.com, liftvault.com, thefitness.wiki |
| Reddit PPL | 6일 PPL×2, 메인 5회(마지막 5+), 세션당 데드 10lb·나머지 5lb, 3연속 실패 시 -10% | liftosaur.com, liftvault.com, thefitness.wiki |
| PHUL | 4일(상·하체 × 파워·근비대), 파워 3~5회·근비대 8~12회, 레인지 상단 달성 시 증량 | liftosaur.com, muscleandstrength.com |
| TB Fighter | 주 2일, 매 세션 스쿼트·벤치·오버헤드·데드 전부, 6주 파형·블록 증량은 Operator와 동일 | fitfrek.com, liftvault.com |
| TB Zulu | 주 4일 A/B 교대, 전 종목 주 2회(Operator보다 데드·오버헤드 빈도↑) | fitfrek.com, liftvault.com |

---

## 2. 제외 항목

- 코치/개인별 세부 증량 규칙 (실패 시 리셋 규칙의 세부 분기)
  - ⚠️ 단, gzclp/texas/greyskull은 신규 플랜에 한해 정석 모델(`progressionModel:"v2"`)로 실패·리셋 분기를 구현함 — 아래 §5-5 참조. 기존 플랜은 플래그 부재로 단순 LP 유지(forward-only).
- 보조운동 대규모 템플릿
- 책/유료 자료에만 있는 상세 변형
- `%TM` 기반 5/3/1 계열 (legacy `531`, `candito-linear` 제거됨)
- 프로그램 엔진 신규 kind 추가

---

## 3. 구현 원칙

- 엔진 재작성 없이 기존 `LOGIC + MANUAL` 체계 사용
- rule 다양성은 manual session의 `note/percent`로 표현
- AMRAP/top set/back-off 성격은 `set.note` 기반으로 UI에서 표시

### 핵심 파라미터 (샘플 테스트 데이터)

```
sessionKeyMode: "DATE"       // 날짜 재진입 테스트 용이
startDate:      "2026-01-05"
```

**Operator TM 설정**:
- `TM = 90% 1RM` 기반 6주 파형 (70/80/90/75/85/95)
- `SQUAT/BENCH/DEADLIFT/PULL` TM 입력 지원
- `D1/D2 = Squat+Bench+Pull-Up`, `D3 = Squat+Bench+Deadlift`
- 기본 `mainSets=3`, `deadliftSets=3`

**Auto-progression 적용 대상 (기본 ON)**:
- Program Tactical Barbell Operator
- Program Greyskull LP

---

## 4. Seed 실행 명령

```bash
# 기본 seed (템플릿 + 운동 카탈로그)
pnpm db:seed

# 검증용 샘플 플랜까지 포함
pnpm db:seed:demo-plans

# 레거시 정리 후 전체 초기화 + seed
WORKOUT_SEED_RESET_ALL=1 pnpm db:seed

# 샘플 플랜까지 전체 초기화 + seed
WORKOUT_SEED_RESET_ALL=1 pnpm db:seed:demo-plans

# 검증 스크립트 실행
pnpm db:verify:programs
```

**정리되는 레거시 템플릿** (seed 시 자동):
- `starter-fullbody-3day`
- `531`
- `candito-linear`

---

## 5. 구현 내용

### 5-1. 프로그램 데이터

**신규 LOGIC 템플릿**: `operator`, `tb-fighter`, `tb-zulu`

**신규 MANUAL 템플릿**:
1. `starting-strength-lp`
2. `stronglifts-5x5`
3. `texas-method`
4. `gzclp`
5. `greyskull-lp`
6. `madcow-5x5`
7. `nsuns-lp-5day`
8. `reddit-ppl-6day`
9. `phul`

**검증용 플랜** (유저: `dev`):
1. Program Tactical Barbell Operator
2. Program Starting Strength LP
3. Program StrongLifts 5x5
4. Program Texas Method
5. Program GZCLP
6. Program Greyskull LP

### 5-2. 운동 종목 보완

추가:
- `Power Clean`
- `Front Squat`
- `Sumo Deadlift` (nSuns D2 T2)
- `Close-Grip Bench Press` (nSuns D5 T2)
- PPL·PHUL 보조 15종: `Seated Row` `Dumbbell Row` `Face Pull` `Lateral Raise` `Bicep Curl` `Hammer Curl`
  `Triceps Pushdown` `Triceps Extension` `Skullcrusher` `Chest Fly` `Incline Dumbbell Bench Press`
  `Leg Curl` `Leg Extension` `Calf Raise` `Lunge`
  (근육군 기여도는 [`category-to-muscle.ts`](../../packages/core/src/muscle-groups/category-to-muscle.ts)에 이미 정의돼 있어 추가 매핑 불필요)

별칭 보강:
- `Overhead Press` → `Press` alias 추가

### 5-3. UI 최소 수정 (처방 표시)

**수정 파일**:
- `src/app/workout/today/log/page.tsx`
- `src/app/workout/session/[logId]/page.tsx`

**수정 내용**:
- planned set의 `percent/note`를 행 UI와 비교표에 표시
- AMRAP/top set/T1~T3 성격을 `set.note`로 노출

### 5-4. 기록 수정 API 추가

**파일**: `src/app/api/logs/[logId]/route.ts`

**추가**:
- `PATCH /api/logs/[logId]` — 소유권 검증 후 세트 교체 (삭제 후 재삽입)
- stats cache 무효화 유지

### 5-5. Auto-progression (Stage 1)

**신규 테이블**:
- `plan_runtime_state` (플랜별 누적 상태)
- `plan_progress_event` (로그 기반 진행 이벤트)

**신규 파일**:
- `src/server/progression/reducer.ts` — 순수 규칙 계산
- `src/server/progression/autoProgression.ts` — DB 반영 + PATCH replay
- `src/server/program-engine/generateSession.ts` — runtime state 오버레이

**기본 정책**:
- Operator: 블록 내 증량 없이 3일 완료 시 day/week/cycle 전진, 6주 블록 완료 후 증량(상체 +2.5kg/하체 +5kg). 정체 재구축 리셋폭 ×0.9(TB 공식 90%).
- Greyskull: 성공 시 선형 증량, 실패 누적 시 reset
- `PATCH /api/logs/[logId]` 시 해당 로그 이벤트 재계산 + 이후 이벤트 순차 replay

**정석 모델(v2, 신규 플랜 기본 적용 · forward-only)** — `progressionModel:"v2"`:
- gzclp: T1/T2 실패 시 무게 유지 + rep 스킴 강등(T1 5×3→6×2→10×1, T2 3×10→3×8→3×6), 마지막 stage 소진 후 실패에만 ×0.85 리셋. T3는 마지막 AMRAP ≥25 시 증량. 하체 증량 +5kg/상체 +2.5kg.
- texas: I(강도일)만 reducer 도달 — 성공 시 주 1회 즉시 증량, 3연속 실패 시 ×0.9 리셋. V/R 무게는 I×0.9/0.8 파생.
- greyskull: 메인 리프트 마지막 세트 AMRAP(5+) 자기조절 — 실측 reps ≥10이면 더블 프로그레션(증량 2배), ≥5 단일 증량, <5(실패) 2연속 시 ×0.9 디로드(Phrak's). uniform LP라 plannedRef 미주입 → 처방이 마지막 메인 세트에 `amrap:true`를 주입해 reducer가 `meta.amrap` 실측 reps로 판정.

### 5-5b. 퍼센트 파생 슬롯 (madcow / nsuns)

기존 slotted-lp(gzclp/texas)는 슬롯 하나의 workKg를 **전 세트에 그대로** 적용한다. Madcow의 램프와
nSuns의 %TM 처방은 그럴 수 없어서, 두 family만 세트의 `percent`를 곱해 무게를 파생한다
(`usesPercentDerivedSets` — [`program-registry.ts`](../../packages/core/src/program-store/program-registry.ts)).
gzclp/texas는 이 목록에 없으므로 percent를 계속 무시한다(회귀 테스트로 고정).

**슬롯 키는 요일이 아니라 운동별**(`exerciseSlotKey` → `EX_BENCH_PRESS`)이다. 한 리프트의 기준
무게(주간 탑세트 / TM)를 여러 요일이 공유해야 하기 때문이다. 대신 같은 키를 여러 세션이 읽으므로,
진행 판정은 **`slot.driver === true`인 슬롯 하나만** 맡고 나머지 행은 `skipProgression`으로 reducer에서
빠진다(texas V/R과 같은 전략). 이 분리가 없으면 월·수·금이 각각 증량시켜 주 3회 오른다.

기준 무게 해석 순서는 처방과 reducer가 동일해야 한다 — **슬롯 키 → family 키(SQUAT/BENCH/…) →
슬롯 `startWeightKg`**. 시작 화면은 1RM을 family 키로도 저장하므로, 슬롯 키만 조회하면 첫 세션이
유저 입력 대신 seed 데모 무게로 처방된다.

**원전 대비 의도적 각색** (앱 그리드·엔진 정합성):

| 프로그램 | 원전 | 앱 채택 | 이유 |
|----------|------|---------|------|
| Madcow | 탑세트 주 2.5% | **주 +2.5kg 고정** | 2.5kg 그리드에서 퍼센트 누적은 경량 리프트가 반올림에 흡수돼 영구 정체(45×1.025=46.1→45). 회귀 테스트로 고정 |
| Madcow | 5RM에 4주차 도달하도록 역산 | `defaults.tmPercent = 0.8` | 5RM≈1RM×0.87에서 3주 러너웨이(×0.925) |
| nSuns | AMRAP reps별 +5~15lb **범위** | +0 / +2.5 / +5 / +7.5kg **고정** | 결정론적 자동 진행에 범위 처방은 쓸 수 없음 |
| nSuns | T1 마지막 백오프도 "5+/3+" | **95% 세트만** amrap 표시 | reducer는 amrap 세트의 마지막 실측값을 읽어, 둘 다 표시하면 65% 세트가 판정을 덮어씀 |
| nSuns | 벤치 T1이 D1·D5 2회 | D5(5/3/1 데이)만 driver | 한 TM을 두 날이 굴리면 주 2회 증량 |
| 둘 다 | — | 1RM을 **운동별**로 입력 | family로 뭉치면 Front Squat이 백스쿼트 TM을, Close-Grip이 벤치 TM을 물려받아 보조가 과중량 |

### 5-5c. 보조 운동이 많은 프로그램 (PPL / PHUL)

두 프로그램은 세션당 메인 1~3개 + 보조 4~7개 구성이라, 기존 uniform LP 계열(SS/StrongLifts/
Greyskull)의 전제 — "세션의 모든 행이 메인" — 가 깨진다. 보조를 그냥 두면 두 곳에서 샌다.

1. **진행 판정 오염**: reducer는 `plannedRef`에 진행 키가 없으면 **운동명으로 family를 되짚는다**
   (`progressionIdentityForSet`). 그래서 `Seated Row`가 `Barbell Row`(PULL) 판정에, `Incline
   Dumbbell Bench Press`가 `Bench Press`(BENCH) 판정에 섞인다.
2. **무게 오버라이드 오염**: `applyManualRuntimeWeightOverrides`(family-target)도 운동명으로
   family를 찾아 덮어쓴다. `Romanian Deadlift`가 데드리프트 작업중량을 그대로 받는다.

그래서 처방 플래너가 **`role: "ASSIST"` 행에 `skipProgression`을 붙이고**, 오버라이드는
`skipProgression` 행을 건너뛴다. 시드는 메인만 `role: "MAIN"`으로 두면 된다.

PHUL의 근비대일(UH/LH)은 **전 행을 ASSIST**로 둔다. `Incline Bench Press`(BENCH)·`Front
Squat`(SQUAT)이 파워데이와 같은 family로 잡혀 한 주에 두 번 증량시키기 때문이다.

**원전 대비 각색**:

| 프로그램 | 원전 | 앱 채택 | 이유 |
|----------|------|---------|------|
| PHUL | 파워 3~5회 레인지 안에서 반복 늘리다 상단 달성 시 +중량 | 처방을 **상단(5회) 고정** | 엔진이 중량만 추적한다. 상단을 처방해야 "전 세트 상단 달성=증량"이 double progression의 중량 스텝과 일치. 하단(3회)을 처방하면 3회만 해도 매 세션 증량된다 |
| 둘 다 | 보조도 double progression(8→12회 후 +5lb) | **보조 자동 진행 없음** | 중량만 추적하는 엔진에서 보조를 LP에 태우면 레터럴 레이즈가 세션마다 +2.5kg이 된다. 보조 무게는 유저가 직전 기록을 보고 조정 |

### 5-5d. Tactical Barbell variant (Operator / Fighter / Zulu)

세 템플릿은 **같은 `kind: "operator"` 엔진**을 쓴다. 6주 파형(70/80/90/75/85/95)과 블록 완주 시
증량(상체 +2.5kg / 하체 +5kg), 정체 시 ×0.9 재구축이 모두 동일하고, **차이는 주당 세션 수와
세션별 리프트 구성뿐**이다. 그래서 프로그램을 늘리지 않고 정의에 `variant`만 둔다.

| variant | 주당 | 세션 구성 |
|---------|------|-----------|
| `operator`(기본) | 3일 | D1·D2 스쿼트·벤치·풀업 / D3 스쿼트·벤치·데드 |
| `fighter` | 2일 | 매 세션 스쿼트·벤치·오버헤드·데드 |
| `zulu` | 4일 | A(스쿼트·벤치·풀업) / B(데드·오버헤드) 교대 — 전 종목 주 2회 |

클러스터 테이블은 [`tactical-barbell-blueprint.ts`](../../packages/core/src/program-store/tactical-barbell-blueprint.ts)
단일 진실원에 있다. 처방(program-engine)과 스토어 draft(program-store)가 함께 읽어야 하므로
lib 쪽에 두었다 — model이 program-engine을 import하면 레이어 방향이 뒤집힌다.

**주당 세션 수가 두 곳에 필요하다.** 처방은 정의의 `variant`로 알 수 있지만, reducer는 프로그램
정의를 보지 못한다(블록 완주 판정 `week === 6 && day === N`과 요일 롤오버에 N이 필요). 그래서
정의의 `schedule.sessionsPerWeek`가 프로그램 시작 시 `planParams.sessionsPerWeek`로 흘러가고
reducer는 그 값을 읽는다. **미설정이면 3** — 기존 Operator 플랜은 이 필드가 없어도 동작이 그대로다
(회귀 테스트로 고정).

세션 키는 Zulu도 `D1..D4`를 쓴다. A/B 교대 구성은 클러스터가 이미 담고 있고, 키를 `A,B,A,B`로
두면 중복이라 fork 후 세션 조회(`pickManualSession`)가 두 번째 A/B를 못 집는다.

### 5-5e. fork 시 세트별 구조 보존

커스터마이즈는 **정의 → draft → 정의**로 왕복한다(`inferSessionDraftsFromTemplate` →
편집기 → `toManualDefinition`). draft는 원래 운동당 `(세트 수, reps)` 두 숫자만 들고 있어서,
세트마다 퍼센트가 다른 퍼센트 파생 프로그램은 이 왕복에서 램프가 균일 세트로 뭉개졌다
(Madcow 50/62.5/75/87.5/100% → 전부 같은 무게, nSuns 95% AMRAP 판정 세트 소실).

`ProgramExerciseDraft.setRows`(세트별 `reps`·`percent`·`note`·`amrap`)를 추가해 왕복에서
보존한다. 채우는 대상은 **`usesPercentDerivedSets` family뿐** — gzclp/texas는 세트가 균일해
두 숫자만으로 왕복이 되므로 `setRows`가 `null`이고 기존 동작 그대로다(회귀 테스트로 고정).

**사용자 편집과의 충돌 처리**: 편집기는 운동당 세트 수와 reps만 노출하므로, 사용자가 그 값을
바꿨는지는 보존해 둔 행과 비교해서만 알 수 있다. `toManualDefinition`은 **세트 수가 다르거나
reps가 첫 행과 다르면** 세트별 구조를 버리고 균일 처방으로 되돌린다 — 사용자의 편집이 조용히
무시되는 것보다 낫다는 판단이다. 손대지 않으면 원본과 **완전히 같은 퍼센트**로 처방된다.

### 5-6. 자동 진행 UX

**신규 파일**:
- `src/lib/progression/summary.ts` — 자동 진행 요약/라벨 공통 포맷
- `src/server/progression/summary.ts` — 진행 이벤트 응답 payload 변환

**수정 파일**:
- `src/app/api/logs/route.ts` + `src/app/api/logs/[logId]/route.ts` — `progression` 응답 포함
- `src/app/workout/today/log/page.tsx` — 저장 직후 자동 진행 요약 표시
- `src/app/workout/session/[logId]/page.tsx` — 세션 상세에서 이벤트/타겟 결정 표시
- `src/app/api/plans/[planId]/route.ts` + `src/app/plans/manage/page.tsx` — `autoProgression` ON/OFF 토글

---

## 6. 수동 검증 체크리스트

### A. 프로그램 처방 표시

1. `/workout/today/log`에서 플랜 선택
2. `1) 세션 생성/적용` 실행
3. 세트 카드에서 처방 문구에 reps/중량/percent/note 표시 확인
4. 하단 비교표에서 planned와 actual 분리 표시 확인

### B. 입력/저장/재조회

1. 일부 세트만 `완료` 체크
2. `반복/중량` 값 수정
3. `로그 저장` 실행
4. `/workout/session/[logId]` 재진입
5. 수정값 유지 및 planned note/percent 표시 확인

### C. 기존 기록 수정

1. `PATCH /api/logs/[logId]`로 세트 수정
2. `GET /api/logs/[logId]` 재조회 시 변경 반영 확인

### D. 자동 진행 UX

1. `/plans/manage`에서 대상 플랜의 `자동 진행 ON/OFF` 토글 동작 확인
2. `/workout/today/log` 저장 후 `자동 진행` 안내 행 노출 확인
3. `/workout/session/[logId]`에서 자동 진행 이벤트/타겟별 결정 표시 확인

---

## 7. 알려진 이슈

| 이슈 | 원인 | 처리 |
|------|------|------|
| `workout_set.weight_kg`가 `integer`로 남아 소수 중량 업데이트 실패 | `0011_furry_the_order.sql` 미적용 | `pnpm db:migrate` 후 정상화 (`numeric(8,2)`) |
| ~~madcow/nsuns를 fork하면 램프·%TM 구조가 균일 세트로 뭉개짐~~ | 스토어 draft 모델이 운동당 `(세트 수, reps)`만 들고 있었음 | **해결** — draft에 `setRows`(세트별 reps·percent·amrap)를 추가. 아래 §5-5e 참조 |

### 의도적으로 하지 않은 것

- 프로그램 엔진 신규 kind 추가/재작성
- 운동기록 페이지 구조 재설계
- 도메인 모델/스키마 대규모 변경

### 검증 결과 (2026-03-04)

| 명령 | 결과 |
|------|------|
| `pnpm test:progression` | 3 pass |
| `pnpm build` | 성공 |
| `pnpm db:migrate` | 성공 |
| `pnpm db:seed` | 성공 |
| `pnpm db:verify:programs` | Operator/Starting Strength/StrongLifts/Texas/GZCLP/Greyskull 전체 통과 |
