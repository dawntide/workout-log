import "./load-env";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import {
  appUser,
  generatedSession,
  plan as planTable,
  programTemplate,
  programVersion,
  workoutLog,
} from "@workout/core/db/schema";
import {
  COACH_IDENTIFIERS,
  validateCoachPrescription,
  type CoachPrescription,
} from "@workout/core/program-engine/coach-prescription";
import {
  readCoachSession,
  upsertCoachPrescription,
} from "@workout/core/program-engine/coach-session";
import {
  generateAndSaveSession,
  generateSessionSnapshot,
} from "@workout/core/program-engine/generateSession";

/**
 * 코치 처방 세션의 불변식을 실제 Postgres에서 확인한다.
 *
 * 1. 세션 열기(generate)가 코치의 처방을 **덮어쓰지 않는다.** 코치 플랜이 일반 MANUAL 경로로
 *    떨어지면 프로그램 정의(세션 없음)에서 만든 빈 스냅샷이 처방을 지운다.
 * 2. **수행 기록이 연결된 처방은 바뀌지 않는다**(`locked`).
 * 3. 코치 플랜이 아닌 플랜·남의 플랜·카탈로그에 없는 종목은 거부된다.
 * 4. 같은 처방을 다시 보내면 개정 번호가 오르지 않는다.
 *
 * 왜 유닛이 아니라 여기인가: 잠금(`FOR UPDATE`)·upsert·종목 조회가 전부 SQL이다.
 * 시드된 템플릿(`coach-prescribed`)과 카탈로그가 필요하므로 `db:seed` 뒤에 돌린다.
 */

const DATE = "2026-03-02";
const OTHER_DATE = "2026-03-03";

function prescription(weightKg: number, rationale = "검증용 처방"): CoachPrescription {
  const validated = validateCoachPrescription({
    rationale,
    exercises: [
      {
        exerciseName: "Bench Press",
        sets: [
          { reps: 3, targetWeightKg: weightKg, rpe: 8 },
          { reps: 5, targetWeightKg: weightKg - 10 },
        ],
      },
      { exerciseName: "Deadlift", role: "ASSIST", sets: [{ reps: 4, targetWeightKg: 100 }] },
    ],
  });
  assert.ok(validated.ok, "fixture prescription must validate");
  return validated.value;
}

type Snapshot = {
  sessionKey?: string;
  sessionType?: string;
  exercises?: Array<{
    exerciseId?: string | null;
    exerciseName?: string;
    sets?: Array<{ targetWeightKg?: number; reps?: number }>;
  }>;
  coach?: { rationale?: string; revision?: number } | null;
};

async function main() {
  const marker = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const strangerId = randomUUID();
  const planIds: string[] = [];

  try {
    await db.insert(appUser).values([
      {
        id: userId,
        email: `coach-sessions-${marker}@example.invalid`,
        passwordHash: "ci-integration-test-only",
        displayName: `Coach sessions ${marker}`,
      },
      {
        id: strangerId,
        email: `coach-sessions-stranger-${marker}@example.invalid`,
        passwordHash: "ci-integration-test-only",
        displayName: `Coach sessions stranger ${marker}`,
      },
    ]);

    const versionRows = await db
      .select({ id: programVersion.id })
      .from(programVersion)
      .innerJoin(programTemplate, eq(programTemplate.id, programVersion.templateId))
      .where(eq(programTemplate.slug, COACH_IDENTIFIERS.slug))
      .limit(1);
    const coachVersion = versionRows[0];
    assert.ok(coachVersion, "the coach-prescribed template is not seeded — run db:seed first");

    const [coachPlan] = await db
      .insert(planTable)
      .values({
        userId,
        type: "MANUAL",
        name: `Coach ${marker}`,
        rootProgramVersionId: coachVersion.id,
        params: {
          timezone: "UTC",
          autoProgression: false,
          programFamily: COACH_IDENTIFIERS.family,
          sessionKeyMode: "DATE",
        },
      })
      .returning();
    const [plainPlan] = await db
      .insert(planTable)
      .values({
        userId,
        type: "MANUAL",
        name: `Plain ${marker}`,
        rootProgramVersionId: coachVersion.id,
        params: { schedule: ["A"] },
      })
      .returning();
    assert.ok(coachPlan && plainPlan);
    planIds.push(coachPlan.id, plainPlan.id);

    const generate = () =>
      generateAndSaveSession({ userId, planId: coachPlan.id, sessionDate: DATE, timezone: "UTC" });

    // ── 처방이 없는 날: 읽기 전용 미리보기는 쓰지 않고, 열면 빈 세션이 생긴다 ──
    const preview = (await generateSessionSnapshot({
      userId,
      planId: coachPlan.id,
      sessionDate: DATE,
      timezone: "UTC",
    })) as Snapshot;
    assert.deepEqual(preview.exercises, [], "a date without a prescription must preview empty");
    assert.equal(preview.coach, null);
    const afterPreview = await db
      .select({ id: generatedSession.id })
      .from(generatedSession)
      .where(eq(generatedSession.planId, coachPlan.id));
    assert.equal(afterPreview.length, 0, "the read-only preview wrote a generated_session row");

    const emptySession = await generate();
    assert.equal(emptySession.sessionKey, DATE, "coach session key must be the date");
    assert.deepEqual((emptySession.snapshot as Snapshot).exercises, []);
    assert.deepEqual(
      await readCoachSession({ userId, planId: coachPlan.id, date: DATE }),
      { status: "ok", session: null, locked: false },
      "an empty placeholder session must not read as a prescription",
    );

    // ── 처방 넣기 ───────────────────────────────────────────────────────────
    const first = await upsertCoachPrescription({
      userId,
      planId: coachPlan.id,
      date: DATE,
      prescription: prescription(90),
    });
    assert.equal(first.status, "ok");
    assert.ok(first.status === "ok");
    assert.equal(first.created, true, "the first prescription for a date must report created");
    assert.equal(first.session.id, emptySession.id, "the prescription must reuse the opened row");
    const firstSnapshot = first.session.snapshot as Snapshot;
    assert.equal(firstSnapshot.coach?.revision, 1);
    assert.equal(firstSnapshot.sessionType, "COACH");
    assert.ok(
      firstSnapshot.exercises?.every((exercise) => typeof exercise.exerciseId === "string"),
      "prescribed exercises must be resolved to catalog ids",
    );
    assert.deepEqual(
      firstSnapshot.exercises?.[0]?.sets?.map((set) => set.targetWeightKg),
      [90, 80],
      "the server must store the prescribed loads untouched",
    );

    // ── 본론 1: 세션을 열어도 처방이 그대로다 ────────────────────────────────
    const opened = await generate();
    assert.equal(opened.id, first.session.id);
    assert.equal(
      JSON.stringify(opened.snapshot),
      JSON.stringify(first.session.snapshot),
      "opening the session overwrote the coach's prescription",
    );

    // ── 같은 처방 재전송은 개정이 아니다 / 다른 처방은 개정이다 ───────────────
    const retry = await upsertCoachPrescription({
      userId,
      planId: coachPlan.id,
      date: DATE,
      prescription: prescription(90),
    });
    assert.ok(retry.status === "ok");
    assert.equal(retry.unchanged, true, "an identical PUT must be a no-op");
    assert.equal((retry.session.snapshot as Snapshot).coach?.revision, 1);

    const revised = await upsertCoachPrescription({
      userId,
      planId: coachPlan.id,
      date: DATE,
      prescription: prescription(92.5, "지난 세션이 가벼웠다"),
    });
    assert.ok(revised.status === "ok");
    assert.equal(revised.created, false);
    assert.equal(revised.unchanged, false);
    assert.equal((revised.session.snapshot as Snapshot).coach?.revision, 2);

    // 열지 않은 날짜에 바로 넣어도 된다.
    const direct = await upsertCoachPrescription({
      userId,
      planId: coachPlan.id,
      date: OTHER_DATE,
      prescription: prescription(60),
    });
    assert.ok(direct.status === "ok");
    assert.equal(direct.created, true);

    // ── 거부되는 것들 ───────────────────────────────────────────────────────
    const unknownExercise = validateCoachPrescription({
      rationale: "x",
      exercises: [{ exerciseName: `No Such Lift ${marker}`, sets: [{ reps: 5, targetWeightKg: 50 }] }],
    });
    assert.ok(unknownExercise.ok);
    assert.deepEqual(
      await upsertCoachPrescription({
        userId,
        planId: coachPlan.id,
        date: DATE,
        prescription: unknownExercise.value,
      }),
      { status: "unknown_exercises", names: [`No Such Lift ${marker}`] },
    );
    assert.deepEqual(
      await upsertCoachPrescription({
        userId,
        planId: plainPlan.id,
        date: DATE,
        prescription: prescription(90),
      }),
      { status: "not_coach_plan" },
      "a non-coach plan accepted a prescription",
    );
    assert.deepEqual(
      await upsertCoachPrescription({
        userId: strangerId,
        planId: coachPlan.id,
        date: DATE,
        prescription: prescription(90),
      }),
      { status: "plan_not_found" },
      "another user's plan accepted a prescription",
    );
    assert.deepEqual(await readCoachSession({ userId: strangerId, planId: coachPlan.id, date: DATE }), {
      status: "plan_not_found",
    });
    const plainRows = await db
      .select({ id: generatedSession.id })
      .from(generatedSession)
      .where(eq(generatedSession.planId, plainPlan.id));
    assert.equal(plainRows.length, 0, "a rejected prescription still wrote a row");

    // ── 본론 2: 수행 기록이 붙으면 처방은 잠긴다 ─────────────────────────────
    await db.insert(workoutLog).values({
      userId,
      planId: coachPlan.id,
      generatedSessionId: revised.session.id,
      performedAt: new Date(`${DATE}T09:00:00.000Z`),
    });
    const beforeLocked = JSON.stringify(revised.session.snapshot);
    assert.deepEqual(
      await upsertCoachPrescription({
        userId,
        planId: coachPlan.id,
        date: DATE,
        prescription: prescription(100, "수행 뒤에 바꾸려는 시도"),
      }),
      { status: "locked" },
      "a performed prescription was accepted for change",
    );
    const [afterLocked] = await db
      .select({ snapshot: generatedSession.snapshot })
      .from(generatedSession)
      .where(
        and(eq(generatedSession.planId, coachPlan.id), eq(generatedSession.sessionKey, DATE)),
      );
    assert.equal(
      JSON.stringify(afterLocked?.snapshot),
      beforeLocked,
      "a performed prescription changed after the fact",
    );
    const lockedRead = await readCoachSession({ userId, planId: coachPlan.id, date: DATE });
    assert.ok(lockedRead.status === "ok");
    assert.equal(lockedRead.locked, true);
    assert.equal((lockedRead.session?.snapshot as Snapshot).coach?.revision, 2);

    // 잠기지 않은 다른 날짜는 여전히 고칠 수 있다(대조군).
    const otherRevised = await upsertCoachPrescription({
      userId,
      planId: coachPlan.id,
      date: OTHER_DATE,
      prescription: prescription(62.5),
    });
    assert.ok(otherRevised.status === "ok");
    assert.equal(otherRevised.unchanged, false);

    console.log("[verify] coach sessions ok");
  } finally {
    if (planIds.length > 0) {
      await db.delete(workoutLog).where(inArray(workoutLog.planId, planIds));
      await db.delete(generatedSession).where(inArray(generatedSession.planId, planIds));
      await db.delete(planTable).where(inArray(planTable.id, planIds));
    }
    await db.delete(appUser).where(inArray(appUser.id, [userId, strangerId]));
  }
}

main()
  .catch((error) => {
    console.error("[verify] coach sessions failed", error);
    process.exitCode = 1;
  })
  .then(async () => {
    if (!global.__dbPool) return;
    await global.__dbPool.end();
  })
  .catch((error) => {
    console.error("[verify] coach sessions pool shutdown failed", error);
    process.exitCode = 1;
  });
