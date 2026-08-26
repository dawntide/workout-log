# @workout/mcp

Workout Log **MCP 서버**. LLM이 개인 액세스 토큰(PAT)으로 자기 운동 데이터를
읽고 쓸 수 있게 한다.

## 왜 MCP인가

로드맵 §1이 **생성형 AI를 진행 엔진에 넣지 않는다**고 못박았다. 판정이 결정론이어야
"왜 이 무게인지"를 설명할 수 있기 때문이다.

MCP는 그 둘을 동시에 만족시킨다 — **LLM 활용을 외부로 밀어내면서 엔진은 결정론을
지킨다.** 이 서버는 읽고 쓰는 클라이언트일 뿐 판정에 관여하지 않는다.

## 설정

1. 토큰 발급 — 웹과 TUI 중 편한 쪽:
   - **웹**: 설정 > 계정 > 액세스 토큰 > 새 토큰 발급
   - **TUI**(`ironlog`): 설정 버퍼 > `액세스 토큰` 행 > `n`. 발급 직후 `y`로 클립보드에
     복사된다(OSC 52라 SSH 세션에서도 된다). 여기서 셸을 안 떠나도 된다.
   - 읽기만 필요하면 `read`(기본). 세션을 기록하게 하려면 `read_write`.
2. MCP 클라이언트에 등록:

```json
{
  "mcpServers": {
    "workout-log": {
      "command": "npx",
      "args": ["tsx", "/path/to/workout-log/apps/mcp/src/index.ts"],
      "env": { "WORKOUT_LOG_TOKEN": "wlpat_…" }
    }
  }
}
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `WORKOUT_LOG_TOKEN` | (필수) | `wlpat_`로 시작하는 PAT |
| `WORKOUT_LOG_BASE_URL` | 프로덕션 | 로컬 개발 시 `http://127.0.0.1:3000` |

## 도구

| 도구 | 하는 일 |
|---|---|
| `list_sessions` · `get_session` | 세션 목록·상세 |
| `get_volume` · `get_strength_summary` · `get_personal_records` | 통계 |
| `list_plans` · `get_progression_state` | 플랜과 **다음 처방의 근거** |
| `preview_cycle` | 주차×세션 격자(확정 스케줄 아님) |
| `search_exercises` | 카탈로그 755종 검색 |
| `log_session` · `log_bodyweight` | 기록 — **`read_write` 필요** |

공개 표면 22개를 전부 도구로 만들지 않았다. 도구가 많으면 LLM이 고르기 어려워지고,
나머지는 앱 화면용 부트스트랩이라 대화에 쓸모가 없다.

## 경계 — HTTP 밖으로 나가지 않는다

이 패키지는 `@workout/core`도, DB도 만지지 않는다. **공개 API를 HTTP로만 부르는 얇은
래퍼다.** `pnpm lint:boundary`가 CI에서 강제한다.

깨지면 잃는 것:
- **배포 독립성** — core가 바뀔 때마다 MCP도 같이 나가야 한다
- **단일 진실원** — 도메인 로직이 서버와 MCP 두 곳으로 갈라진다

## 안전 성질

- **세션 토큰을 넣으면 거부한다.** 세션 토큰은 공개 표면 제한을 받지 않아 계정
  삭제까지 열린다. 접두사(`wlpat_`)로 걸러 낸다.
- **삭제 도구가 없다.** 공개 표면 자체에 삭제가 없다 — 프로그램 실수의 손실이
  되돌릴 수 없고, 도구 목록에 있으면 LLM이 부른다.
- **오류를 예외로 던지지 않는다.** `isError`로 돌려주고 원인을 문장으로 적는다
  ("이 토큰은 읽기 전용입니다. 쓰기가 필요하면 read_write 스코프로 새로 발급하세요")
  — LLM이 읽고 스스로 고칠 수 있어야 한다.
- **토큰은 호출 시점에 읽는다.** 기동 시 읽으면 토큰이 없을 때 프로세스가 죽어
  클라이언트가 "서버가 안 뜬다"만 보게 된다.
- 요청 한도는 서버가 강제한다(읽기 120/분, 쓰기 30/분). 막으려는 것은 사람이 아니라
  **루프**다.

## 개발

```bash
pnpm -C apps/mcp typecheck
pnpm -C apps/mcp lint:boundary
pnpm -C apps/mcp test          # 실제 MCP 프로토콜을 인메모리 전송으로 태운다
```

공개 API 계약은 [`docs/api/README.md`](../../docs/api/README.md)에 있다.
