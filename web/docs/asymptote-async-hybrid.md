# Asymptote × Async Hybrid Protocol

> 점근선(Asymptote)의 골격에 Async의 자동조절을 얹은 하이브리드 — 불규칙 일정·회복 부족 중급 리프터용.

| 항목 | 내용 |
|---|---|
| Version | 0.1 (draft) |
| 베이스 | [Asymptote Protocol](./asymptote-protocol.md) v1.0 (구현 엔진 재사용) |
| 차용 | Async Protocol v1.1 — 그라인딩-정지, 트리거 디로드, e1RM 추세 |
| 대상 | 일정 불규칙 + 영양/수면 불안정 + 1RM 측정 거부 + 스쿼트 1순위 |
| 종목 | 5개 (SQ·BP·WPU 메인 / DL·OHP 보조), 변형 없음 |

---

## 1. 왜 합치는가 — 두 프로그램은 한 축에서만 갈린다

Asymptote와 Async는 같은 7원리 분석에서 태어난 쌍둥이다. 종목·캡(DL≤SQ, OHP≤BP×0.5)·A/B/C
캘린더 무관 로테이션·스쿼트 매 세션 DUP·1RM 미측정·풀업 총중량(BW+추중량)이 모두 동일하다.
**유일한 분기점은 "자동조절을 어디서 하느냐"** 다:

- **Async** — 매 세트, 바 스피드(그라인딩-정지)로 *연속* 조절. 3일 연속 같은 날에도 그날 자동
  디로드. 단 진행 신호가 주관적이고, "진행 없음"이 정체인지 자동조절인지 구분이 안 된다.
- **Asymptote** — 블록(12세션)마다 AMRAP 렙수로 *이산* 조절. 신호가 객관적이고 정체 판별이
  명확하며 이미 구현돼 있다. 단 블록 내부는 고정 %라 연속일 피로에 무방비(TB와 같은 맹점).

두 층은 **충돌하지 않고 포개진다.** Asymptote 작업 세트는 이미 서브맥시멀이라, 그라인딩-정지를
얹어도 컨디션 좋은 날엔 렙을 다 채우고(볼륨 손실 0) 피로한 날에만 렙이 줄어든다. 그리고 진행은
사이클3 AMRAP으로만 게이팅되므로 작업 세트의 렙 미달은 진행 로직을 건드리지 않는다.

> **1+1>2 지점:** Asymptote의 객관적 AMRAP 숫자가 Async의 최대 결함(정체 vs 자동조절 구분
> 불가)을 해결하고, Async의 그라인딩-정지가 Asymptote의 최대 결함(연속일 무방비)을 해결한다.

---

## 2. 축별 채택 (장점 극대화 / 단점 최소화)

| 설계 축 | 채택 | 출처 |
|---|---|---|
| 거시 진행 신호 | **AMRAP 렙수(객관)** | Asymptote |
| 미시 피로 밸브 | **그라인딩-정지(매 세트)** | Async |
| 천장/벽 방지 | **TM 점근(캡, 최대 0.975×TM)** | Asymptote |
| 디로드 | **고정 사이클4(바닥) + 트리거(천장)** | 양쪽 |
| 정체 판별 | **AMRAP 숫자** | Asymptote |
| 연속 모니터 | **e1RM 7세션 이동평균** | Async |
| 구현/운영 | **Asymptote 엔진 재사용** | Asymptote |

---

## 3. 규칙셋 (베이스 = Asymptote, 아래 4가지를 이식·보정)

베이스 구조(블록 = 4사이클×3세션, 사이클 계수 0.925/0.95/0.975/0.85, 사이클3 AMRAP, AMRAP
렙수→TM ±2.5/−5 매트릭스, 보조 자동 도출)는 [Asymptote Protocol](./asymptote-protocol.md)
§3~§9 그대로다. 하이브리드는 여기에 다음을 더한다.

### 3.1 그라인딩-정지 밸브 (Async 차용) — *구현됨*

AMRAP이 아닌 **모든 작업 세트**는 "바가 눈에 띄게 느려지는 첫 렙에서 정지"가 기본 가이드다.
렙 타겟을 다 못 채워도 멈춘다. 이 미달은 **실패가 아니라 그날의 자동 보정**(특히 연속일 피로
흡수)이며, 진행은 AMRAP으로만 게이팅되므로 TM 결정에 영향이 없다.

- 코드: 처방의 비-AMRAP 작업 세트에 `stopOnGrind: true` 부착 (`generateSession.ts`).
- AMRAP 세트는 종전대로 RPE9 한도까지 rep-out (그라인딩-정지와 사실상 같은 정지 동작이라 일관).

### 3.2 연속일 AMRAP 가드 (Async 차용) — *구현됨*

AMRAP은 거시 진행 신호라 누적 피로로 오염되면 TM 결정이 틀어진다. 사이클3 AMRAP 세션이 직전
세션과 **최소 휴식일(`ASYMPTOTE_AMRAP_MIN_REST_DAYS` = 2, 즉 48h) 미만**으로 붙으면 그날
AMRAP을 **보류**하고 작업 세트(그라인딩-정지)로 강등한다.

- 보류된 리프트는 이번 블록 AMRAP 결측 → reducer가 TM을 **유지**(안전 강등). 진행 신호를
  깨끗한 날에만 받는다.
- 코드: `asymptoteShouldDeferAmrap({ amrapEligible, restDayGap })` 순수 함수. 처방 레이어가
  `params.restDayGap`(직전 세션과의 일 간격)을 넘기면 발동하고, **미지정이면 보류하지 않아
  기존 동작을 그대로 보존**한다.

### 3.3 트리거 조기 디로드 (Async 차용) — *구현됨*

고정 사이클4(바닥 보험)는 유지하되, 그 전이라도 *3 드라이버(SQ/BP/PULL) 중 2개가 최근 노출에서
그라인딩으로 렙 급감(`failureStreak ≥ 2`)* 하면 빌드 사이클(week 1~3) 중 즉시 사이클4(디로드)로
점프한다. 불규칙 공백이 이미 회복을 주는 패턴이면 고정 디로드를 앞당겨 누적 피로를 끊는다.

- 코드: `progression/reducer.ts`의 asymptote 블록 — 세션 advance 후 드라이버 `failureStreak`을 보고
  `state.week`을 4로 점프. 블록은 week4/day3에서 평소대로 완료(TM 유지)된다. 정상 진행(streak 0)엔
  미발동이라 기존 풀블록 동작에 회귀 없음.

### 3.4 TM 배수 보정 (절충) — *구현됨*

초기 TM = 최근 추정 1RM × **0.87** (Asymptote 0.83 ↔ Async 공격적의 절충). TB에서 0.90 TM을
이미 소화 중인 리프터의 재적응 낭비를 줄이고 스쿼트 강도를 의미 있는 수준으로 끌어올린다.

- 코드: `ASYMPTOTE_HYBRID_TM_PERCENT = 0.87`(lib 단일 소스). 플랜 시작의 `resolveStartTmPercent`가
  `isAsymptoteTemplate`이면 저장된 `defaults.tmPercent`(0.83)를 의도적으로 오버라이드해 0.87 적용.
  (원본 Asymptote Protocol 스펙은 0.83이지만, 앱의 asymptote는 Async 레이어가 얹힌 하이브리드라
  시작 배수를 0.87로 둔다.)

### 3.5 e1RM 연속 모니터 (Async 차용) — *구현됨 (헬퍼 + stats 노출)*

AMRAP은 12세션마다라 그 사이가 깜깜이다. SQ-A·BP-C·WPU-A 탑세트의 e1RM(Epley) 7세션 이동평균을
블록 내내 추적해, AMRAP 전에 정체/하락 조짐을 본다. **풀업은 총중량(BW+추중량)으로 계산하므로
체중 기록이 전제** — 미기록이면 풀업 추세가 노이즈가 된다(설정의 체중을 보정값으로 사용).

- 순수 헬퍼: `program-engine/asymptote-monitor.ts` — `asymptoteDriverTrend(exposures, window=7)`가
  e1RM·이동평균·추세(RISING/FLAT/FALLING/INSUFFICIENT)를, `aggregateDriverExposures`가 로그 세트를
  드라이버별 일자별 탑세트로 집계.
- 서비스: `stats/asymptote-monitor-service.ts` — 활성 asymptote 플랜이 있을 때만 드라이버 추세 산출.
- UI: stats 화면의 `AsymptoteMonitorSection` — asymptote 플랜이 없으면 섹션 미표시(다른 유저 화면 불변).

---

## 4. 약점 상쇄 결과

| 원래 약점 | 출처 | 하이브리드 처리 |
|---|---|---|
| 3일 연속 과부하 | TB/Asymptote | ✅ 그라인딩-정지가 그날 자동 디로드 (§3.1) |
| 정체 vs 자동조절 구분 불가 | Async | ✅ AMRAP 숫자로 판별 |
| 주관 신호(바 스피드) 의존 | Async | ✅ 진행은 AMRAP(객관), 바 스피드는 밸브로만 |
| 12세션 깜깜이 | Asymptote | ✅ e1RM 7세션 추세 (§3.5) |
| 고정 디로드 낭비 | Asymptote | ✅ 트리거로 앞당김 (§3.3) |
| AMRAP이 연속일에 오염 | (신규 결합 리스크) | ✅ 연속일 AMRAP 가드 (§3.2) |
| 스쿼트 강도 과소 | 둘 다 | ⚠️ TM 0.87로 완화(완전 해결 아님) |
| 미구현 | Async | ✅ Asymptote 엔진 재사용 |

---

## 5. 정직한 한계

- **버리는 것:** Async의 더블 프로그레션(빠른 피드백). AMRAP-게이팅이 더 robust하지만 진행은
  더 느리고 이산적 — "대회 아님, 꾸준한 증량" 목표엔 부합.
- **여전히 남는 것:** 스쿼트 절대 고중량 노출은 TM×0.87로도 ~74% 1RM 수준. 더 원하면 사이클3
  세션A 스쿼트 계수(0.875→0.90) 다이얼이 있으나 엔진 수정·회복 부담↑이라 *TB 정체 확인 후* 권장.
- **근본 변수:** 무엇을 섞든 적응은 칼로리·수면이 만든다. 본 프로토콜은 자극을 최적 분배할 뿐.
- **선결 조건:** §3.2 풀업 진행과 §3.5 모니터 모두 **체중 기록이 필수**다.

---

## 6. 구현 매핑 (코드)

| 규칙 | 코드 위치 | 상태 |
|---|---|---|
| 그라인딩-정지 플래그 | `program-engine/generateSession.ts` `PlannedSet.stopOnGrind`, `generateAsymptote` / `plannedExercisesFromAsymptoteManualSession` | 구현 |
| 연속일 AMRAP 가드 | `program-engine/asymptote.ts` `asymptoteShouldDeferAmrap` / `asymptoteSetGuidance` | 구현 |
| restDayGap 실연동 | `generateSession.ts` `resolveRestDayGapDays` → `generateAndSaveSession`이 직전 세션 `performed_at`과의 일 간격을 `params.restDayGap`로 주입. `asymptoteDayGap`(asymptote.ts)로 일수 계산 | 구현 |
| 최소 휴식일 상수 | `asymptote.ts` `ASYMPTOTE_AMRAP_MIN_REST_DAYS` (=2) | 구현 |
| 트리거 조기 디로드 | `progression/reducer.ts` asymptote 블록 — 드라이버 2+ `failureStreak ≥ 2` → week4 점프 | 구현 |
| e1RM 모니터 (헬퍼) | `program-engine/asymptote-monitor.ts` `asymptoteDriverTrend` / `aggregateDriverExposures` | 구현 |
| e1RM 모니터 (서비스) | `stats/asymptote-monitor-service.ts` `fetchAsymptoteDriverMonitor` | 구현 |
| e1RM 모니터 (UI) | `widgets/stats-screen/asymptote-monitor-section.tsx` + stats 부트스트랩 `asymptoteMonitor` | 구현 |
| TM 배수 init | lib `ASYMPTOTE_HYBRID_TM_PERCENT`(=0.87) + 컨트롤러 `resolveStartTmPercent`의 `isAsymptoteTemplate` 분기 | 구현 |
| 테스트 | `asymptote-hybrid.test.ts`, `asymptote-monitor.test.ts`, `progression/asymptote-trigger-deload.test.ts`, `lib/program-store/model.test.ts` | 구현 |

> `restDayGap`은 `generateAndSaveSession`이 세션 생성 시 같은 플랜의 최신 `workout_log.performed_at`과의
> 일 간격(plan timezone 기준)으로 채운다. 직전 세션이 없거나 조회 실패면 `null` → 가드 비활성(다른
> 프로그램·preview 경로 동작 불변). 모든 하이브리드 메커니즘이 엔진/처방/UI에 연동됨.

---

## 부록: 버전 히스토리

| Version | Date | Changes |
|---|---|---|
| 0.1 | 2026-06-13 | 초안. Asymptote 골격 + Async 그라인딩-정지/연속일 가드. 엔진 헬퍼·처방 플래그·테스트 구현. |
| 0.2 | 2026-06-13 | restDayGap 실연동(generateAndSaveSession), 트리거 조기 디로드(reducer), e1RM 연속 모니터(asymptote-monitor) 구현 + 테스트. |
| 0.3 | 2026-06-13 | TM×0.87 init 연동(resolveStartTmPercent/isAsymptoteTemplate), e1RM 모니터 stats 화면 노출(서비스+부트스트랩+UI 섹션). |
