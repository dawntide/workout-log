import { and, asc, desc, eq, gte } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { bodyMeasurement } from "@workout/core/db/schema";
import { invalidateStatsCacheForUser } from "./cache";
import {
  bodyweightAsOf,
  normalizeBodyweightPoints,
  type BodyweightPoint,
} from "./bodyweight-timeline";

/**
 * 체중 기록 CRUD와 시점 조회. 순수 계산은 bodyweight-timeline.ts에 있다.
 *
 * 기록은 `kind = 'weight'` 하나만 다룬다 — 컬럼은 확장 여지로 열어 뒀지만 이 서비스는
 * 체중 전용이다(계획서 docs/bodyweight-timeseries-plan.md §3.1).
 */

const WEIGHT_KIND = "weight";

/** 사람이 낼 수 있는 값의 범위. 밖이면 오타로 보고 거부한다. */
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 500;

export type BodyweightEntry = {
  id: string;
  valueKg: number;
  measuredAt: string;
};

export class InvalidBodyweightError extends Error {
  readonly code = "INVALID_BODYWEIGHT";
  constructor(message: string) {
    super(message);
    this.name = "InvalidBodyweightError";
  }
}

function parseValueKg(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new InvalidBodyweightError("valueKg must be a number");
  const rounded = Math.round(value * 100) / 100;
  if (rounded < MIN_WEIGHT_KG || rounded > MAX_WEIGHT_KG) {
    throw new InvalidBodyweightError(`valueKg must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG}`);
  }
  return rounded;
}

function parseMeasuredAt(raw: unknown): Date {
  // 미지정은 "지금" — 배너에서 한 번 탭으로 기록하는 경로가 이걸 쓴다.
  if (raw === undefined || raw === null || raw === "") return new Date();
  const parsed = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(parsed.getTime())) throw new InvalidBodyweightError("measuredAt is not a valid date");
  return parsed;
}

export async function recordBodyweight(input: {
  userId: string;
  valueKg: unknown;
  measuredAt?: unknown;
}): Promise<BodyweightEntry> {
  const valueKg = parseValueKg(input.valueKg);
  const measuredAt = parseMeasuredAt(input.measuredAt);

  // 같은 시각에 다시 적으면 덮어쓴다 — "고쳐 적기"가 별도 수정 UI 없이 성립한다
  // (계획서 §7-4). unique(userId, kind, measuredAt)가 이 upsert의 근거다.
  const [row] = await db
    .insert(bodyMeasurement)
    .values({ userId: input.userId, kind: WEIGHT_KIND, valueKg, measuredAt })
    .onConflictDoUpdate({
      target: [bodyMeasurement.userId, bodyMeasurement.kind, bodyMeasurement.measuredAt],
      set: { valueKg },
    })
    .returning({
      id: bodyMeasurement.id,
      valueKg: bodyMeasurement.valueKg,
      measuredAt: bodyMeasurement.measuredAt,
    });

  // 체중이 바뀌면 체중 대비 지표가 바뀐다. 무효화를 빠뜨리면 "기록했는데 지표가
  // 안 바뀜"이 된다(계획서 §4 G5).
  await invalidateStatsCacheForUser(input.userId);

  return {
    id: row!.id,
    valueKg: Number(row!.valueKg),
    measuredAt: row!.measuredAt.toISOString(),
  };
}

export async function deleteBodyweight(input: { userId: string; id: string }): Promise<boolean> {
  const deleted = await db
    .delete(bodyMeasurement)
    .where(and(eq(bodyMeasurement.userId, input.userId), eq(bodyMeasurement.id, input.id)))
    .returning({ id: bodyMeasurement.id });
  if (deleted.length === 0) return false;
  await invalidateStatsCacheForUser(input.userId);
  return true;
}

export async function fetchBodyweightEntries(input: {
  userId: string;
  since?: Date | null;
  limit?: number;
}): Promise<BodyweightEntry[]> {
  const limit = Math.min(1000, Math.max(1, Math.round(input.limit ?? 365)));
  const rows = await db
    .select({
      id: bodyMeasurement.id,
      valueKg: bodyMeasurement.valueKg,
      measuredAt: bodyMeasurement.measuredAt,
    })
    .from(bodyMeasurement)
    .where(
      and(
        eq(bodyMeasurement.userId, input.userId),
        eq(bodyMeasurement.kind, WEIGHT_KIND),
        input.since ? gte(bodyMeasurement.measuredAt, input.since) : undefined,
      ),
    )
    .orderBy(desc(bodyMeasurement.measuredAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    valueKg: Number(row.valueKg),
    measuredAt: row.measuredAt.toISOString(),
  }));
}

/**
 * 시점 조회용 전체 이력. 소비처가 세션마다 쿼리를 날리지 않도록 한 번에 읽어
 * `bodyweightAsOf`에 반복 사용한다.
 */
export async function loadBodyweightTimeline(userId: string): Promise<BodyweightPoint[]> {
  const rows = await db
    .select({ measuredAt: bodyMeasurement.measuredAt, valueKg: bodyMeasurement.valueKg })
    .from(bodyMeasurement)
    .where(and(eq(bodyMeasurement.userId, userId), eq(bodyMeasurement.kind, WEIGHT_KIND)))
    .orderBy(asc(bodyMeasurement.measuredAt));
  return normalizeBodyweightPoints(rows);
}

/** 이력이 있으면 시점 값, 없으면 null — 호출자가 설정 단일값으로 폴백한다. */
export { bodyweightAsOf };
