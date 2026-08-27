import test from "node:test";
import assert from "node:assert/strict";

import { app } from "./app";
import { apiTokenSurfaceSnapshot } from "./api-token-surface";

/**
 * **앱 전체의 라우트 테이블**을 순서까지 고정한다.
 *
 * `plans/route-order.test.ts`가 그룹 하나를 잠그던 패턴을 앱 전체로 넓힌 것이다
 * (계획서 §4 G2). 목적이 둘이다:
 *
 * 1. **새 라우트가 리뷰 없이 늘지 않게** — 이 목록을 고치는 diff가 곧 "표면이
 *    바뀐다"는 신호다. PAT는 기본 거부라 새 라우트가 자동 공개되지는 않지만,
 *    무엇이 생겼는지는 보여야 한다.
 * 2. **Hono 매칭 순서 사고 방지** — 등록 순서로 매칭하므로 구체 경로가 파라미터
 *    경로 뒤로 가면 조용히 삼켜진다.
 *
 * ⚠️ **프로덕션 프로브로는 이걸 볼 수 없다** — 미인증 요청은 프록시가 401로 끊어
 * Hono까지 가지 않고, 존재하지 않는 경로도 401이다. 이 스냅샷이 유일한 방어선이다.
 */

function registeredRoutes(): string[] {
  const { routes } = app as unknown as {
    routes: Array<{ method: string; path: string }>;
  };
  // 미들웨어(`ALL /*`)는 순서가 아니라 개수만 의미가 있어 뺀다 — 그쪽 순서는
  // `api-token-surface.test.ts`가 "라우트보다 앞"으로 따로 잠근다.
  //
  // 같은 method+path가 두 번 오는 경우가 있다(라우터의 `use("*", requireAuth)`
  // 바인딩과 핸들러 등록). 매칭에 의미가 있는 것은 **첫 등장 순서**라 그것만 남긴다.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const route of routes) {
    if (route.method === "ALL") continue;
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered;
}

const EXPECTED = [
  "GET /health",
  "POST /api/auth/login",
  "POST /api/auth/signup",
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "POST /api/auth/password",
  "DELETE /api/auth/account",
  "POST /api/auth/password/reset/request",
  "POST /api/auth/email/verification/request",
  "GET /api/auth/sessions",
  "GET /api/auth/api-tokens",
  "POST /api/auth/api-tokens",
  "DELETE /api/auth/api-tokens/:tokenHash",
  "DELETE /api/auth/sessions",
  "GET /api/logs",
  "POST /api/logs",
  "GET /api/logs/calendar",
  "GET /api/logs/:logId",
  "PATCH /api/logs/:logId",
  "DELETE /api/logs/:logId",
  "GET /api/stats/e1rm",
  "GET /api/stats/bundle",
  "GET /api/stats/volume-series",
  "GET /api/stats/prs",
  "GET /api/stats/ref5-start-recommendation",
  "GET /api/stats/strength-summary",
  "GET /api/stats/volume",
  "GET /api/stats/muscle-freshness",
  "GET /api/stats/ux-snapshot",
  "GET /api/bodyweight",
  "POST /api/bodyweight",
  "DELETE /api/bodyweight/:id",
  "GET /api/exercises",
  "POST /api/exercises",
  "GET /api/exercises/categories",
  "POST /api/exercises/alias",
  "PATCH /api/exercises/:exerciseId",
  "DELETE /api/exercises/:exerciseId",
  "GET /api/settings",
  "PATCH /api/settings",
  "POST /api/settings/clear-cache",
  "POST /api/settings/app-reset",
  "POST /api/settings/seed-demo-data",
  "GET /api/plans",
  "POST /api/plans",
  "PATCH /api/plans/:planId",
  "DELETE /api/plans/:planId",
  "GET /api/plans/:planId/generated-sessions/active",
  "GET /api/plans/:planId/generated-sessions/:sessionId",
  "DELETE /api/plans/:planId/generated-sessions/:sessionId",
  "POST /api/plans/:planId/generate",
  "POST /api/plans/:planId/overrides",
  "GET /api/plans/:planId/progression-state",
  "POST /api/plans/:planId/runtime-targets",
  "GET /api/plans/:planId/cycle-overview",
  "GET /api/templates",
  "DELETE /api/templates/:slug",
  "PATCH /api/templates/:slug",
  "POST /api/templates/:slug/fork",
  "GET /api/home",
  "GET /api/export",
  "POST /api/me/import",
  "PUT /api/program-versions/:id",
  "GET /api/generated-sessions",
  "POST /api/ux-events/public",
  "POST /api/ux-events",
  "GET /api/ops/sessions/prune",
  "POST /api/ops/sessions/prune",
];

test("앱 라우트가 순서까지 그대로 등록된다", () => {
  assert.deepEqual(registeredRoutes(), EXPECTED);
});

test("구체 경로가 같은 자리의 파라미터 경로보다 먼저다", () => {
  // Hono는 등록 순서로 매칭한다. `/calendar`가 `/:logId` 뒤로 가면 logId로 먹힌다.
  const routes = registeredRoutes();
  const pairs: Array<[string, string]> = [
    ["GET /api/logs/calendar", "GET /api/logs/:logId"],
    ["GET /api/exercises/categories", "GET /api/exercises/:exerciseId"],
    [
      "GET /api/plans/:planId/generated-sessions/active",
      "GET /api/plans/:planId/generated-sessions/:sessionId",
    ],
  ];
  for (const [concrete, parameterized] of pairs) {
    const concreteIndex = routes.indexOf(concrete);
    if (concreteIndex < 0) continue; // 그 쌍이 없으면 이 단정은 대상 밖이다
    const paramIndex = routes.indexOf(parameterized);
    if (paramIndex < 0) continue;
    assert.ok(
      concreteIndex < paramIndex,
      `${concrete}가 ${parameterized}보다 뒤에 있다 — 파라미터 경로가 삼킨다`,
    );
  }
});

test("공개 표면은 전체 표면의 부분집합이다", () => {
  // 허용목록에만 있고 앱에는 없는 경로를 막는 단정은
  // `api-token-surface.test.ts`에도 있다. 여기서는 **비율**을 기록한다 —
  // 공개 비중이 갑자기 커지면 그 자체가 리뷰 신호다.
  const routes = new Set(registeredRoutes());
  const { read, write } = apiTokenSurfaceSnapshot();
  const publicEntries = [...read, ...write];
  for (const entry of publicEntries) {
    assert.ok(routes.has(entry), `공개 표면에 없는 라우트: ${entry}`);
  }
  const ratio = publicEntries.length / routes.size;
  console.log(
    `  공개 표면: ${publicEntries.length}/${routes.size} (${Math.round(ratio * 100)}%) — 나머지는 세션 전용`,
  );
  assert.ok(
    ratio < 0.5,
    `공개 비중이 ${Math.round(ratio * 100)}%다 — 개인 도구의 기본 거부 원칙과 어긋난다`,
  );
});
