# REF5 근거 조사 원자료 (2026-10-15)

2026-10-15 REF5 v1.4 독립 평가 때 모은 조사 원자료다. 최종 보고서는 [ref5-evidence-evaluation-2026-10-15.md](../../notes/ref5-evidence-evaluation-2026-10-15.md)이고, 이 폴더에는 그 보고서의 바탕이 된 출처 전체와 중간 판단을 담았다. 새 프로그램을 설계하거나 REF5를 바꿀 때(§26) 근거 조사의 출발점으로 쓰려고 보관한다.

## 만든 방법

워크플로 실행 `wf_cbfe22d1-b45`에서 에이전트 70개가 다음 순서로 일했다. 8개 영역 조사와 내부 분석(스펙·엔진·Dev 계정 기록, DB는 읽기 전용) → 영역별 출처 검증 → 스포츠과학 종합과 코칭 종합 → 둘을 합친 주장 24건 → 주장마다 evidence·applicability 두 관점의 반박 검토 → 누락 점검 → 보고서 작성. 첫 실행이 세션 한도로 끊겨 에이전트 32개가 실패했지만 재개 실행에서 모두 다시 돌았다. 결과는 70/70으로 완결이다.

## 수치

출처는 341건이다. 상태별로 confirmed 224, corrected 73, unverifiable 43, misattributed 1이다. 이 중 339건은 조사 단계에서 나왔고, 2건은 검증 단계에서 추가됐다.

| 영역 | 파일 | 건수 | confirmed | corrected | unverifiable | misattributed |
|---|---|---|---|---|---|---|
| 볼륨·빈도 | [01](sources/01-volume-frequency.md) | 33 | 28 | 4 | 1 | 0 |
| 실패 근접도·자동조절 | [02](sources/02-proximity-autoregulation.md) | 47 | 42 | 5 | 0 | 0 |
| 강도·진행 모델 | [03](sources/03-intensity-progression.md) | 44 | 26 | 8 | 10 | 0 |
| 회복·감량·병행 운동 | [04](sources/04-recovery-deficit-concurrent.md) | 35 | 22 | 12 | 1 | 0 |
| 원암 풀업·건 적응·단측 | [05](sources/05-oap-tendon-unilateral.md) | 53 | 24 | 14 | 15 | 0 |
| 타 프로그램 비교 A (TB, 5/3/1, Pavel, Dan John, Bulgarian 등) | [06](sources/06-program-comparison-a.md) | 52 | 26 | 17 | 8 | 1 |
| 타 프로그램 비교 B (SBS, Juggernaut, GZCL, nSuns, Texas Method 등) | [07](sources/07-program-comparison-b.md) | 45 | 37 | 5 | 3 | 0 |
| 목표 현실성 | [08](sources/08-goal-feasibility.md) | 32 | 19 | 8 | 5 | 0 |

## 파일

- `sources/01–08-*.md`: 영역별 출처 전문이다. 출처마다 조사 요약, 검증 결과, 검증 메모, REF5 관련성이 있다. 파일 끝에 그 영역의 함의(검증 후 유지·약화·원안)와 불확실성이 있다.
- `sources.json`: 같은 341건을 기계가 읽는 형식으로 담았다. 필드는 `id`, `dimension`, `status`, `citation`, `url`, `kind`, `year`, `finding`, `verifiedFinding`, `note`, `relevanceToREF5`, 그리고 검증에서 서지가 바뀐 경우의 `citationAsResearched`·`urlAsResearched`다.
- `claims.md`: 병합 주장 24건과 반박 검토 48건이다.
- `synthesis-overall.md`, `synthesis-claims.json`: 종합 3종(스포츠과학·코칭·병합)의 개요, 그리고 스포츠과학·코칭 종합의 개별 주장(각 22건)이다.
- `internal-characterization.md`: 평가 입력으로 쓴 스펙·엔진·기록 내부 분석이다.
- `completeness-critique.md`: 보고서 작성 전에 한 누락 점검이다.
- `workflow-script.js`: 같은 조사를 다시 돌릴 때 쓰는 워크플로 스크립트다.

예: 강도 영역에서 원문이 확인된 출처만 보려면 `jq -r '.[] | select(.dimension=="intensity-progression" and .status=="confirmed") | .citation' sources.json`.

## 쓸 때 주의

본문은 에이전트가 쓴 영어 원문 그대로이고 번역하지 않았다.

상태의 뜻은 다음과 같다. confirmed는 초록·원문·출판사 페이지로 확인한 것이다. corrected는 출처는 있지만 서지나 수치를 고친 것이라 `검증 결과`(`verifiedFinding`)를 써야 한다. unverifiable은 확인하지 못한 것이라 다시 확인하기 전에는 근거로 쓰지 않는다. misattributed는 저자 귀속이 틀린 것이다. 검증은 2026-10-15 시점 기준이고, 일부는 초록만 확인했다(검증 메모 참고).

포럼·블로그·코치 글은 코칭 출처이지 연구 근거가 아니다(`kind` 필드로 구분).

REF5를 평가하려고 모은 자료라서, REF5가 택하지 않은 설계 선택지는 근거가 얇을 수 있다(추정).

원자료가 인용한 스펙 문구와 줄 번호는 [#760](https://github.com/dawntide/workout-log/pull/760)(2026-10-16 머지) 이전 기준이다. §7.3 48시간 분리, §19.5(c) 2주 체류, §22.2 Coleman 2024 문구는 그 뒤에 고쳐졌다.

기록 수치(세션 수, 기준 무게 등)는 10/14 세션까지 반영한 값이다. 원자료는 체중이 "측정되지 않음"이라고 쓰는데, 2026-10-16에 사용자가 입력은 안 하지만 실제 체중도 변하지 않았다고 확인했다. 하드 SQ는 하이바이고 무릎은 많이 좋아졌다(같은 날 확인). 현재 상태는 [ref5-context.md](../../notes/ref5-context.md)를 기준으로 한다.
