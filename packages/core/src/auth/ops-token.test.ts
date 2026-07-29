import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { opsTokenAuthorized } from "./ops-token";

const ENV_KEYS = ["WORKOUT_OPS_TOKEN", "CRON_SECRET", "WORKOUT_OPS_ALLOW_NO_TOKEN"] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("opsTokenAuthorized", () => {
  test("시크릿 미설정이면 거부한다 (fail-closed)", () => {
    // 과거 web 라우트는 여기서 통과시켰다 — 공개 주소의 파괴적 엔드포인트가 무인증이 됐다.
    assert.equal(opsTokenAuthorized("Bearer anything"), false);
    assert.equal(opsTokenAuthorized(null), false);
  });

  test("WORKOUT_OPS_ALLOW_NO_TOKEN=1은 명시적 opt-out", () => {
    process.env.WORKOUT_OPS_ALLOW_NO_TOKEN = "1";
    assert.equal(opsTokenAuthorized(null), true);
    // "1" 이외의 값은 opt-in이 아니다.
    process.env.WORKOUT_OPS_ALLOW_NO_TOKEN = "true";
    assert.equal(opsTokenAuthorized(null), false);
  });

  test("토큰이 설정되면 일치하는 Bearer만 통과한다", () => {
    process.env.WORKOUT_OPS_TOKEN = "s3cret";
    assert.equal(opsTokenAuthorized("Bearer s3cret"), true);
    assert.equal(opsTokenAuthorized("bearer s3cret"), true, "스킴은 대소문자 무시");
    assert.equal(opsTokenAuthorized("Bearer wrong"), false);
    assert.equal(opsTokenAuthorized("s3cret"), false, "Bearer 스킴 없이는 불가");
    assert.equal(opsTokenAuthorized(null), false);
  });

  test("토큰이 설정되면 ALLOW_NO_TOKEN이 우회로가 되지 않는다", () => {
    process.env.WORKOUT_OPS_TOKEN = "s3cret";
    process.env.WORKOUT_OPS_ALLOW_NO_TOKEN = "1";
    assert.equal(opsTokenAuthorized(null), false);
    assert.equal(opsTokenAuthorized("Bearer s3cret"), true);
  });

  test("CRON_SECRET은 명시적으로 허용한 라우트에서만 통한다", () => {
    process.env.CRON_SECRET = "vercel-cron";
    // 기본(ops-token만 허용)에서는 CRON_SECRET이 설정돼 있어도 안 통하고,
    // 허용 목록이 비면 fail-closed로 떨어진다.
    assert.equal(opsTokenAuthorized("Bearer vercel-cron"), false);
    assert.equal(opsTokenAuthorized("Bearer vercel-cron", ["cron-secret"]), true);
    assert.equal(opsTokenAuthorized("Bearer vercel-cron", ["ops-token", "cron-secret"]), true);
  });

  test("둘 다 설정되면 어느 쪽이든 통과한다 (스케줄러 이관 중 공존)", () => {
    process.env.WORKOUT_OPS_TOKEN = "ops";
    process.env.CRON_SECRET = "cron";
    const accept = ["ops-token", "cron-secret"] as const;
    assert.equal(opsTokenAuthorized("Bearer ops", accept), true);
    assert.equal(opsTokenAuthorized("Bearer cron", accept), true);
    assert.equal(opsTokenAuthorized("Bearer other", accept), false);
  });

  test("빈 문자열 시크릿은 설정되지 않은 것으로 본다", () => {
    process.env.WORKOUT_OPS_TOKEN = "   ";
    assert.equal(opsTokenAuthorized("Bearer    "), false);
    assert.equal(opsTokenAuthorized("Bearer "), false);
  });
});
