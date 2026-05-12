# v2 진행 현황 및 남은 작업 정리

> 작성일: 2026-05-07  
> 기준 브랜치: `codex/stats-v2-dashboard`  
> 기준 PR: #254 draft, `/stats` v2 전환 작업 포함

---

## 1. 현재까지 완료된 작업

### PR #250: IronGraph v2 디자인 + 멀티유저 인증 기반

앱 전반의 디자인 방향을 IronGraph v2 시스템으로 전환했다.

- `v2-tokens.css`, `v2-overrides.css` 기반의 v2 토큰 레이어 추가
- 기존 `--color-*` 토큰을 v2 팔레트로 remap해 레거시 화면도 톤을 맞춤
- v2 primitives 추가
  - `V2Card`
  - `V2Chip`
  - `V2IconBtn`
  - `V2PrimaryBtn`
  - `V2SecondaryBtn`
  - `V2Sheet`
  - `V2ActionDock`
- 홈 화면을 Today / Progress / History 3-deck 구조로 전환
- 하단 내비게이션을 ActionDock 5-slot IA로 전환
- PlanSheet, LibrarySheet, MoreSheet 추가
- 온보딩 화면과 신규 사용자 자동 온보딩 진입 추가
- 세션 요약 화면 v2 추가
- 빠른 기록 키패드 화면과 운동 기록 화면 내 키패드 오버레이 추가
- PR 감지 로직 개선
  - `exerciseId` 우선 매칭
  - alias fallback
  - 운동명 lowercase fallback
  - 서버 측 e1RM best 비교
- DB 기반 사용자 인증 추가
  - `app_user`
  - `auth_session`
  - PBKDF2 password hash
  - cookie session
  - env fallback 사용자 유지
- 인증 API 추가
  - signup
  - login
  - logout
  - me
  - password change
- 세션 pruning ops endpoint 추가

### PR #251: 비밀번호 재설정 + 이메일 인증 + 인증 이벤트 로그

Sprint 1의 인증 복구 블록을 구현했다.

- Resend 기반 이메일 전송 레이어 추가
  - SDK 없이 `fetch` 사용
  - 개발 환경에서 `RESEND_API_KEY`가 없으면 서버 로그로 링크 출력
- 환경변수 추가
  - `RESEND_API_KEY`
  - `RESEND_FROM`
  - `WORKOUT_APP_URL`
- DB 확장
  - `password_reset_token`
  - `email_verification_token`
  - `auth_event_log`
  - `app_user.email_verified_at`
- 토큰 정책 구현
  - raw token은 저장하지 않음
  - SHA-256 hash만 DB 저장
  - 1시간 만료
  - single-use
- 비밀번호 재설정 API 추가
  - `POST /api/auth/password/reset/request`
  - `POST /api/auth/password/reset/confirm`
- 이메일 인증 API 추가
  - `POST /api/auth/email/verification/request`
  - `GET /api/auth/email/verify?token=...`
- 보안 이벤트 조회 API 추가
  - `GET /api/me/security/events`
- 페이지 추가
  - `/forgot-password`
  - `/reset-password?token=...`
- signup 직후 이메일 인증 메일 발송 시도
- 미인증 사용자에게 로그인 후 verification banner 표시
- 인증 이벤트 로깅 추가
  - signup
  - login success/failure
  - logout
  - password change
  - reset request
  - reset confirm
  - verification request
  - verification confirm
- `CLAUDE.md` 인증 시스템 설명 업데이트

### PR #252: 레거시 design compliance E2E 제거

현재 v2 디자인 방향과 맞지 않는 오래된 iOS Settings 스타일 기준 E2E를 제거했다.

- 레거시 design compliance gate 제거
- 현재 디자인 시스템과 충돌하는 불필요한 CI 실패 원인 제거
- 핵심 smoke, unit, async UX 테스트는 유지

### PR #253: 운동 기록 화면 v2 카드 + RPE 슬롯

운동 기록 본 화면을 v2 카드 스타일로 정리하고 set 단위 RPE 입력을 추가했다.

- workout log 메인 카드 스타일을 v2 카드 톤으로 전환
- program/user 운동 세트 입력에 RPE 슬롯 추가
- RPE 입력값을 저장 payload에 매핑
- 기존 `workoutSet.rpe` 저장 흐름과 연결
- workout record draft / entry state 테스트 보강
- 저장 후 session summary 이동 흐름 유지

### PR #254: `/stats` v2 대시보드 전환

현재 draft PR이다. `/stats` 페이지의 첫 화면과 1RM 상세 컴포넌트 표면을 v2로 정리했다.

- `/stats` 상단을 v2 metric card grid로 변경
  - 30일 세션 수
  - 30일 볼륨
  - 최고 e1RM
  - 90일 PR 수
- 레거시 `StatsPageHeader`, `StatsPrSection` 의존 제거
- PR 리스트를 v2 card row + chip 기반으로 재구성
- PR row 클릭 시 기존 `exerciseId` deep link 유지
- 1RM 상세 컨트롤과 차트 카드 표면을 v2 token으로 정리
- `/stats/loading.tsx` 스켈레톤을 새 IA와 맞춤
- 검증 완료
  - `pnpm --dir web typecheck`
  - `pnpm --dir web lint` pass, 기존 warning만 존재
  - `pnpm --dir web test:unit`
  - `pnpm --dir web test:async-ux:stats-1rm`
  - `DB_MIGRATE_ENABLED=0 NEXT_TELEMETRY_DISABLED=1 pnpm --dir web build`
  - `pnpm --dir web test:e2e -- e2e/smoke.spec.ts --project chromium`

---

## 2. 현재 상태 요약

### 완료된 큰 축

- v2 디자인 토큰과 핵심 컴포넌트 기반 구축
- 홈, 하단 IA, 시트 계층, 세션 요약, 빠른 기록 키패드 v2 적용
- 멀티유저 이메일/비밀번호 인증 구현
- 비밀번호 재설정과 이메일 인증 구현
- 인증 이벤트 로깅 구현
- 운동 기록 메인 카드와 RPE 입력 구현
- 통계 대시보드 v2 전환 진행 중

### 아직 남아있는 큰 축

- 운동 상세 페이지 v2
- PR 히스토리 전용 화면
- 백업/복원 export-import
- 계정/세션 관리 고도화
- 인증 보안 고도화
- 통계 화면의 추가 drill-down
- QA/E2E 보강

---

## 3. 남은 작업 우선순위

### P1. 운동 상세 페이지 v2

`/exercises/[exerciseId]` 신규 상세 페이지를 만든다.

목표:
- LibrarySheet, stats PR row, 홈 PR 카드에서 운동 상세로 진입 가능하게 만들기
- 운동별 최고 e1RM, 최근 세션, 볼륨, 평균 RPE, PR 기록을 한 화면에 정리

구현 후보:
- 신규 route: `/exercises/[exerciseId]`
- 서버 bootstrap service 추가
- 상세 화면 v2 컴포넌트 추가
- 주요 섹션
  - 운동명 hero
  - 최고 e1RM card
  - 최근 90일 chart
  - 최근 세트 로그
  - PR history subset
  - 관련 프로그램/최근 사용 빈도

완료 기준:
- `/stats` PR row에서 상세 페이지로 이동 가능
- 없는 exerciseId에 대한 not-found 처리
- 최소 smoke E2E 또는 route-level 테스트 추가

### P1. PR 히스토리 전용 화면

PR 기록을 session summary 안에서만 보지 않고 전용 화면으로 탐색 가능하게 만든다.

목표:
- `/stats/prs` 추가
- 운동별, 기간별 필터
- 날짜순 PR list
- 각 row에서 session summary 또는 exercise detail로 이동

필요 API:
- 기존 `/api/stats/prs` 재사용 가능 여부 확인
- 부족하면 PR event 전용 endpoint 추가

완료 기준:
- 최근 PR을 한 화면에서 확인 가능
- 운동별 필터가 동작
- 빈 상태가 v2 스타일로 표시

### P1. 백업 / 복원

사용자 데이터 안전성을 위한 export/import 기능을 만든다.

목표:
- 계정 단위 전체 데이터 JSON export
- JSON import dry-run
- replace/merge 정책 중 최소 1개 구현

구현 후보:
- `GET /api/me/export`
- `POST /api/me/import`
- `schemaVersion` 포함
- export 대상
  - workout logs
  - workout sets
  - plans
  - generated sessions
  - progression state
  - user settings
  - custom exercises / aliases
- MoreSheet 또는 settings/data에 v2 UI 추가

완료 기준:
- export 파일로 동일 계정 또는 새 계정에 복원 가능
- dry-run에서 row count와 충돌 정보를 보여줌
- 잘못된 schemaVersion 거부

### P2. 활성 세션 관리

현재 session은 cookie 기반으로 동작하지만, 사용자에게 활성 세션 목록을 보여주지는 않는다.

목표:
- 로그인된 기기/브라우저 목록 표시
- 현재 세션 표시
- 특정 세션 종료
- 다른 모든 세션 종료

구현 후보:
- `auth_session`에 `userAgent`, `ip`, `createdAt` 표시 개선
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/[token]`
- MoreSheet 안에 세션 관리 시트 추가

완료 기준:
- 현재 세션과 다른 세션 구분
- 다른 세션 종료 후 해당 session token이 더 이상 유효하지 않음

### P2. 계정 삭제

사용자가 직접 계정과 개인 데이터를 삭제할 수 있게 한다.

목표:
- 비밀번호 재확인 후 계정 삭제
- user-scoped domain data 삭제
- public seed data는 보존

구현 후보:
- `DELETE /api/auth/account`
- 위험 영역 UI 추가
- 이중 확인 문구 입력

완료 기준:
- 계정 삭제 후 login 불가
- 사용자 workout/log/plan/settings row 삭제
- shared seed exercise/template은 유지

### P2. 통계 drill-down 보강

`/stats` v2 첫 화면 이후의 세부 분석 경험을 강화한다.

후보:
- 운동 picker를 v2 chip carousel로 개선
- 주간 볼륨 bar chart 추가
- 최근 8주 변화량 표시
- RPE 평균 추이
- PR marker가 있는 chart

완료 기준:
- `/stats`에서 exercise detail 없이도 핵심 추이를 빠르게 파악 가능
- 기존 API 호출 수가 과도하게 늘지 않음

### P3. 인증 보안 고도화

현재 기능은 기본 계정 운영에 충분하지만, 장기적으로는 아래 항목이 남아 있다.

후보:
- Google OAuth
- TOTP 2FA
- 백업 코드
- Redis 기반 rate limiting
- 이메일 인증 기반 feature gating

완료 기준:
- OAuth와 password 계정 link 정책 결정
- 멀티 인스턴스 환경에서 rate limit 일관성 확보

### P3. E2E/QA 보강

기존 레거시 design compliance E2E는 제거했지만, 실제 사용자 흐름 중심 테스트는 더 필요하다.

후보:
- auth recovery E2E
- email verification flow E2E
- workout log RPE save E2E
- stats dashboard smoke + interaction E2E
- exercise detail navigation E2E
- export/import E2E

완료 기준:
- 디자인 픽셀 고정 테스트가 아니라 사용자 플로우 기준으로 검증
- CI에서 과도하게 flaky하지 않음

---

## 4. 권장 다음 PR 순서

### 1순위: PR #254 머지

현재 진행 중인 `/stats` v2 전환을 먼저 main에 반영한다.

브랜치:
- `codex/stats-v2-dashboard`

PR:
- #254

### 2순위: 운동 상세 페이지 v2

권장 브랜치:
- `codex/exercise-detail-v2`

권장 커밋:
- `feat(stats): add exercise detail page`

권장 PR 제목:
- `[codex] add v2 exercise detail page`

작업 범위:
- `/exercises/[exerciseId]`
- exercise detail bootstrap service
- v2 detail UI
- `/stats` PR row 링크 일부를 detail route로 전환
- smoke/route 테스트

### 3순위: PR 히스토리 화면

권장 브랜치:
- `codex/pr-history-v2`

권장 커밋:
- `feat(stats): add pr history screen`

권장 PR 제목:
- `[codex] add v2 PR history screen`

작업 범위:
- `/stats/prs`
- PR list API 보강
- 운동/기간 필터
- session/exercise detail link

### 4순위: 백업 / 복원

권장 브랜치:
- `codex/data-export-import`

권장 커밋:
- `feat(data): add account export and import`

권장 PR 제목:
- `[codex] add data export and import`

작업 범위:
- `GET /api/me/export`
- `POST /api/me/import`
- dry-run
- settings/data 또는 MoreSheet UI
- schemaVersion validation

### 5순위: 세션 관리 + 계정 삭제

권장 브랜치:
- `codex/account-session-management`

권장 커밋:
- `feat(auth): add session management and account deletion`

권장 PR 제목:
- `[codex] add account and session management`

작업 범위:
- active sessions API
- session management sheet
- account delete API
- 위험 영역 UI

---

## 5. 현재 알려진 주의사항

- `pnpm --dir web lint`는 통과하지만 기존 warning이 남아 있다.
- 레거시 design compliance E2E는 v2 방향과 맞지 않아 제거했다. 앞으로는 사용자 플로우 중심 E2E를 추가하는 편이 낫다.
- `PageHeader`는 현재 null을 반환하는 레거시 wrapper다. 새 화면에서는 v2 자체 헤더를 쓰는 방향이 맞다.
- 인증 이메일은 production에서 `RESEND_API_KEY`와 `RESEND_FROM` 설정이 없으면 실제 발송되지 않는다.
- `WORKOUT_APP_URL`은 이메일 링크 absolute URL 생성에 필요하다.
- 통계 화면은 기존 API와 컨트롤러를 유지하고 표면만 v2로 전환했다. deep stats 재설계는 별도 PR로 분리한다.

---

## 6. 다음 세션 시작 체크리스트

1. `git switch main`
2. `git pull --ff-only origin main`
3. PR #254가 merge됐는지 확인
4. 다음 브랜치 생성
   - 운동 상세 페이지라면 `git switch -c codex/exercise-detail-v2`
5. 관련 파일 먼저 확인
   - `web/src/app/stats/page.tsx`
   - `web/src/widgets/stats-screen/stats-screen.tsx`
   - `web/src/server/stats/*`
   - `web/src/app/api/stats/*`
   - `web/src/components/v2/*`
6. 구현 후 최소 검증
   - `pnpm --dir web typecheck`
   - `pnpm --dir web lint`
   - `pnpm --dir web test:unit`
   - 관련 focused E2E
   - `DB_MIGRATE_ENABLED=0 NEXT_TELEMETRY_DISABLED=1 pnpm --dir web build`
