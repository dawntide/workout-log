import assert from "node:assert/strict";
import test from "node:test";
import { EXERCISE_NAMES } from "@workout/core/exercise/catalog";
import { selectDefaultStatsExercise } from "./default-exercise";

const at = (date: string) => new Date(`${date}T12:00:00.000Z`);

test("a recorded exercise outranks unrecorded priority exercises", () => {
  const selected = selectDefaultStatsExercise([
    { id: "squat", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: null },
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: null },
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
  ]);

  assert.equal(selected?.id, "row");
});

test("a recorded high-bar squat outranks other recorded exercises", () => {
  const selected = selectDefaultStatsExercise([
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
    { id: "squat", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: at("2026-06-01") },
  ]);

  assert.equal(selected?.id, "squat");
});

test("a recorded low-bar squat outranks another recorded big-three lift", () => {
  const selected = selectDefaultStatsExercise([
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: at("2026-07-18") },
    { id: "low-bar", name: EXERCISE_NAMES.lowBarBackSquat, lastPerformedAt: at("2026-06-01") },
  ]);

  assert.equal(selected?.id, "low-bar");
});

test("a recorded bench or deadlift outranks another recorded exercise", () => {
  const selected = selectDefaultStatsExercise([
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
    { id: "bench", name: EXERCISE_NAMES.benchPress, lastPerformedAt: at("2026-06-01") },
  ]);

  assert.equal(selected?.id, "bench");
});

test("front squat is not prioritized over a recorded big-three lift", () => {
  const selected = selectDefaultStatsExercise([
    { id: "front", name: EXERCISE_NAMES.frontSquat, lastPerformedAt: at("2026-07-18") },
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: at("2026-06-01") },
  ]);

  assert.equal(selected?.id, "deadlift");
});

test("latest activity breaks ties between high-bar and low-bar squats", () => {
  const selected = selectDefaultStatsExercise([
    { id: "high-bar", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: at("2026-07-01") },
    { id: "low-bar", name: EXERCISE_NAMES.lowBarBackSquat, lastPerformedAt: at("2026-07-18") },
  ]);

  assert.equal(selected?.id, "low-bar");
});

test("latest activity breaks ties within the same priority tier", () => {
  const selected = selectDefaultStatsExercise([
    { id: "bench", name: EXERCISE_NAMES.benchPress, lastPerformedAt: at("2026-07-01") },
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: at("2026-07-18") },
  ]);

  assert.equal(selected?.id, "deadlift");
});

test("workout history breaks ties between non-big-three exercises", () => {
  const selected = selectDefaultStatsExercise([
    { id: "press", name: EXERCISE_NAMES.overheadPress, lastPerformedAt: null },
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: at("2026-07-18") },
  ]);

  assert.equal(selected?.id, "row");
});

test("high-bar squat is the deterministic fallback when there is no history", () => {
  const selected = selectDefaultStatsExercise([
    { id: "row", name: EXERCISE_NAMES.barbellRow, lastPerformedAt: null },
    { id: "front", name: EXERCISE_NAMES.frontSquat, lastPerformedAt: null },
    { id: "deadlift", name: EXERCISE_NAMES.deadlift, lastPerformedAt: null },
    { id: "high-bar", name: EXERCISE_NAMES.highBarBackSquat, lastPerformedAt: null },
  ]);

  assert.equal(selected?.id, "high-bar");
});

test("returns null when the exercise dictionary is empty", () => {
  assert.equal(selectDefaultStatsExercise([]), null);
});
