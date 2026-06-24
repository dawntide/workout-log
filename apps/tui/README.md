# ironlog — workout-log 터미널 TUI

`workout-log` 웹앱의 **rich 터미널 클라이언트**. Go + [Bubble Tea v2](https://github.com/charmbracelet/bubbletea) (`charm.land/*/v2`) + Lip Gloss + Bubbles + [ntcharts](https://github.com/NimbleMarkets/ntcharts).

**TUI-first**: 기존 Next.js HTTP API에 **백엔드 수정 0**으로 붙습니다. 세션은 `wl_session` httpOnly 쿠키를 캡처/replay해서 인증합니다(서버의 `assertSameOrigin`이 Origin 없는 CLI 요청을 통과시키므로 가능). 디자인 언어는 웹의 `terminal`(ironlog) 스킨을 그대로 옮겼습니다 — [redesign-target.md](../../web/docs/redesign-target.md) §5.

> **상태: MVP-1** — 인증 + 히어로 로깅(2:log)까지 동작. stats·calendar·program·settings 탭은 post-MVP placeholder.

## 요구사항

- **Go 1.24+** (Bubble Tea v2)
- 실행 중인 `workout-log` 백엔드 (로컬 `pnpm -C web dev` 또는 배포된 URL)

## 빌드 & 실행

```bash
cd apps/tui
go build -o ironlog .     # 빌드
./ironlog                 # 실행 (또는 go run .)
```

## 설정

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `IRONLOG_API_URL` | `http://localhost:3000` | 백엔드 base URL (로컬 dev ↔ 배포 prod 전환) |

세션 토큰은 OS 설정 디렉터리(`%AppData%\ironlog` / `~/.config/ironlog`)의 `session` 파일(0600)에 영속됩니다. 재실행 시 자동 로그인되며, 401이면 로그인 화면으로 돌아갑니다.

```bash
# 배포된 API에 붙기
IRONLOG_API_URL=https://your-app.vercel.app ./ironlog
```

## 사용법

1. **로그인** — 이메일/비밀번호 입력(`tab`으로 이동, `⏎` 제출). 성공 시 셸 진입.
2. **2:log (히어로 로깅)** — vim식 모드:
   - **NORMAL**: `1`–`5` 탭 전환 · `i` 입력 시작 · `s` 저장 · `x` 마지막 세트 삭제 · `q` 종료
   - **INSERT**: 운동명·무게·reps 입력 → `⏎` 세트 추가(휴식 타이머 시작) · `tab` 필드 이동 · `esc` NORMAL 복귀
   - 저장(`s`) 시 `POST /api/logs` → 서버가 e1RM/PR 계산 → `[PR]`로 표시

> 숫자키가 탭 전환(NORMAL)과 무게 입력(INSERT)에서 충돌하므로 모드로 분리했습니다.

## 개발

```bash
go test ./...                 # 유닛 + 헤드리스 렌더 테스트
go vet ./...
gofmt -l .                    # 포맷 체크 (출력 없으면 통과)

# 라이브 테스트 — fallback 끈 백엔드 필요
#   (로컬: $env:WORKOUT_AUTH_USER_ID=' '; pnpm -C web dev)
IRONLOG_SPIKE_URL=http://localhost:3000 go test -run TestLive -v ./internal/api

# 레이아웃 스냅샷 (ANSI 제거 평문)
IRONLOG_SNAPSHOT=/tmp/snap.txt IRONLOG_SNAPSHOT_TARGET=log go test -run TestSnapshot ./internal/ui
```

## 구조

```
main.go                 config 로드 → api.Client → ui.App 기동
internal/
├── api/                HTTP 클라이언트 (cookiejar 세션, Login/Signup/Me/ListLogs/CreateLog/GetLog)
├── config/             세션·base URL 영속
├── theme/              term-* 팔레트 + 글리프 vocab (웹 terminal 스킨 미러)
└── ui/                 App(인증↔셸) · Shell(크롬·탭·상태머신) · Login · Log(히어로)
```

## 로드맵

- **MVP-1 (완료)**: 스캐폴드 · 쿠키 인증 · 셸 크롬 · 히어로 로깅
- **다음**: stats(ntcharts 1RM 추이) · calendar(월 그리드 수제) · program store · settings · 플랜 기반 세션 생성
- **장기**: 백엔드를 Hono로 추출 + 토큰 인증 도입(웹 cross-origin & TUI 쿠키 스크래핑 동시 해결), 모노레포 `packages/core` 공유
