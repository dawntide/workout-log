import assert from "node:assert/strict";
import test from "node:test";

import { apiGet, apiInvalidateCache } from "./api";

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
