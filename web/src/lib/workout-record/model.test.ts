import assert from "node:assert/strict";
import test from "node:test";
import {
  addUserExercise,
  createWorkoutRecordDraft,
  createWorkoutRecordDraftFromLog,
  type ExistingWorkoutLogLike,
  type GeneratedSessionLike,
  hasWorkoutEdits,
  isWorkoutDraftProtocolCompatible,
  migrateWorkoutRecordDraft,
  patchSeedExercise,
  toWorkoutLogPayload,
  updateUserExercise,
  validateWorkoutDraft,
  type WorkoutRecordDraft,
} from "./model";
import {
  patchSetWeightAtIndex,
  appendSetWeight,
  removeSetWeightAtIndex,
} from "@/features/workout-log/model/exercise-entry";
import { toDefaultWorkoutPreferences } from "@/lib/settings/workout-preferences";
import { applyWorkoutLogWeightRulesToDraft } from "./weight-rules";

function makeRef5Session(): GeneratedSessionLike {
  return {
    id: "ref5-session-1",
    planId: "ref5-plan-1",
    sessionKey: "REF5:2026-07-13T09:00:00.000Z:start-1",
    snapshot: {
      schemaVersion: 4,
      protocolVersion: "1.2",
      sessionKey: "REF5:2026-07-13T09:00:00.000Z:start-1",
      sessionDate: "2026-07-13",
      timezone: "Asia/Seoul",
      program: { slug: "ref5-adaptive-strength" },
      ref5: {
        protocolVersion: "1.2",
        actualStartAt: "2026-07-13T09:00:00.000Z",
        timezone: "Asia/Seoul",
        startEventId: "start-1",
        runtimeRevisionBefore: 4,
        runtimeRevisionAfter: 5,
      },
      exercises: [
        {
          exerciseName: "Weighted Pull-Up",
          rowType: "AUTO",
          progressionTarget: "PULL",
          ref5: {
            exerciseKey: "PULL_FOCUS",
            stream: "PULL_FOCUS",
            targetTotalKg: 87.5,
            lockedAddedKg: 12.5,
            todayBodyweightKg: 76,
            actualTotalKg: 88.5,
            windowId: "pull-focus-3",
          },
          sets: [
            { reps: 3, targetWeightKg: 12.5, meta: { immutableMarker: "a" } },
            { reps: 3, targetWeightKg: 12.5, meta: { immutableMarker: "b" } },
            { reps: 3, targetWeightKg: 12.5, meta: { immutableMarker: "c" } },
          ],
        },
      ],
    },
  };
}

test("REF5 draft freezes the exact start, locked added load, and termination metadata", () => {
  let draft = createWorkoutRecordDraft(makeRef5Session(), "REF5", {
    sessionDate: "2026-07-14",
    timezone: "Asia/Seoul",
  });
  assert.equal(draft.session.performedAt, "2026-07-13T09:00:00.000Z");
  assert.equal(draft.session.sessionDate, "2026-07-13", "snapshot calendar date stays canonical");
  assert.equal(draft.session.week, null, "REF5 must not fabricate a finite week");
  assert.equal(draft.session.day, null, "REF5 must not fabricate a finite day");
  assert.equal(draft.session.estimatedE1rmKg, null);
  assert.equal(draft.session.estimatedTmKg, null);
  assert.deepEqual(draft.seedExercises[0]?.set.weightKgPerSet, [12.5, 12.5, 12.5]);
  assert.equal(validateWorkoutDraft(draft, "en").valid, false, "termination reason is required");

  draft = patchSeedExercise(draft, "seed-1", {
    set: { repsPerSet: [3, 2, 0] },
    ref5: { terminationReason: "CLEAR_SLOWDOWN" },
  });
  const payload = toWorkoutLogPayload(draft, {
    bodyweightKg: 99,
    isBodyweightExercise: () => true,
  });
  assert.deepEqual(payload.sets.map((set) => set.weightKg), [12.5, 12.5, 12.5]);
  assert.deepEqual(payload.sets.map((set) => set.reps), [3, 2, 0]);
  const meta = payload.sets[1]!.meta;
  assert.equal(meta.bodyweightKg, undefined, "current settings must not rewrite locked REF5 BW");
  assert.equal(meta.immutableMarker, "b");
  assert.deepEqual(meta.ref5, {
    prescription: draft.seedExercises[0]!.ref5!.prescription,
    terminationReason: "CLEAR_SLOWDOWN",
    protocolVersion: "1.2",
    actualStartAt: "2026-07-13T09:00:00.000Z",
    startEventId: "start-1",
    completionEventId: "start-1:completion",
    runtimeRevisionBefore: 4,
    runtimeRevisionAfter: 5,
    plannedReps: 3,
    actualReps: 2,
    setIndex: 1,
  });
});

test("REF5 reload preserves frozen external PULL loads and bypasses generic plate rules", () => {
  const draft = createWorkoutRecordDraft(makeRef5Session(), "REF5");
  const reloaded = applyWorkoutLogWeightRulesToDraft(draft, {
    ...toDefaultWorkoutPreferences(),
    bodyweightKg: 75,
    minimumPlateDefaultKg: 10,
  });

  assert.equal(reloaded, draft, "immutable REF5 drafts must not be rewritten");
  assert.deepEqual(reloaded.seedExercises[0]?.set.weightKgPerSet, [12.5, 12.5, 12.5]);
});

test("REF5 local draft restore rejects stale protocol/concurrent-session caches", () => {
  const current = createWorkoutRecordDraft(makeRef5Session(), "REF5");
  const legacy = structuredClone(current);
  legacy.session.ref5!.protocolVersion = "1.1";
  assert.equal(isWorkoutDraftProtocolCompatible(current, legacy), false);

  const sameLegacy = structuredClone(legacy);
  assert.equal(isWorkoutDraftProtocolCompatible(legacy, sameLegacy), true);

  const otherTab = structuredClone(current);
  otherTab.session.generatedSessionId = "ref5-session-other-tab";
  assert.equal(isWorkoutDraftProtocolCompatible(current, otherTab), false);
  assert.equal(isWorkoutDraftProtocolCompatible(null, legacy), false);
});

test("REF5 log edit round-trips arbitrary set metadata without recomputing bodyweight", () => {
  let draft = createWorkoutRecordDraft(makeRef5Session(), "REF5");
  draft = patchSeedExercise(draft, "seed-1", {
    set: { repsPerSet: [3, 3, 3] },
    ref5: { terminationReason: "NORMAL" },
  });
  const firstPayload = toWorkoutLogPayload(draft);
  const editedDraft = createWorkoutRecordDraftFromLog(
    {
      id: "log-ref5-1",
      planId: draft.session.planId,
      generatedSessionId: makeRef5Session().id,
      performedAt: draft.session.performedAt,
      sets: firstPayload.sets,
      generatedSession: makeRef5Session(),
    },
    "REF5",
  );
  assert.equal(editedDraft.session.estimatedE1rmKg, null);
  assert.equal(editedDraft.session.estimatedTmKg, null);
  const exerciseId = editedDraft.userExercises[0]!.id;
  const changed = updateUserExercise(editedDraft, exerciseId, {
    set: { repsPerSet: [0, 2, 3] },
    ref5: { terminationReason: "SAFETY" },
  });
  const secondPayload = toWorkoutLogPayload(changed, { bodyweightKg: 120, isBodyweightExercise: () => true });
  assert.deepEqual(secondPayload.sets.map((set) => set.weightKg), [12.5, 12.5, 12.5]);
  assert.deepEqual(secondPayload.sets.map((set) => set.reps), [0, 2, 3]);
  assert.equal(secondPayload.sets[0]!.meta.immutableMarker, "a");
  assert.equal((secondPayload.sets[0]!.meta.ref5 as { terminationReason: string }).terminationReason, "SAFETY");
});

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

// 슬롯 자동진행 입력 흐름: 슬롯형(gzclp/texas, key=`{sessionKey}_s{n}`) progressionKey만 로그
// set.meta.plannedRef로 흘려야 reducer가 슬롯 독립 진행을 굴린다. operator EX_키 등 family 1:1
// 키는 제외(부착 시 기존 family-state 진행 단절).
test("toWorkoutLogPayload: 슬롯형 progressionKey(_s)는 set.meta.plannedRef로 흘린다", () => {
  const session: GeneratedSessionLike = {
    id: "session-slot",
    planId: "plan-slot",
    sessionKey: "2026-03-09@D1",
    snapshot: {
      sessionKey: "2026-03-09@D1",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      program: { slug: "gzclp", name: "GZCLP" },
      exercises: [
        {
          exerciseName: "Back Squat",
          rowType: "AUTO",
          progressionTarget: "SQUAT",
          progressionKey: "D1_s0",
          sets: [
            { reps: 5, targetWeightKg: 100 },
            { reps: 5, targetWeightKg: 100 },
            { reps: 5, targetWeightKg: 100, amrap: true },
          ],
        },
      ],
    },
  };
  const draft = createWorkoutRecordDraft(session, "GZCLP Plan", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });
  const payload = toWorkoutLogPayload(draft, {});

  assert.equal(payload.sets.length, 3);
  const meta0 = payload.sets[0]!.meta as {
    plannedRef?: { progressionKey?: string; progressionTarget?: string; reps?: number; amrap?: boolean };
  };
  assert.equal(meta0.plannedRef?.progressionKey, "D1_s0");
  assert.equal(meta0.plannedRef?.progressionTarget, "SQUAT");
  assert.equal(meta0.plannedRef?.reps, 5);
  assert.notEqual(meta0.plannedRef?.amrap, true); // 비-amrap 세트
  // 마지막 세트만 amrap
  const metaLast = payload.sets[2]!.meta as { plannedRef?: { amrap?: boolean } };
  assert.equal(metaLast.plannedRef?.amrap, true);
});

test("toWorkoutLogPayload: operator EX_키(family 1:1)는 plannedRef 미부착(전환 단절 방지)", () => {
  const session: GeneratedSessionLike = {
    id: "session-op",
    planId: "plan-op",
    sessionKey: "2026-03-09@C1W1D1",
    snapshot: {
      sessionKey: "2026-03-09@C1W1D1",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      program: { slug: "operator", name: "Tactical Barbell Operator" },
      exercises: [
        {
          exerciseName: "Back Squat",
          rowType: "AUTO",
          progressionTarget: "SQUAT",
          progressionKey: "EX_BACK_SQUAT",
          sets: [{ reps: 5, targetWeightKg: 100 }],
        },
      ],
    },
  };
  const draft = createWorkoutRecordDraft(session, "Operator Plan", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });
  const payload = toWorkoutLogPayload(draft, {});
  const meta0 = payload.sets[0]!.meta as { plannedRef?: unknown };
  assert.equal(meta0.plannedRef, undefined);
});

test("toWorkoutLogPayload: progressionKey 없는 사용자 추가 운동은 plannedRef 미부착", () => {
  const session: GeneratedSessionLike = {
    id: "session-user",
    planId: "plan-user",
    sessionKey: "2026-04-07",
    snapshot: { sessionKey: "2026-04-07", sessionDate: "2026-04-07", week: 1, day: 1, exercises: [] },
  };
  const draft = addUserExercise(
    createWorkoutRecordDraft(session, "Plan", { sessionDate: "2026-04-07", timezone: "Asia/Seoul" }),
    { exerciseId: "ex-curl", exerciseName: "Bicep Curl", weightKg: 20, repsPerSet: [12], memo: "" },
  );
  const payload = toWorkoutLogPayload(draft, {});
  const meta0 = payload.sets[0]!.meta as { plannedRef?: unknown };
  assert.equal(meta0.plannedRef, undefined);
});

// SS/StrongLifts 정석(v2): uniform LP는 슬롯키(_s)가 없어 plannedRef를 못 흘려 rep 미달을 감지
// 못했다. enforcePlannedReps 마킹 시 progressionKey 없는 reps-only plannedRef를 흘려 reducer의
// setWasCompleted가 reps 미달을 실패로 판정하게 한다. progressionKey를 안 넣어야 family 진행이 유지된다.
test("toWorkoutLogPayload: SS/SL(v2 enforcePlannedReps)은 progressionKey 없는 reps-only plannedRef를 흘린다", () => {
  const session: GeneratedSessionLike = {
    id: "session-ss",
    planId: "plan-ss",
    sessionKey: "2026-03-09@A",
    snapshot: {
      sessionKey: "2026-03-09@A",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      program: { slug: "starting-strength-lp", name: "Starting Strength" },
      exercises: [
        {
          exerciseName: "Back Squat",
          rowType: "AUTO",
          progressionTarget: "SQUAT",
          enforcePlannedReps: true,
          sets: [
            { reps: 5, targetWeightKg: 100 },
            { reps: 5, targetWeightKg: 100 },
            { reps: 5, targetWeightKg: 100 },
          ],
        },
      ],
    },
  };
  const draft = createWorkoutRecordDraft(session, "SS Plan", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });
  const payload = toWorkoutLogPayload(draft, {});

  assert.equal(payload.sets.length, 3);
  const meta0 = payload.sets[0]!.meta as {
    plannedRef?: { progressionKey?: string; progressionTarget?: string; reps?: number };
  };
  assert.equal(meta0.plannedRef?.reps, 5);
  assert.equal(meta0.plannedRef?.progressionTarget, "SQUAT");
  assert.equal(meta0.plannedRef?.progressionKey, undefined); // 키 오염 방지(핵심) — family 진행 유지
});

test("toWorkoutLogPayload: enforcePlannedReps 없는 SS/SL(레거시)은 plannedRef 미부착(forward-only)", () => {
  const session: GeneratedSessionLike = {
    id: "session-ss-legacy",
    planId: "plan-ss-legacy",
    sessionKey: "2026-03-09@A",
    snapshot: {
      sessionKey: "2026-03-09@A",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      program: { slug: "starting-strength-lp", name: "Starting Strength" },
      exercises: [
        {
          exerciseName: "Back Squat",
          rowType: "AUTO",
          progressionTarget: "SQUAT",
          // enforcePlannedReps 없음 → 레거시 동작 유지
          sets: [{ reps: 5, targetWeightKg: 100 }],
        },
      ],
    },
  };
  const draft = createWorkoutRecordDraft(session, "SS Plan", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });
  const payload = toWorkoutLogPayload(draft, {});
  const meta0 = payload.sets[0]!.meta as { plannedRef?: unknown };
  assert.equal(meta0.plannedRef, undefined);
});

test("toWorkoutLogPayload: SS Power Clean 5×3은 세트별 reps=3으로 흘린다(progressionKey 없음)", () => {
  const session: GeneratedSessionLike = {
    id: "session-pc",
    planId: "plan-pc",
    sessionKey: "2026-03-09@B",
    snapshot: {
      sessionKey: "2026-03-09@B",
      sessionDate: "2026-03-09",
      week: 1,
      day: 1,
      program: { slug: "starting-strength-lp", name: "Starting Strength" },
      exercises: [
        {
          exerciseName: "Power Clean",
          rowType: "AUTO",
          progressionTarget: "DEADLIFT",
          enforcePlannedReps: true,
          sets: [
            { reps: 3, targetWeightKg: 50 },
            { reps: 3, targetWeightKg: 50 },
            { reps: 3, targetWeightKg: 50 },
            { reps: 3, targetWeightKg: 50 },
            { reps: 3, targetWeightKg: 50 },
          ],
        },
      ],
    },
  };
  const draft = createWorkoutRecordDraft(session, "SS Plan", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });
  const payload = toWorkoutLogPayload(draft, {});
  const meta0 = payload.sets[0]!.meta as { plannedRef?: { reps?: number; progressionKey?: string } };
  assert.equal(meta0.plannedRef?.reps, 3);
  assert.equal(meta0.plannedRef?.progressionKey, undefined);
});

// operator 정석(v2): operator는 EX_ progressionKey를 들지만, enforcePlannedReps 분기는 슬롯형(_s)
// 블록의 else로 들어가 progressionKey를 생략한 reps-only plannedRef만 흘린다 → family 진행(SQUAT) 유지.
test("toWorkoutLogPayload: operator(v2 enforcePlannedReps)는 EX_키를 plannedRef에 안 흘리고 reps-only만 흘린다", () => {
  const session: GeneratedSessionLike = {
    id: "session-op-v2",
    planId: "plan-op-v2",
    sessionKey: "2026-03-09@C1W6D3",
    snapshot: {
      sessionKey: "2026-03-09@C1W6D3",
      sessionDate: "2026-03-09",
      week: 6,
      day: 3,
      program: { slug: "operator", name: "Tactical Barbell Operator" },
      exercises: [
        {
          exerciseName: "Back Squat",
          rowType: "AUTO",
          progressionTarget: "SQUAT",
          progressionKey: "EX_BACK_SQUAT",
          enforcePlannedReps: true,
          sets: [{ reps: 1, targetWeightKg: 142.5 }],
        },
      ],
    },
  };
  const draft = createWorkoutRecordDraft(session, "Operator Plan", {
    sessionDate: "2026-03-09",
    timezone: "Asia/Seoul",
  });
  const payload = toWorkoutLogPayload(draft, {});
  const meta0 = payload.sets[0]!.meta as {
    plannedRef?: { reps?: number; progressionKey?: string; progressionTarget?: string };
  };
  assert.equal(meta0.plannedRef?.reps, 1);
  assert.equal(meta0.plannedRef?.progressionTarget, "SQUAT");
  assert.equal(meta0.plannedRef?.progressionKey, undefined); // EX_키 있어도 plannedRef엔 미포함 → family 진행 유지
});
