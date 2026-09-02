# REF5 v1.4 OAP 스킬 슬롯 — 구현 계획

> 규범: [`ref5-program-spec.md`](ref5-program-spec.md) v1.4 (PR #738). 이 문서는 그 규범을 코드로 옮기는 **작업 순서·터치 지점·테스트 매핑**이다. 스펙과 충돌하면 스펙이 이긴다(§2).
> 기준선(2026-09-02 main `61c79872`): core 692/692, 프로토콜 `1.3`, 엔진 `513`, 스키마 `3`, 시작 구성 `2`.
> 제약: 되돌리기 입력 필수. §25 v1.4 테스트 요구 전부 + 기존 스위트 회귀 0. v1.3 스냅샷·프로토콜 거부. **새 플랜 생성은 하지 않는다**(컷오버는 사용자가 §19.6대로 직접).

## 0. 설계 결정 (코드에 들어가기 전에 고정)

| # | 결정 | 이유 |
|---|---|---|
| D1 | `Ref5Stream`(12개, `failStreams` 키)은 **그대로 둔다**. `PULL_VOLUME_NORMAL`은 되돌리기 전용으로 남는다. 새로 `REF5_ACTIVE_STREAMS`(11개, §14 목록)를 export하고 테스트로 고정한다 | 상태 모양·reset 로직·TUI 문자열이 안 바뀐다. 스펙 §14 "11 + 되돌리기 전용 12번째 슬롯"과 정확히 일치 |
| D2 | OAP 처방 키 4개(`OAP_LEFT`·`OAP_RIGHT`·`OAP_NEG_LEFT`·`OAP_NEG_RIGHT`)는 `Ref5OapKey`로 두고 `Ref5PrescriptionKey = Ref5Stream \| Ref5OapKey`를 만든다. `Ref5ExercisePrescription.stream`·완료 `outcomes` 레코드·`REF5_REST_SECONDS`·`prescriptionId`가 이 키를 쓴다 | DB replay가 `outcomesByStream`으로 **stream 키 → 결과**를 만들므로 좌/우가 같은 키면 충돌한다. 키를 흐름과 분리하면 `failStreams[item.stream]` 접근이 OAP에서 undefined가 되는 함정도 타입으로 막힌다 |
| D3 | `Ref5Lift`(5개)는 그대로. 처방의 lift는 `Ref5PrescriptionLift = Ref5Lift \| "OAP"`, `Ref5ProgressionChange.lift`도 같은 확장 타입 | `Record<Ref5Lift, …>`가 web e1RM 입력·캘리브레이션에 쓰여 union을 넓히면 전부 깨진다 |
| D4 | OAP 운동 이름은 `"Assisted OAP · Left"`, `"Assisted OAP · Right"`, `"OAP Negative · Left"`, `"OAP Negative · Right"`. **"Pull-Up"·"풀업"·"Chin-Up"·"친업"을 이름에 넣지 않는다** | `isBodyweightExerciseName`(core `bodyweight-load.ts`)과 TUI `isBodyweightExercise`가 substring으로 맨몸 판정을 해서 체중 프롬프트·총중량 계산에 걸린다. 캘리브레이션 strict match(`ref5CalibrationLiftForExerciseName`)는 이미 완전일치라 안전하지만 §5.3대로 테스트로 고정한다 |
| D5 | OAP 세트는 `externalLoadKg: 0`, `totalLoadKg: 0`, 처방에 `oap: { arm, rung, rungName, negative }` 메타. `progressionTarget`은 `null`(5개 타깃 enum 밖), 스냅샷 `role: "MAIN"` 유지(세션 카드가 MAIN만 그린다), `ref5.role: "SKILL"` | 저장 경로가 `weightKg`를 처방과 대조하므로 0을 처방해야 0으로 저장된다 |
| D6 | 런타임 상태 `oap.left/right = { rung, passStreak, failStreak, negativesUnlocked, achieved, lastFreeExposureAt }`. 시작 구성 `oap.left/right.startRung`(정수 1–6, 기본 2) | 스펙 §7.5.2·§24.2 |
| D7 | 되돌리기는 `Ref5SessionInput.oapSlotReverted: boolean`(기본 false). 생성 요청·raw event·API body·web 시작 패널·TUI 시작값 전부에 관통. 계획 params에는 넣지 않는다 | 스펙 §7.6. params 불변 규칙(crud.ts)과 충돌 없이 replay 재현 |
| D8 | OAP 진행 변화는 `Ref5ProgressionChange`에 `kind: "OAP_PROMOTE" \| "OAP_DEMOTE" \| "OAP_ACHIEVE"`, `lift: "OAP"`, `beforeKg/afterKg`에 **단 번호**, 추가 필드 `arm`. 소비자(web `recent-changes.ts`, TUI `ref5_recent_changes.go`, `feedback-catalog.ts`, 판정 카드 #672)는 kind별로 "kg" 서식을 붙이지 않게 감사한다 | 이력 채널을 하나로 유지. 단을 kg로 찍는 회귀는 테스트로 막는다 |
| D9 | 버전 상수: `REF5_PROTOCOL_VERSION = "1.4"`, `REF5_PRIOR_PROTOCOL_VERSION = "1.3"`, `REF5_PROGRAM_VERSION = 4`, `REF5_RUNTIME_SCHEMA_VERSION = 4`, `REF5_SNAPSHOT_SCHEMA_VERSION = 4`, `REF5_START_CONFIG_VERSION = 3`, `REF5_ENGINE_VERSION_V14 = 514`(integration·auto-progression 양쪽), TUI `Ref5ProtocolVersion = "1.4"`, `Ref5RuntimeSchemaVersion = 4` | §24.3. 리터럴 가드(`ref5-protocol-version-guard.test.mjs`)가 web/api/tui 복제를 잡는다 |
| D10 | 시드: 템플릿 버전 2를 **제자리 재라벨**(v1.3 컷오버 #617과 동일 방식)하고 defaults에 `oap` 추가. `upsertPlanForUser`가 params를 갱신하므로 시드 플랜 재라벨은 자동. 단 dev 스키마에 남은 v1.3 generated_session은 replay가 거부한다(함정 3) | v1.3 때 6줄 변경으로 끝난 전례 |

## 1. 작업 순서 (커밋 단위)

한 PR, 커밋 6개. 각 커밋 끝에 해당 단계 검증을 돌린다. 이전 커밋이 초록이어야 다음으로 간다.

### C1 · core 엔진 컷오버 (`packages/core`)

**`program-engine/ref5-protocol-version.ts`** — D9 값. 주석의 "v1.3" 언급 갱신.

**`program-engine/ref5.ts`**
- 상수 5개(D9), 헤더 주석 v1.4.
- 타입: `Ref5OapArm = "left" \| "right"`, `Ref5OapRung = 1..6`, `REF5_OAP_RUNGS`(단 번호→명칭·정의, §7.5.2 표 그대로), `Ref5OapKey`, `Ref5PrescriptionKey`, `Ref5PrescriptionLift`, `REF5_ACTIVE_STREAMS`(11), `REF5_OAP_KEYS`, `REF5_PRESCRIPTION_KEYS`.
- `Ref5ExerciseRole`에 `"SKILL"` 추가. `Ref5ExercisePrescription`에 `oap?: { arm, rung, rungName, negative: boolean }`.
- `Ref5StartConfig`에 `oap: Record<Ref5OapArm, { startRung }>`. `validateRef5StartConfig(value)`의 입력을 `{ startingValuesKg, oap? }`로 넓힌다 — **호출부 3곳**(`normalizeRef5StartConfig`·`readRef5PlanStartConfig`·apps/api `resolveRef5PlanStartConfig`·web `readRef5StartConfigFromTemplate/PlanParams`)이 지금 `startingValuesKg`만 넘기므로 시그니처를 `validateRef5StartConfig(startingValuesKg, oap?)`로 두는 편이 파급이 작다. `oap` 없음 = 2/2, 정수 아님·범위 밖·좌우 누락 = 거부. `ohpMicroloading`은 계속 무시.
- `Ref5SessionInput.oapSlotReverted: boolean`(validate: boolean 아니면 거부). `Ref5SessionDecision.oap: null \| { reverted, left: { rung, negative }, right: {...} }`.
- `Ref5RuntimeState.oap`(D6). `createInitialRef5State(standards, oapStart?)`로 시작 단 주입. `cloneState` 그대로.
- `generateRef5Session` BP 분기: `input.oapSlotReverted` → 기존 `pullExercise(VOLUME, NORMAL)`; 아니면 `oapExercises(snapshotId, state.oap, input.actualStartAt)` — 좌/우 `2×3`(`sets: prescriptionSets(2, 3, 0, 0)`), 팔별 `negativesUnlocked && rung >= 4 && !achieved`면 `OAP_NEG_*` `1×2`; `achieved`면 5단 `2×3` + (직전 프리 노출로부터 ≥168h면) 프리 `1×1`(키는 `OAP_LEFT/RIGHT`에 `oap.rung: 6`으로 표현 — 별도 키를 늘리지 않는다). 프리 1×1의 "직전 프리 노출"은 **START 시각** 기준(`lastFreeExposureAt`은 START에서 기록).
- `applyRef5FirstSquatStart`: 달성 팔에 프리 세트가 생성된 스냅샷이면 `oap[arm].lastFreeExposureAt = snapshot.actualStartAt`.
- `normalizeCompletionOutcomes`: "non-prescribed stream" 루프를 `REF5_PRESCRIPTION_KEYS`로.
- `reduceRef5Completion`: 노출 루프 **맨 앞**에서 `item.oap`면 분기 — `OAP_NEG_*`는 기록만, `OAP_LEFT/RIGHT`는 §7.5.4 팔별 갱신(PASS→passStreak+1·failStreak=0, 3이면 승급; FAIL→failStreak+1·passStreak=0, 2이면 강등(1단 하한, 카운터만 초기화); HOLD→둘 다 0; INVALID→무변화). 승급으로 4단 도달 시 `negativesUnlocked = true`. 6단 승급 조건 충족 시 `achieved = true`, rung 6 유지, 카운터 초기화. 달성 팔은 이후 무변화. 변화마다 D8 change 기록. **이 분기는 `next.failStreams`·`mainWindows`·`forcedMicro`·`immediateCauses`에 절대 닿지 않는다.**
- `REF5_REST_SECONDS_BY_STREAM`을 `Record<Ref5PrescriptionKey, number>`로, OAP 4키 150.
- `Ref5RawLogEvent.oapSlotReverted?: boolean`, `replayRef5RawLogs`가 넘긴다.
- `decodeRef5SessionSnapshot`: 스키마 4 검사(기존 코드가 상수 비교라 자동). `REF5_V12_REMOVED_STATE_KEYS` 그대로.

**`program-engine/ref5-status.ts`** — `oap: { left: { rung, rungName, passStreak, failStreak, negativesUnlocked, achieved }, right }` 추가. `isRef5State` 스키마 4.

**`program-engine/ref5-integration.ts`** — `REF5_ENGINE_VERSION_V14 = 514`. `Ref5GenerateRequest.oapSlotReverted: boolean`. `normalizeRef5GenerationRequest`에서 `=== true`로 정규화. `toRef5GeneratedSnapshot`: 상위 envelope `schemaVersion: 4`는 generated_session 봉투 버전이라 **건드리지 않는다**(도메인 스냅샷 `REF5_SNAPSHOT_SCHEMA_VERSION`만 3→4), exercises에 `progressionTarget: exercise.lift === "OAP" ? null : targetForLift(...)`, `ref5.oap`·set meta에 `oap` 전달, `note`에 `"좌 · 2단 전완"` 식 라벨(PULL note와 같은 자리). 기존 행 재시도 동등성 검사에 `oapSlotReverted` 추가.

**`progression/ref5-auto-progression.ts`** — `REF5_PROGRESSION_ENGINE_VERSION_V14 = 514`, 감사 행·runtime row `engineVersion` 514. `Ref5CanonicalExerciseOutcome.stream/lift` 타입 확장(D2·D3). 그 외 로직 무변경(stream 키 기반이라 OAP가 자연 통과). `decodeRef5RuntimeState` 스키마 4.

**`db/seed.ts`** — D10. `ref5StartConfig`에 `oap: { left: { startRung: 2 }, right: { startRung: 2 } }`, `profile: "ref5-v1.4"`. ⚠️ `seed.ts` import를 바꾸면 `db-seed.yml`의 seed-tracked-files 목록·가드를 확인(type-only는 예외).

**테스트(C1)** — `ref5.test.ts`에 §25 v1.4 항목을 **1:1로** 추가(테스트명에 § 번호):
1. BP 집중 세션: OAP 좌/우 2×3, 페어 회계 `totalWorkingSets === 10`, `PULL_VOLUME_NORMAL` 없음, PULL 집중·마이크로는 v1.3 스냅샷과 exercises 동등(기존 `first normal session` 테스트의 기대값 유지로 회귀 고정).
2. 승급 3연속 PASS / 강등 2연속 FAIL / HOLD 중립 / INVALID 무진행 / 1단 하한 / 6단 → `achieved` + 유지 처방(5단 2×3, 168h 프리 경계: 정확히 168h 허용·1ms 짧으면 미생성 — §9 경계 스타일).
3. 좌 결과가 우 상태를 안 바꿈.
4. 네거티브: 3→4 승급 다음 노출부터 `OAP_NEG_*` 1×2, `totalWorkingSets === 11`; 3단 이하 미생성; 강등 4→3 중단, 재승급 시 재개; 시작 단 4 이상은 첫 노출부터; 달성 후 미생성.
5. 네거티브 결과(FAIL 2연속 포함)가 사다리 무영향.
6. OAP 독립성: OAP FAIL 2연속이 `directStandardsKg.pullFocusTotalKg`·`mainWindows.PULL`·`failStreams`·`forcedMicro.failEvents`·`nextFocus`를 안 바꿈. PULL 집중창 veto가 마이크로 `PULL_VOLUME_MICRO` FAIL로만 걸림.
7. 되돌리기: `oapSlotReverted: true` BP 집중 → `PULL_VOLUME_NORMAL` 2×6, 10세트, OAP 상태 스냅샷 전후 deepEqual; 그 세션의 볼륨 FAIL이 veto·`failStreams.PULL_VOLUME_NORMAL`에 반영; PULL 집중·마이크로에서 무시.
8. 시작 구성 3: `oap` 생략 = 2/2, `startRung: 0/7/2.5/"2"` 거부, 87.5 PULL 통과, `initializationVersion === 3`.
9. replay: OAP 승급·되돌리기 세션이 섞인 raw 이벤트가 결정적(두 번 재생 deepEqual).
10. `REF5_ACTIVE_STREAMS` 길이 11·`PULL_VOLUME_NORMAL` 미포함; `REF5_STREAMS` 12 유지.
11. 거부: 프로토콜 "1.3"(`REF5_PRIOR_PROTOCOL_VERSION`) 스냅샷·상태·시작 구성 → `Ref5StaleVersionError`. 기존 "v1.3 snapshot decoder rejects…" 테스트를 v1.4로 재명명하고 1.3 케이스 추가.
12. 상수 테스트(`v1.3 constants…`)의 리터럴을 1.4/4/4/3으로.

`ref5-status.test.ts`(+oap 블록·스키마 4 폴백), `ref5-integration.test.ts`(리터럴 "1.3" → 상수, `oapSlotReverted` 정규화·재시도 불일치 거부), `ref5-auto-progression.test.ts`(리터럴, 엔진 514), `ref5-log-sets.test.ts`(리터럴, OAP 세트 weight 0), `ref5-start-calibration.test.ts`(D4 이름 4개가 `null`), `bodyweight-load.test.ts`(D4 이름 4개가 `false`), `program-store/model.test.ts`(리터럴).

검증: `pnpm -C packages/core test` (692 + 신규 전부), `pnpm -C packages/core typecheck`, `lint:boundary`, `lint:no-any`.

### C2 · apps/api

- `lib/ref5-plan-creation.ts`: `resolveRef5PlanStartConfig`가 `source.oap`도 넘긴다. 테스트: oap 생략 기본값, 잘못된 rung 거부, 1.25 OHP 거부 유지.
- `routes/plans/generate.ts`: body `ref5.oapSlotReverted === true` 파싱·전달. 409 메시지 그대로.
- `routes/plans/crud.ts`: 400 메시지에 "OAP 시작 단 1–6" 추가(ko/en). `REF5_STALE_VERSION` 경로는 상수라 자동.
- `route-order.test.ts` 스냅샷 변화 없음 확인.

검증: `pnpm -C apps/api typecheck`, 테스트, `lint:boundary`.

### C3 · web

- `features/program-store/model/use-program-store-start-program-controller.ts:215` `schemaVersion !== 3` 리터럴 → `REF5_RUNTIME_SCHEMA_VERSION`(가드 밖이었던 자리 — 이번에 상수화). `readRef5StartConfigFromTemplate/PlanParams`가 `oap` 통과. 드래프트에 `ref5OapStartRungs` + `ref5-start-setup.tsx`에 좌/우 단 선택(V2 프리미티브, 기본 2, 단 명칭 표시). 컨트롤러 테스트에 oap 케이스.
- `features/workout-log/ui/ref5-session-start-panel.tsx`: `oapSlotReverted` 토글(`V2Switch`, 기본 off). **BP 집중 차례일 때만 노출**(status.nextFocus === "BP" — 미리보기 응답의 `decision.focus`가 더 정확하니 미리보기 후 재노출도 허용). 요청 페이로드에 포함. `ref5-session-start.test.ts` 갱신.
- `lib/workout-record/ref5-outcome.ts`: `resolveRef5OapDisplay(exercise)` → `{ arm, rung, rungName, negative }`. `workout-exercise-card.tsx`가 PULL suffix 자리에 OAP suffix(`좌 · 2단 전완` / `L · rung 2 forearm`), 네거티브면 `네거티브 1×2`. 세트 행의 무게 입력은 ref5라 readOnly — 0으로 보인다; OAP면 무게 칸을 숨긴다(작은 조건 분기, 테마 포크 아님).
- `lib/workout-record/model.ts`: `readRef5SessionMeta` 스키마·버전은 상수라 자동. 테스트 리터럴 "1.3" 갱신.
- `features/ref5/model/window-progress.ts` + `components/ref5/ref5-window-progress-panel.tsx`: 판정창 행 아래 OAP 행 2개(좌/우: `2단 전완 · PASS 1/3`, 해금·달성 배지). `window-progress.test.ts`.
- `widgets/plans-manage-screen/ref5-status-panel.tsx`: OAP 블록. `features/ref5/model/recent-changes.ts`: `OAP_*` kind 서식(단 번호, kg 금지) + 테스트.
- `server/db/verifyProgramWorkflows.ts`: 리터럴 없음(상수) — 무변경 예상. `db:verify:programs`는 DB 환경 있을 때만.

검증: `pnpm -C web typecheck`, `lint`, `lint:design`, `test:unit`, `test:progression`.

### C4 · apps/tui (Go)

- `internal/api/plans.go`: `Ref5ProtocolVersion = "1.4"`, `Ref5RuntimeSchemaVersion = 4`.
- `internal/api/ref5.go`: 시작 요청 struct에 `OapSlotReverted bool \`json:"oapSlotReverted"\``; `Ref5PlanStatus`에 `Oap` 블록; 처방 struct에 `Oap *Ref5OapPrescription`.
- `internal/ui/ref5_model.go` `ref5StartValues`에 `OapSlotReverted`(signature에 포함되어 재시도 동등성 유지). `ref5_view.go`/`ref5_update.go`: 시작 화면에 토글 1개(키 바인딩은 기존 manualMicro 옆). `log_view.go:235` `isPull` 판정은 lift 기반이라 OAP 무관. 세트 컨텍스트에 `oap` 라벨.
- `internal/ui/ref5_window.go`: OAP 좌/우 줄(웹과 같은 의미: 단·`n/3`·해금·달성). `ref5_recent_changes.go`: `OAP_*` kind.
- `programs.go` 계획 생성: `oap` 생략(서버 기본 2/2) — TUI에서 단 입력은 이번 범위 밖(웹만). README에 명시.
- 테스트: `ref5_test.go:518` 리터럴 "1.3" → "1.4"; `golden_fixtures_test.go`가 core fixtures를 대조하면 함께; `ref5_window_test.go`·`ref5_recent_changes_test.go` 스냅샷; ⚠️ 폭 테스트는 줄 길이가 아니라 **의미 단위 동일 줄**로(lipgloss 접힘).

검증: `go build ./... && go vet ./... && go test ./...`(로컬 Go 1.26 정상). gofmt는 CRLF 탓 전 파일이 뜨니 변경 파일만.

### C5 · e2e (nightly, PR 게이트가 파일 변경을 강제)

`web/e2e/ref5-user-journey.spec.ts` 전수 감사:
- BP 집중 세션(focus: "BP")의 `fillCurrentRef5Session` 오버라이드에서 `"Weighted Pull-Up"` 키를 `"Assisted OAP · Left"`·`"Assisted OAP · Right"`로. 카드 루프는 aria-label 기반이라 카드 수 증가는 자동.
- **볼륨 veto 시나리오**(`ref5-volume-veto-next-session.png` 근처): BP 집중의 PULL 볼륨 FAIL로 PULL 창 veto를 만들던 케이스는 v1.4에서 불가. 둘 중 하나로 바꾼다 — (a) PULL 집중 세션의 BP 볼륨 FAIL로 BP 창 veto를 검증(의미 동일, 종목만 교체), (b) `oapSlotReverted: true`로 시작해 v1.3 경로를 검증. **둘 다** 넣는 게 §25(되돌리기·veto 입력) 커버리지에 맞다.
- 신규: OAP 3연속 PASS 승급이 상태 API `oap.left.rung === 3`로 보이는지, 되돌리기 토글이 BP 차례에만 보이는지.
- `setCount: 10` 기대값은 네거티브 없는 한 유지. 네거티브 시나리오는 상태 API 단언으로만(UI 11세트 확인 1회).
- `readRef5Status` 응답에 `oap` 블록.
- 실행: `gh workflow run e2e-nightly.yml --ref <branch>`로 브랜치에서 1회 확인. ⚠️ 로컬 dev는 CI와 기능 플래그가 다르고, 로컬 DB엔 데이터가 있고 CI엔 없다.

### C6 · 문서·시드 마무리

- `docs/ref5-program-spec.md` §0 표 "구현 전" 문구 → 구현 병합 표기, §28 v1.4 "구현 대기" 제거(스펙과 같은 PR에서 갱신 — §26.3).
- `README.md`·`apps/tui/README.md`의 REF5 v1.3 언급 갱신. `web/docs/program-seed-guide.md` REF5 항목.
- `CLAUDE.md`는 REF5 버전을 적지 않으므로 무변경.

## 2. 함정 목록 (v1.3 컷오버·정정에서 실제로 난 것)

1. **리터럴 전수** — 가드는 `protocolVersion` 줄만 잡는다. `schemaVersion: 3`(web 컨트롤러 215행)·`513`·`"ref5-v1.3"` 프로필 문자열은 가드 밖이니 `grep -rn '"1\.3"\|schemaVersion: 3\|513\|ref5-v1\.3'`로 직접 훑는다(위 §1에 자리 명시).
2. **nightly 스펙** — 범프 가드가 `web/e2e/*ref5*.spec.ts` 변경을 요구한다. 세트 수 외에 **카드 이름**이 바뀌는 첫 범프다.
3. **시드 플랜 stale** — D10. 실측: `upsertPlanForUser`(seed.ts:174)가 `params`를 갱신하므로 플랜 재라벨은 자동이다. 남는 문제는 그 플랜 아래 **v1.3 generated_session 행** — `loadRef5ReplaySource`가 전 행을 `decodeRef5SessionSnapshot`으로 열어 1.3이면 던진다. dev 스키마에서 데모 재생 시더를 돌리기 전에 그 플랜의 generated_session·workout_log를 비우거나(시드 옵션), 시더가 REF5 플랜을 새 이름으로 만들게 한다. 안 되면 시드에서 REF5 플랜 params를 현재 버전으로 재라벨(진행 상태는 replay가 다시 접는다 — 단 v1.3 스냅샷이 남아 있으면 `decodeRef5SessionSnapshot`이 거부하니 시드 플랜의 generated_session도 정리해야 한다). CI E2E 레인은 fresh DB라 안전.
4. **OAP 노출 루프 순서** — `reduceRef5Completion`의 첫 루프가 `next.failStreams[item.stream]`을 바로 읽는다. OAP 분기를 **그 앞에** 두지 않으면 undefined에 `+= 1` 해서 조용히 NaN이 된다(예외가 아니다). 테스트 6이 이걸 잡는다.
5. **맨몸 이름 매칭** — D4. 이름을 바꾸면 웹·TUI 양쪽 substring 판정에 걸린다. 테스트로 고정.
6. **되돌리기 재시도 동등성** — `buildRef5PlanSession` persist 경로의 기존 행 대조에 `oapSlotReverted`를 넣지 않으면 "OFF로 미리보기 → ON으로 시작" 재시도가 다른 스냅샷을 조용히 반환한다.
7. **진행 변화 kg 서식** — D8. 실측: web `features/ref5/model/recent-changes.ts:87-89`가 모든 change를 `${before} → ${after} kg`로 찍고, core `feedback-catalog.ts:556-561`이 kind로 switch한다. 둘 다 `OAP_*` 분기 + 테스트. `aggregateRef5EventType`(auto-progression)은 `OAP_*`를 `REF5_COMPLETE`로 접는데, 판정 카드에 OAP 승급을 띄우려면 `REF5_OAP` 이벤트 타입을 추가해야 한다 — 이번 범위에서는 **추가하지 않고** 상태 패널 표출로만 충족(§18은 현재 단·연속 PASS 표출을 요구할 뿐 카드를 요구하지 않는다).
8. **TUI 폭·접힘** — OAP 줄이 길다(`좌 2단 전완 PASS 2/3 · 네거티브`). 헤드리스 렌더로 접힘 확인.
9. **git add** — 커밋 전 `git diff --cached` 내용 확인(동시 편집 파일 섞임 전례).

## 2b. 계획 대비 실제 (구현 후 기록)

계획서를 예측으로만 남기지 않기 위해, 실제로 달라진 것을 적어 둔다.

| 항목 | 계획 | 실제 | 왜 |
|---|---|---|---|
| OAP 키 개수 | 4 (D2) | **6** (`OAP_FREE_LEFT/RIGHT` 추가) | 달성 팔의 유지 처방은 "5단 2×3 + 프리 1×1"이라 한 팔에 두 처방이 동시에 존재한다. `prescriptionId`가 `${snapshotId}:${key}`라 키를 공유할 수 없고, 한 노출이 두 단에 걸치면 §7.5.4 판정이 비교 불가능해진다 |
| 세트 회계 | 좌팔만 세기 | **페어 종류별 max** | 한쪽 팔만 네거티브가 해금된 상태에서 좌팔만 세면, 그 팔이 우측일 때 +1이 사라진다 |
| 프리 세트 판별 | `rung === 6` | **`kind` 필드** | 승급으로 6단에 올랐지만 아직 달성이 아닌 팔은 6단에서 2×3 사다리를 수행한다. 단만 보면 유지 처방과 구분되지 않는다 |
| `buildRef5Status` 2번째 인자 | 직접 기준 | **시작 구성 전체** | 첫 세션 전에는 런타임 상태가 없어, 계획이 고른 시작 단이 아니라 기본값 2/2가 표시된다 |
| 미리보기 세트 수 | 언급 없음 | **엔진 `totalWorkingSets` 우선** | 웹 미리보기가 운동 행을 합산해 OAP 좌/우를 두 번 세면 10세트가 12로 보인다 |
| 강도 표기 | `weightSuffix` 재사용 | **`intensityLabel` 신설** | `weightSuffix`는 무게가 있을 때만 렌더된다. OAP는 무게가 없어 "0kg"을 만들어야 붙는데, 그 값은 거짓이다 |
| C1/C2 커밋 분리 | 별도 | **한 커밋** | core의 `Ref5GenerateRequest`에 필수 필드가 늘어 apps/api가 같은 커밋에서 고쳐지지 않으면 타입체크가 깨진다 |
| 운동 카탈로그 | 언급 없음 | **6개 등재 필요** | 계획서가 통째로 놓쳤다. REF5 저장 경로가 세트의 운동 이름을 카탈로그에서 못 찾으면 세션을 거부한다 — 유닛·타입체크는 전부 초록인데 E2E 데모 시드만 500으로 터졌다. 카탈로그 등재와 이름 제약을 묶는 테스트를 추가했다 |

## 3. 완료 정의

- [ ] §25 v1.4 항목 12개가 테스트명으로 식별 가능하게 존재하고 통과
- [ ] core 692 → 692 + 신규, web test:unit·progression, apps/api, TUI go test 전부 초록
- [ ] typecheck(core·web·api)·lint·lint:design·경계 린트 2개 통과
- [ ] `ref5-protocol-version-guard.test.mjs`·`ref5-protocol-bump-e2e-guard.mjs` 통과
- [ ] nightly e2e 브랜치 실행 1회 초록
- [ ] 스펙 §0·§28 "구현 대기" 문구 갱신이 같은 PR에
- [ ] PR 본문에 §26.3 체크리스트 답변, 실행하지 못한 검증은 "미실행"으로 명시
- [ ] 새 플랜을 만들지 않았음(prod DB 무접촉)
