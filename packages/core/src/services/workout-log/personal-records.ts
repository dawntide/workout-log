import { db } from "@workout/core/db/client";
import { and, eq, gte, inArray, lt, ne } from "@workout/core/db/ops";
import { exercise, exerciseAlias, workoutLog, workoutSet } from "@workout/core/db/schema";
import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";

// ─────────────────────────────────────────────────────────────────────────────
// D1(frozen-at-save, lazy 변형) — 로그 상세의 PR 감지가 매 조회마다 사전 이력
// 전체를 스캔(하한·LIMIT 없음)하던 것을 로그별 동결값(workout_log.personal_records)
// 으로 대체한다.
//   · 저장/편집: 값을 계산하지 않는다. 대신 영향권(performed_at >= 변경 시점)의
//     동결값을 null로 무효화만 한다(백데이트 삽입·편집·삭제가 이후 로그의
//     "그 당시 PR" 판정을 바꿀 수 있으므로).
//   · 조회: 동결값이 있으면 그대로(스캔 0), null이면 기존 스캔으로 계산 후
//     best-effort로 동결(lazy self-heal) — 레거시 로그 backfill이 불필요하다.
// 판정 로직 자체는 apps/api 라우트에 있던 detectPersonalRecords를 그대로 이동
// (exerciseId 우선·alias 정규화·맨몸 총부하 e1RM — 통계 서비스와 일관).
// ─────────────────────────────────────────────────────────────────────────────

function epley(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  const r = Number.isFinite(reps) && reps > 0 ? reps : 1;
  return weightKg * (1 + r / 30);
}

export type PersonalRecordPayload = {
  exerciseName: string;
  topWeightKg: number;
  topReps: number;
  estOneRm: number;
  previousBestE1rm: number | null;
  deltaE1rm: number;
};


export type PersonalRecordSetInput = {
  exerciseName: string;
  exerciseId: string | null;
  reps: number | null;
  weightKg: number | null;
  isExtra: boolean | null;
  meta: Record<string, unknown> | null;
};

type MatchKey = string;
const nameKey = (name: string): MatchKey => `name:${name.trim().toLowerCase()}`;
const idKey = (exerciseId: string): MatchKey => `eid:${exerciseId}`;

/**
 * PR 감지 — exerciseId 우선, 없으면 alias 정규화로 canonical exercise.id 매칭.
 * 맨몸 운동은 총부하(체중+추가)로 e1RM 비교 (통계 서비스와 일관).
 * web/src/app/api/logs/[logId]/route.ts 의 detectPersonalRecords 와 동일.
 */
export async function detectPersonalRecords(input: {
  userId: string;
  logId: string;
  sets: PersonalRecordSetInput[];
  performedAt: Date;
}): Promise<PersonalRecordPayload[]> {
  const { userId, logId, sets, performedAt } = input;

  const namesInLog = Array.from(
    new Set(
      sets
        .map((s) => String(s.exerciseName ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const aliasToId = new Map<string, string>();
  if (namesInLog.length > 0) {
    const aliasRows = await db
      .select({ alias: exerciseAlias.alias, exerciseId: exerciseAlias.exerciseId })
      .from(exerciseAlias)
      .where(inArray(exerciseAlias.alias, namesInLog));
    for (const r of aliasRows) {
      aliasToId.set(r.alias.trim().toLowerCase(), r.exerciseId);
    }
    const baseRows = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(inArray(exercise.name, namesInLog));
    for (const r of baseRows) {
      aliasToId.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  function resolveKey(exerciseId: string | null, name: string): MatchKey | null {
    if (exerciseId) return idKey(exerciseId);
    const lower = name.trim().toLowerCase();
    if (!lower) return null;
    const aliased = aliasToId.get(lower);
    if (aliased) return idKey(aliased);
    return nameKey(lower);
  }

  type Best = { weightKg: number; reps: number; e1rm: number; displayName: string };
  const currentTop = new Map<MatchKey, Best>();
  for (const s of sets) {
    if (s.isExtra) continue;
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: s.exerciseName,
        weightKg: s.weightKg,
        meta: s.meta,
      }) ?? 0,
    );
    const r = Number(s.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
    const displayName = String(s.exerciseName ?? "").trim();
    const key = resolveKey(s.exerciseId, displayName);
    if (!key) continue;
    const e = epley(w, r);
    const cur = currentTop.get(key);
    if (!cur || e > cur.e1rm) {
      currentTop.set(key, { weightKg: w, reps: r, e1rm: e, displayName });
    }
  }
  if (currentTop.size === 0) return [];

  const priorRows = await db
    .select({
      exerciseId: workoutSet.exerciseId,
      exerciseName: workoutSet.exerciseName,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      isExtra: workoutSet.isExtra,
      meta: workoutSet.meta,
    })
    .from(workoutSet)
    .innerJoin(workoutLog, eq(workoutLog.id, workoutSet.logId))
    .where(
      and(
        eq(workoutLog.userId, userId),
        ne(workoutLog.id, logId),
        lt(workoutLog.performedAt, performedAt),
      ),
    );

  const priorNames = new Set<string>();
  for (const r of priorRows) {
    if (!r.exerciseId) {
      const n = String(r.exerciseName ?? "").trim().toLowerCase();
      if (n && !aliasToId.has(n)) priorNames.add(n);
    }
  }
  if (priorNames.size > 0) {
    const arr = Array.from(priorNames);
    const aliasRows = await db
      .select({ alias: exerciseAlias.alias, exerciseId: exerciseAlias.exerciseId })
      .from(exerciseAlias)
      .where(inArray(exerciseAlias.alias, arr));
    for (const r of aliasRows) {
      aliasToId.set(r.alias.trim().toLowerCase(), r.exerciseId);
    }
    const baseRows = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(inArray(exercise.name, arr));
    for (const r of baseRows) {
      aliasToId.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  const priorBest = new Map<MatchKey, number>();
  for (const r of priorRows) {
    if (r.isExtra) continue;
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: String(r.exerciseName ?? ""),
        weightKg: r.weightKg,
        meta: r.meta as Record<string, unknown> | null,
      }) ?? 0,
    );
    const reps = Number(r.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(reps) || reps <= 0) continue;
    const key = resolveKey(r.exerciseId, String(r.exerciseName ?? ""));
    if (!key) continue;
    const e = epley(w, reps);
    const cur = priorBest.get(key);
    if (cur == null || e > cur) priorBest.set(key, e);
  }

  const out: PersonalRecordPayload[] = [];
  for (const [key, cur] of currentTop.entries()) {
    const prev = priorBest.get(key) ?? null;
    const isPr = prev == null || cur.e1rm > prev + 0.1;
    if (!isPr) continue;
    out.push({
      exerciseName: cur.displayName,
      topWeightKg: cur.weightKg,
      topReps: cur.reps,
      estOneRm: Number(cur.e1rm.toFixed(2)),
      previousBestE1rm: prev != null ? Number(prev.toFixed(2)) : null,
      deltaE1rm: prev != null ? Number((cur.e1rm - prev).toFixed(2)) : cur.e1rm,
    });
    void key;
  }
  out.sort((a, b) => b.deltaE1rm - a.deltaE1rm);
  return out.slice(0, 3);
}

/**
 * 동결값이 있으면 그대로, 없으면 계산 후 best-effort 동결(lazy freeze).
 * frozen 스키마가 바뀌면 null 무효화로 자연 재계산되므로 버저닝이 불필요하다.
 */
export async function getOrFreezePersonalRecords(input: {
  userId: string;
  logId: string;
  frozen: unknown;
  sets: PersonalRecordSetInput[];
  performedAt: Date;
}): Promise<PersonalRecordPayload[]> {
  if (Array.isArray(input.frozen)) {
    return input.frozen as PersonalRecordPayload[];
  }
  const computed = await detectPersonalRecords(input);
  // 동시 조회가 겹쳐도 같은 값을 쓰므로 조건 없는 UPDATE로 충분. 실패해도 다음
  // 조회가 다시 계산한다(정확성은 계산 경로가 보장).
  try {
    await db
      .update(workoutLog)
      .set({ personalRecords: computed })
      .where(and(eq(workoutLog.id, input.logId), eq(workoutLog.userId, input.userId)));
  } catch {
    // best-effort
  }
  return computed;
}

type DbLike = Pick<typeof db, "update">;

/**
 * 영향권 무효화 — fromPerformedAt 이후(포함)의 동결값을 null로. 저장(생성·편집)과
 * 삭제 경로에서 호출한다. 종목 필터 없이 유저 범위로 넓게 무효화(단순·안전 —
 * 재계산은 조회 시 lazy로 일어난다).
 */
export async function invalidatePersonalRecordsFrom(input: {
  dbi?: DbLike;
  userId: string;
  fromPerformedAt: Date;
}): Promise<void> {
  const dbi = input.dbi ?? db;
  await dbi
    .update(workoutLog)
    .set({ personalRecords: null })
    .where(
      and(
        eq(workoutLog.userId, input.userId),
        gte(workoutLog.performedAt, input.fromPerformedAt),
      ),
    );
}
