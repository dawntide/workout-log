import assert from "node:assert/strict";
import test from "node:test";

import { apiGet, apiInvalidateCache } from "./api";

test("an invalidated in-flight read cannot repopulate the cache or serve a new reader", async (t) => {
  const originalFetch = globalThis.fetch;
  let finishOld!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Promise<Response>((resolve) => { finishOld = resolve; });
    return Response.json({ revision: "after-save" });
  };
  t.after(() => { globalThis.fetch = originalFetch; apiInvalidateCache(); });
  const oldRead = apiGet("/api/logs/race");
  apiInvalidateCache("/api/logs");
  assert.deepEqual(await apiGet("/api/logs/race"), { revision: "after-save" });
  finishOld(Response.json({ revision: "before-save" }));
  await assert.rejects(oldRead, { name: "AbortError" });
  assert.deepEqual(await apiGet("/api/logs/race"), { revision: "after-save" });
  assert.equal(calls, 2);
});

test("invalidation also rejects undeduplicated stale reads without cancelling unrelated paths", async (t) => {
  const originalFetch = globalThis.fetch;
  const pending = new Map<string, (response: Response) => void>();
  globalThis.fetch = async (path) => new Promise<Response>((resolve) => { pending.set(String(path), resolve); });
  t.after(() => { globalThis.fetch = originalFetch; apiInvalidateCache(); });
  const stale = apiGet("/api/logs/no-dedupe", { dedupe: false });
  const unrelated = apiGet("/api/settings/independent");
  apiInvalidateCache("/api/logs");
  pending.get("/api/logs/no-dedupe")!(Response.json({ old: true }));
  pending.get("/api/settings/independent")!(Response.json({ setting: true }));
  await assert.rejects(stale, { name: "AbortError" });
  assert.deepEqual(await unrelated, { setting: true });
});

test("network-only GET bypasses an existing SWR response", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ version: requestCount }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    apiInvalidateCache();
  });

  const path = "/api/test/network-only";
  assert.deepEqual(await apiGet(path), { version: 1 });
  assert.deepEqual(await apiGet(path), { version: 1 });
  assert.equal(requestCount, 1);

  assert.deepEqual(
    await apiGet(path, { cachePolicy: "network-only" }),
    { version: 2 },
  );
  assert.equal(requestCount, 2);
});

// stale 히트는 "옛 값 먼저"라 화면이 스스로 최신으로 올라올 통로가 필요하다. 이 통로가
// 없으면 IDB 웜업(항상 stale로 복원) 뒤 첫 진입 화면이 옛 상태에 영원히 고정된다 —
// 저장 직후 진행 판정 배너가 통째로 사라졌던 nightly 회귀의 두 번째 축.
test("SWR stale hit reports the revalidated payload to the caller", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ version: requestCount }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    apiInvalidateCache();
  });

  const path = "/api/test/swr-revalidated";
  assert.deepEqual(await apiGet(path), { version: 1 });

  const revalidated: unknown[] = [];
  // maxAgeMs: -1 → 방금 쓴 엔트리도 무조건 stale 분기로 보낸다(시계 해상도에 의존하지 않음).
  const staleValue = await apiGet(path, {
    maxAgeMs: -1,
    onRevalidated: (data) => revalidated.push(data),
  });
  assert.deepEqual(staleValue, { version: 1 }, "stale 값을 먼저 돌려준다");

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revalidated, [{ version: 2 }], "재검증 결과를 호출부에 알린다");
  assert.equal(requestCount, 2);
  assert.deepEqual(await apiGet(path), { version: 2 }, "캐시도 최신으로 갱신된다");
});
