import assert from "node:assert/strict";
import test from "node:test";

import { apiGet, apiPost } from "./api";
import { setOfflineMode } from "./debug-flags";

/**
 * 오프라인 모드의 계약: **네트워크로 나가지 않는다.**
 *
 * 브라우저에서 재려다 두 번 헛짚었다 — 화면 데이터 상당수는 RSC 부트스트랩으로 오고,
 * 두 번째 방문은 SWR 캐시가 답해서 "요청 0건"이 차단 덕인지 애초에 없었던 건지 구분되지
 * 않았다. 여기서는 fetch를 직접 지켜보므로 그 모호함이 없다.
 */

function withStubbedFetch<T>(run: (calls: () => number) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return run(() => calls).finally(() => {
    globalThis.fetch = original;
  });
}

test("오프라인 모드에서 GET은 fetch를 부르지 않고 시뮬레이션 오류를 던진다", async () => {
  await withStubbedFetch(async (calls) => {
    setOfflineMode(true);
    try {
      await assert.rejects(
        () => apiGet("/api/offline-probe-get", { cachePolicy: "network-only" }),
        /오프라인 모드/,
      );
      assert.equal(calls(), 0, "요청이 실제로 나가면 차단이 아니다");
    } finally {
      setOfflineMode(false);
    }
  });
});

test("오프라인 모드에서 POST도 막힌다", async () => {
  await withStubbedFetch(async (calls) => {
    setOfflineMode(true);
    try {
      await assert.rejects(() => apiPost("/api/offline-probe-post", {}), /오프라인 모드/);
      assert.equal(calls(), 0);
    } finally {
      setOfflineMode(false);
    }
  });
});

test("끄면 다시 네트워크로 나간다", async () => {
  await withStubbedFetch(async (calls) => {
    setOfflineMode(false);
    await apiPost("/api/offline-probe-post", {});
    assert.equal(calls(), 1, "토글을 끄면 원래대로 동작해야 한다");
  });
});
