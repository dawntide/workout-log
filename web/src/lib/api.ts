type ApiCachePolicy = "swr" | "network-only" | "cache-only";

type ApiGetOptions<T = unknown> = {
  cachePolicy?: ApiCachePolicy;
  cacheKey?: string;
  maxAgeMs?: number;
  staleWhileRevalidateMs?: number;
  dedupe?: boolean;
  signal?: AbortSignal;
  // SWR stale 히트로 "오래된 값"을 먼저 돌려준 경우, 백그라운드 재검증이 끝나면 한 번 더 알린다.
  // 이게 없으면 stale을 그린 화면은 다른 이유로 리렌더되기 전까지 영원히 옛 상태로 남는다
  // (IDB 웜업 엔트리는 항상 stale로 복원되므로 새 진입마다 그 상태가 된다).
  onRevalidated?: (data: T) => void;
};

type ApiMutationOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  invalidateCache?: boolean;
  // PERF: 전체 캐시 삭제 대신 특정 prefix만 무효화 → 유효한 캐시 엔트리 보존
  invalidateCachePrefixes?: string[];
};

type ApiCacheEntry = {
  data: unknown;
  updatedAt: number;
  lastAccessedAt: number;
};

type ApiInflightRequest = {
  controller: AbortController | null;
  consumers: number;
  promise: Promise<unknown>;
  settled: boolean;
};

type ApiNetworkListener = (inflightCount: number) => void;

// PERF: 기본 캐시 시간 조정
// maxAgeMs: 30s → 서버 HTTP Cache-Control max-age와 정합 (home=60s, plans=30s)
//   8s는 너무 짧아 동일 데이터를 자주 재요청함. 30s로 늘려 네트워크 요청 감소.
// staleWhileRevalidateMs: 120s → HTTP stale-while-revalidate=120 과 정합
//   캐시 만료 후에도 120s간 stale 데이터 반환, 백그라운드에서 자동 재검증
const DEFAULT_MAX_AGE_MS = 30_000;
const DEFAULT_STALE_WHILE_REVALIDATE_MS = 120_000;
// PERF: 캐시 엔트리 수 180개 유지 (주요 API * 경우의 수 기준 충분)
const API_CACHE_MAX_ENTRIES = 180;

const apiResponseCache = new Map<string, ApiCacheEntry>();
const apiInflightRequests = new Map<string, ApiInflightRequest>();
const apiNetworkListeners = new Set<ApiNetworkListener>();
let apiNetworkInflightCount = 0;

function cloneData<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cacheNow() {
  return Date.now();
}

function notifyApiNetworkListeners() {
  for (const listener of apiNetworkListeners) {
    listener(apiNetworkInflightCount);
  }
}

function beginApiNetworkRequest() {
  apiNetworkInflightCount += 1;
  notifyApiNetworkListeners();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    apiNetworkInflightCount = Math.max(0, apiNetworkInflightCount - 1);
    notifyApiNetworkListeners();
  };
}

function trimApiCache() {
  if (apiResponseCache.size <= API_CACHE_MAX_ENTRIES) return;
  const entries = [...apiResponseCache.entries()];
  entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
  const removeCount = entries.length - API_CACHE_MAX_ENTRIES;
  for (let i = 0; i < removeCount; i += 1) {
    const key = entries[i]?.[0];
    if (!key) continue;
    apiResponseCache.delete(key);
  }
}

function writeApiCache(key: string, data: unknown) {
  const now = cacheNow();
  apiResponseCache.set(key, {
    data: cloneData(data),
    updatedAt: now,
    lastAccessedAt: now,
  });
  trimApiCache();
  // IDB 영속화 (fire-and-forget, 클라이언트 전용)
  if (typeof window !== "undefined") {
    void import("./api-cache-idb").then(({ idbWriteEntry }) =>
      idbWriteEntry(key, data, now, now).catch(() => {
        // IDB 실패는 무시 — 인메모리 캐시가 primary
      }),
    );
  }
}

function readApiCache(key: string): ApiCacheEntry | null {
  const entry = apiResponseCache.get(key);
  if (!entry) return null;
  entry.lastAccessedAt = cacheNow();
  return entry;
}

function resolveApiErrorMessage(
  body: unknown,
  fallbackMessage: string,
) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallbackMessage;
}

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const endNetworkRequest = beginApiNetworkRequest();
  try {
    const res = await fetch(path, {
      cache: "no-store",
      signal,
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw new Error(resolveApiErrorMessage(body, `GET ${path} failed: ${res.status}`));
    }
    return (body ?? {}) as T;
  } finally {
    endNetworkRequest();
  }
}

function releaseApiInflightConsumer(cacheKey: string, inflight: ApiInflightRequest) {
  if (inflight.consumers > 0) {
    inflight.consumers -= 1;
  }
  if (inflight.consumers > 0 || inflight.settled) return;
  if (apiInflightRequests.get(cacheKey) === inflight) {
    apiInflightRequests.delete(cacheKey);
  }
  inflight.controller?.abort();
}

async function awaitApiInflight<T>(
  cacheKey: string,
  inflight: ApiInflightRequest,
  signal?: AbortSignal,
) {
  inflight.consumers += 1;

  const release = () => {
    releaseApiInflightConsumer(cacheKey, inflight);
  };

  try {
    if (!signal) {
      return cloneData((await inflight.promise) as T);
    }

    if (signal.aborted) {
      release();
      throw createAbortError();
    }

    const data = await new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        release();
        reject(createAbortError());
      };

      signal.addEventListener("abort", onAbort, { once: true });
      inflight.promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value as T);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });

    return cloneData(data);
  } finally {
    release();
  }
}

async function requestAndCache<T>(
  path: string,
  cacheKey: string,
  { dedupe = true, signal }: Pick<ApiGetOptions, "dedupe" | "signal">,
): Promise<T> {
  const shouldDedupe = dedupe;
  if (shouldDedupe) {
    const inflight = apiInflightRequests.get(cacheKey);
    if (inflight) {
      return awaitApiInflight<T>(cacheKey, inflight, signal);
    }
  }

  if (!shouldDedupe) {
    const data = await fetchJson<T>(path, signal);
    writeApiCache(cacheKey, data);
    return cloneData(data);
  }

  const controller = new AbortController();
  const dedupedRequest = (async () => {
    const data = await fetchJson<T>(path, controller.signal);
    writeApiCache(cacheKey, data);
    return data;
  })();

  const inflight: ApiInflightRequest = {
    controller,
    consumers: 0,
    promise: dedupedRequest as Promise<unknown>,
    settled: false,
  };
  apiInflightRequests.set(cacheKey, inflight);

  void dedupedRequest
    .finally(() => {
      inflight.settled = true;
      if (apiInflightRequests.get(cacheKey) === inflight) {
        apiInflightRequests.delete(cacheKey);
      }
    })
    .catch(() => {
      // Consumers handle the request failure or abort path.
    });

  return awaitApiInflight<T>(cacheKey, inflight, signal);
}

export function apiInvalidateCache(cacheKeyPrefix?: string) {
  if (!cacheKeyPrefix) {
    apiResponseCache.clear();
  } else {
    for (const key of apiResponseCache.keys()) {
      if (!key.startsWith(cacheKeyPrefix)) continue;
      apiResponseCache.delete(key);
    }
  }
  // IDB에서도 동일 범위 삭제 (fire-and-forget)
  if (typeof window !== "undefined") {
    void import("./api-cache-idb").then(({ idbDeleteEntries }) =>
      idbDeleteEntries(cacheKeyPrefix).catch(() => {}),
    );
  }
}

/**
 * 앱 시작 시 IDB에 저장된 캐시를 인메모리 캐시로 복원.
 * 엔트리는 "방금 stale됨" 상태로 삽입되어 즉시 UI에 표시되고
 * 백그라운드에서 자동 재검증(stale-while-revalidate)이 트리거됨.
 * 이미 인메모리에 있는 키는 덮어쓰지 않음.
 */
export async function warmApiCacheFromIDB(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { idbLoadAllEntries } = await import("./api-cache-idb");
    const entries = await idbLoadAllEntries();
    // updatedAt을 "maxAgeMs 직전" 으로 조정 → SWR이 즉시 백그라운드 재검증 트리거
    const adjustedUpdatedAt = cacheNow() - DEFAULT_MAX_AGE_MS - 1;
    for (const entry of entries) {
      if (apiResponseCache.has(entry.key)) continue;
      apiResponseCache.set(entry.key, {
        data: entry.data,
        updatedAt: adjustedUpdatedAt,
        lastAccessedAt: entry.lastAccessedAt,
      });
    }
    trimApiCache();
  } catch {
    // 웜업 실패는 조용히 무시 — 앱 동작에 영향 없음
  }
}

export function getApiNetworkInflightCount() {
  return apiNetworkInflightCount;
}

export function subscribeApiNetworkInflight(listener: ApiNetworkListener) {
  apiNetworkListeners.add(listener);
  listener(apiNetworkInflightCount);
  return () => {
    apiNetworkListeners.delete(listener);
  };
}

export async function apiGet<T>(path: string, options: ApiGetOptions<T> = {}): Promise<T> {
  const {
    cachePolicy = "swr",
    cacheKey = path,
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    staleWhileRevalidateMs = DEFAULT_STALE_WHILE_REVALIDATE_MS,
    dedupe = true,
    signal,
    onRevalidated,
  } = options;

  if (cachePolicy === "network-only") {
    return requestAndCache<T>(path, cacheKey, { dedupe, signal });
  }

  const cachedEntry = readApiCache(cacheKey);
  if (cachedEntry) {
    const ageMs = cacheNow() - cachedEntry.updatedAt;

    if (ageMs <= maxAgeMs) {
      return cloneData(cachedEntry.data as T);
    }

    if (cachePolicy === "swr" && ageMs <= maxAgeMs + staleWhileRevalidateMs) {
      const inflight = apiInflightRequests.get(cacheKey);
      const revalidation = inflight
        ? (inflight.promise as Promise<T>)
        : requestAndCache<T>(path, cacheKey, { dedupe: true });
      void revalidation
        .then((fresh) => {
          onRevalidated?.(cloneData(fresh));
        })
        .catch(() => {
          // Keep stale cache when background refresh fails.
        });
      return cloneData(cachedEntry.data as T);
    }
  }

  if (cachePolicy === "cache-only") {
    throw new Error(`GET ${path} failed: cache miss`);
  }

  return requestAndCache<T>(path, cacheKey, { dedupe, signal });
}

async function apiMutate<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: ApiMutationOptions = {},
) {
  const { signal, headers, invalidateCache = true } = options;
  const requestHeaders: Record<string, string> = {};
  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
  }
  if (headers) {
    Object.assign(requestHeaders, headers);
  }

  const endNetworkRequest = beginApiNetworkRequest();
  try {
    const res = await fetch(path, {
      method,
      headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw new Error(resolveApiErrorMessage(data, `${method} ${path} failed: ${res.status}`));
    }
    if (invalidateCache) {
      const { invalidateCachePrefixes } = options;
      if (invalidateCachePrefixes?.length) {
        // PERF: 지정된 prefix만 무효화 → 나머지 캐시(plans, exercises 등) 보존
        for (const prefix of invalidateCachePrefixes) {
          apiInvalidateCache(prefix);
        }
      } else {
        apiInvalidateCache();
      }
    }
    return (data ?? {}) as T;
  } finally {
    endNetworkRequest();
  }
}

export async function apiPost<T>(path: string, body: unknown, options?: ApiMutationOptions): Promise<T> {
  return apiMutate<T>("POST", path, body, options);
}

export async function apiPut<T>(path: string, body: unknown, options?: ApiMutationOptions): Promise<T> {
  return apiMutate<T>("PUT", path, body, options);
}

export async function apiPatch<T>(path: string, body: unknown, options?: ApiMutationOptions): Promise<T> {
  return apiMutate<T>("PATCH", path, body, options);
}

export async function apiDelete<T>(path: string, options?: ApiMutationOptions): Promise<T> {
  return apiMutate<T>("DELETE", path, undefined, options);
}
