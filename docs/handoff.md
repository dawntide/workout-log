# 인계 문서 (덮어쓰기)
- 갱신: 2026-11-11 14:14 / 브랜치: main / HEAD: f048c46f

작업을 마치거나 중단할 때 이 문서를 **덮어써서** 갱신한다. 이력은 `docs/decisions.md`와 git에 있다. 아래는 2026-11-03 프로젝트 메모리에서 옮긴 초기 내용이며, 메모리 기준 시점(마지막 갱신 2026-10-31)이라 **운영 DB·최신 main으로 검증하지 않았다**. 쓰기 전에 확인할 것.

## 현재 상태

- 규범 프로그램: REF5 Adaptive Strength **v1.5**(프로토콜 1.5, 엔진 515). 정본은 `docs/ref5-program-spec.md`. main은 2026-10-31 기준 ae6d256(#766 §19.4 연속일 지침 머지) 이후.
- 사용자 플랜: "REF5 Adaptive Strength 프로그램 2"(엔진 514로 시작한 v1.4 플랜을 새 플랜 없이 이어감, 9/05 시작). 2026-10-29 기준 상태(rev 38): SQ H3 85 / H2 90 / V 75, SQ 창 4/6(10/18 H2 FAIL이라 이번 창 INCREASE 불가), SQ_H2 failStreak 1, BP 85, PULL 총중량 90(잠금 +15), DL 75, OHP 32.5(BP 90 전까지 동결), OAP 양팔 2단(우 failStreak 1). 10/29 정상 세션(H3 85·PULL 집중·DL)은 전부 PASS, 10/30 BP 집중, 10/31 micro. **다음 hard는 H2 90**(SQ_H2 failStreak 1 — 또 FAIL이면 −2.5).
- 7/19–10/31 REF5 37세션 중 주종목 FAIL은 10/18 SQ H2 하나뿐. OAP 부족분은 9/07·9/12·9/21·9/24·10/14·10/18·10/30.
- 현재 기준은 훈련 전 TB 시절 무게(SQ 92.5×3, BP 90×3)보다 낮아서 올-PASS 기록은 아직 프로그램 효과의 증거가 아니다.

## 진행 중

- 사용자가 2026-11-03 hard SQ H2를 계획했다(11/2 휴식). 11/1도 휴식이었는지에 따라 §19.4 연속일 지침 해당 여부가 갈린다. **결과를 보고받으면** 평가하고, §19.4 지침 때문에 micro를 골랐던 세션에는 "§19.4 연속일" 메모를 남기게 요청한다.
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
7. **전체 점검**(2026-11-11). 결과로 draft PR 7개를 올렸고 전부 머지 전이다(#778–#783 CI 통과, #784는 올린 직후라 [미확인]). 화면 렌더와 로컬 E2E는 어느 PR도 확인하지 않았다.
   - #778 통계 운동 목록 200개 제한 제거. 머지 전 프리뷰에서 통계 화면에 스쿼트·풀업이 나오는지 볼 것.
   - #779 휴식 타이머 리렌더 4/s→1/s, 스크래치 5개 삭제, `ci.yml` 6개 잡 타임아웃 15분, 이 문서.
   - #780 `claimDevData`를 프로덕션에서 잠금. 운영 env에 `WORKOUT_AUTH_USER_ID`가 있는지는 [미확인].
   - #781 추적 중이던 운영 DB 덤프 삭제 + `.gitignore`. 히스토리는 다시 쓰지 않기로 했다(사용자 승인).
   - #782 운동 사전의 수정·삭제·별칭을 관리자 전용으로(API 계약 변경, `decisions.md`).
   - #783 DB·네트워크 예외 문구를 API 응답에서 가림, health의 `requiredTables` 상한 20.
   - #784 세션 토큰을 `sha256:` 해시로 저장(이중 조회 전환, `decisions.md`). 평문 행 승격 경로는 실제 DB로 [미확인]. 후속: 2027-05-10 이후 평문 분기 제거.
   - #782와 #784는 둘 다 `docs/decisions.md` 끝에 항목을 추가해서 나중에 머지하는 쪽에서 충돌이 난다(둘 다 남기면 된다).
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
