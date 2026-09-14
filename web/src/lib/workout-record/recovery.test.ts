import assert from "node:assert/strict";
import test from "node:test";
import { createWorkoutRecordDraftFromLog, type ExistingWorkoutLogLike } from "./model";
import { isDraftAlreadySaved, recoveryHref } from "./recovery";
import type { WorkoutDraftData } from "../storage/workoutDraftStore";

const log: ExistingWorkoutLogLike = {
  id: "log-1", planId: "plan-1", generatedSessionId: "session-1",
  performedAt: "2026-07-17T09:00:00.000Z", notes: null,
  sets: [{ exerciseName: "Squat", setNumber: 1, reps: 5, weightKg: 60, rpe: null, isExtra: false, meta: {} }],
};
function local(): WorkoutDraftData {
  return { key: "plan-1:2026-07-17:log-1", updatedAt: 1,
    draft: createWorkoutRecordDraftFromLog(structuredClone(log), "Test"), programEntryState: {} };
}

test("a saved log snapshot is not a recovery candidate", () => {
  assert.equal(isDraftAlreadySaved(local(), log), true);
});
test("changed reps, weights, notes, set type and date remain recoverable", () => {
  for (const edit of [
    (d: WorkoutDraftData) => { d.draft.userExercises[0].set.repsPerSet[0] = 4; },
    (d: WorkoutDraftData) => { d.draft.userExercises[0].set.weightKgPerSet[0] = 65; },
    (d: WorkoutDraftData) => { d.draft.session.note.memo = "new note"; },
    (d: WorkoutDraftData) => { d.draft.userExercises[0].note.memo = "new exercise note"; },
    (d: WorkoutDraftData) => { d.draft.userExercises[0].set.setTypePerSet[0] = "WARMUP"; },
    (d: WorkoutDraftData) => { d.draft.session.performedAt = "2026-07-18T09:00:00Z"; },
  ]) {
    const item = local(); edit(item);
    assert.equal(isDraftAlreadySaved(item, log), false);
  }
});
test("matching date and content alone never identify the same workout", () => {
  const item = local(); item.draft.session.logId = null; item.draft.session.generatedSessionId = null;
  assert.equal(isDraftAlreadySaved(item, log), false);
});
test("a committed new draft can be matched by generated session or mutation identity", () => {
  const item = local(); item.draft.session.logId = null;
  assert.equal(isDraftAlreadySaved(item, log), true);
  item.draft.session.generatedSessionId = null; item.draft.session.clientMutationId = "web:retry";
  assert.equal(isDraftAlreadySaved(item, { ...log, generatedSessionId: null, clientMutationId: "web:retry" }), true);
});
test("raw unfinished entry input is preserved even if materialized sets still match", () => {
  for (const value of ["-", ""]) {
    const item = local();
    item.programEntryState["log-1"] = { repsInputs: [value], plannedRepsPerSet: [5], memoInput: "", memoPlaceholder: "" };
    assert.equal(isDraftAlreadySaved(item, log), false);
  }
});
test("new draft links keep the original persistence key even with a generated session", () => {
  const item = local(); item.key = "plan-1:2026-07-17:new"; item.draft.session.logId = null;
  assert.equal(new URL(recoveryHref(item), "http://localhost").searchParams.has("sessionId"), false);
  item.key = "plan-1:2026-07-17:session-1";
  assert.equal(new URL(recoveryHref(item), "http://localhost").searchParams.get("sessionId"), "session-1");
});
