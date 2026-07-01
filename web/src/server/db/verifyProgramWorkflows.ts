import "dotenv/config";
import assert from "node:assert/strict";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./client";
import { plan as planTable, planProgressEvent, planRuntimeState, workoutLog, workoutSet } from "./schema";
import { generateAndSaveSession } from "../program-engine/generateSession";
import { upsertWorkoutLogService } from "../services/workout-log/upsert-log";

type PlannedSet = {
  reps?: number;
  targetWeightKg?: number;
  percent?: number;
  note?: string;
  rpe?: number;
};

type PlannedExercise = {
  exerciseName: string;
  sets: PlannedSet[];
};

type GeneratedSessionPayload = {
  id: string;
  planId: string;
  sessionKey: string;
  snapshot: {
    week?: number;
    day?: number;
    exercises?: PlannedExercise[];
  };
};

type VerifiablePlan = {
  name: string;
  date: string;
  checks: (session: GeneratedSessionPayload) => void;
};

function toMapByExercise(session: GeneratedSessionPayload) {
  const rows = Array.isArray(session.snapshot?.exercises) ? session.snapshot.exercises : [];
  return new Map<string, PlannedExercise>(
    rows.map((exercise) => [exercise.exerciseName, exercise]),
  );
}

function assertReps(exercise: PlannedExercise, expected: number[]) {
  assert.deepEqual(
    exercise.sets.map((set) => Number(set.reps ?? 0)),
    expected,
  );
}

function assertSetCount(exercise: PlannedExercise, expected: number) {
  assert.equal(exercise.sets.length, expected);
}

function buildLogSetsFromSession(session: GeneratedSessionPayload) {
  const exercises = Array.isArray(session.snapshot?.exercises) ? session.snapshot.exercises : [];
  const payloadSets: Array<{
    exerciseName: string;
    setNumber: number;
    reps: number;
    weightKg: number;
    rpe: number;
    isExtra: boolean;
    meta: Record<string, unknown>;
  }> = [];

  exercises.forEach((exercise) => {
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    sets.forEach((set, index) => {
      payloadSets.push({
        exerciseName: exercise.exerciseName,
        setNumber: index + 1,
        reps: Number(set.reps ?? 0) || 0,
        weightKg: Number(set.targetWeightKg ?? 0) || 0,
        rpe: Number(set.rpe ?? 0) || 0,
        isExtra: false,
        meta: {
          planned: true,
          plannedRef: {
            exerciseName: exercise.exerciseName,
            setNumber: index + 1,
            reps: set.reps ?? null,
            targetWeightKg: set.targetWeightKg ?? null,
            percent: set.percent ?? null,
            note: set.note ?? null,
            rpe: set.rpe ?? null,
          },
          completed: index % 2 === 0,
        },
      });
    });
  });

  return payloadSets;
}

async function main() {
  const userId = (process.env.WORKOUT_AUTH_USER_ID ?? "dev").trim() || "dev";
  const timezone = "Asia/Seoul";
  const createdLogIds: string[] = [];

  const plans = await db
    .select({
      id: planTable.id,
      name: planTable.name,
      userId: planTable.userId,
    })
    .from(planTable)
    .where(eq(planTable.userId, userId));

  const planMap = new Map(plans.map((plan) => [plan.name, plan]));
  const requirePlan = (name: string) => {
    const item = planMap.get(name);
    assert.ok(item, `required plan missing: ${name}`);
    return item;
  };

  const verifiablePlans: VerifiablePlan[] = [
    {
      name: "Program Tactical Barbell Operator",
      date: "2026-01-05",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const pull = map.get("Pull-Up");
        assert.ok(squat && bench && pull, "Operator D1 base exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(bench, 3);
        assertSetCount(pull, 3);
        assertReps(squat, [5, 5, 5]);
        assert.deepEqual(
          squat.sets.map((set) => Number(Number(set.percent ?? 0).toFixed(2))),
          [0.7, 0.7, 0.7],
        );
        assert.equal(
          String(squat.sets[0]?.note ?? "").includes("Operator W1"),
          true,
          "Operator W1 note missing",
        );
      },
    },
    {
      name: "Program Tactical Barbell Operator",
      date: "2026-01-07",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && bench && deadlift, "Operator D3 base exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(bench, 3);
        assertSetCount(deadlift, 3);
        assertReps(deadlift, [5, 5, 5]);
      },
    },
    {
      name: "Program Starting Strength LP",
      date: "2026-01-05",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && bench && deadlift, "Starting Strength A day base exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(bench, 3);
        assertSetCount(deadlift, 1);
        assertReps(squat, [5, 5, 5]);
      },
    },
    {
      name: "Program StrongLifts 5x5",
      date: "2026-01-06",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const press = map.get("Overhead Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && press && deadlift, "StrongLifts B day base exercises missing");
        assertSetCount(squat, 5);
        assertSetCount(press, 5);
        assertSetCount(deadlift, 1);
      },
    },
    {
      name: "Program Texas Method",
      date: "2026-01-07",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const bench = map.get("Bench Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && bench && deadlift, "Texas Method intensity day exercises missing");
        assertSetCount(squat, 1);
        assert.equal(
          String(squat.sets[0]?.note ?? "").toLowerCase().includes("intensity"),
          true,
          "Texas Method intensity note missing",
        );
      },
    },
    {
      name: "Program GZCLP",
      date: "2026-01-08",
      checks: (session) => {
        const map = toMapByExercise(session);
        const deadlift = map.get("Deadlift");
        const press = map.get("Overhead Press");
        const legPress = map.get("Leg Press");
        assert.ok(deadlift && press && legPress, "GZCLP D4 exercises missing");
        assertSetCount(deadlift, 5);
        assertSetCount(press, 3);
        assertSetCount(legPress, 3);
        assert.equal(
          String(legPress.sets[2]?.note ?? "").toUpperCase().includes("AMRAP"),
          true,
          "GZCLP T3 AMRAP note missing",
        );
      },
    },
    {
      name: "Program Greyskull LP",
      date: "2026-01-06",
      checks: (session) => {
        const map = toMapByExercise(session);
        const squat = map.get("Back Squat");
        const press = map.get("Overhead Press");
        const deadlift = map.get("Deadlift");
        assert.ok(squat && press && deadlift, "Greyskull LP B day exercises missing");
        assertSetCount(squat, 3);
        assertSetCount(press, 3);
        assertSetCount(deadlift, 1);
        assertReps(squat, [5, 5, 5]);
        assert.equal(
          String(squat.sets[2]?.note ?? "").toUpperCase().includes("AMRAP"),
          true,
          "Greyskull LP AMRAP note missing",
        );
      },
    },
  ];

  for (const target of verifiablePlans) {
    const p = requirePlan(target.name);
    const generated = (await generateAndSaveSession({
      userId,
      planId: p.id,
      sessionDate: target.date,
      timezone,
    })) as GeneratedSessionPayload;

    assert.equal(generated.planId, p.id, `${target.name}: generated planId mismatch`);
    assert.equal(
      Array.isArray(generated.snapshot?.exercises) && generated.snapshot.exercises.length > 0,
      true,
      `${target.name}: no generated exercises`,
    );
    target.checks(generated);
    console.log(`[verify] session ok: ${target.name} @ ${target.date}`);
  }

  const updateTargetPlan = requirePlan("Program Greyskull LP");
  const updateTargetSession = (await generateAndSaveSession({
    userId,
    planId: updateTargetPlan.id,
    sessionDate: "2026-01-07",
    timezone,
  })) as GeneratedSessionPayload;

  const payloadSets = buildLogSetsFromSession(updateTargetSession);
  assert.equal(payloadSets.length > 0, true, "log payload requires at least one set");

  const perfAt = new Date();
  const created = await upsertWorkoutLogService({
    userId,
    locale: "ko",
    timezone,
    performedAt: perfAt,
    notes: "program verify create",
    planId: updateTargetPlan.id,
    generatedSessionId: updateTargetSession.id,
    sets: payloadSets,
  });
  const createdLogId = created.log.id;
  createdLogIds.push(createdLogId);

  const beforeSetRows = await db
    .select({ reps: workoutSet.reps, weightKg: workoutSet.weightKg })
    .from(workoutSet)
    .where(eq(workoutSet.logId, createdLogId));
  assert.equal(beforeSetRows.length, payloadSets.length, "created set count mismatch");

  const beforeEventRows = await db
    .select({
      id: planProgressEvent.id,
      eventType: planProgressEvent.eventType,
      afterState: planProgressEvent.afterState,
    })
    .from(planProgressEvent)
    .where(
      and(
        eq(planProgressEvent.planId, updateTargetPlan.id),
        eq(planProgressEvent.logId, createdLogId),
      ),
    )
    .limit(1);
  assert.ok(beforeEventRows[0], "progress event missing before patch");
  const beforeEvent = beforeEventRows[0];

  const updatedSets = payloadSets.map((set) =>
    ({
      ...set,
      reps: 0,
      meta: {
        ...(set.meta ?? {}),
        editedBy: "verifyProgramWorkflows",
      },
    }),
  );

  await upsertWorkoutLogService({
    logId: createdLogId,
    userId,
    locale: "ko",
    timezone,
    performedAt: perfAt,
    notes: "program verify updated",
    planId: updateTargetPlan.id,
    generatedSessionId: updateTargetSession.id,
    sets: updatedSets,
  });

  const afterLogRows = await db
    .select({ notes: workoutLog.notes })
    .from(workoutLog)
    .where(eq(workoutLog.id, createdLogId))
    .limit(1);
  const afterSetRows = await db
    .select({ reps: workoutSet.reps, weightKg: workoutSet.weightKg, meta: workoutSet.meta })
    .from(workoutSet)
    .where(eq(workoutSet.logId, createdLogId))
    .orderBy(asc(workoutSet.sortOrder));
  assert.equal(afterSetRows.length, updatedSets.length, "updated set count mismatch");
  assert.equal(Number(afterSetRows[0]?.reps ?? 0), Number(updatedSets[0]?.reps ?? 0), "updated reps mismatch");
  assert.equal(Number(afterSetRows[0]?.weightKg ?? 0), Number(updatedSets[0]?.weightKg ?? 0), "updated weight mismatch");
  assert.equal(afterLogRows[0]?.notes, "program verify updated", "updated note mismatch");
  assert.equal(
    (afterSetRows[0]?.meta as Record<string, unknown> | null)?.editedBy,
    "verifyProgramWorkflows",
    "updated meta mismatch",
  );

  const runtimeRows = await db
    .select({
      id: planRuntimeState.id,
      userId: planRuntimeState.userId,
      state: planRuntimeState.state,
    })
    .from(planRuntimeState)
    .where(eq(planRuntimeState.planId, updateTargetPlan.id))
    .limit(1);
  assert.ok(runtimeRows[0], "runtime state missing after log save");
  assert.equal(runtimeRows[0]?.userId, userId, "runtime state user mismatch");

  const progressEventRows = await db
    .select({
      id: planProgressEvent.id,
      eventType: planProgressEvent.eventType,
      afterState: planProgressEvent.afterState,
    })
    .from(planProgressEvent)
    .where(
      and(
        eq(planProgressEvent.planId, updateTargetPlan.id),
        eq(planProgressEvent.logId, createdLogId),
      ),
    )
    .limit(1);
  assert.ok(progressEventRows[0], "progress event missing after log save");
  assert.notEqual(
    JSON.stringify(progressEventRows[0]?.afterState ?? {}),
    JSON.stringify(beforeEvent?.afterState ?? {}),
    "progress event after_state should be replayed on patch",
  );

  console.log(`[verify] log create/reload/update ok: ${createdLogId}`);

  for (const logId of createdLogIds) {
    await db.delete(workoutLog).where(eq(workoutLog.id, logId));
  }
  console.log("[verify] cleanup ok");
}

main().catch((error) => {
  console.error("[verify] failed", error);
  process.exit(1);
});
