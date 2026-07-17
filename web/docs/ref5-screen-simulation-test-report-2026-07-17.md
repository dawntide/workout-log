# REF5 화면 모의 실테스트 결과 (2026-07-17)

## 결론

- 모바일 Chromium(390×844)에서 가입부터 REF5 활성화, 세션 수행, 복구, 수정·삭제까지 실제 UI로 조작했다.
- REF5 10개 운용 흐름과 일반 프로그램 복구 비교 1개를 검증했다.
- 발견한 미저장 부분 입력 복구 결함은 수정 완료했다. 수정 후 REF5와 일반 프로그램 모두 새로고침 뒤 입력값이 복구됐다.
- 결함은 공통 복구 모듈에서 나타났지만 발생 조건은 REF5 전용이었다. 일반 프로그램은 수정 전에도 정상 복구됐다.

## 환경과 데이터 경계

- 로컬 Next.js `127.0.0.1:3000` + Hono API `127.0.0.1:8787`
- Supabase PostgreSQL의 `dev` 스키마
- 시나리오마다 신규 테스트 계정을 생성했다. 운영 계정·운영 로그·마이그레이션은 건드리지 않았다.
- 쓰기는 브라우저 UI를 통해 수행했다. API 직접 호출은 상태와 저장 결과의 읽기 검증에만 사용했다.

## 화면 시나리오 결과

| 시나리오 | 결과 | 확인 내용 |
|---|---|---|
| 가입 → 스토어 → REF5 고정 시작 → 첫 세션 | 통과 | 미리보기는 상태 불변, 시작·9세트 입력·저장 후 SQ/PULL/DL 창이 1 증가 |
| PASS/HOLD/FAIL/INVALID | 통과 | 모순 입력 CHECK, INVALID 창 제외, PULL INVALID 시 우선순위 유지 |
| 강제·수동 마이크로 | 통과 | 주운동 FAIL 조합은 다음 4세트 마이크로 생성, 시작 시 1회 소비, 수동 마이크로는 판정창 불변 |
| 전체 판정창·보조 상한·PULL 잠금 | 통과 | SQ 85, BP 85, PULL 총 90, DL 75kg; OHP는 상한으로 32.5kg 유지; 일일 체중 변동 중 PULL 총목표 고정 |
| 보조 볼륨 FAIL veto | 통과 | BP 집중 4회 PASS여도 BP 볼륨 FAIL 때문에 82.5kg 유지 |
| 동일 흐름 2회 FAIL | 통과 | PULL 총목표 87.5 → 85kg 즉시 감소, 다음 화면 +10kg/총 85kg |
| 정체 2창 → 마이크로 → 재평가 | 통과 | SQ 유지 창 2개 뒤 `STAGNATION_SQ` 마이크로, 재평가 유지 시 82.5 → 80kg |
| REF5 부분 입력 새로고침 복구 | 통과 | 복구 시트에서 복구 후 첫 반복값 `2` 유지 |
| 일반 프로그램 부분 입력 새로고침 복구 | 통과 | 비교군에서도 첫 반복값 `2` 유지 |
| 새로고침 재개·멀티탭 중복 저장 | 통과 | 같은 시작 세션을 두 탭에서 재개하고 저장해도 시작·완료·판정창은 1회만 반영 |
| 48h·168h 경계 | 통과 | 47h59m=V, 48h00m=하드; 167h59m=V, 168h00m=하드 |
| 과거 로그 수정·삭제 정방향 재계산 | 통과 | PULL FAIL→PASS 수정 시 85 → 87.5kg 복원, 최신 로그 삭제 시 완료 수와 SQ/PULL 창 감소 |

성공한 시나리오 실행에서 브라우저 `pageerror`, console error, HTTP 5xx는 0건이다.

## 발견 결함과 수정

### 원인

REF5 시작 세션 새로고침 시 URL의 `sessionId`와 localStorage draft는 먼저 준비되지만, 서버에서 현재 REF5 draft를 불러오는 작업은 아직 끝나지 않았다. 복구 로직이 이 `null` 상태에서 호환성 검사를 실행해 저장 draft를 다른 세션으로 판정하고 삭제했다.

일반 프로그램은 REF5의 `generatedSessionId`·`startEventId` 일치 검사를 사용하지 않아 같은 타이밍에도 복구됐다. 따라서 프로그램 전체의 공통 증상이 아니라 REF5의 엄격한 세션 동일성 검사와 초기 로드 순서가 만난 경쟁 조건이다.

### 수정

- 현재 서버 draft가 준비된 뒤에만 저장·복구 훅을 활성화한다.
- REF5 프로토콜 버전, `generatedSessionId`, `startEventId` 검사는 그대로 유지한다.
- 동일 세션은 허용하고 구버전·다른 탭 세션은 거절하는 단위 테스트를 보강했다.
- REF5와 일반 프로그램의 실제 새로고침 복구 E2E를 회귀 테스트로 추가했다.

## 자동화와 회귀 결과

- 화면 자동화: [`ref5-user-journey.spec.ts`](../e2e/ref5-user-journey.spec.ts)
- REF5 전체 실행: 앞 6개 통과 후 같은 IP 신규가입 5회/시간 제한으로 나머지 5개가 HTTP 429에서 차단됨
- 저장소의 공식 E2E 옵션 `WORKOUT_DISABLE_RATE_LIMIT=1`로 가입 제한만 해제해 차단된 5개 재실행: `5 passed (3.1m)`
- 따라서 11개 시나리오의 기능 경로는 모두 통과했다. 429와 `Retry-After` 응답도 보안 제한의 정상 동작으로 별도 확인했다.
- web unit: 119/119 통과
- core unit: 365/365 통과
- progression: 67/67 통과
- core 금지 import 경계: 위반 0건
- web typecheck, ESLint, design-lint: 통과

재실행 시 반복 신규가입 제한을 피하려면 웹 테스트 서버 시작 환경에 E2E 전용 옵션을 둔다.

```powershell
$env:WORKOUT_DISABLE_RATE_LIMIT='1'
pnpm -C web dev

$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
$env:CI=''
pnpm -C web exec playwright test e2e/ref5-user-journey.spec.ts --project chromium --workers=1
```

실행 증거는 `web/test-results/`, HTML 리포트는 `web/playwright-report/index.html`에 생성되며 둘 다 git-ignore 대상이다.

## 이번 테스트의 한계

- 실제 iOS/Android 기기, Safari, PWA 오프라인·서비스워커 전환은 포함하지 않았다.
- 화면 시간 경계는 Asia/Seoul에서 검증했다. DST 경계는 core 테스트가 담당한다.
- 동일 기준에서 두 번째 정체 감소 후 `structureReview` 플래그와 v1.1 stale snapshot 거절은 core 테스트로 검증했고, UI에서 장기 세션을 다시 쌓지는 않았다.
