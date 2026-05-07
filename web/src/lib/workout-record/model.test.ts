import assert from "node:assert/strict";
import test from "node:test";
import {
  addUserExercise,
  createWorkoutRecordDraft,
  createWorkoutRecordDraftFromLog,
  type ExistingWorkoutLogLike,
  type GeneratedSessionLike,
  hasWorkoutEdits,
  toWorkoutLogPayload,
  updateUserExercise,
} from "./model";

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
