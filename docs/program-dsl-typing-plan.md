# 프로그램 정의 DSL 타입 모델링 계획

> 상태: **Phase 2b-1 완료** (2026-07-23) — ManualItem 스키마 확장 + base manual 생성기 타이핑. 다음: 2b-2(slotted 생성기 4개).
>
> **Phase 2b-1**: `ManualItem` 스키마에 `meta`·`exerciseId`·`order`·`slotRole`·`note` + `manualSlotSchema`(tier·coef·progressionKey·startWeightKg·sessionKey·texasRole·driver·assistance·amrap·role) 추가 → slotted 생성기 groundwork. `plannedExercisesFromManualSession(manualSession: ManualSession|null)` 타이핑(item-as-set은 passthrough로 호환). **실데이터가 또 교정**: seed slot의 `driver`는 boolean(→`z.unknown()`). 출력 불변(골든·엔진 16테스트), conformance 4/4. slotted 생성기 4개(`Operator/Asymptote/531/SlottedLp`, slot 서브필드 접근)는 **Phase 2b-2**.
>
> **Phase 2a**(`generateSession.ts`): `mapManualSet(s: any→ManualSet)` + `pickManualSession(definition: any→unknown, 반환 ManualSession|null)` — 스키마 추가 없이 깨끗(읽는 필드가 전부 스키마에 존재). **타입 전용(런타임 무변경)**, 골든(LOGIC)·엔진 행위 테스트 16파일이 출력 불변 보증. generateSession any 56→53. 생성기(`plannedExercisesFromXxxManualSession`)는 `meta`·`exerciseId`·`order`·`slotRole` 스키마 추가 + item-as-set 이중성 얽힘 → **Phase 2b**.
>
> **Phase 1a 산출물** (`packages/core/src/program-dsl/`):
> - ✅ zod 판별 유니온 `programDefinitionSchema`(kind 판별: manual·operator·531·asymptote·ref5) + `parseProgramDefinition`(미지 kind는 throw 아닌 `{ok:false}` fallback — 엔진 "Unsupported kind" 시맨틱 보존). 스키마=타입(`z.infer`)=파서 단일 소스. `.passthrough()`로 미지 필드 보존.
> - ✅ **conformance 테스트**: `fixtures/dsl/inputs.json`의 실 정의 18개 전수 파싱 통과 + fork 필드·동의어·미지 kind fallback. **실데이터가 스키마를 또 교정**: `ref5.protocolVersion`이 number가 아니라 **문자열 "1.1"**(→ `string|number`로 수정) — dev만 봤으면 못 잡음.
> - ✅ **G2 prod 인벤토리 완료**: kind 분포 dev와 동일 5종. **candito-linear=0(dev·prod 모두 → 죽은 코드 확정)**. **유저 fork 1건**(operator→manual 구체화)에서 seed 밖 필드 **`operatorStyle`(top-level)·`setNumber`(set)** 발견 → 스키마에 반영. zod ^3.25.76 core에 추가(소비자 미연결이라 아직 번들 무영향).
>
> **Phase 0 산출물:**
> - ✅ **G1 골든**: `generateFromLogicDefinition`(LOGIC 디스패처 — 실 DB 경로가 타는 함수) export + `dsl-golden.test.ts`. dev에서 덤프한 실 LOGIC 정의 7개(operator 3·531 3·asymptote 1) × 4 (week,day) 출력을 `fixtures/dsl/golden-logic.json`에 고정(2회 실행 안정 확인, core 473/473). ref5는 디스패처 밖 경로라 제외, manual slotted 라우팅은 Phase 2 골든에서(현재 기존 행위 테스트 16파일이 커버).
> - ✅ **G2 dev 인벤토리**: `fixtures/dsl/inputs.json`(실 정의 18개 덤프) + §2 실측 반영. **prod 스캔은 미실행**(별도 승인).
> - **검증 방식 결정: zod 채택**(§7-1) — 스키마=타입=파서 단일 소스로 타입/현실 드리프트(이 리팩터가 막으려는 바로 그 버그) 원천 차단. 단 파서는 서버 사이드 한정, Phase 1 도입 시 번들 예산 green 확인.
> 배경: [`codebase-audit-2026-07.md`](codebase-audit-2026-07.md) §4.5 `any` 감축의 잔여(~121건)는 프로그램 정의 JSON DSL이 지배한다 — `generateSession.ts` 56 · `program-store/model.ts` 11 + snapshot 소비자들. 이들은 "경고 감축"이 아니라 **DSL 스키마 모델링**이라는 별도 과제로 다뤄야 한다(PR #597에서 의도적으로 남긴 부분).

## 1. 문제와 목표

`program_version.definition`(jsonb)은 앱 전용 미니 표기법(DSL)이다. 프로그램마다 골격이 다르고(명시형 `manual` vs 규칙형 `531`/`operator`/`asymptote`), 선택 필드·동의어(`exerciseName ?? name`, `targetWeightKg ?? weightKg`)·버전(`dslVersion`)이 섞여 있어 엔진이 전부 `any` + 방어적 접근(`?.` / `??`)으로 읽는다.

**목표**: 타입스크립트가 이 JSON의 구조를 알게 만들어 ① 오타/오접근을 컴파일 타임에 잡고 ② 새 프로그램 추가 시 계약을 강제하고 ③ `any` 잔여의 대부분을 해소한다. **비목표**: 세션 생성 결과(무게·세트·순서)의 어떤 변화도 일으키지 않는다 — 이 리팩터의 성공 기준은 "출력 불변"이다.

## 2. 현재 DSL 표면 (2026-07-23 조사)

### 2.1 판별자와 종류

- `definition.kind` (dev 실측 18정의): **`manual`(10) · `operator`(3) · `531`(3) · `ref5`(1) · `asymptote`(1)**. `generateFromLogicDefinition` 디스패처는 531/operator/asymptote/`candito-linear`만 분기하는데 — **`candito-linear`는 dev 데이터 0건**(엔진 분기만 존재 → 죽은 코드 확정에 강한 신호, prod 스캔으로 최종 판정) — **`ref5`는 디스패처에 없다**(REF5 전용 경로로 별도 처리 → 5번째 kind로 타입 모델에 포함, asymptote와 함께 최후). 디스패치: [`generateSession.ts:769-786`](../packages/core/src/program-engine/generateSession.ts).
- **kind별 top-level 키(dev 실측)**: `manual`={kind, sessions, programFamily} · `operator`={dslVersion, kind, variant, schedule, modules, progression} · `531`={dslVersion, kind, schedule, modules, **assistance**}(operator와 달리 `progression` 없음) · `ref5`={dslVersion, kind, family, id, protocolVersion, modules, progression} · `asymptote`={dslVersion, kind, schedule, modules, progression}. manual item 키={exerciseName, role, rowType, progressionTarget, slot, sets} · set 키={reps, targetWeightKg, percent, rpe, note, amrap}. → **kind마다 키가 실제로 달라 판별 유니온이 정당**.
- 보조 판별자: `family`(REF5 등 fork 정체성 — [`program-registry.ts`](../packages/core/src/program-store/program-registry.ts)의 `PROGRAM_FAMILY_REGISTRY`가 canonical), `dslVersion: 1`, reducer는 kind/family/`operatorStyle`을 혼용해 프로그램을 복원([`reducer.ts:443-461`](../packages/core/src/progression/reducer.ts)).

### 2.2 형태 요약

| 데이터 | 골격 | 특이점 |
|---|---|---|
| `manual` definition | `sessions[] → {key, items[] → {exerciseName, role?, sets[] → {reps?, targetWeightKg?, percent?, rpe?, note?, amrap?}}}` | 동의어 폴백(`name`, `weightKg`), item 자체가 단일 세트인 레거시(`setRows = sets ?? [item]`) |
| LOGIC definition | `{dslVersion, kind, variant?, schedule{weeks, sessionsPerWeek}, modules[], progression{profile, …}}` | kind별로 progression 필드 상이 |
| `defaults` | `{tmPercent?, …}` kind별 상이 | |
| `plan.params` | `timezone, startDate, schedule, sessionKeyMode, autoProgression, trainingMaxKg{}, oneRepMaxKg{}, lightBlockMode, …` | 대부분 `pickTrainingMaxKg` 등 헬퍼 경유 — 직접 접근 4곳뿐 |
| `generated_session.snapshot` | `{schemaVersion: 3, sessionKey, sessionDate, timezone, week, day, plan{}, exercises[], blocks?[], accessories?[]}` | **이미 버전 필드 보유** — 타입 도입에 유리 |

### 2.3 소비자(읽기) 16파일 / 생산자(쓰기) 경로

- **읽기**: program-engine(generateSession) · program-store(model, facets) · progression(reducer, autoProgression, feedback-catalog) · stats(asymptote-monitor) · apps/api(plans, misc) · web(program-store 컨트롤러 2, workout-record model, bootstrap, verifyProgramWorkflows).
- **쓰기**(타입이 계약을 강제할 지점): ① [`seed.ts`](../packages/core/src/db/seed.ts)(공개 템플릿) ② program-store fork/편집 직렬화([`model.ts`](../packages/core/src/program-store/model.ts)의 draft→definition) ③ REF5 정의 생성(generateSession 내) ④ **`userImport.ts` — 내보내기 파일의 임의 JSON을 그대로 insert** (레거시/외부 형태 유입 통로).

### 2.4 기존 자산

- 행위 테스트가 두텁다: program-engine 테스트 16파일(asymptote·ref5·slotted-lp·wendler531·manual-family 등) + `test:progression`.
- golden fixture 문화 존재(`packages/core/fixtures/` — session-key·bodyweight-load, Go/TS 교차 검증).
- 검증 라이브러리(zod 등) **없음** — core는 의존성 경량 유지 중, `toRecord`/`toNumberOrNull` 등 수제 내로잉이 관례.
- `PlannedSet`/`PlannedExercise`/`ProgramSessionDraft` 등 **출력·드래프트 타입은 이미 존재** — 없는 것은 "저장된 definition의 입력 타입"뿐.

## 3. 설계 원칙

1. **Parse, don't validate — 경계에서 정규화**. 흩어진 방어적 읽기(`item?.exerciseName ?? item?.name`)가 사실상의 파서다. raw jsonb는 `unknown`으로 두고, kind별 `parseXxxDefinition(raw: unknown): XxxDefinition` 정규화 함수 하나에 폴백 시맨틱을 **그대로 옮겨 모은다**. 다운스트림은 깨끗한 타입만 소비. raw JSON에 엄격한 타입을 직접 씌우는 것(거짓 타입)은 금지 — DB에는 seed 밖 형태(유저 편집·import 유입)가 실재할 수 있다.
2. **판별 유니온** `ProgramDefinition = ManualDefinition | Wendler531Definition | OperatorDefinition | AsymptoteDefinition (| CanditoDefinition)` — `kind` 판별. 위치: 신설 `packages/core/src/program-dsl/`(프레임워크-무지, core 경계 준수).
3. **폴백 시맨틱 동결**. 정규화 함수는 현재 동작을 1:1로 보존한다(동의어·레거시 단일세트 item·라운딩 입력). "정리"는 이 리팩터의 범위가 아니다.
4. **런타임 검증 라이브러리 미도입(권장)**. zod를 넣는 대신 기존 관례(수제 내로잉)를 유지 — core 의존성 경량 원칙, 그리고 파서가 "실패"가 아니라 "폴백"으로 동작해야 하는 도메인 특성(기존 Unsupported kind 폴백 유지) 때문. *결정 사항 §7-1.*
5. **랫칫(ratchet)**: 디렉터리가 clean해질 때마다 eslint override로 `no-explicit-any`를 그 디렉터리에 한해 warn→error 승격 — 재유입 방지.

## 4. 안전장치 (이 계획의 핵심)

이전 작업의 교훈(메모리: 컬럼 타입 변경 때 캐스트 쿼리는 E2E만 잡았다)대로, **typecheck는 이 리팩터의 회귀를 못 잡는다**. 출력 불변을 기계로 증명한다:

- **G1. 골든 마스터 하네스 (Phase 0 산출물)**: seed된 전 프로그램 × 대표 (week, day) 조합에 대해 `generateSession` 출력 snapshot을 JSON fixture로 캡처(`packages/core/fixtures/generated-sessions/`). 이후 모든 Phase의 PR은 이 fixture와 **바이트 동일**해야 통과. 기존 golden fixture 관례의 확장.
- **G2. DB 실데이터 인벤토리 (read-only)**: dev·prod의 `program_version.definition`을 스캔해 kind별 실제 키 집합·레거시 형태를 수집(FK 작업의 preflight와 동형 — prod 스캔은 승인 게이트). seed에 없는 형태(유저 fork·import 유입)가 타입 모델이 수용해야 할 실범위를 정의한다. candito-linear 실사용 여부도 여기서 판정.
- **G3. 기존 스위트**: core 472+ · `test:progression` · web/apps/api typecheck · E2E smoke(CI).

## 5. 단계별 계획 (PR 6개, 각각 독립 검증·머지)

| Phase | 내용 | 리스크 | 게이트 |
|---|---|---|---|
| ~~**0. 하네스+인벤토리**~~ ✅ | G1 골든(`dsl-golden.test.ts`, LOGIC 디스패처 고정) + G2 dev 인벤토리(`inputs.json`). candito 0·ref5 5번째 kind 발견. | 없음 | ✅ core 473/473, 골든 2회 안정 |
| **1a. `program-dsl` 모듈** ✅ | zod 판별 유니온 + `parseProgramDefinition` + conformance 테스트(실 정의 전수). 소비자 미연결. | 없음 | ✅ core 477/477, conformance green |
| **1b. seed 쓰기 경로** ✅ | seed `upsertVersion(values.definition)`를 `ProgramDefinition`으로 타이핑 — 18개 canonical 정의가 컴파일 타임 계약 검사 통과, 향후 malformed seed 프로그램은 빌드에서 차단. 런타임 무변경. | 없음 | ✅ core 477/477, web·apps/api typecheck |
| **2 예정: program-store 쓰기 직렬화** | fork 재료화(`model.ts`의 `{kind:"manual", operatorStyle, …}` 생산)는 program-store **로컬 정의 타입**(`ManualDefinitionSession` 등)과 얽혀 있음 → Phase 2에서 로컬 타입을 zod-inferred 타입으로 **수렴**하며 함께 처리 | 중 | G1 불변 |
| **2. manual 경로** | `pickManualSession`/`mapManualSet`/`plannedExercisesFromManualSession`이 `parseManualDefinition` 경유로 전환 | 중 | G1 바이트 동일 + manual 계열 행위 테스트 |
| **3. LOGIC kind별 1PR** | operator → 531 → asymptote 순(asymptote 최후 — ref5/hybrid 얽힘 최대). 각 generator의 def/defaults 접근을 타입 경유로 | 중~높음 | kind별 G1 + 해당 행위 테스트 |
| **4. Snapshot v3 타입** | 엔진이 `SnapshotV3`를 생산하도록 타입 부여 → 소비자(home-service `buildPlannedExercises`·workout-record model·plans bootstrap) 순차 전환. PR #597에서 남긴 홈 잔여 5건 해소 | 중 | G1 + E2E smoke |
| **5. 잔여+랫칫** | reducer/program-store 잔여 `any`, `params` 헬퍼 시그니처, clean 디렉터리 eslint error 승격 | 낮음 | 전체 스위트 |

각 PR은 **타입/경계 이동만** 포함하고 로직 변경 0을 원칙으로 한다. G1이 깨지면 그 diff 자체가 잡아낸 잠복 버그이므로, 수정이 아니라 **보고 후 별도 결정**(골든을 고치지 말 것).

## 6. 리스크 / 하지 말 것

- **DB에는 seed 밖 형태가 있다**(유저 편집 fork, import 유입) — G2 없이 타입을 확정하지 말 것. 타입은 실데이터 합집합을 수용해야 한다.
- **폴백 제거·"정리" 금지** — 출력이 변하면 실사용자 세션이 변한다. 이 리팩터에서 시맨틱 변경은 전면 금지.
- **asymptote를 먼저 하지 말 것** — ref5·hybrid·monitor가 얽혀 있어 마지막에.
- reducer의 kind/family 복원 로직(`reducer.ts:443-`)은 fork된 manual에도 동작해야 하므로 판별을 kind에만 의존시키지 말 것(registry family가 canonical).
- 한 PR에 여러 Phase를 합치지 말 것 — G1 diff의 원인 추적이 불가능해진다.

## 7. 결정 사항

1. **런타임 검증**: ✅ **zod 채택**(2026-07-23) — 스키마=타입=파서 단일 소스로 드리프트 차단. 서버 사이드 한정 + Phase 1에서 번들 예산 확인.
2. **candito-linear**: ✅ **dev·prod 모두 0건 확인** → 타입 모델에서 제외 완료. **엔진 분기 삭제는 Phase 3(LOGIC)에서** — 골든이 지키는 상태에서 죽은 분기 제거.
3. **G2 prod 스캔**: ✅ 완료(2026-07-23). fork 필드 `operatorStyle`·`setNumber` 발견해 스키마 반영. import 유입 형태는 `userImport.ts`가 임의 JSON을 insert하므로 Phase 1b/2에서 `parseProgramDefinition` 관용성(`.passthrough()`+fallback)으로 흡수.
