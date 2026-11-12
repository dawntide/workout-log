# 인계 문서 (덮어쓰기)
- 갱신: 2026-11-12 14:30 / 브랜치: docs/handoff-coach-merged / main `af181772` 기준

작업을 마치거나 중단할 때 이 문서를 **덮어써서** 갱신한다. 이력은 `docs/decisions.md`와 git에 있다. 아래는 2026-11-03 프로젝트 메모리에서 옮긴 초기 내용이며, 메모리 기준 시점(마지막 갱신 2026-10-31)이라 **운영 DB·최신 main으로 검증하지 않았다**. 쓰기 전에 확인할 것.

## 현재 상태

- 규범 프로그램: REF5 Adaptive Strength **v1.6**(프로토콜 1.6, 엔진 516). 정본은 `docs/ref5-program-spec.md`. main은 2026-10-31 기준 ae6d256(#766 §19.4 연속일 지침 머지) 이후.
- 사용자 플랜: "REF5 Adaptive Strength 프로그램 2"(엔진 514로 시작한 v1.4 플랜을 새 플랜 없이 이어감, 9/05 시작). **2026-11-12 운영 DB 확인, 11/08 세션까지(rev 50)**: SQ H3 85 / H2 90 / V 72.5, BP 87.5, PULL 총중량 92.5(잠금 +17.5), DL 77.5, OHP 32.5. SQ 창 2는 11/05에 MAINTAIN으로 닫혔고(10/18 H2 FAIL) 유지창 1회 누적, 창 3은 1/6. 창 3도 유지면 정체 마이크로가 예약된다. BP·PULL은 창 2개 모두 INCREASE, 창 3은 각 1/4. DL 2창 INCREASE(다음 80은 v1.5 상한으로는 SQ H3 90부터, v1.6이면 다음 올-PASS 창에서), OHP 2창 MAINTAIN(v1.5 상한). OAP 좌 2단 0/3(10/30·11/08 HOLD), 우 1단 1/3(10/18·10/30 FAIL로 강등). 다음 집중 PULL, 다음 hard H2 90.
- 7/19–11/08 REF5 40세션 중 주종목 FAIL은 10/18 SQ H2 하나뿐. 10/14 이후 12세션은 하드 SQ 5회, 마이크로 5회(자동 4, 11/07 수동 1). 체중은 전 세션 75, `body_measurement` 0행, 세션 메모 0건.
- 현재 기준은 TB 시절 무게(SQ 92.5×3, BP 90×3, PULL 총 약 95×3)보다 낮아서 올-PASS 기록은 아직 프로그램 효과의 증거가 아니다. TB 54세션(3/08–7/17)은 처방 반복 누락이 없었고 SQ TM이 95→100→102.5로 올랐다.

## 진행 중

- **보조 상한 v1.6 머지·배포 완료(2026-11-12, PR #786, main `f3947827`)**: DL·OHP 상한을 직접 작업중량으로 비교한다(`DL ≤ SQ H3`, `OHP ≤ floor2.5(BP 집중 × 0.5)`). 프로토콜 1.6 · 프로그램 6 · 엔진 516. 사용자가 수정안과 머지를 각각 승인했다. 머지 전 CI 9개 체크(E2E 포함) 통과, 머지 뒤 prod·dev 마이그레이션·시드와 프로덕션 배포 성공.
  - 소급 금지: 완료 리듀서가 세션 스냅샷의 프로토콜로 상한 규칙을 고른다(v1.4·v1.5는 종전 REF 상한). 고정 테스트는 `ref5-auto-progression.test.ts`.
  - 배포 직후 운영 DB(읽기 전용): `plan_runtime_state`는 rev 50 그대로이고 DL 77.5, OHP 32.5다. 저장된 프로토콜 표시는 아직 `1.5`이며 읽을 때 `1.6`으로 이어지고 다음 쓰기 때 바뀐다.
  - 운영에서 [미확인]: 다음 세션 미리보기와 상태 패널의 표시 상한(DL 85, OHP 42.5 예상). 사용자의 다음 세션 때 확인한다. 다음 DL·OHP 4회 창(현재 각 1/4)이 올-PASS로 닫히면 2.5씩 오른다.
  - 사용자는 TUI를 쓰지 않는다(2026-11-12 확인). 구버전 TUI 바이너리의 409는 지금 실사용 문제가 아니다.
  - §19.7 보존 판단 기준의 수치는 에이전트 초안이다. 사용자가 따로 확정하지는 않았다.
- **코치 처방 세션 머지·배포 완료(2026-11-12, PR #788, main `af181772`)**: 사용자가 제안서 Q1–Q5에 답해 승인했다(전부 구현 / `generated_session` 재사용 / 메모 양식 / 일지는 프로젝트 메모리 / 토큰은 전환 시점에 발급). 설계와 달라진 점은 [`coach-prescribed-sessions-proposal.md`](coach-prescribed-sessions-proposal.md) 9절, 이유는 [`decisions.md`](decisions.md) 맨 아래.
  - 들어간 것: 시드 템플릿 `coach-prescribed`(프로그램 스토어 노출), `PUT`·`GET /api/plans/:planId/coach-sessions/:date`(PAT 공개 표면), `buildSession`의 코치 분기, MCP 도구 `prescribe_session`·`get_prescribed_session`, 기록 화면의 처방 근거 카드와 **세션 메모 입력란(모든 플랜)**. DB 스키마 변경과 마이그레이션은 없다.
  - 로컬 확인(임시 Postgres + dev 서버): 처방 PUT 201, 같은 본문 재전송 `unchanged`, 검증 오류 400, 카탈로그 밖 종목 400, 기록 화면에 처방과 근거 표시, UI로 저장(세트 9개·메모·세션 연결), 저장 뒤 PUT 409, 처방 없는 날 빈 세션 안내, `plan_runtime_state` 0행.
  - 머지 뒤 확인: 머지 전 CI 9개 체크(E2E, `Verify coach sessions` 포함) 통과. 머지 뒤 `db-migrate`·`db-seed`·`deploy` 성공, Vercel 프로덕션 배포 완료. 운영 DB 읽기 전용 조회로 `program_template`에 `coach-prescribed` v1이 있고, Dev 계정 REF5 상태는 revision 50 그대로(SQ 85·BP 87.5·PULL 92.5)이며 코치 플랜은 0개임을 봤다.
  - [미확인]: 프로그램 스토어 시작 시트의 코치 문구를 브라우저로 보지 않았다(타입체크만). 운영 화면(스토어의 코치 템플릿 카드, 기록 화면의 세션 메모 입력란)은 보지 않았고 운영 API도 호출하지 않았다. 이 클라우드 환경에서 운영 공개 API를 부를 수 있는지도 모른다.
  - 사용자가 정할 것: (머지와 CI 검증 추가는 2026-11-12에 승인받았다. `db:verify:coach-sessions`는 CI E2E 잡의 seed 뒤에서 돈다.) 운영에서 코치 플랜을 실제로 쓰기 시작하는 시점과 `read_write` 토큰 발급은 프로그램 전환 때다.
  - REF5 화면에도 세션 메모 입력란이 보인다. 판정에는 쓰이지 않는다(`workout_log.notes`).
- 2026-11-12 방향성 자문에서 낸 의견(결정 아님): 3일 연속이 가능하면 가운데 날을 쉬어 하드 SQ 2회를 받는다, PULL 집중 다음 날 OAP를 피한다([`decisions.md`](decisions.md) (9)의 재검토 조건인 48시간 내 HOLD/FAIL 재발이 10/30에 충족됨), 체중 실측 전에는 감량을 시작하지 않는다. 10/18 FAIL을 연속일 피로로만 설명하기는 약하다(6/07–09 SQ 82.5×5×3 사흘 연속 뒤 6/11 92.5×3×3 완료).
- §21.1 3창 평가는 세 번째 창이 닫히는 12월 초~중순 예상. 그때 "SQ H3 90–92.5에서 깨끗한 반복으로 TB 수준을 넘는가"를 기준으로 본다(의견).
- 이 맥락 이전 작업(프로젝트 지침·메모리 → 저장소). 프로젝트 지침 정리는 사용자 승인 후 별도로 진행.

## 다음 할 일 / 열린 항목

1. **(완료 2026-11-03) `docs/design.md` 신설.** 정본(스펙, 레이어 문서 등)을 가리키는 색인으로 만들었다. 내용 복제는 하지 않는다.
2. **(완료 2026-11-03) 공유 폴더 자료 이전.** `docs/research/ref5-evidence-2026-10/`(출처 341건·주장 24건·반박 검토·내부 분석·재실행 스크립트, `README.md`가 색인, 새 프로그램·§26 근거 작업은 여기서 시작)와 `docs/notes/`(`ref5-context.md` 현재 기준 요약 외 4건). 스크린샷 폴더는 이전하지 않음(공유 폴더에만 존재, 미참조). 근거: [`decisions.md`](decisions.md) 맨 아래.
3. **REF5 열린 항목**(출처 [`docs/notes/ref5-context.md`](notes/ref5-context.md) §5):
   - 체중 입력 — 감량을 시작하면 그날부터 실측 입력 필요(AGENTS.md 함정 참조).
   - 평가 권고 중 미착수: 판정 밖 기록(수면·클라이밍·통증·무릎·스탠스), §21.1 사전 등록 보강(예전 최고 무게를 넘기 전 INCREASE는 효과 증거로 세지 않음), 플랜 전환 전 상태 수기 기록 규율.
   - 알려진 구조적 비용: OHP 동결(§22.4 #5), DL이 SQ 상한에 묶여 창이 버려짐, PULL 볼륨 veto 사실상 미발동(§22.4 #10), 플랜 전환 시 창·정체 이력 초기화.
   - 팔꿈치(헤비 풀업 + OAP + 클라이밍): 되돌리기 권장 조건은 팔꿈치 통증 2주 이상 또는 PULL 집중창 2연속 유지. 48시간 PULL↔OAP 분리 §26 규칙은 48시간 내 HOLD/FAIL 재발 시 재검토([`decisions.md`](decisions.md) 9).
   - §21.1 3창 평가에서 재검토할 것: 166시간 허용(§26 후보, v1.5로 사실상 무의미해짐), 볼륨 +1세트(§23.1 순서), §8 엔진의 연속일 처리(n=1이라 #766에서 보류).
4. **미채택 제안**(ChatGPT 검토, 2026-10-14, 승인 안 됨): P0 문서·UI 수정(일부는 #760으로 반영), P1 관찰 데이터, P2 순서 SQ→OAP→BP→OHP, P3 SQ V 3×5→4×5. P2·P3는 근거 부족으로 보류.
5. **의심 사항 A–F 판정**(2026-10-14): A OAP 쌍 순서·휴식 UI 갭(L1→L2→R1→R2, 판정과 무관, 미착수), B 스펙 문구 결함(#760에서 정정), C 문구만 정리(#760), D·E·F 스펙이 알고 받아들인 비용(§22.4 #9–#11).
6. **문서 점검에서 나온 백로그**(2026-11-09, #776 작업 중 발견, 미착수):
   - `V2Switch`가 `<label>` 밖에 있는 5곳: `rest-timer-page-content.tsx` 3곳(휴식 타이머 설정, 사용자 화면), `save-policy-section.tsx` 2곳(관리자 화면). 헤드리스 Chromium에서는 탭해도 토글되지 않았다. 실기기 확인 전이고 덮는 E2E가 없다. 규칙은 [v2 primitives README](../web/src/components/v2/primitives/README.md).
   - `AGENTS.md`의 apps/api 인증 폴백 설명이 플래그로 production 폴백이 열리는 것처럼 읽힌다. 코드는 production에서 항상 닫는다(`apps/api/src/auth.ts`).
   - `docs/codebase-audit-2026-07.md`의 앵커 인터셉터 "기우로 판명" 문단이 낡았다. `app-shell.tsx`의 `defaultPrevented` 처리와 `link-navigation.spec.ts` 가드가 이미 있다.
   - `apps/tui/README.md` 로드맵에 overrides가 아직 "다음"으로 남아 있다(이미 구현됨).
7. **전체 점검**(2026-11-11). 결과로 올린 PR 7개(#778–#784)를 모두 main에 머지했고 프로덕션 배포까지 성공했다(HEAD `3926a106`). 머지된 브랜치는 원격·로컬 모두 지웠다.
   - 운영 확인(DB 읽기 전용): 배포 전부터 있던 세션 1개가 접속 후 `sha256:` 형식으로 바뀌고 활성으로 남았다(평문 행 승격 경로 동작 확인). 나머지 활성 세션 2개는 아직 평문이고 다음 접속 때 바뀐다.
   - 운영에서 화면으로 [미확인]: 통계 필터에 스쿼트·풀업·OHP가 나오는지(#778), `/exercises`에서 admin 수정·삭제(#782), 설정 세션 목록의 "현재 세션" 표시(#784), 휴식 타이머 표시(#779).
   - 후속: 2027-05-10 이후 세션 토큰의 평문 분기 제거(`decisions.md`). 운영 env에 `WORKOUT_AUTH_USER_ID`가 있는지는 [미확인](있어도 #780으로 가입 시 이전은 막힌다).
   - 남은 것([미확인], 서브에이전트 보고만): `.next/cache` CI 캐시, `eslint-config-next`·`@types/node`·`tsx` 버전 불일치, REF5 저장마다 전체 replay, `requireAuth` 세션 2회 조회, `auth_event_log`·만료 토큰 보존 정책 없음(`pruneExpiredApiTokens` 호출처 0건은 확인), 통계 메모리 캐시 인스턴스 로컬, 로그인 속도 제한 폴백, `logAuthEvent` 빈 catch, 플랜 생성 시 템플릿 visibility 검사, Material Symbols FOUT, `revalidatePath("/workout/log")`.
   - 남은 것(확인): `apiMutate` 기본 전체 캐시 무효화(`web/src/lib/api.ts:429`), 통계 부트스트랩 직렬 await(`get-stats-page-bootstrap.ts:150,151,245`), 통계 클라이언트 폴백의 `/api/exercises?limit=200`(`use-stats-1rm-controller.ts:144`), core의 `test`·`lint:boundary` 스크립트가 POSIX 전용이라 Windows에서 `pnpm` 스크립트로 안 돈다(Git Bash에서 명령을 직접 실행).

## 막힌 점

- **운영 DB의 `public`·`dev` 54개 테이블에서 RLS가 꺼져 있다(정책 0건).** 2026-11-11 확인: `anon`·`authenticated`에 두 스키마 USAGE와 테이블 권한이 없어 Data API로는 읽히지 않고, 보안 어드바이저도 RLS 경고를 내지 않는다. 긴급은 아니고 방어 겹이 하나뿐인 상태다. 같은 어드바이저 경고: `guard_deleted_account_write`의 `search_path` 미고정, `pg_net`이 `public`에 설치됨.
- 에이전트는 운영 Supabase에 직접 쓸 수 없다(차단됨, 읽기 전용 조회만). 기록 정정은 앱 UI 또는 사용자가 실행하는 가드된 SQL.
- 9일 공백 뒤 정상/micro 선택 같은 질문에는 §19.4가 둘 다 허용하며, 지난번(2026-10-29)에는 정상(SQ H3 85 + PULL 집중)을 권고했다. 결정이 아니라 권고였다.

## 참고 (운영 환경)

- 호스팅·인증·경로·로컬 env 상세는 2026-11-05에 `AGENTS.md`에서 `docs/agent-reference.md`로 옮겼다.
- 세션 평가 Supabase 프로젝트: `edaoieuohxtqiyzcwnjj`(workout-log-prod), Dev 계정 필터는 AGENTS.md 함정 참조.
- 휴식 종료 Web Push(#755)는 서버 흔적이 거의 없다: `rest_push_schedule` 행은 claim/cancel 때 삭제, Vercel hobby는 런타임 로그 미보존. 확인 가능한 증거는 `pg_stat_user_tables`의 `public.rest_push_schedule` 누적 카운터(2026-10-29 기준 ins 44 / upd 8 / del 44)와 `net._http_response`(약 6시간 보존, 날씨 앱 cron `weather-push-check`는 같은 DB라 제외). "푸시가 안 옴" 보고는 먼저 PWA를 홈 화면에 다시 추가했는지(iOS 재설치 = 구독 소실)와 "휴식 끝 알림" 토글을 확인한다. 2026-10-29 사례가 그랬고, 화면 안내 추가는 사용자가 거절했다.
