# ironlog — workout-log 터미널 TUI

`workout-log` 웹앱의 **rich 터미널 클라이언트**. Go + [Bubble Tea v2](https://github.com/charmbracelet/bubbletea) (`charm.land/*/v2`) + Lip Gloss + Bubbles + [ntcharts](https://github.com/NimbleMarkets/ntcharts). 단일 바이너리.

**TUI-first**: 기존 Next.js HTTP API에 **백엔드 수정 0**으로 붙습니다. 세션은 `wl_session` httpOnly 쿠키를 캡처/replay해서 인증합니다(서버의 `assertSameOrigin`이 Origin 없는 CLI 요청을 통과시키므로 가능). 디자인 언어는 웹의 `terminal`(ironlog) 스킨을 그대로 옮겼습니다 — [redesign-target.md](../../web/docs/redesign-target.md) §5.

> **상태**: 가입 → 로깅(RPE) → 통계(e1RM·주간 볼륨) → 기록(편집) → 플랜 → 운동 CRUD → 설정·계정 → 백업/복원까지 **전 워크플로가 TUI만으로 동작**. helix식 모달 앱(6버퍼).

## 요구사항

- **Go 1.26+** (Bubble Tea v2) — 소스 빌드 시
- 실행 중인 `workout-log` 백엔드 (로컬 `pnpm -C web dev` 또는 배포된 URL)

## 설치

### 1. 설치 스크립트 (linux/macOS — 가장 쉬움)

```bash
curl -fsSL https://raw.githubusercontent.com/sharru0701/workout-log/main/apps/tui/install.sh | sh
```

OS/아키텍처를 자동 감지해 **최신 릴리스 바이너리**를 PATH(`/usr/local/bin`, 없으면 `~/.local/bin`)에 설치합니다. 버전/위치 고정:

```bash
curl -fsSL .../install.sh | IRONLOG_VERSION=0.1.0 IRONLOG_INSTALL_DIR=~/.local/bin sh
```

### 2. 릴리스 바이너리 직접 다운로드

[GitHub Releases](https://github.com/sharru0701/workout-log/releases)에서 받습니다. 태그 `v*` push 시 GoReleaser가 linux·macOS·Windows × amd64·arm64 아카이브를 자동 빌드합니다. (macOS=`..._macos_...`, Windows=`.zip`)

```bash
curl -sL https://github.com/sharru0701/workout-log/releases/download/v0.1.0/ironlog_0.1.0_linux_arm64.tar.gz | tar xz
./ironlog --version
```

### 3. go install (Go 환경)

```bash
go install github.com/sharru0701/workout-log/apps/tui@latest   # 바이너리명: tui
```

### 4. iPhone 등 원격에서 보기 (VPS + SSH)

TUI는 터미널 앱이라 웹 URL이 아닌 **SSH로 접속**합니다. iOS는 바이너리를 직접 실행할 수 없으므로 VPS에 두고 붙습니다:

```bash
# 1) 클라우드 VPS(linux)에서 — 설치하며 서버 URL까지 한 번에 저장
curl -fsSL https://raw.githubusercontent.com/sharru0701/workout-log/main/apps/tui/install.sh | IRONLOG_API_URL=https://your-app.vercel.app sh
# 2) tmux로 세션 유지하며 실행 (이후엔 환경변수 불필요)
tmux new -s ironlog ironlog
```

iPhone [Termius](https://termius.com) 등 SSH 앱으로 VPS에 접속 → `tmux attach -t ironlog`. 서버를 바꾸려면 `ironlog --set-server <url>`.

## 빌드 (소스에서)

```bash
cd apps/tui
go build -o ironlog .     # 빌드
./ironlog                 # 실행 (실제 터미널 필요 — go run은 TTY 문제로 비권장)
```

## 설정

백엔드 base URL은 **환경변수 > 저장된 설정 > 기본값** 순으로 결정됩니다.

| 방법 | 설명 |
|---|---|
| `ironlog --set-server https://your-app` | URL을 config에 저장(한 번) → 이후 `ironlog`만 실행 |
| `IRONLOG_API_URL=https://your-app ironlog` | 환경변수로 임시 오버라이드 |
| (기본) | `http://localhost:3000` |

설정·세션은 OS 설정 디렉터리(`%AppData%\ironlog` / `~/.config/ironlog`)에 저장됩니다 — `base_url`, `session`(0600). 로그인 화면 상단에 현재 접속 중인 서버가 표시됩니다.

## 사용법

- **인증** — 로그인 / 가입(`ctrl+t`) / 비밀번호 재설정 요청(`ctrl+f`). `tab` 이동, `⏎` 제출.
- **프레임(전역)** — `space` 버퍼 이동(goto) · `:` 명령 팔레트 · `?` 도움 · `1`–`6` 버퍼 가속 · `q` 종료.
- **6버퍼** — `today`(로깅) · `stats` · `history` · `programs` · `exercises` · `settings`.
- **today** — `i` 편집 · `e` 운동 추가 · `x` 완료 · `o` 세트 추가 · `d` 삭제 · `s` 저장 · `h`/`l` 셀 이동(무게/reps/`@`rpe). 휴식 게이지 · 서버 e1RM/PR 표시 · 플랜 세션 로딩.
- **stats** — `v`로 e1RM 추이 ↔ 주간 볼륨 토글 · `jk` 운동 · `[ ]` 범위 · `b` 차트 스타일.
- **history** — 히트맵 + 세션 리스트 · `⏎` 상세 · `e` 편집(today 재사용) · `d` 삭제.
- **데이터** — `:export`(JSON 백업) · `:import <경로>`(미리보기 → 확인 → 교체).

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

# 릴리스 dry-run (GoReleaser)
goreleaser check
goreleaser build --snapshot --clean --single-target
```

## 릴리스

```bash
git tag v0.1.0
git push origin v0.1.0        # → tui-release 워크플로가 멀티플랫폼 바이너리를 Releases에 게시
```

설정: [.goreleaser.yaml](.goreleaser.yaml) · [.github/workflows/tui-release.yml](../../.github/workflows/tui-release.yml).

## 구조

```
main.go                 --version 플래그 · config 로드 → api.Client → ui.App 기동
internal/
├── api/                HTTP 클라이언트 (cookiejar 세션; auth·logs·home·stats·plans·exercises·account·data)
├── config/             세션·base URL 영속
├── theme/              term-* 팔레트 + 글리프 vocab (웹 terminal 스킨 미러)
└── ui/                 App(인증↔프레임) · Frame(크롬·goto·팔레트·confirm) · 6버퍼 · Login
```

## 로드맵

- **완료**: 전 워크플로(인증·로깅·통계·기록·플랜·운동·설정·백업) · 릴리스 자동화(GoReleaser → GitHub Releases)
- **다음**: 백엔드를 Hono로 추출 + 토큰 인증 도입(웹 cross-origin & TUI 쿠키 스크래핑 동시 해결), 모노레포 `packages/core` 공유
