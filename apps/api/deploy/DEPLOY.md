# ironlog-api 배포 가이드 (B2 — 상시 가동)

apps/api(독립 Hono 백엔드)를 **상시 가동**으로 배포하고, TUI를 그쪽으로 cutover하는 런북.
두 경로를 제공: **A. systemd(권장)** / **B. Docker(대안)**. 둘 다 동일 리버스 프록시(Caddy)로 TLS.

> ✅ **실제 운영 배포 완료 (2026-06-29, AWS Lightsail)**: 리포=`/home/ubuntu/workout-log`, 서비스 유저=`ubuntu`,
> ExecStart=`node_modules/.bin/tsx src/index.ts` **직접**(systemd 샌드박스에서 `pnpm start`는 deps-status-check로
> 실패하므로 tsx 직접 호출), 공개=Caddy + `3-37-203-76.sslip.io`(Let's Encrypt). 일상 운영은 **§5 `ilapi` CLI**.
> 아래 본문의 `/opt`·`ironlog` 유저는 예시 — 실제 배포는 위 구성을 따른다.

## 0. 사전 지식 — 왜 web/도 필요한가 (중요)

`apps/api`는 `@/*` → `../../web/src/*` alias로 web 서버 코드를 런타임 재사용한다. 그 web 코드가
`drizzle-orm`·`pg` 등을 **web/node_modules에서** 해석하므로, 배포 호스트엔 **web/ 소스 + web 설치**와
**apps/api 설치**가 둘 다 있어야 한다. (별도 빌드 단계 없음 — `tsx`가 런타임에 alias+트랜스파일.)

전제: Node 24 + pnpm 11(corepack), 리포가 호스트에 있음(예: `/opt/workout-log`).

## 1. 환경변수

`apps/api/.env` 생성(`cp deploy/.env.example apps/api/.env`, `chmod 600`). 핵심:
- `DATABASE_URL` = 프로덕션 Supabase **풀러** URL.
- ⚠️ `DB_SCHEMA` **미설정**(= public, prod web과 동일). dev 격리 배포일 때만 `dev`.
- ⚠️ `WORKOUT_AUTH_USER_ID` **미설정**(prod 보안).
- `WORKOUT_APP_URL` = 공개 **웹앱** URL(메일 링크가 웹을 가리키도록).
- `RESEND_API_KEY`/`RESEND_FROM`(복구·인증 메일), `WORKOUT_OPS_TOKEN`(ops 보호), `PORT=8787`.

---

## A. systemd 경로 (권장 — 기존 VPS에 가장 잘 맞음)

이번 추출 작업 내내 `pnpm -C apps/api start`(=`tsx src/index.ts`)가 Node24/pnpm11에서 검증됨 →
동일 VPS에서 그대로 작동.

```bash
# 1) 리포 배치 + 설치 (둘 다!)
sudo git clone <repo> /opt/workout-log        # 또는 기존 위치 사용
cd /opt/workout-log
corepack enable && corepack prepare pnpm@11.9.0 --activate
pnpm install                                   # 워크스페이스 루트 1회 — web(drizzle/pg)·apps/api(hono+tsx)·packages/core 전부
# (esbuild build-script는 루트 pnpm-workspace.yaml allowBuilds로 승인됨. 문제 시 `pnpm rebuild esbuild`)

# 2) env
cp apps/api/deploy/.env.example apps/api/.env && sudo chmod 600 apps/api/.env
# ... apps/api/.env 편집 ...

# 3) 서비스 유저 + 권한 (예시)
sudo useradd --system --no-create-home ironlog || true
sudo chown -R ironlog:ironlog /opt/workout-log

# 4) systemd 유닛
sudo cp apps/api/deploy/ironlog-api.service /etc/systemd/system/
#   유닛 안의 User/WorkingDirectory/PATH를 환경에 맞게 수정(특히 `which pnpm`, node 경로)
sudo systemctl daemon-reload
sudo systemctl enable --now ironlog-api
journalctl -u ironlog-api -f                   # "ironlog-api listening on :8787" 확인
```

로컬 스모크:
```bash
curl -s localhost:8787/health        # {"ok":true,...}
```

---

## B. Docker 경로 (대안)

```bash
cd /opt/workout-log
cp apps/api/deploy/.env.example apps/api/.env && chmod 600 apps/api/.env   # 편집
docker compose -f apps/api/deploy/compose.yaml up -d --build
docker compose -f apps/api/deploy/compose.yaml logs -f
```
주의: 빌드 컨텍스트=리포 루트(이미지에 web/+apps/api/ 포함 → 이미지가 큼). 이 환경에선 빌드
테스트를 못 했으니 호스트에서 검증. tsx가 esbuild 바이너리로 실패하면 Dockerfile의
`pnpm rebuild esbuild`가 해결책(이미 포함).

---

## 2. 리버스 프록시 + TLS (공개 노출)

출시된 TUI는 엔드유저 머신에서 도므로 **공개 HTTPS**가 필요(Bearer 토큰 전송).
apps/api는 `127.0.0.1:8787`에 두고 Caddy가 TLS 종단:
```bash
# /etc/caddy/Caddyfile 에 apps/api/deploy/Caddyfile.example 내용 추가(도메인 교체)
sudo caddy reload --config /etc/caddy/Caddyfile
curl -s https://api.example.com/health    # 공개 확인
```
도메인이 없으면: Tailscale 호스트명(사설) 또는 Cloudflare Tunnel로 A레코드 없이 TLS.

## 3. 인증 스모크 (배포 검증)

```bash
# 로그인 → 토큰(body) → Bearer로 보호 라우트
TOKEN=$(curl -s https://api.example.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"...","password":"..."}' | jq -r .token)
curl -s https://api.example.com/api/auth/me -H "Authorization: Bearer $TOKEN"   # {user:{...}}
```
(전체 흐름은 `apps/tui` live_test를 `IRONLOG_SPIKE_URL=https://api.example.com`으로 돌려 검증 가능.)

## 4. TUI cutover (마지막 단계)

apps/api가 공개되면 TUI 기본 서버를 그쪽으로:
- 임시/검증: `IRONLOG_API_URL=https://api.example.com ironlog`
- 영구: `apps/tui/.goreleaser.yaml`의 ldflags `defaultBase`를 `https://api.example.com`으로 바꿔
  다음 릴리스. (client는 이미 Bearer 이중모드 — login/signup/password 응답의 body 토큰 사용.)

## 5. 운영 — ilapi CLI (권장)

`apps/api/deploy/ilapi`를 PATH에 설치하면 운영이 한 줄로 끝난다. 실제 lightsail 배포는 이 방식으로 운영 중:

```bash
sudo install -m 755 apps/api/deploy/ilapi /usr/local/bin/ilapi
```

| 명령 | 동작 |
|------|------|
| `ilapi update` | `git pull --ff-only` + pnpm install(워크스페이스 루트 1회) + restart + health. **직전 커밋 자동 저장**(rollback 대비), 리포의 ilapi로 **자기 자신도 self-update**, health≠200이면 비정상 종료 |
| `ilapi rollback` | 마지막 update **직전 커밋**으로 checkout + install + restart |
| `ilapi status` | 서비스 active / local·public health / 현재 커밋 / ironlog 대상 한눈에 |
| `ilapi logs` \| `tail [N]` \| `errors [since]` | journalctl follow / 최근 N줄 / 경고+에러만 |
| `ilapi restart` \| `start` \| `stop` | 서비스 제어 |
| `ilapi cutover {local\|prod}` | ironlog 접속 서버 전환(local=apps/api, prod=프로덕션 Vercel) + tmux 재시작 |

**수동(ilapi 없이)**: `cd <repo> && git pull && pnpm install && sudo systemctl restart ironlog-api`.
롤백은 `git checkout <태그/커밋>` 후 동일. Docker는 `git pull && docker compose -f apps/api/deploy/compose.yaml up -d --build`.
(DB 마이그레이션은 web 쪽에서 관리 — 하위호환 유지 시 백엔드만 롤백 안전.)

## 6. 관측성(권장, 선택)

- 로그: 이미 구조화 JSON(`api.request`) → `journalctl`/`docker logs`. 중앙화하려면 로그 드라이버/수집기.
- 에러 추적: Sentry 등 추가(현재 미설정).
- 헬스: `GET /health`(무인증) — 업타임 모니터 대상.

---
> 미해결(인프라 결정 필요): CORS 정책(브라우저 web이 apps/api를 직접 호출한다면 allowed origins +
> `Allow-Credentials` 설정 필요 — 현재 web은 자체 Next API를 쓰므로 즉시 필요 없음), 시크릿 중앙
> 관리(Doppler/1Password 등), TUI fleet 버전 추적. 자세한 배경은 다중-프론트/단일-백엔드 리서치 리포트 참조.
