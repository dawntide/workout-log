import assert from "node:assert/strict";
import test from "node:test";

import {
  hashWorkoutLogMutationPayload,
  normalizeWorkoutLogClientMutationId,
  WorkoutLogClientMutationValidationError,
} from "./upsert-log";

const performedAt = new Date("2026-07-14T01:02:03.456Z");

test("workout-log mutation hash is stable across object key order and null omission", () => {
  const first = hashWorkoutLogMutationPayload({
    performedAt,
    sets: [{ exerciseName: "Squat", weightKg: 100, reps: 5, meta: { z: 2, a: 1 } }],
  });
  const second = hashWorkoutLogMutationPayload({
    performedAt,
    durationMinutes: null,
    notes: null,
    tags: null,
    planId: null,
    generatedSessionId: null,
    progressionTargetDecisions: null,
    sets: [{ reps: 5, meta: { a: 1, z: 2 }, weightKg: 100, exerciseName: "Squat" }],
  });
  assert.equal(first, second);
});

test("workout-log mutation hash rejects a contradictory retry payload", () => {
  const first = hashWorkoutLogMutationPayload({
    performedAt,
    sets: [{ exerciseName: "Squat", weightKg: 100, reps: 5 }],
  });
  const changed = hashWorkoutLogMutationPayload({
    performedAt,
    sets: [{ exerciseName: "Squat", weightKg: 100, reps: 4 }],
  });
  assert.notEqual(first, changed);
});

test("client mutation ids are normalized and bounded", () => {
  assert.equal(
    normalizeWorkoutLogClientMutationId("  tui-0123456789abcdef0123456789abcdef  "),
    "tui-0123456789abcdef0123456789abcdef",
  );
  assert.equal(normalizeWorkoutLogClientMutationId(undefined), null);
  assert.throws(
    () => normalizeWorkoutLogClientMutationId("   "),
    WorkoutLogClientMutationValidationError,
  );
  assert.throws(
    () => normalizeWorkoutLogClientMutationId({ key: "tui-value" }),
    WorkoutLogClientMutationValidationError,
  );
  assert.throws(
    () => normalizeWorkoutLogClientMutationId("bad key"),
    WorkoutLogClientMutationValidationError,
  );
  assert.throws(
    () => normalizeWorkoutLogClientMutationId(`tui-${"a".repeat(130)}`),
    WorkoutLogClientMutationValidationError,
  );
});
