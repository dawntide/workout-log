import assert from "node:assert/strict";
import test from "node:test";
import { EXERCISE_NAMES } from "@workout/core/exercise/catalog";
import { selectDefaultStatsExercise } from "./default-exercise";

const at = (date: string) => new Date(`${date}T12:00:00.000Z`);

test("workout history outranks an unrecorded squat", () => {
  const selected = selectDefaultStatsExercise([
    { id: "squat", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: null },
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
  ]);

  assert.equal(selected?.id, "row");
});

test("a recorded squat outranks other recorded exercises", () => {
  const selected = selectDefaultStatsExercise([
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
    { id: "squat", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: at("2026-06-01") },
  ]);

  assert.equal(selected?.id, "squat");
});

test("a recorded big-three lift outranks other recorded exercises", () => {
  const selected = selectDefaultStatsExercise([
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: at("2026-06-01") },
  ]);

  assert.equal(selected?.id, "deadlift");
});

test("latest activity breaks ties within the same priority tier", () => {
  const selected = selectDefaultStatsExercise([
    { id: "bench", name: EXERCISE_NAMES.benchPress, lastPerformedAt: at("2026-07-01") },
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: at("2026-07-18") },
  ]);

  assert.equal(selected?.id, "deadlift");
});

test("high-bar squat is the deterministic fallback when there is no history", () => {
  const selected = selectDefaultStatsExercise([
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: null },
    { id: "front", name: EXERCISE_NAMES.frontSquat, lastPerformedAt: null },
    { id: "high-bar", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: null },
  ]);

  assert.equal(selected?.id, "high-bar");
});

test("returns null when the exercise dictionary is empty", () => {
  assert.equal(selectDefaultStatsExercise([]), null);
});
