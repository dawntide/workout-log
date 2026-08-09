import test from "node:test";
import assert from "node:assert/strict";

import { plansRoutes } from "../plans";

/**
 * plans 라우트 **등록 테이블 전체**를 고정한다.
 *
 * 2026-08 감사 §3.3(C1)에서 `plans.ts` 1,706줄을 그룹별 모듈로 쪼갤 때, 순수 이동이라
 * 타입체크로는 회귀가 안 잡히는 상태였다. 실제로 깨질 수 있는 건 하나 —
 * **등록 순서**다. Hono는 등록 순서로 매칭하므로 그룹 하나를 위아래로 옮기기만 해도
 * 라우팅이 조용히 달라진다. 특히 `/:planId/generated-sessions/active`가
 * `/:planId/generated-sessions/:sessionId` 뒤로 가면 `active`가 sessionId로 먹힌다.
 *
 * 그래서 method+path를 **순서까지 통째로** 스냅샷한다. 라우트를 의도적으로 추가/변경할
 * 때는 이 목록을 함께 고쳐야 하고, 그 diff가 곧 "라우팅이 바뀐다"는 리뷰 신호다.
 */
const EXPECTED = [
  "ALL /*",
  "GET /",
  "POST /",
  "PATCH /:planId",
  "DELETE /:planId",
  "GET /:planId/generated-sessions/active",
  "GET /:planId/generated-sessions/:sessionId",
  "DELETE /:planId/generated-sessions/:sessionId",
  "POST /:planId/generate",
  "POST /:planId/overrides",
  "GET /:planId/progression-state",
  "POST /:planId/runtime-targets",
  "GET /:planId/cycle-overview",
];

function registeredRoutes(): string[] {
  const { routes } = plansRoutes as unknown as {
    routes: Array<{ method: string; path: string }>;
  };
  return routes.map((route) => `${route.method} ${route.path}`);
}

test("plans 라우트가 순서까지 그대로 등록된다", () => {
  assert.deepEqual(registeredRoutes(), EXPECTED);
});

test("구체 경로 /active가 파라미터 경로 /:sessionId보다 먼저다", () => {
  const routes = registeredRoutes();
  const active = routes.indexOf("GET /:planId/generated-sessions/active");
  const byId = routes.indexOf("GET /:planId/generated-sessions/:sessionId");
  assert.ok(active >= 0 && byId >= 0, "두 라우트가 모두 등록돼 있어야 한다");
  assert.ok(
    active < byId,
    `순서가 뒤집혔다 — active(${active})가 :sessionId(${byId})보다 뒤다. ` +
      "이 상태면 /active 요청이 sessionId='active'로 매칭된다.",
  );
});

test("requireAuth가 전 경로 앞에 걸린다", () => {
  // 이게 첫 번째가 아니면 그 앞의 라우트는 인증 없이 열린다.
  assert.equal(registeredRoutes()[0], "ALL /*");
});
