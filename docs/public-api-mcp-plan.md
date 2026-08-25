# 공개 API와 MCP 서버 계획 (M6)

> 상태: **PR1·PR2 구현 완료** (2026-08-26). 상위 문서 [`improvement-roadmap-2026-08.md`](improvement-roadmap-2026-08.md) §9.
> **순서**: 마일스톤 마지막. 기능 표면이 안정된 뒤에 공개해야 한다 — 공개 API는 한 번 열면 계약이 되고, M1~M5가 세트 타입·체중·신선도로 표면을 바꾼다.
>
> **유령 확인 결과** (2026-08-19): PAT·공개 API·MCP 코드는 **없다**(`personalAccessToken|apiToken` grep 0건, `apps/`에 `api`·`tui`뿐). 신규 구축이 맞다.
>
> **좋은 소식**: 인증 재료가 이미 있다. `auth_session`은 **opaque 토큰 PK 테이블**([`schema.ts:640`](../packages/core/src/db/schema.ts))이고, apps/api는 이미 **Bearer 헤더로 세션을 읽는 경로**를 갖고 있다([`auth.ts`](../apps/api/src/auth.ts)의 `sessionToken()` — TUI가 이 경로로 동작한다).

> ## 착수 전 재검증 (2026-08-25)
>
> 계획서가 6일 묵었고 그 사이 M1~M5(PR #676~#700)가 들어갔다. §2의 인증 서술과 §2.3의
> 멱등성 주장(`hashWorkoutLogMutationPayload`)은 **유효**했고, 아래 넷이 교정 대상이다.
>
> **① §3.1의 평문 토큰 저장은 이 리포의 관례와 반대다** (설계 교정). 계획서는
> `token text PK`(평문)를 제안했는데, 그건 `auth_session`의 패턴이다. 이 리포에는
> **장수명 토큰용 해시 저장 패턴이 이미 있다** — `password_reset_token`·
> `email_verification_token`이 `token_hash text PK`이고, [`auth/token.ts`](../packages/core/src/auth/token.ts)의
> `generateAuthTokenPair()`(32바이트 랜덤 + SHA-256)가 그 재료다.
> PAT는 만료가 nullable(무기한)이라 **세션보다 훨씬 장수명**이므로 더 약한 쪽이 아니라
> 더 강한 쪽 패턴을 따라야 한다. DB 덤프가 그대로 쓸 수 있는 자격증명이 되면 안 된다.
> 접두사 판별은 **제시된 토큰**에서 하고(DB가 아니라), 해시로 조회한다 — 계획서의
> 접두사 판별 설계는 그대로 성립한다.
>
> **② §3.3의 `simulateRoadmap` 재사용은 불가능하다** (유령). `grep` 0건 —
> M4-2에서 "이미 구현돼 있음"으로 종결되면서 그 이름의 함수는 만들어지지 않았다.
> 실제 재료는 `GET /api/plans/:planId/cycle-overview`다.
>
> **③ §2.2의 라우트 파일 목록이 낡았다.** `bodyweight.ts`가 M2-1(#683)에서 추가돼
> 10개다. `app.ts`의 마운트도 계획서가 적은 8개보다 많다 — `templates`·`home`·
> `export`·`me/import`·`program-versions`·`generated-sessions`·`ux-events`가 더 있다.
> 엔드포인트는 **50개**(계획서의 "59개"는 그 시점 수치). 공개 표면 결정(§7 결정 3)에
> `bodyweight`·`export`가 후보로 추가돼야 한다 — PR2에서 판단한다.
>
> **④ 스코프 강제를 PR2로 미루면 위험한 창이 생긴다** (순서 교정). 계획서 §5는
> PR1이 발급, PR2가 "스코프 강제"다. 그러면 PR1 머지 시점부터 PR2까지 **PAT가 모든
> 경로(`/api/auth/*` 포함)에 접근 가능한 창**이 열린다. PR1에서 **기본 거부 +
> 명시 허용목록**으로 시작한다 — PR2는 그 목록을 route-order 스냅샷으로 고정하고
> OpenAPI를 붙인다.
>
> **⑤ 구현 중 드러난 사실 — `auth` 경로는 web이 직접 처리한다.** `/api/auth/me`·
> `/sessions`·`/login` 등은 web의 자체 `route.ts`가 잡고(구체 경로가 catch-all보다
> 우선) **`Authorization` 헤더를 아예 읽지 않는다** — `wl_session` 쿠키만 본다.
> 결과적으로 PAT로는 그 경로에서 신원이 서지 않으며, 이는 **의도한 결과**다.
> 다만 apps/api의 표면 강제가 닿지 않는 영역이므로 PR2의 OpenAPI에 "PAT 접근 불가"로
> 명시해야 하고, E2E도 상태 코드가 아니라 **"내 신원이 서지 않는다"**로 단정해야
> 한다(로컬은 env fallback 때문에 200이 나온다).
>
> **⑥ 웹 프록시는 쿠키가 있을 때만 `Authorization`을 덮는다.** catch-all이
> `if (token) headers.set("authorization", ...)`이라, 쿠키 없는 PAT 요청은 헤더가
> 그대로 통과한다 — 즉 **PAT는 web 도메인으로도 동작한다**(apps/api 직접 호출 불필요).
> 반대로 쿠키가 있으면 세션이 이긴다. MCP·스크립트는 쿠키가 없으므로 문제되지 않는다.
>
> **재료 추가 발견**: route-order 스냅샷은 **이미 선례가 있다** —
> [`plans/route-order.test.ts`](../apps/api/src/routes/plans/route-order.test.ts)가
> Hono의 `routes` 배열을 순서까지 스냅샷한다. G2는 이 패턴을 앱 전체로 넓히면 된다.

## 1. 문제와 목표

Liftosaur는 공개 REST API와 **MCP 서버**를 제공해 LLM을 계정에 연결한다. 우리는 "데이터는 사용자 것"이라는 포지션(JSON+CSV export, dry-run import)을 갖고 있으면서 프로그램적 접근 경로가 없다.

동시에 로드맵 §1은 **생성형 AI를 엔진에 넣지 않는다**고 못박았다. MCP는 이 둘을 동시에 만족시키는 답이다 — **LLM 활용을 외부로 밀어내면서 결정론 엔진을 지킨다.**

**목표**
1. 본인 발급 토큰으로 자기 데이터에 프로그램적으로 접근한다.
2. 공개 표면을 명시적으로 고정한다(무엇이 계약이고 무엇이 내부인지).
3. LLM이 MCP로 세션 조회·기록·통계 요약·프로그램 미리보기를 할 수 있다.

**비목표**
- 서드파티 OAuth·앱 등록 — 개인 도구다. 발급 주체는 본인뿐.
- 공개 문서 사이트·SDK 배포.
- 쓰기 범위의 무제한 개방 — 스코프로 제한한다.
- 엔진에 LLM 도입 — MCP는 **읽고 쓰는 클라이언트**일 뿐 판정에 관여하지 않는다.

**성공 기준**: 발급한 토큰으로 `GET /api/logs`가 동작하고, MCP를 붙인 LLM이 "지난주 스쿼트 볼륨"을 답할 수 있으며, 토큰을 폐기하면 즉시 막힌다.

## 2. 현재 표면 (2026-08-19 코드 실측)

### 2.1 인증 — Bearer 경로가 이미 있다

- [`schema.ts:602-618`](../packages/core/src/db/schema.ts) `auth_session = { token(PK, text), userId(FK cascade), createdAt, expiresAt }` + `user_idx`·`expires_idx`. **opaque 토큰이라 PAT를 같은 모양으로 얹기 쉽다.**
- [`auth.ts:48-51`](../apps/api/src/routes/auth.ts) 주석: 토큰 클라이언트는 세션 토큰을 **응답 body로** 받고 "current session"을 **Authorization 헤더에서** 읽는다. Bearer는 CSRF origin 체크 대상이 아니다.
- web은 `wl_session` 쿠키 → 캐치올이 `Authorization: Bearer`로 변환(CLAUDE.md의 프록시 계약). **즉 apps/api는 이미 Bearer만 본다.**
- 세션 관리 UI가 이미 있다 — `/settings/account`의 활성 세션 목록·개별 종료.

### 2.2 라우트 표면

[`apps/api/src/routes/`](../apps/api/src/routes): `auth.ts` · `logs.ts` · `plans.ts`(+`plans/`) · `stats.ts` · `exercises.ts` · `settings.ts` · `misc.ts` · `ops.ts`. 등록은 [`app.ts`](../apps/api/src/app.ts).

**공개 후보**: `logs`(읽기·쓰기) · `stats`(읽기) · `plans`(읽기) · `exercises`(읽기)
**비공개**: `auth` · `ops` · `settings`(계정 설정 변경) · web 잔류(마이그레이션·health)

### 2.3 경계 규칙

- apps/api는 `@/`·`next`·`react` import 금지(`lint:boundary` CI 게이트), node 서버 어댑터는 `src/index.ts` 전용.
- ⚠️ **프로덕션 API는 미인증 시 401로 끊어 Hono까지 가지 않는다** — 존재하지 않는 경로도 401이라 **프로덕션 프로브로 라우팅을 검증할 수 없다**. 공개 표면 고정은 **route-order 스냅샷 테스트**로 해야 한다.
- 저장 멱등성: 요청 해시 기반 exactly-once 계약이 이미 있다 → 쓰기 API 문서에 명시한다.

## 3. 설계

### 3.1 PAT (개인 액세스 토큰)

```
auth_api_token
  tokenHash   text PK              -- SHA-256(제시 토큰). 평문은 저장하지 않는다
  tokenPrefix text NOT NULL        -- 목록 표시용 앞자리 (예: wlpat_3f9a…)
  userId      uuid NOT NULL -> app_user.id (cascade)
  name        text NOT NULL        -- "MCP", "스크립트" 등 사용자 라벨
  scope       text NOT NULL        -- 'read' | 'read_write'
  createdAt   timestamptz NOT NULL defaultNow
  expiresAt   timestamptz          -- nullable = 무기한
  lastUsedAt  timestamptz
```
- **`auth_session`과 분리한다** — 수명·스코프·표시 방식이 다르고, 세션 프루닝 크론이 PAT를 지우면 안 된다.
- ~~`token text PK`(평문)~~ → **`token_hash text PK`** (2026-08-25 교정). `password_reset_token`·
  `email_verification_token`과 같은 패턴이다. PAT는 만료가 nullable이라 세션보다 장수명이므로
  평문 저장은 위험이 더 크다. `generateAuthTokenPair()`를 그대로 쓴다.
- 인증 미들웨어가 **제시된** Bearer 토큰의 접두사로 종류를 판별해 세션/PAT 경로를 가른다
  (DB에 평문이 없어도 접두사 판별은 성립한다 — 판별 대상이 요청 값이다).
- 발급 시 **평문은 한 번만** 보여준다. UI는 `/settings/account`의 세션 목록 옆에 배치한다.
- 비밀번호 변경·전 세션 무효화 시 **PAT는 유지**한다(§7 결정 2).
- rate limit은 기존 체계를 재사용한다.

### 3.2 공개 표면 고정

- 공개 서브셋을 **명시 목록**으로 선언하고, 그 밖의 경로는 PAT로 401을 준다(세션은 전 경로 허용 — web·TUI는 내부 클라이언트).
- **route-order 스냅샷 테스트**로 목록을 고정한다. 새 라우트가 실수로 공개되지 않게 하는 것이 목적이다(§2.3의 프로브 불가 제약 때문에 테스트가 유일한 방어선).
- OpenAPI 스펙을 `docs/api/`에 생성해 둔다(수기 또는 Hono 스키마 기반).

### 3.3 MCP 서버

- 신규 패키지 `apps/mcp` — stdio 전송, PAT로 공개 API를 호출하는 **얇은 래퍼**. 도메인 로직 없음.
- 도구: 세션 조회/기록, 통계 요약, 플랜 상태, **프로그램 미리보기**
  (~~M4-2의 `simulateRoadmap`~~ → **`GET /api/plans/:planId/cycle-overview`**. 그 이름의
  함수는 만들어진 적이 없다 — M4-2가 "이미 구현돼 있음"으로 종결됐다).
- 경계: `apps/mcp`는 core를 import하지 않는다 — HTTP로만 말한다. 그래야 배포·버전이 독립적이다.

## 4. 안전장치

- **G1. 스코프 위반** — `read` 토큰으로 쓰기 시도 시 403, 비공개 경로 접근 시 401. 유닛으로 고정.
- **G2. route-order 스냅샷** — 공개 목록이 바뀌면 테스트가 깨진다. 새 라우트 추가 시 의도적 결정을 강제한다.
- **G3. 폐기 즉시성** — 토큰 폐기 후 다음 요청이 401인지(캐시 없음 확인).
- **G4. 세션과의 격리** — 비밀번호 변경·전 세션 무효화가 PAT를 건드리지 않는지. 반대로 계정 삭제는 PAT도 지우는지(FK cascade).
- **G5. 경계 린트** — `pnpm -C apps/api lint:boundary` 통과, `apps/mcp`가 core를 import하지 않는지.
- **G6. MCP 스모크** — 로컬에서 도구 목록·조회 1건.

## 5. PR 분해 (4개, 순서 고정)

| # | 제목(안) | 내용 | 리스크 | 게이트 |
|---|---|---|---|---|
| **1** | `feat(auth): 개인 액세스 토큰을 발급한다` | `auth_api_token` 테이블 + 마이그레이션 + 접두사 판별 미들웨어 + **기본 거부 허용목록** + `/settings/account` 발급·폐기 UI | 중 | G1·G3·G4 |
| **2** | `feat(api): 공개 표면을 고정한다` | 허용목록을 route-order 스냅샷으로 고정 + 공개 서브셋 재검토(`bodyweight`·`export`) | 중 | G2·G5 |
| **3** | `docs(api): OpenAPI 스펙을 게시한다` | `docs/api/` 스펙 + 멱등성·rate limit 명시 | 낮 | — |
| **4** | `feat(mcp): MCP 서버를 추가한다` | `apps/mcp` 패키지 + 도구 5종 + 스모크 | 중 | G5·G6 |

**TUI**: PAT를 로그인 대안으로 수용할 수 있다(서버측 판별이라 TUI 변경은 선택). PR1에서 함께 볼지 후행할지는 착수 시 판단.

## 6. 리스크 / 하지 말 것

1. **PAT를 `auth_session`에 섞지 말 것** — 세션 프루닝 크론이 PAT를 지우고, 활성 세션 목록이 오염된다.
2. **공개 표면을 프로덕션 프로브로 검증하려 하지 말 것** — 미인증 요청은 401로 끊겨 Hono까지 가지 않으므로 **존재하지 않는 경로도 401**이다. 스냅샷 테스트가 유일한 방어선이다.
3. **`apps/mcp`에서 core를 import하지 말 것** — HTTP 경계를 지켜야 배포가 독립적이고, 도메인 로직이 두 곳으로 갈라지지 않는다.
4. **쓰기 스코프를 기본값으로 하지 말 것** — 발급 기본은 `read`. 쓰기는 명시 선택.
5. **M1~M5 완료 전에 표면을 공개하지 말 것** — 세트 타입·체중·신선도가 응답 형태를 바꾼다. 공개 후 바꾸면 계약 파기다.
6. **평문 토큰을 다시 보여주지 말 것** — 발급 시 1회. 분실하면 재발급.

## 7. 결정 사항

1. **PAT 저장 형태** → 별도 테이블(§3.1). 접두사로 종류를 판별한다.
2. **비밀번호 변경 시 PAT 처리** → **유지한다.** 세션 무효화는 브라우저 탈취 대응이고, PAT는 사용자가 명시 폐기하는 자산이다. 단 계정 삭제는 FK cascade로 함께 삭제된다.
3. **공개 범위** → `logs`(읽기·쓰기) · `stats`(읽기) · `plans`(읽기) · `exercises`(읽기). `settings`는 제외 — 설정 변경은 앱에서만.
   - PR1에서 **`bodyweight`** 추가(M2-1이 만든 경로라 계획서가 알 수 없었다), **`home`** 추가.
   - PR2에서 **`export` 포함으로 결정**(§7 결정 8).
   - stats는 **패턴이 아니라 전수 열거**다 — `/api/stats/:metric`으로 묶으면 나중에 추가되는 지표가 검토 없이 공개된다(`ux-snapshot`처럼 사용자 데이터가 아닌 것도 있다).
   - **삭제는 어느 스코프로도 열지 않는다.** 프로그램 실수의 손실이 되돌릴 수 없고, MCP 도구 목록에 삭제가 있으면 LLM이 부를 수 있다.
4. **MCP 전송 방식** → stdio 1차. HTTP 전송은 원격 접근 수요가 생기면.
5. **착수 시점** → M1~M5 완료 후. 표면이 흔들리는 동안 공개하면 계약을 두 번 만든다.
6. **토큰 저장 형태** → **해시(SHA-256)** (2026-08-25 교정, §착수 전 재검증 ①). 평문 저장은
   `auth_session`의 패턴이고 PAT에는 맞지 않다.
7. **허용목록은 PR1부터** (2026-08-25 교정, §착수 전 재검증 ④). 기본 거부로 시작해
   PR2가 고정한다. 스코프 강제를 뒤로 미루면 PAT가 전 경로에 열린 창이 생긴다.
8. **`export`는 공개 read 표면에 넣는다** (PR2 결정). 전량 덤프라 망설였으나:
   담기는 것이 **도메인 데이터뿐**이고(설정·인증·텔레메트리 없음) 세분화된 읽기로
   이미 전부 도달할 수 있다 — 거부해도 유출된 토큰이 닿는 범위가 줄지 않고 느려질
   뿐이다. 백업 스크립트는 PAT의 가장 자연스러운 용도이고 "데이터는 사용자 것"
   포지션과 맞는다. ⚠️ 이 판단은 **export가 도메인 데이터만 담는다**는 전제 위에
   있고, 유닛이 그 전제를 잠근다. 역방향(`POST /api/me/import`)은 `mode: "replace"`가
   전부 지우므로 어느 스코프로도 열지 않는다.
9. **토큰당 rate limit** (PR2 결정) → 읽기 120/분, 쓰기 30/분, 키는 **토큰 해시**.
   사람이 아니라 **루프**를 막는 것이 목적이다 — MCP를 붙인 LLM은 초당 수십 번도
   간다. IP로 잡으면 같은 집의 다른 클라이언트끼리 서로를 굶긴다.
