import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

// 기계가 부르는 라우트(Vercel cron)는 쿠키를 들고 오지 않는다. proxy의 공개 목록에
// 빠지면 라우트 자체의 Bearer 게이트에 닿기도 전에 401이 되는데, 로컬 dev는
// WORKOUT_AUTH_USER_ID fallback에 걸려 통과하므로 **프로덕션에서만** 드러난다.
// 실제로 /api/cron이 그렇게 나가 cron이 매일 401로 죽을 뻔했다.

const HERE = dirname(fileURLToPath(import.meta.url));
const CRON_ROUTE_DIR = join(HERE, "app", "api", "cron");

function cronRoutePaths(): string[] {
  return readdirSync(CRON_ROUTE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `/api/cron/${e.name}`);
}

function request(pathname: string): NextRequest {
  return new NextRequest(new URL(`https://example.test${pathname}`));
}

let savedFallback: string | undefined;

beforeEach(() => {
  // 프로덕션과 같은 조건: 쿠키 없음 + dev fallback 없음.
  savedFallback = process.env.WORKOUT_AUTH_USER_ID;
  delete process.env.WORKOUT_AUTH_USER_ID;
});

afterEach(() => {
  if (savedFallback === undefined) delete process.env.WORKOUT_AUTH_USER_ID;
  else process.env.WORKOUT_AUTH_USER_ID = savedFallback;
});

describe("proxy — 기계 호출 라우트 통과", () => {
  test("cron 라우트가 하나 이상 존재한다 (스캔이 비면 이 테스트는 무의미)", () => {
    assert.ok(cronRoutePaths().length > 0, `cron 라우트를 찾지 못함: ${CRON_ROUTE_DIR}`);
  });

  test("모든 /api/cron/* 라우트가 쿠키 없이도 미들웨어를 통과한다", async () => {
    for (const path of cronRoutePaths()) {
      const res = await proxy(request(path));
      assert.notEqual(
        res.status,
        401,
        `${path}가 proxy에서 401 — PUBLIC_PATH_PREFIXES에 /api/cron이 있는지 확인`,
      );
    }
  });

  test("ops 라우트도 같은 이유로 통과한다", async () => {
    const res = await proxy(request("/api/ops/sessions/prune"));
    assert.notEqual(res.status, 401);
  });
});

describe("proxy — 쿠키 게이트는 그대로", () => {
  test("공개 목록에 없는 데이터 라우트는 쿠키 없으면 401", async () => {
    // 이게 401이 아니면 위 통과 단정들이 게이트를 실제로 지나온 증거가 못 된다.
    const res = await proxy(request("/api/logs"));
    assert.equal(res.status, 401);
  });
});
