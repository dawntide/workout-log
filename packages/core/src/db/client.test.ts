// pg 풀 수명 훅 — Fluid Compute에서 인스턴스 일시 중단 전에 유휴 클라이언트를 놓아주는
// 배선(web의 attachDatabasePool 어댑터)이 실제로 풀까지 도달하는지 고정한다.
// core는 플랫폼을 모르므로 여기서는 주입 계약만 검증한다(실제 attach는 web 어댑터의 몫).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { setDbPoolLifecycleHook } from "./client";

function fakePool(): Pool {
  return {} as Pool;
}

test.afterEach(() => {
  setDbPoolLifecycleHook(null);
  global.__dbPool = undefined;
});

test("이미 만들어진 풀이 있으면 늦게 등록해도 즉시 적용된다", () => {
  // 미들웨어처럼 부트스트랩 순서를 보장 못 하는 번들에서 첫 쿼리가 먼저 나갈 수 있다.
  const pool = fakePool();
  global.__dbPool = pool;

  const seen: Pool[] = [];
  setDbPoolLifecycleHook((p) => seen.push(p));

  assert.deepEqual(seen, [pool]);
});

test("같은 풀에 두 번 적용되지 않는다", () => {
  // 등록 지점이 둘(instrumentation·proxy)이라 중복 호출이 정상 경로다.
  const pool = fakePool();
  global.__dbPool = pool;

  let calls = 0;
  setDbPoolLifecycleHook(() => { calls += 1; });
  setDbPoolLifecycleHook(() => { calls += 1; });

  assert.equal(calls, 1);
});

test("등록된 훅이 없으면 아무 일도 하지 않는다", () => {
  global.__dbPool = fakePool();
  assert.doesNotThrow(() => setDbPoolLifecycleHook(null));
});

test("훅 상태는 모듈 스코프가 아니라 전역에 산다", () => {
  // Next는 등록지(instrumentation·proxy)와 쿼리가 도는 앱 코드를 다른 번들로 컴파일할 수 있다.
  // 모듈 스코프에 두면 번들마다 별도 인스턴스가 되어 등록이 보이지 않는다 — 실제로 그렇게
  // 만들었다가 훅이 한 번도 호출되지 않았다. 풀(global.__dbPool)과 같은 저장소를 써야 한다.
  const hook = () => {};
  setDbPoolLifecycleHook(hook);
  assert.equal(global.__dbPoolLifecycleHook, hook);

  setDbPoolLifecycleHook(null);
  assert.equal(global.__dbPoolLifecycleHook, null);
});
