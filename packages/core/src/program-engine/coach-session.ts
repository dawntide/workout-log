/**
 * 코치 처방 세션 — 저장·조회.
 *
 * 처방은 새 테이블이 아니라 `generated_session`에 `sessionKey = 날짜`로 들어간다.
 * 그래서 기록 화면·저장 경로가 다른 프로그램과 같은 길을 탄다. 순수 계약은
 * `coach-prescription.ts`, 설계 근거는 `docs/decisions.md`(2026-11-12).
 */

import { and, eq, sql } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { generatedSession, plan as planTable, workoutLog } from "@workout/core/db/schema";
import { resolveExercisesByNames } from "@workout/core/exercise/resolve";

import {
  buildCoachSnapshot,
  buildEmptyCoachSnapshot,
  coachSnapshotMatchesPrescription,
  isCoachDateKey,
  isCoachPlanParams,
  readCoachSessionMeta,
  type CoachPrescription,
  type CoachSessionSnapshot,
} from "./coach-prescription";

type PlanRow = typeof planTable.$inferSelect;
type GeneratedSessionRow = typeof generatedSession.$inferSelect;

function planTimezone(planRow: Pick<PlanRow, "params">, override?: string): string {
  const params = (planRow.params ?? {}) as Record<string, unknown>;
  return (
    (typeof override === "string" && override.trim()) ||
    (typeof params.timezone === "string" && params.timezone.trim()) ||
    process.env.TZ ||
    "UTC"
  );
}

function todayInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function planRef(planRow: PlanRow) {
  return { id: planRow.id, type: planRow.type, name: planRow.name };
}

async function findCoachSessionRow(planId: string, date: string) {
  const rows = await db
    .select()
    .from(generatedSession)
    .where(and(eq(generatedSession.planId, planId), eq(generatedSession.sessionKey, date)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * `buildSession`의 코치 분기. **계산하지 않는다** — 그 날짜에 저장된 처방을 그대로
 * 돌려주고, 없으면 빈 세션을 연다(자유 기록).
 *
 * 일반 MANUAL 경로로 흘려보내면 안 된다: 그 경로는 프로그램 정의에서 스냅샷을 다시
 * 만들어 upsert하므로 코치가 넣은 처방을 빈 스냅샷으로 덮어쓴다.
 */
export async function buildCoachPlanSession(
  input: { plan: PlanRow; userId: string; sessionDate?: string; timezone?: string },
  persist: boolean,
): Promise<GeneratedSessionRow | { snapshot: CoachSessionSnapshot }> {
  const timezone = planTimezone(input.plan, input.timezone);
  const date = isCoachDateKey(input.sessionDate) ? input.sessionDate : todayInTimezone(timezone);

  const existing = await findCoachSessionRow(input.plan.id, date);
  if (existing) {
    return persist ? existing : { snapshot: existing.snapshot as CoachSessionSnapshot };
  }

  const snapshot = buildEmptyCoachSnapshot({ plan: planRef(input.plan), date, timezone });
  if (!persist) return { snapshot };

  // 동시에 처방 PUT이 들어오면 그쪽이 이긴다 — 빈 세션으로 덮어쓰지 않는다.
  await db
    .insert(generatedSession)
    .values({ planId: input.plan.id, userId: input.userId, sessionKey: date, snapshot })
    .onConflictDoNothing({ target: [generatedSession.planId, generatedSession.sessionKey] });
  const saved = await findCoachSessionRow(input.plan.id, date);
  if (!saved) throw new Error("Coach session was not persisted");
  return saved;
}

export type CoachSessionView = {
  id: string;
  planId: string;
  sessionKey: string;
  scheduledAt: Date | null;
  status: GeneratedSessionRow["status"];
  snapshot: unknown;
  updatedAt: Date;
};

function toView(row: GeneratedSessionRow): CoachSessionView {
  return {
    id: row.id,
    planId: row.planId,
    sessionKey: row.sessionKey,
    scheduledAt: row.scheduledAt,
    status: row.status,
    snapshot: row.snapshot,
    updatedAt: row.updatedAt,
  };
}

export type UpsertCoachPrescriptionResult =
  | { status: "plan_not_found" }
  | { status: "not_coach_plan" }
  | { status: "unknown_exercises"; names: string[] }
  /** 이미 수행 기록이 연결됐다. 처방과 수행의 대조가 사후에 바뀌면 안 된다. */
  | { status: "locked" }
  | { status: "ok"; session: CoachSessionView; created: boolean; unchanged: boolean };

/**
 * 한 날짜의 처방을 넣거나 고친다. 하루에 처방 하나.
 *
 * 수행 기록이 연결된 뒤에는 `locked`다. 행을 `FOR UPDATE`로 잡고 기록 유무를 보므로,
 * 기록 저장(FK가 `FOR KEY SHARE`를 건다)과 동시에 들어와도 "기록된 처방이 바뀌는" 틈이
 * 없다.
 */
export async function upsertCoachPrescription(input: {
  userId: string;
  planId: string;
  date: string;
  prescription: CoachPrescription;
  now?: Date;
}): Promise<UpsertCoachPrescriptionResult> {
  const planRows = await db.select().from(planTable).where(eq(planTable.id, input.planId)).limit(1);
  const planRow = planRows[0];
  // 남의 플랜은 "없다"와 구분해 주지 않는다.
  if (!planRow || planRow.userId !== input.userId) return { status: "plan_not_found" };
  if (!isCoachPlanParams(planRow.params)) return { status: "not_coach_plan" };

  const names = input.prescription.exercises.map((exercise) => exercise.exerciseName);
  const resolved = await resolveExercisesByNames(names);
  const unknown = names.filter((name) => !resolved.has(name.toLowerCase()));
  if (unknown.length > 0) return { status: "unknown_exercises", names: unknown };

  const timezone = planTimezone(planRow);
  const plan = planRef(planRow);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    // 행이 없으면 빈 세션으로 먼저 만든다. 그래야 아래에서 잠글 행이 항상 있다.
    await tx
      .insert(generatedSession)
      .values({
        planId: planRow.id,
        userId: input.userId,
        sessionKey: input.date,
        snapshot: buildEmptyCoachSnapshot({ plan, date: input.date, timezone }),
      })
      .onConflictDoNothing({ target: [generatedSession.planId, generatedSession.sessionKey] });

    const [row] = await tx
      .select()
      .from(generatedSession)
      .where(and(eq(generatedSession.planId, planRow.id), eq(generatedSession.sessionKey, input.date)))
      .limit(1)
      .for("update");
    if (!row) throw new Error("Coach session row is missing after insert");

    const logged = await tx
      .select({ id: workoutLog.id })
      .from(workoutLog)
      .where(eq(workoutLog.generatedSessionId, row.id))
      .limit(1);
    if (logged[0]) return { status: "locked" as const };

    const previous = readCoachSessionMeta(row.snapshot);
    const snapshot = buildCoachSnapshot({
      plan,
      date: input.date,
      timezone,
      prescription: input.prescription,
      resolvedExercises: resolved,
      prescribedAt: now.toISOString(),
      revision: (previous?.revision ?? 0) + 1,
    });
    if (coachSnapshotMatchesPrescription(row.snapshot, snapshot)) {
      return { status: "ok" as const, session: toView(row), created: false, unchanged: true };
    }

    const [saved] = await tx
      .update(generatedSession)
      .set({
        snapshot,
        status: "PLANNED",
        scheduledAt: new Date(`${input.date}T00:00:00.000Z`),
        updatedAt: sql`now()`,
      })
      .where(eq(generatedSession.id, row.id))
      .returning();
    return {
      status: "ok" as const,
      session: toView(saved!),
      created: previous === null,
      unchanged: false,
    };
  });
}

export type ReadCoachSessionResult =
  | { status: "plan_not_found" }
  | { status: "not_coach_plan" }
  | { status: "ok"; session: CoachSessionView | null; locked: boolean };

/** 한 날짜의 처방을 읽는다. 처방이 없으면(빈 세션 포함) `session: null`. */
export async function readCoachSession(input: {
  userId: string;
  planId: string;
  date: string;
}): Promise<ReadCoachSessionResult> {
  const planRows = await db
    .select({ userId: planTable.userId, params: planTable.params })
    .from(planTable)
    .where(eq(planTable.id, input.planId))
    .limit(1);
  const planRow = planRows[0];
  if (!planRow || planRow.userId !== input.userId) return { status: "plan_not_found" };
  if (!isCoachPlanParams(planRow.params)) return { status: "not_coach_plan" };

  const row = await findCoachSessionRow(input.planId, input.date);
  if (!row) return { status: "ok", session: null, locked: false };
  const logged = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(eq(workoutLog.generatedSessionId, row.id))
    .limit(1);
  return {
    status: "ok",
    session: readCoachSessionMeta(row.snapshot) ? toView(row) : null,
    locked: Boolean(logged[0]),
  };
}
