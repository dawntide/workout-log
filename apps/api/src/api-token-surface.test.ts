import test from "node:test";
import assert from "node:assert/strict";

import { app } from "./app";
import { apiTokenSurfaceSnapshot, decideApiTokenSurface } from "./api-token-surface";

/**
 * PAT 공개 표면의 계약.
 *
 * ⚠️ **프로덕션 프로브로는 이걸 검증할 수 없다** — 미인증 요청은 프록시가 401로 끊어
 * Hono까지 가지 않고, 존재하지 않는 경로도 401이다. 이 파일이 유일한 방어선이다.
 */

function registeredRoutes(): Set<string> {
  const { routes } = app as unknown as {
    routes: Array<{ method: string; path: string }>;
  };
  return new Set(
    routes.filter((route) => route.method !== "ALL").map((r) => `${r.method} ${r.path}`),
  );
}

test("스캔이 실제 라우트 테이블을 읽고 있다 (커버리지 단정)", () => {
  const routes = registeredRoutes();
  assert.ok(routes.size > 30, `라우트가 ${routes.size}개 — 스캔이 낡았다`);
  assert.ok(routes.has("GET /api/logs"), "알려진 라우트가 안 잡힌다");
});

test("허용목록의 모든 경로가 실제로 등록돼 있다", () => {
  // **이 테스트가 실제 오타를 잡았다.** 초안이 `GET /api/stats/:metric`을 적었는데
  // 그런 라우트는 없다(stats는 구체 경로 8개다). 존재하지 않는 경로를 허용목록에
  // 적으면 "열었다고 생각하는데 401"이 되고, 반대로 라우트 이름이 바뀌면 허용목록만
  // 남아 조용히 닫힌다.
  const routes = registeredRoutes();
  const { read, write } = apiTokenSurfaceSnapshot();
  const missing = [...read, ...write].filter((entry) => !routes.has(entry));
  assert.deepEqual(missing, [], `등록되지 않은 허용목록 경로: ${missing.join(", ")}`);
});

test("공개 표면 스냅샷 — 바뀌면 의도적 결정을 강제한다", () => {
  // 새 라우트가 실수로 공개되지 않게 하는 것이 목적이다. 이 목록을 고치는 diff가
  // 곧 "공개 계약이 바뀐다"는 리뷰 신호다.
  assert.deepEqual(apiTokenSurfaceSnapshot(), {
    read: [
      "GET /api/logs",
      "GET /api/logs/calendar",
      "GET /api/logs/:logId",
      "GET /api/stats/bundle",
      "GET /api/stats/e1rm",
      "GET /api/stats/prs",
      "GET /api/stats/strength-summary",
      "GET /api/stats/volume",
      "GET /api/stats/volume-series",
      "GET /api/plans",
      "GET /api/plans/:planId/cycle-overview",
      "GET /api/plans/:planId/progression-state",
      "GET /api/plans/:planId/generated-sessions/active",
      "GET /api/plans/:planId/generated-sessions/:sessionId",
      "GET /api/exercises",
      "GET /api/exercises/categories",
      "GET /api/bodyweight",
      "GET /api/home",
    ],
    write: ["POST /api/logs", "PATCH /api/logs/:logId", "POST /api/bodyweight"],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G1 — 스코프 위반
// ─────────────────────────────────────────────────────────────────────────────

test("read 토큰은 읽기만 — 쓰기는 403", () => {
  assert.deepEqual(
    decideApiTokenSurface({ method: "GET", pathname: "/api/logs", scope: "read" }),
    { allowed: true },
  );
  assert.deepEqual(
    decideApiTokenSurface({ method: "POST", pathname: "/api/logs", scope: "read" }),
    { allowed: false, reason: "scope" },
  );
});

test("read_write 토큰은 쓰기 표면까지", () => {
  for (const entry of apiTokenSurfaceSnapshot().write) {
    const [method, pathname] = entry.split(" ");
    const concrete = pathname.replace(":logId", "abc");
    assert.deepEqual(
      decideApiTokenSurface({ method, pathname: concrete, scope: "read_write" }),
      { allowed: true },
      `${entry}가 read_write에서 막힌다`,
    );
  }
});

test("공개 표면 밖은 스코프와 무관하게 401 — 기본은 거부다", () => {
  const closed = [
    // 인증 경로. **토큰이 토큰을 낳으면 폐기가 의미를 잃는다.**
    ["GET", "/api/auth/me"],
    ["GET", "/api/auth/sessions"],
    ["GET", "/api/auth/api-tokens"],
    ["POST", "/api/auth/api-tokens"],
    ["DELETE", "/api/auth/api-tokens/abc"],
    ["DELETE", "/api/auth/account"],
    ["POST", "/api/auth/password"],
    // 설정 변경은 앱에서만(계획서 §7 결정 3).
    ["GET", "/api/settings"],
    ["PATCH", "/api/settings"],
    ["POST", "/api/settings/app-reset"],
    // 인프라·텔레메트리·전량 덤프.
    ["GET", "/api/ops/sessions/prune"],
    ["GET", "/api/stats/ux-snapshot"],
    ["POST", "/api/ux-events"],
    ["GET", "/api/export"],
    ["POST", "/api/me/import"],
    // 삭제는 프로그램 실수의 손실이 되돌릴 수 없다.
    ["DELETE", "/api/logs/abc"],
    ["DELETE", "/api/bodyweight/abc"],
    ["DELETE", "/api/plans/abc"],
    // 존재하지 않는 경로.
    ["GET", "/api/nope"],
  ] as const;

  for (const scope of ["read", "read_write"] as const) {
    for (const [method, pathname] of closed) {
      assert.deepEqual(
        decideApiTokenSurface({ method, pathname, scope }),
        { allowed: false, reason: "not_public" },
        `${method} ${pathname}가 ${scope} 토큰에 열려 있다`,
      );
    }
  }
});

test("경로 매칭이 세그먼트 수를 지킨다 — 접두사 일치로 새지 않는다", () => {
  // `/api/logs`가 허용이라고 `/api/logs/anything/else`까지 열리면 안 된다.
  assert.deepEqual(
    decideApiTokenSurface({ method: "GET", pathname: "/api/logs/a/b", scope: "read" }),
    { allowed: false, reason: "not_public" },
  );
  // 파라미터는 한 세그먼트만 먹는다.
  assert.deepEqual(
    decideApiTokenSurface({ method: "GET", pathname: "/api/logs/abc", scope: "read" }),
    { allowed: true },
  );
});

test("메서드가 다르면 막힌다 — 같은 경로라도", () => {
  assert.deepEqual(
    decideApiTokenSurface({ method: "DELETE", pathname: "/api/bodyweight", scope: "read_write" }),
    { allowed: false, reason: "not_public" },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 등록 위치 — 이 가드가 실제 결함을 잡았다
// ─────────────────────────────────────────────────────────────────────────────

test("PAT 표면 강제가 모든 라우트보다 **앞에** 등록돼 있다", () => {
  // 처음엔 표면 판단을 `requireAuth` 안에 뒀다. 그런데 `/api/auth/me`·`/logout`은
  // `requireAuth`를 쓰지 않아 검사가 아예 안 돌았고, PAT로 부르면 200이 나왔다
  // (실측으로 확인). 라우터마다 인증을 기억해야 하는 규약에 보안 경계를 맡기면
  // 새 라우터 하나가 잊는 순간 열린다 — 그래서 앱 최상단으로 옮겼다.
  //
  // 이 테스트는 그 위치를 고정한다. 미들웨어가 라우트 뒤로 밀리거나 사라지면 깨진다.
  const { routes } = app as unknown as {
    routes: Array<{ method: string; path: string; handler: { name?: string } }>;
  };

  const middlewareIndex = routes.findIndex(
    (route) => route.handler?.name === "enforceApiTokenSurface",
  );
  assert.notEqual(middlewareIndex, -1, "enforceApiTokenSurface가 등록돼 있지 않다");

  const firstConcreteRoute = routes.findIndex((route) => route.method !== "ALL");
  assert.notEqual(firstConcreteRoute, -1, "구체 라우트가 하나도 없다 — 스캔이 낡았다");
  assert.ok(
    middlewareIndex < firstConcreteRoute,
    `표면 강제(${middlewareIndex})가 첫 라우트(${firstConcreteRoute})보다 뒤에 있다`,
  );
});

test("requireAuth를 쓰지 않는 경로도 공개 표면 밖이면 막힌다", () => {
  // 위 결함의 구체적 형태. 이 경로들은 인증 미들웨어가 없어 라우터 수준 검사로는
  // 절대 안 걸린다.
  for (const [method, pathname] of [
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/logout"],
    ["POST", "/api/auth/login"],
    ["POST", "/api/auth/signup"],
    ["GET", "/health"],
  ] as const) {
    assert.deepEqual(
      decideApiTokenSurface({ method, pathname, scope: "read_write" }),
      { allowed: false, reason: "not_public" },
      `${method} ${pathname}가 PAT에 열려 있다`,
    );
  }
});
