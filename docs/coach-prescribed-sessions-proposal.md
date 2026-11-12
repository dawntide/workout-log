# 코치 처방 세션 — 설계 제안서

> **상태: 제안, 미승인.** API 계약과 데이터 구조를 바꾸는 설계 영향 작업이라 승인 전에는 코드를 바꾸지 않는다(AGENTS.md 작업 규칙).
> 작성: 2026-11-12. 기준: main `70929571`.
> 표기: **사실**은 코드에서 직접 확인한 것, **추정**은 확인하지 않은 예상, **의견**은 판단이다.

## 1. 배경과 목표

사용자 방침(2026-11-12): REF5는 막혔다고 판단될 때까지 그대로 진행한다. 그 뒤 프로그램을 바꾸게 되면, 고정 프로그램 대신 LLM 코치가 세션마다 처방을 짜는 방식을 후보로 본다. 그때 쓸 기록 경로를 미리 만들어 둔다.

목표는 하나다. **코치가 정한 세션이 앱에 "오늘 세션"으로 뜨고, 사용자는 지금 쓰는 기록 화면에서 수행만 입력한다.** 처방과 수행이 함께 남아야 다음 처방의 근거가 된다.

하지 않는 것:

- REF5 엔진·판정·스펙을 건드리지 않는다. REF5 플랜에는 이 경로가 닿지 않는다.
- LLM을 진행 엔진에 넣지 않는다(`apps/mcp/README.md`의 원칙). 서버는 코치가 보낸 처방을 **검증하고 저장**할 뿐 무게를 계산하지 않는다.
- 코치가 수행 기록을 대신 입력하는 흐름을 만들지 않는다(이미 `log_session`이 있다).

## 2. 현재 있는 것 (사실)

- **MCP 서버** `apps/mcp`: 공개 API를 HTTP로만 부르는 래퍼. 읽기 도구(세션·통계·플랜·진행 상태)와 쓰기 도구 `log_session`·`log_bodyweight`. 삭제 도구는 없다.
- **PAT 공개 표면** `apps/api/src/api-token-surface.ts`: 기본 거부. 쓰기는 `POST /api/logs`, `PATCH /api/logs/:logId`, `POST /api/bodyweight` 셋뿐이다. 스냅샷 테스트가 표면 변경을 의도적 결정으로 강제한다.
- **처방의 저장 형태** `generated_session`: `planId`·`sessionKey`(플랜 안에서 유일)·`scheduledAt`·`status`·`snapshot`. 스냅샷 v3의 정규 필드는 `exercises: PlannedExercise[]`(`exerciseName`, `role`, `sets[{reps, targetWeightKg, rpe, note}]`)이다.
- **MANUAL 플랜**: `program_version.definition`의 고정 세션을 `plan.params.schedule`로 골라 `generateSession`이 스냅샷을 만든다.
- **선행 설계**: 공개 API와 MCP는 [`public-api-mcp-plan.md`](public-api-mcp-plan.md)가 정본이다. "LLM은 읽고 쓰는 클라이언트일 뿐 판정에 관여하지 않는다", "삭제는 어느 스코프로도 열지 않는다"가 거기서 정해졌고 이 제안도 따른다.
- **기록 쪽 필드**: `workout_log.notes`, `workout_log.tags`, `workout_set.rpe`. 운영 계정의 메모는 0건이다(2026-11-12 조회).

없는 것:

- 아직 수행하지 않은 처방을 **밖에서 넣는** 경로.
- 수면·통증·남은 여유 반복을 구조화해 받는 입력란.

## 3. 제안

### 3.1 코치 플랜

- 시드에 프로그램 템플릿 하나를 추가한다: `coach-prescribed`(type `MANUAL`, definition `{ kind: "manual", programFamily: "coach", sessions: [] }`).
- 사용자는 프로그램 스토어에서 이 템플릿으로 플랜을 만든다. 플랜 `params.programFamily = "coach"`.
- 자동 진행(reducer)은 없다. 코치 플랜의 완료 기록은 `plan_runtime_state`를 바꾸지 않는다.

### 3.2 처방 쓰기 API

```text
PUT /api/plans/:planId/coach-sessions/:date        (date = 플랜 시간대의 YYYY-MM-DD)
```

요청 본문:

```json
{
  "exercises": [
    { "exerciseName": "Back Squat", "role": "MAIN",
      "sets": [{ "reps": 3, "targetWeightKg": 90, "rpe": 8, "note": "하이바" }] }
  ],
  "rationale": "지난 세션 3×3 90 RIR 2. 같은 무게로 1세트 추가.",
  "clientMutationId": "…"
}
```

동작:

- 플랜 소유자와 `programFamily === "coach"`를 확인한다. 그 외 플랜(REF5 포함)은 400.
- `generated_session`에 `sessionKey = "COACH:<date>"`, `status = "PLANNED"`, `scheduledAt`, 스냅샷 v3(`exercises` + `coach: { rationale, prescribedAt, revision }`)로 upsert한다. 하루에 처방 하나다.
- **수행 뒤에는 불변**: 그 세션에 연결된 `workout_log`가 있으면 409. 처방과 수행의 대조가 사후에 바뀌면 안 된다.
- 검증(서버): 종목 이름이 카탈로그에 있어야 한다, 종목 12개 이하, 종목당 12세트 이하, 반복 1–50, 무게 0–500 kg, `rationale` 2000자 이하. 범위 밖은 조용히 고치지 않고 거부한다.
- 삭제 API는 만들지 않는다. 잘못 넣은 처방은 같은 날짜에 다시 PUT 한다(수행 전에 한해).

읽기는 기존 `GET /api/plans/:planId/generated-sessions/:sessionId`와 `GET /api/logs`로 충분하다(추정: 날짜로 처방을 찾는 조회 하나가 더 필요할 수 있다. 구현 계획에서 확정).

### 3.3 세션 열기

- `POST /api/plans/:planId/generate`가 코치 플랜이면 계산하지 않고 그 날짜의 `PLANNED` 처방을 돌려준다.
- 처방이 없으면 빈 세션과 안내("오늘 코치 처방이 없습니다")를 돌려준다. 사용자는 자유 기록을 할 수 있다.
- 기록 화면·저장 경로는 그대로 쓴다. 스냅샷 모양이 기존 v3와 같기 때문이다(추정: 기록 화면이 `exercises`만으로 그려지는지는 구현 전에 확인한다).
- 화면 추가는 하나다: 세션 상단에 `rationale`을 보여 준다.

### 3.4 PAT 표면과 MCP 도구

- 쓰기 표면에 `PUT /api/plans/:planId/coach-sessions/:date` 한 줄을 추가한다(`read_write` 토큰만). 스냅샷 테스트를 함께 고친다.
- MCP 도구 `prescribe_session` 하나를 추가한다. 읽기는 기존 도구로 한다.
- 쓰기 한도(30/분)는 그대로 적용된다.

### 3.5 코칭용 입력 (1단계는 스키마 변경 없음)

- 세트별 남은 여유는 기존 `rpe` 입력으로 받는다. RIR로 입력하는 옵션은 이미 계획이 확정돼 있고 미착수다([`rir-input-plan.md`](rir-input-plan.md), `rpe = 10 − rir` 변환 저장). 코치 방식으로 전환하면 그 계획의 우선순위가 올라간다. 이 제안의 범위에는 넣지 않는다.
- 수면·통증·컨디션은 기존 세션 메모에 한 줄 양식으로 받는다: `수면 6h / 통증 없음 / 컨디션 보통`. 기록 화면의 메모 입력란에 이 양식을 placeholder로 넣는다.
- 구조화 필드(예: `workout_log`에 readiness 컬럼)는 실제로 메모가 쌓이는지 본 뒤 2단계로 미룬다. 지금까지 메모가 0건이라, 칸부터 늘리면 빈 칸만 늘 수 있다(의견).

### 3.6 코칭 일지

- 코치(LLM)는 대화 사이에 기억이 없다. 판단의 연속성은 **처방의 `rationale` + 수행 기록 + 일지**로 만든다.
- 일지 위치는 저장소가 아니라 프로젝트 메모리를 권한다. 저장소는 공개이고, 일지에는 통증·수면 같은 개인 정보가 들어간다(의견). 코치가 따를 고정 규칙(종목, 주당 하드 상한, 증량·감량 조건)은 전환 시점에 별도 문서로 정한다.

## 4. 코치가 붙는 방법

| 환경 | 방법 | 상태 |
|---|---|---|
| Claude 데스크톱·Claude Code(사용자 PC) | `apps/mcp`를 MCP 서버로 등록, `read_write` PAT | 지금도 읽기·기록은 된다. `prescribe_session`만 추가하면 된다 |
| claude.ai 프로젝트(클라우드 세션) | 공개 API를 HTTPS로 직접 호출, PAT는 환경 시크릿 | [미확인] 환경의 네트워크 정책이 프로덕션 도메인을 허용하는지 |

운영 DB 직접 쓰기는 계속 금지다. 코치의 쓰기는 PAT와 공개 API를 거친다. 이것은 "에이전트가 운영 DB에 쓰지 않는다"는 규칙의 예외가 아니라, 사용자가 발급한 토큰으로 앱의 검증을 거치는 정식 경로다. 다만 **사용자가 토큰을 발급해 줄 때만** 열린다.

## 5. 위험

1. **처방 오류가 그대로 화면에 뜬다.** 서버 검증은 범위만 본다. 무게가 합리적인지는 코치 책임이다. 완화: 처방에 `rationale`을 필수로 하고 화면에 보여 줘 사용자가 시작 전에 읽게 한다.
2. **PAT 쓰기 표면이 넓어진다.** 유출된 `read_write` 토큰이 미래 처방을 바꿀 수 있다. 수행 뒤 불변, 삭제 없음, 코치 플랜 한정으로 범위를 좁힌다.
3. **REF5와의 혼동.** 코치 플랜과 REF5 플랜이 동시에 활성일 수 있다. 코치 경로가 REF5 플랜을 거부하는 테스트를 둔다.
4. **쓰이지 않을 수 있다.** 전환 시점이 오지 않으면 죽은 코드가 된다. 1단계 범위를 작게 잡는 이유다.

## 6. 구현 범위 (승인 시, 추정)

- core: 코치 처방 검증·스냅샷 구성 함수와 유닛 테스트, 시드 템플릿
- apps/api: PUT 라우트, generate 분기, PAT 표면 + 스냅샷 테스트, OpenAPI
- apps/mcp: `prescribe_session` 도구와 테스트
- web: 처방 근거 표시, 메모 placeholder, 프로그램 스토어 노출
- 문서: decisions.md, handoff.md, apps/mcp README
- DB 스키마 변경과 마이그레이션은 없다(시드만 추가)

## 7. 사용자가 정할 것

| # | 질문 | 권장 | 이유 |
|---|---|---|---|
| Q1 | 지금 구현할지, 전환 시점에 할지 | 지금 1단계만 | 범위가 작고 REF5와 분리돼 있다. 다만 쓰이지 않을 위험(§5-4)이 있다 |
| Q2 | 처방 저장을 `generated_session` 재사용으로 할지, 전용 테이블로 할지 | 재사용 | 기록 화면·저장 경로를 그대로 쓴다. 마이그레이션이 없다 |
| Q3 | 코칭 입력을 메모 양식으로 시작할지, 전용 필드를 만들지 | 메모 양식 | §3.5 |
| Q4 | 일지를 어디에 둘지 | 프로젝트 메모리 | 저장소가 공개다 |
| Q5 | 코치에게 `read_write` 토큰을 줄지 | 전환 시점에 발급 | 지금은 쓸 일이 없다. 구현 검증은 로컬·CI로 한다 |

## 8. 검토하고 택하지 않은 안

- **채팅으로 처방을 받고 자유 기록.** 개발이 없지만 매번 손으로 옮겨야 하고 처방과 수행을 대조할 수 없다.
- **전용 테이블 `coach_prescription`.** 의미는 더 깨끗하지만 마이그레이션(prod·dev 두 벌)과 기록 화면 연결을 새로 만들어야 한다.
- **MANUAL 프로그램 정의를 매번 고쳐 쓰기.** `program_version`은 버전 불변 정의라 세션마다 고치는 용도가 아니다.
- **코치가 수행 기록까지 입력.** 운동 중 채팅으로 불러 줘야 해서 지금보다 불편하다.
