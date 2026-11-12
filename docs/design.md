# 설계 색인 (design.md)

이 문서는 설계의 **색인**이다. 내용을 복제하지 않고 정본 위치와 읽는 순서만 정한다. 설계가 바뀌면 정본을 고치고, 여기에는 위치·요약이 달라질 때만 반영한다. 설계에 영향을 주는 변경은 구현 전에 수정안을 제안하고 승인을 받는다(AGENTS.md "작업 규칙").

## 시스템 구조

- 구성: Next.js 16 + React 19 PWA(`web/`), Hono 백엔드(`apps/api`), 공유 도메인 코드(`packages/core`, 프레임워크-무지), Drizzle + PostgreSQL(Supabase), 배포 Vercel. 요약은 AGENTS.md "프로젝트 개요".
- 정본: [`web/docs/architecture-layers.md`](../web/docs/architecture-layers.md) — 레이어 흐름(app→widgets→features→primitives→lib→server), 의존 방향, 시스템 토폴로지(web↔apps/api 인프로세스/프록시).
- 경계 규칙은 린트로 강제된다: `pnpm -C packages/core lint:boundary`, `pnpm -C apps/api lint:boundary`.
- UI 규칙: [`web/docs/design-guide.md`](../web/docs/design-guide.md), 프리미티브 규칙 `web/src/components/v2/primitives/README.md`.

## 훈련 프로그램 (REF5 Adaptive Strength)

- 정본: [`docs/ref5-program-spec.md`](ref5-program-spec.md) (현재 v1.6, 규범 문서). 정본 순서는 스펙 §2: 스펙 → `packages/core/src/program-engine/ref5.ts` → 테스트 → 세션 스냅샷 → UI 문구. 변경은 §26 형식으로 한 번에 한 요소.
- 현재 상태 요약: [`docs/notes/ref5-context.md`](notes/ref5-context.md). 스펙과 다르면 스펙이 맞다.
- 근거 자료: [`docs/research/ref5-evidence-2026-10/`](research/ref5-evidence-2026-10/README.md), 평가 [`docs/notes/ref5-evidence-evaluation-2026-10-15.md`](notes/ref5-evidence-evaluation-2026-10-15.md).
- 비규범 기록: `ref5-v1.4-oap-proposal.md`, `ref5-v1.4-implementation-plan.md`. `ref5-v1.6-aux-cap-proposal.md`(보조 상한 기준, 승인되어 스펙 v1.6에 반영). 폐기본(`ref5-program-spec-v1.3*`, `hybrid-*`, `async_protocol_*`)은 근거로 쓰지 않는다.

## 기능별 계획 문서

`docs/` 아래 `*-plan.md`(rest-timer, rir-input, set-type, exercise-catalog, plate-calculator, muscle-freshness, bodyweight-timeseries, db-multiuser-isolation, program-dsl-typing, public-api-mcp, judgment-history-and-roadmap)와 `docs/notes/rest-timer-push-plan.md`. 각 문서가 해당 기능의 설계 정본이다.

## 결정과 상태

- 결정의 이유·버린 대안: [`docs/decisions.md`](decisions.md).
- 현재 상태·열린 항목: [`docs/handoff.md`](handoff.md).
- 호스팅·인증·경로·로컬 env 상세: [`docs/agent-reference.md`](agent-reference.md).
- 감사: [`codebase-audit-2026-08.md`](codebase-audit-2026-08.md)(최신), [`codebase-audit-2026-07.md`](codebase-audit-2026-07.md).
