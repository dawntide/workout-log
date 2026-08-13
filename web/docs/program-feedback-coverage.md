# 프로그램 진행 피드백 커버리지

진행 판정의 단일 데이터원은 `plan_progress_event`의 `reason`과 `meta.targetDecisions`다. 서버의 [`feedback-catalog.ts`](../../packages/core/src/progression/feedback-catalog.ts)가 로케일 문구를 조립하고 web·TUI가 같은 payload를 렌더링한다.

⚠️ **REF5만 데이터 계보가 다르다** — 완료 리듀서가 판정을 `meta.targetDecisions`가 아니라 `meta.changes`(`Ref5ProgressionChange[]`)에 싣는다. 그래서 공통 카탈로그 경로를 타지 않고 `buildRef5ProgressReport`가 별도로 조립한다. 새 패밀리를 추가할 때 **판정이 어느 meta 필드에 실리는지 먼저 확인할 것** — 계보가 어긋나면 카탈로그 항목을 넣어도 카드가 빈 채로 만들어진다(REF5가 실제로 그 상태였다).

피드백은 다음 네 질문에 답해야 한다.

1. 결과가 무엇인가
2. 왜 그런가
3. 다음 세션에서 무엇을 해야 하는가
4. 선택을 바꾸면 어떤 값이 언제 적용되는가

## 패밀리별 표출

| 패밀리 | 주요 이벤트 | 화면에 보이는 판단 근거·행동 |
|---|---|---|
| Manual | 자동 진행 없음 | 고정 세션이며 사용자가 작성한 그대로 기록됨 |
| Starting Strength / StrongLifts | 증량, 실패 streak, 리셋 | 처방 완료, 실패 `1/3·2/3·3/3`, 같은 무게 재도전, 새 무게 적용 |
| Greyskull | AMRAP 단일/2단계 증량, 실패, 리셋 | `5–9`, `10+`, 실패 `1/2·2/2`, 다음 AMRAP 목표 |
| Texas Method | 주간 증량, 강도일 실패, 주간 리셋 | V/R/I 역할, 실패 `1/3·2/3·3/3`, 다음 강도일, 파생 무게 재계산 |
| GZCLP | stage clear/down/reset, T3 AMRAP | 현재 단계 변화, 무게 유지/증량/85% 리셋, AMRAP 25회 기준 |
| Operator | 블록 중간 미달, 블록 증량/동결 | 미해소 실패, 전체 증량 보류, 다음 블록 동일 TM |
| 5/3/1 | 4주 블록 증량/동결 | 다음 사이클 TM, 리프트별 증량·유지 선택, ASSIST 판정 제외 |
| Asymptote | AMRAP 판정, 파생 TM, 보류, 조기 디로드 | AMRAP reps, `+2.5/HOLD/-5+light`, 휴식 부족, 회복 점프와 TM 유지 |
| REF5 | PASS/HOLD/FAIL/INVALID, 창·밀도·마이크로 | 현재 가능 상태와 종료 사유의 의미, 다음 스트림·강제 세션·재평가 |
| REF5 창 판정 | 판정창 마감(INCREASE/MAINTAIN), 즉시·정체·상한 감량, PULL 재고정 | 리프트별 `기준 100 → 102.5 kg (+2.5)`와 사유, 적용 시점(다음 세션) |

## 선택 처리

- SS/StrongLifts/Texas는 3번째 연속 실패, Greyskull은 2번째 실패에서 운동별 선택창을 연다.
- Operator·5/3/1은 블록 종료 시 운동별 `증량/유지/감소`를 제공한다.
- 블록에 미해소 실패가 하나라도 있으면 전체 `유지`가 기본 권장값이다.
- 사용자가 권장값을 그대로 확정하면 reducer의 전문 reason을 보존한다.
- 실제 값을 변경한 선택만 `override:per-target:*`로 기록하고 다음 노출에 반영한다.
- 취소하면 저장하지 않고 같은 완료 동작에서 선택창을 다시 열 수 있다.

## 노이즈 정책

- 의미 있는 HOLD는 표출한다: LP 실패 누적, Texas 강도일 실패, GZCLP stage-down/T3 미달, Operator·5/3/1 블록 실패, Asymptote AMRAP HOLD.
- 단순 블록 중간 성공 streak처럼 사용자의 행동을 바꾸지 않는 HOLD는 카드에서 생략한다.
- 미등록 reason은 INCREASE/RESET 기본 문구로 폴백하되, HOLD는 무조건 노출하지 않는다.
- REF5의 MAINTAIN은 **표출한다** — 블록 중간 streak HOLD와 달리 판정창이 실제로 마감된 결과이고, 사용자가 "판정이 났는데 유지됐다"와 "아직 판정 전"을 구분해야 한다. 반대로 추가 중량이 그대로인 PULL 재고정, 변경 없는 완료(`REF5_COMPLETE`)·세션 시작(`REF5_START`)은 카드를 만들지 않는다.

## 표출 지점

판정 카드는 판정을 만든 저장 응답(`progression.feedback`)과 플랜의 `progression-state` 양쪽에 실린다. 저장 순간에만 띄우면 저장 직후 앱·터미널을 닫은 사용자가 판정을 영영 놓치기 때문이다.

- web: 저장 직후 착지하는 세션 요약(`/workout/session/:id?fresh=1`)과 운동기록 화면. dismiss는 `localStorage`에 eventId로 기록한다.
- TUI: 저장 결과의 foot 라인, 그리고 재진입 시 `progression-state`가 실어 온 같은 카드.
- 수명: 다음 세션을 시작하면 START 이벤트가 플랜의 최신 이벤트가 되어 서버가 `report: null`을 주므로 카드는 자연 소멸한다.

카드가 **직전 판정 1건**만 보여주므로, 누적 이력은 별도로 `ref5Status.recentChanges`(엔진이 남긴 마지막 8건)를 플랜 상태 화면에 최신순으로 표출한다 — web은 플랜 관리 시트의 REF5 패널, TUI는 Programs 버퍼의 `CHG` 섹션(세로 공간 탓 5건 상한 + 초과분 명시). 이 목록은 카드와 달리 **문장이 아니라 라벨·무게·종류로 쪼갠 행**이고, 서버가 조립하지 않는 구조 데이터라 두 클라이언트가 각자 포맷한다(Go가 TS 모델을 import할 수 없다). 문구 동기화는 `web/src/features/ref5/model/recent-changes.test.ts`와 `apps/tui/internal/ui/ref5_recent_changes_test.go`가 **같은 기대 문자열**을 쓰는 것으로만 유지되니, 라벨을 고치면 양쪽을 함께 고칠 것. 리프트 라벨(무게를 동반할 때 PULL에 `(총하중)`을 붙이는 규칙)은 core `ref5LiftStandardLabel`이 단일 소스다.

## 검증

- 단위: `packages/core/src/progression/feedback-catalog.test.ts`, `web/src/features/workout-log/model/progression-choice.test.ts`, `apps/tui/internal/ui/progression_choice_test.go`
- REF5 창 판정 표출: `apps/tui/internal/ui/ref5_judgment_card_test.go`(저장 응답 왕복 + 재진입 복원)
- 화면 심층: `web/e2e/all-programs-protocol-journey.spec.ts`, `web/e2e/ref5-user-journey.spec.ts`
- 2026-07-17 결과: 일반 심층 13/13, REF5 심층 11/11 통과. 상세는 [`all-programs-screen-simulation-test-report-2026-07-17.md`](all-programs-screen-simulation-test-report-2026-07-17.md).
