import assert from "node:assert/strict";
import test from "node:test";
import {
  addUserExercise,
  createWorkoutRecordDraft,
  createWorkoutRecordDraftFromLog,
  type ExistingWorkoutLogLike,
  type GeneratedSessionLike,
  hasWorkoutEdits,
  migrateWorkoutRecordDraft,
  patchSeedExercise,
  toWorkoutLogPayload,
  updateUserExercise,
  type WorkoutRecordDraft,
} from "./model";
import {
  patchSetWeightAtIndex,
  appendSetWeight,
  removeSetWeightAtIndex,
} from "@/features/workout-log/model/exercise-entry";

test("createWorkoutRecordDraft labels operator logic sessions as D1/D2/D3", () => {
  const session: GeneratedSessionLike = {
    id: "session-operator-1",
    planId: "plan-operator",
    sessionKey: "2026-03-09@C1W1D1",
    snapshot: {
      sessionKey: "2026-03-09@C1W1D1",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      program: {
        slug: "operator",
        name: "Tactical Barbell Operator (Base)",
      },
      exercises: [],
    },
  };

  const draft = createWorkoutRecordDraft(session, "Program Tactical Barbell Operator", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });

  assert.equal(draft.session.sessionType, "D1");
});

test("createWorkoutRecordDraft detects operator from single-plan block snapshot", () => {
  const session: GeneratedSessionLike = {
    id: "session-operator-block-1",
    planId: "plan-operator-block",
    sessionKey: "2026-03-09@C1W1D1",
    snapshot: {
      sessionKey: "2026-03-09@C1W1D1",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      blocks: [
        {
          program: {
            slug: "operator",
            name: "Tactical Barbell Operator (Base)",
          },
          definition: {
            kind: "operator",
          },
        },
      ],
      exercises: [],
    },
  };

  const draft = createWorkoutRecordDraft(session, "Program Tactical Barbell Operator", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });

  assert.equal(draft.session.sessionType, "D1");
});

test("createWorkoutRecordDraftFromLog preserves operator manual session key", () => {
  const log: ExistingWorkoutLogLike = {
    id: "log-operator-1",
    planId: "plan-operator-manual",
    generatedSessionId: "session-operator-manual-1",
    performedAt: "2026-03-11T09:00:00.000Z",
    notes: null,
    sets: [],
    generatedSession: {
      id: "session-operator-manual-1",
      planId: "plan-operator-manual",
      sessionKey: "2026-03-11",
      updatedAt: "2026-03-11T09:00:00.000Z",
      snapshot: {
        sessionKey: "2026-03-11",
        sessionDate: "2026-03-11",
        week: 1,
        day: 3,
        manualSessionKey: "D3",
        program: {
          slug: "operator-custom",
          name: "My Operator",
        },
        exercises: [],
      },
    },
  };

  const draft = createWorkoutRecordDraftFromLog(log, "My Operator", {
    timezone: "Asia/Seoul",
  });

  assert.equal(draft.session.sessionType, "D3");
});

test("createWorkoutRecordDraft uses plan schedule labels for A/B programs", () => {
  const session: GeneratedSessionLike = {
    id: "session-ab-1",
    planId: "plan-ab",
    sessionKey: "2026-03-10",
    snapshot: {
      sessionKey: "2026-03-10",
      sessionDate: "2026-03-10",
      week: 1,
      day: 2,
      exercises: [],
    },
  };

  const draft = createWorkoutRecordDraft(session, "Starting Strength LP", {
    sessionDate: "2026-03-10",
    timezone: "Asia/Seoul",
    planSchedule: ["A", "B"],
  });

  assert.equal(draft.session.sessionType, "B");
});

test("createWorkoutRecordDraft uses custom schedule labels for three-day programs", () => {
  const session: GeneratedSessionLike = {
    id: "session-texas-1",
    planId: "plan-texas",
    sessionKey: "2026-03-12",
    snapshot: {
      sessionKey: "2026-03-12",
      sessionDate: "2026-03-12",
      week: 1,
      day: 3,
      exercises: [],
    },
  };

  const draft = createWorkoutRecordDraft(session, "Texas Method", {
    sessionDate: "2026-03-12",
    timezone: "Asia/Seoul",
    planSchedule: ["V", "R", "I"],
  });

  assert.equal(draft.session.sessionType, "I");
});

test("createWorkoutRecordDraft uses custom schedule labels for four-day programs", () => {
  const session: GeneratedSessionLike = {
    id: "session-gzclp-1",
    planId: "plan-gzclp",
    sessionKey: "2026-03-13",
    snapshot: {
      sessionKey: "2026-03-13",
      sessionDate: "2026-03-13",
      week: 1,
      day: 4,
      exercises: [],
    },
  };

  const draft = createWorkoutRecordDraft(session, "GZCLP", {
    sessionDate: "2026-03-13",
    timezone: "Asia/Seoul",
    planSchedule: ["D1", "D2", "D3", "D4"],
  });

  assert.equal(draft.session.sessionType, "D4");
});

test("hasWorkoutEdits treats session memo as a user edit", () => {
  const session: GeneratedSessionLike = {
    id: "session-memo-1",
    planId: "plan-memo",
    sessionKey: "2026-03-14",
    snapshot: {
      sessionKey: "2026-03-14",
      sessionDate: "2026-03-14",
      week: 1,
      day: 1,
      exercises: [],
    },
  };

  const draft = createWorkoutRecordDraft(session, "Memo Plan", {
    sessionDate: "2026-03-14",
    timezone: "Asia/Seoul",
  });

  draft.session.note.memo = "session memo";

  assert.equal(hasWorkoutEdits(draft), true);
});

test("toWorkoutLogPayload maps per-set RPE values", () => {
  const session: GeneratedSessionLike = {
    id: "session-rpe-1",
    planId: "plan-rpe",
    sessionKey: "2026-03-15",
    snapshot: {
      sessionKey: "2026-03-15",
      sessionDate: "2026-03-15",
      week: 1,
      day: 1,
      exercises: [],
    },
  };

  const draft = addUserExercise(
    createWorkoutRecordDraft(session, "RPE Plan", {
      sessionDate: "2026-03-15",
      timezone: "Asia/Seoul",
    }),
    {
      exerciseId: "exercise-bench",
      exerciseName: "Bench Press",
      weightKg: 100,
      repsPerSet: [5, 4],
      memo: "",
    },
  );

  const userExerciseId = draft.userExercises[0]!.id;
  const edited = updateUserExercise(draft, userExerciseId, {
    set: { rpePerSet: [8, 8.5] },
  });
  const payload = toWorkoutLogPayload(edited);

  assert.deepEqual(
    payload.sets.map((set) => set.rpe),
    [8, 8.5],
  );
});

test("createWorkoutRecordDraft preserves prescribed rpe in plannedSetMeta.rpePerSet", () => {
  const session: GeneratedSessionLike = {
    id: "session-rpe-asymptote",
    planId: "plan-asymptote",
    sessionKey: "2026-03-29",
    snapshot: {
      sessionKey: "2026-03-29",
      sessionDate: "2026-03-29",
      week: 2,
      day: 1,
      exercises: [
        {
          exerciseName: "Squat",
          role: "MAIN",
          rowType: "AUTO",
          sets: [
            { reps: 5, percent: 0.7, targetWeightKg: 100, rpe: 7 },
            { reps: 5, percent: 0.7, targetWeightKg: 100, rpe: 7 },
            { reps: 5, percent: 0.7, targetWeightKg: 100, rpe: 7 },
          ],
        },
      ],
    },
  };

  const draft = createWorkoutRecordDraft(session, "RPE Plan", {
    sessionDate: "2026-03-29",
    timezone: "Asia/Seoul",
  });

  const squat = draft.seedExercises.find((e) => e.exerciseName === "Squat");
  assert.ok(squat, "seed exercise present");
  assert.deepEqual(
    squat!.plannedSetMeta?.rpePerSet,
    [7, 7, 7],
    "rpePerSet hydrated from snapshot",
  );
});

test("toWorkoutLogPayload stamps meta.amrap from prescribed amrapPerSet", () => {
  const session: GeneratedSessionLike = {
    id: "session-amrap-1",
    planId: "plan-amrap",
    sessionKey: "2026-03-22",
    snapshot: {
      sessionKey: "2026-03-22",
      sessionDate: "2026-03-22",
      week: 3,
      day: 1,
      exercises: [
        {
          exerciseName: "Squat",
          role: "MAIN",
          rowType: "AUTO",
          sets: [
            { reps: 5, percent: 0.65, targetWeightKg: 100 },
            { reps: 5, percent: 0.75, targetWeightKg: 110 },
            { reps: 5, percent: 0.85, targetWeightKg: 120, amrap: true, note: "5+" },
          ],
        },
      ],
    },
  };

  const draft = createWorkoutRecordDraft(session, "AMRAP Plan", {
    sessionDate: "2026-03-22",
    timezone: "Asia/Seoul",
  });

  const payload = toWorkoutLogPayload(draft);
  const squatSets = payload.sets.filter((s) => s.exerciseName === "Squat");
  assert.equal(squatSets.length, 3, "all three sets emitted");
  assert.equal(
    (squatSets[0].meta as { amrap?: boolean }).amrap,
    undefined,
    "non-AMRAP set has no amrap key",
  );
  assert.equal(
    (squatSets[2].meta as { amrap?: boolean }).amrap,
    true,
    "AMRAP last set is flagged in meta",
  );
  // AUTO 램핑 운동은 세트별 처방 무게를 그대로 보존해야 한다(이전엔 모든 세트가 100으로 동일).
  assert.deepEqual(
    squatSets.map((s) => s.weightKg),
    [100, 110, 120],
    "ramping AUTO sets keep distinct per-set weights",
  );
});

function makeRampSquatDraft(): WorkoutRecordDraft {
  const session: GeneratedSessionLike = {
    id: "session-ramp",
    planId: "plan-ramp",
    sessionKey: "2026-04-05",
    snapshot: {
      sessionKey: "2026-04-05",
      sessionDate: "2026-04-05",
      week: 1,
      day: 1,
      exercises: [
        {
          exerciseName: "Squat",
          role: "MAIN",
          rowType: "AUTO",
          sets: [
            { reps: 5, percent: 0.65, targetWeightKg: 100 },
            { reps: 5, percent: 0.75, targetWeightKg: 110 },
            { reps: 5, percent: 0.85, targetWeightKg: 120 },
          ],
        },
      ],
    },
  };
  return createWorkoutRecordDraft(session, "Ramp Plan", {
    sessionDate: "2026-04-05",
    timezone: "Asia/Seoul",
  });
}

test("toSeedExercise seeds AUTO per-set weights from program targets", () => {
  const draft = makeRampSquatDraft();
  const squat = draft.seedExercises.find((e) => e.exerciseName === "Squat");
  assert.ok(squat, "seed exercise present");
  assert.deepEqual(squat!.set.weightKgPerSet, [100, 110, 120]);
  assert.equal(squat!.set.weightKg, 100, "derived weightKg mirrors first set");
});

test("editing one set weight does not change other sets", () => {
  const draft = makeRampSquatDraft();
  const squat = draft.seedExercises.find((e) => e.exerciseName === "Squat")!;
  // 두 번째 세트만 105로 변경
  const nextWeightKgPerSet = patchSetWeightAtIndex(
    squat.set.weightKgPerSet,
    squat.set.repsPerSet.length,
    1,
    105,
  );
  const edited = patchSeedExercise(draft, squat.id, {
    set: { weightKgPerSet: nextWeightKgPerSet },
  });
  const payload = toWorkoutLogPayload(edited);
  const squatSets = payload.sets.filter((s) => s.exerciseName === "Squat");
  assert.deepEqual(
    squatSets.map((s) => s.weightKg),
    [100, 105, 120],
    "only the edited set changed",
  );
});

test("addUserExercise seeds uniform per-set weight", () => {
  const session: GeneratedSessionLike = {
    id: "session-add",
    planId: "plan-add",
    sessionKey: "2026-04-06",
    snapshot: { sessionKey: "2026-04-06", sessionDate: "2026-04-06", week: 1, day: 1, exercises: [] },
  };
  const draft = addUserExercise(
    createWorkoutRecordDraft(session, "Add Plan", {
      sessionDate: "2026-04-06",
      timezone: "Asia/Seoul",
    }),
    { exerciseId: "ex-curl", exerciseName: "Curl", weightKg: 40, repsPerSet: [10, 10, 10], memo: "" },
  );
  const user = draft.userExercises[0]!;
  assert.deepEqual(user.set.weightKgPerSet, [40, 40, 40]);
  const payload = toWorkoutLogPayload(draft);
  assert.deepEqual(
    payload.sets.map((s) => s.weightKg),
    [40, 40, 40],
  );
});

test("ADD_SET inherits last set weight, REMOVE_SET keeps remaining, length stays synced", () => {
  const base = [100, 110, 120];
  const appended = appendSetWeight(base, base.length);
  assert.deepEqual(appended, [100, 110, 120, 120], "new set inherits last weight");
  const removed = removeSetWeightAtIndex(appended, appended.length, 1);
  assert.deepEqual(removed, [100, 120, 120]);
});

test("migrateWorkoutRecordDraft derives per-set weights from legacy single weightKg", () => {
  const draft = makeRampSquatDraft();
  const squat = draft.seedExercises.find((e) => e.exerciseName === "Squat")!;
  // 구버전 draft 모사: weightKgPerSet 제거하고 단일 weightKg만 남긴다.
  const legacySet = { ...squat.set, weightKg: 90 } as Record<string, unknown>;
  delete legacySet.weightKgPerSet;
  const legacyDraft: WorkoutRecordDraft = {
    ...draft,
    seedExercises: [{ ...squat, set: legacySet as never }],
  };
  const migrated = migrateWorkoutRecordDraft(legacyDraft);
  const migratedSquat = migrated.seedExercises[0]!;
  assert.deepEqual(
    migratedSquat.set.weightKgPerSet,
    [90, 90, 90],
    "legacy weightKg fanned out to per-set array of reps length",
  );
  assert.equal(migratedSquat.set.weightKg, 90);
});

test("toWorkoutLogPayload attaches per-set totalLoadKg for bodyweight exercises", () => {
  const session: GeneratedSessionLike = {
    id: "session-bw",
    planId: "plan-bw",
    sessionKey: "2026-04-07",
    snapshot: { sessionKey: "2026-04-07", sessionDate: "2026-04-07", week: 1, day: 1, exercises: [] },
  };
  let draft = addUserExercise(
    createWorkoutRecordDraft(session, "BW Plan", {
      sessionDate: "2026-04-07",
      timezone: "Asia/Seoul",
    }),
    { exerciseId: "ex-pullup", exerciseName: "Pull Up", weightKg: 0, repsPerSet: [8, 8], memo: "" },
  );
  const userId = draft.userExercises[0]!.id;
  // 세트별로 다른 추가 중량을 준다.
  draft = updateUserExercise(draft, userId, { set: { weightKgPerSet: [0, 10] } });
  const payload = toWorkoutLogPayload(draft, {
    bodyweightKg: 70,
    isBodyweightExercise: (name) => name === "Pull Up",
  });
  const sets = payload.sets.filter((s) => s.exerciseName === "Pull Up");
  assert.deepEqual(sets.map((s) => s.weightKg), [0, 10]);
  assert.equal((sets[0].meta as { totalLoadKg?: number }).totalLoadKg, 70);
  assert.equal((sets[1].meta as { totalLoadKg?: number }).totalLoadKg, 80);
});
