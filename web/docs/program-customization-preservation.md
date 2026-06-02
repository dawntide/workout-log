# 프로그램 커스터마이즈 자동진행 보존 가이드

커스터마이즈(fork)한 공식 프로그램이 **원본의 자동진행을 그대로 유지**하도록 만드는 메커니즘과,
**새 공식 프로그램을 seed에 추가할 때** 같은 보존이 자동으로 적용되게 하는 체크리스트.

## 왜 필요한가

커스터마이즈 = 원본 프로그램을 **fork → manual 정의로 저장**한다([use-program-store-template-mutation-controller.ts](../src/features/program-store/model/use-program-store-template-mutation-controller.ts)).
fork는 **새 slug**를 받으므로 slug 기반 식별이 깨진다. 그래서 fork 정의에는 `programFamily`를 박고(보존),
처방·진행이 그 family로 원본 흐름을 되살린다. 과거 이 연결이 3곳에 흩어져 있어 신규 프로그램마다 3곳을
고쳐야 했고(531이 reducer family 분기를 빠뜨려 안 됐던 게 그 함정), 이를 단일 레지스트리로 모았다.

## 단일 등록 지점: `program-registry.ts`

[web/src/lib/program-store/program-registry.ts](../src/lib/program-store/program-registry.ts)의 `PROGRAM_FAMILY_REGISTRY` 엔트리:

| 필드 | 의미 |
|------|------|
| `family` | fork 정의에 박히는 `programFamily` (= 진짜 식별자) |
| `slugs` / `kinds` | 원본 seed slug / definition.kind |
| `flowStyle` | `uniform`(운동 구성 자유) \| `slotted`(슬롯에 끼워넣기) |
| `manualPlanner` | 처방 플래너: `generic` \| `operator` \| `asymptote` \| `wendler-531` \| `slotted-lp` |
| `progressionProgram` | reducer의 `ProgressionProgram` 키 |
| `weightOverrideMode` | `family-target`(reducer workKg를 운동명→target으로 덮음) \| `slotted-internal`(전용 플래너가 무게 계산) \| `none` |

세 resolver가 이 레지스트리를 참조한다:
- `resolveProgramFamily` ([model.ts](../src/lib/program-store/model.ts)) — fork 저장 시 보존할 family
- `resolveManualEntry` ([generateSession.ts](../src/server/program-engine/generateSession.ts)) — 처방 플래너 선택
- `resolveAutoProgressionProgram` ([reducer.ts](../src/server/progression/reducer.ts)) — 진행 룰셋 선택

## 처방 흐름

`generateSession`에서 `resolveManualEntry(manual정의)` → `manualPlanner`로 분기:

| planner | 무게 모델 |
|---------|-----------|
| `operator` | per-exercise(EX_ 키) TM × 주차 스킴 |
| `asymptote` | 슬롯 `coef` × 블록 사이클 계수 × TM |
| `wendler-531` | 주차 % × TM + FSL(첫세트% 5×5)/BBB(50% 5×10) 보조 슬롯 |
| `slotted-lp` (gzclp/texas) | 슬롯별 독립 workKg (없으면 `slot.startWeightKg` → 저장 무게 폴백) |
| `generic` (greyskull/SS/SL) | `applyManualRuntimeWeightOverrides`가 family-target workKg로 덮음 |

## 진행 흐름

`reducer.resolveAutoProgressionProgram(slug/family)` → 룰셋.
`usesDynamicProgressionKeys(program)`(operator/gzclp/texas)는 **고정 family target이 아니라 슬롯/운동별
동적 진행 키**를 쓴다 — 같은 운동이라도 슬롯(tier/요일)마다 workKg를 독립 추적한다. asymptote/531은
블록 기반이라 고정 family target.

## 슬롯 진행 키 규칙 (slotted 프로그램)

운동명을 바꿔도 진행 정체성이 유지되도록 **슬롯 고정 ID**를 쓴다:
- operator: `EX_<운동canonical>` (운동 단위)
- gzclp: `<sessionKey>_<tier>` (예: `D1_T1`, `D3_T2`) — 같은 Squat이라도 D1 T1·D3 T2 독립
- texas: `<sessionKey>_<role>` (예: `V_volume`, `I_intensity`)

## 프로그램별 보존 요약

| 프로그램 | kind | flowStyle | planner | 비고 |
|---|---|---|---|---|
| operator | LOGIC(operator) | uniform | operator | 운동 단위 자동진행 |
| asymptote | LOGIC(asymptote) | slotted | asymptote | 슬롯 coef, AMRAP 게이팅 |
| wendler-531(×3) | LOGIC(531) | slotted | wendler-531 | FSL/BBB 보조 슬롯 |
| greyskull / starting-strength / stronglifts | MANUAL | uniform | generic | family-target override |
| gzclp / texas-method | MANUAL | slotted | slotted-lp | 슬롯(tier/요일)별 독립 LP |

---

## ✅ 신규 공식 프로그램 seed 추가 체크리스트

새 프로그램을 [seed.ts](../src/server/db/seed.ts)에 추가할 때, 커스터마이즈 보존을 위해:

1. **seed definition에 `programFamily` 명시.** fork는 항상 manual로 저장되므로 `programFamily`가
   진짜 식별자다. (slug/kind만으로는 fork가 안 잡힌다 — 531이 빠뜨렸던 함정.)
2. **`program-registry.ts`에 엔트리 1줄 추가** (위 표의 6개 필드). 이게 보존의 중심.
3. **reducer 등록**: `rulesFor`에 증감 룰, `ProgressionProgram` 유니온에 키, `resolveAutoProgressionProgram`에
   **slug + family 양쪽 분기**(family 누락 시 fork에서 진행 안 켜짐), 슬롯/운동별 독립이면 `usesDynamicProgressionKeys`에 추가.
4. **처방 플래너**: `uniform`이면 generic + `weightOverrideMode: "family-target"`로 충분. `slotted`면 전용
   플래너(asymptote/531 패턴) 또는 공용 `slotted-lp`(슬롯별 workKg 모델)를 쓰고 `generateSession`의 분기에 연결.
5. **slotted면 draft 슬롯 주입**: `inferSessionDraftsFromTemplate`에 슬롯 메타(역할·진행키·`startWeightKg`)를
   넣는 빌더 추가(asymptote/531/gzclp 패턴). 흐름이 TM×coef면 lib 청사진(asymptote-blueprint.ts 패턴)도.
6. **테스트**: 플래너 단위(무게가 원본과 일치) + `resolveManualEntry`/`resolveAutoProgressionProgram` fork 인식
   + slotted면 "운동명 교체해도 슬롯 흐름 유지" + (해당 시) "같은 운동·다른 슬롯 독립 진행".

> 목표 상태: **레지스트리 엔트리 1줄 + seed `programFamily`** 만으로 fork 보존이 자동 적용. 나머지(3~5)는
> 프로그램 유형(uniform/slotted)별로 패턴이 정해져 있다.

## 알려진 한계 / 남은 작업

- **원본(미-fork) gzclp/texas**: seed `sessions[].items[]`에 슬롯 메타가 없어 `generic`(저장 무게 고정)으로
  처방된다 — 즉 원본은 무게 자동증가가 처방에 반영되지 않는 기존 한계가 남아 있다. **fork(커스터마이즈)는
  완전 보존**되지만, 원본까지 자동진행하려면 seed에 `programFamily` + items에 슬롯 메타를 심거나
  start-program 시 슬롯 draft를 시드해야 한다.
- **gzclp/texas 진행 규칙**: 현재는 단순 per-slot LP(앱의 `rulesFor` 룰을 슬롯별 적용)다. 정석 gzclp의
  stage 변경(5×3→6×2→10×1)·texas 주간 모델은 별개 기능으로 미구현(reducer stage 상태 추가 필요).

## 관련 테스트

- [manual-family-preservation.test.ts](../src/server/program-engine/manual-family-preservation.test.ts) — uniform LP fork 보존
- [wendler531-manual.test.ts](../src/server/program-engine/wendler531-manual.test.ts) — 531 슬롯/보조
- [asymptote-manual.test.ts](../src/server/program-engine/asymptote-manual.test.ts) — asymptote 슬롯
- [slotted-lp-manual.test.ts](../src/server/program-engine/slotted-lp-manual.test.ts) — gzclp/texas per-slot + 통합 흐름
- [reducer.test.ts](../src/server/progression/reducer.test.ts) — 진행 키 독립성
