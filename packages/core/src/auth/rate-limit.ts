/**
 * 인증 라우트용 rate limiter.
 *
 * - Upstash Redis (REST) 환경변수가 설정되어 있으면 sliding window를
 *   Redis로 처리 → 멀티 인스턴스/serverless에서도 일관된 카운터.
 * - 미설정 시 in-memory sliding window로 fallback (단일 인스턴스 가정).
 *
 * 호출자가 sync 인터페이스를 기대하지 않도록 모두 async 시그니처를 사용.
 */

import {
  isRedisRateLimitConfigured,
  redisRateLimit,
} from "./rate-limit-redis";

type Bucket = { timestamps: number[] };

const MAX_KEYS = 1024;
const buckets = new Map<string, Bucket>();

function pruneOld(bucket: Bucket, now: number, windowMs: number) {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < bucket.timestamps.length && bucket.timestamps[i] < cutoff) {
    i++;
  }
  if (i > 0) bucket.timestamps.splice(0, i);
}

function evictIfFull() {
  if (buckets.size <= MAX_KEYS) return;
  const overflow = buckets.size - MAX_KEYS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed++;
    if (removed >= overflow) break;
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimitInput = {
  key: string;
  max: number;
  windowMs: number;
};

export function rateLimitInMemory(input: RateLimitInput): RateLimitResult {
  const { key, max, windowMs } = input;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
    evictIfFull();
  }
  pruneOld(bucket, now, windowMs);

  if (bucket.timestamps.length >= max) {
    const earliest = bucket.timestamps[0];
    const retryAfterMs = Math.max(0, windowMs - (now - earliest));
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, max - bucket.timestamps.length),
    retryAfterMs: 0,
  };
}

/**
 * 진입점. Redis가 설정되어 있으면 그쪽을 우선 사용하고, 네트워크 오류 시
 * in-memory로 graceful fallback (보수적 — 인증 흐름이 외부 의존으로
 * 무너지지 않도록).
 */
export async function rateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  // CI e2e 옵트아웃: nightly가 실계정 스펙 25+개를 한 러너 IP에서 signup하므로
  // 5/hr 한도에 걸린다(prod 전환 후 실측 429). 실배포엔 이 env가 없어 동작 무변경 —
  // WORKOUT_ALLOW_INSECURE_COOKIES와 같은 CI-전용 스위치 계열.
  if (process.env.WORKOUT_DISABLE_RATE_LIMIT === "1") {
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterMs: 0 };
  }
  if (isRedisRateLimitConfigured()) {
    try {
      return await redisRateLimit(input);
    } catch {
      // Network/Upstash error — fall back to in-memory so legitimate
      // requests are not denied by infrastructure failures.
      return rateLimitInMemory(input);
    }
  }
  return rateLimitInMemory(input);
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
