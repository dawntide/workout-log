import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { type WorkoutExecutor, db } from "@workout/core/db/client";
import { statsCache } from "@workout/core/db/schema";

// PERF: DB statsCache 위에 얹는 in-process 메모리 캐시.
// 동일 서버리스 컨테이너 내 반복 요청에서 DB 쿼리 1회 제거.
// 키: "userId:metric:paramsHash", 값: { data, expiresAt }
declare global {
  var __statsMemCache: Map<string, { data: unknown; expiresAt: number }> | undefined;
}
const statsMemCache: Map<string, { data: unknown; expiresAt: number }> =
  global.__statsMemCache ?? new Map();
global.__statsMemCache = statsMemCache;

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableSerialize(v)).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashParams(params: Record<string, unknown>) {
  return createHash("sha256").update(stableSerialize(params)).digest("hex");
}

export async function getStatsCache<T>(input: {
  userId: string;
  metric: string;
  params: Record<string, unknown>;
  maxAgeSeconds?: number;
}): Promise<T | null> {
  const paramsHash = hashParams(input.params);
  const memKey = `${input.userId}:${input.metric}:${paramsHash}`;

  // 1) in-process 메모리 캐시 확인 (DB 쿼리 없음)
  const memEntry = statsMemCache.get(memKey);
  if (memEntry && Date.now() < memEntry.expiresAt) {
    return memEntry.data as T;
  }

  // 2) DB 캐시 확인
  const rows = await db
    .select({
      payload: statsCache.payload,
      updatedAt: statsCache.updatedAt,
    })
    .from(statsCache)
    .where(
      and(
        eq(statsCache.userId, input.userId),
        eq(statsCache.metric, input.metric),
        eq(statsCache.paramsHash, paramsHash),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (input.maxAgeSeconds && input.maxAgeSeconds > 0) {
    const minUpdatedAt = Date.now() - input.maxAgeSeconds * 1000;
    if (new Date(row.updatedAt).getTime() < minUpdatedAt) return null;
  }

  // DB 히트 시 메모리 캐시에도 저장 (나머지 TTL만큼)
  const remainingMs = input.maxAgeSeconds
    ? new Date(row.updatedAt).getTime() + input.maxAgeSeconds * 1000 - Date.now()
    : 60_000;
  if (remainingMs > 0) {
    statsMemCache.set(memKey, { data: row.payload, expiresAt: Date.now() + remainingMs });
  }

  return row.payload as T;
}

export async function setStatsCache<T>(input: {
  userId: string;
  metric: string;
  params: Record<string, unknown>;
  payload: T;
  maxAgeSeconds?: number;
}) {
  const paramsHash = hashParams(input.params);
  await db
    .insert(statsCache)
    .values({
      userId: input.userId,
      metric: input.metric,
      paramsHash,
      payload: input.payload as object,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [statsCache.userId, statsCache.metric, statsCache.paramsHash],
      set: {
        payload: input.payload as object,
        updatedAt: new Date(),
      },
    });

  // DB 저장 후 in-process 메모리 캐시도 갱신
  const memKey = `${input.userId}:${input.metric}:${paramsHash}`;
  const ttlMs = (input.maxAgeSeconds ?? 60) * 1000;
  statsMemCache.set(memKey, { data: input.payload, expiresAt: Date.now() + ttlMs });
}

export async function invalidateStatsCacheForUser(userId: string, tx?: WorkoutExecutor) {
  const executor = tx ?? db;
  await executor.delete(statsCache).where(eq(statsCache.userId, userId));
  // in-process 메모리 캐시에서 해당 userId 항목 제거
  for (const key of statsMemCache.keys()) {
    if (key.startsWith(`${userId}:`)) statsMemCache.delete(key);
  }
}
