import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateMuscleVolumeRows,
  type MuscleVolumeInputRow,
} from "./muscle-volume-aggregate";

test("aggregateMuscleVolumeRows returns empty for empty input", () => {
  const result = aggregateMuscleVolumeRows([]);
  assert.deepEqual(result.weekly, []);
  assert.deepEqual(result.totals, []);
});

test("aggregateMuscleVolumeRows skips rows with non-positive reps", () => {
  const rows: MuscleVolumeInputRow[] = [
    {
      weekStart: "2026-05-18",
      exerciseName: "Back Squat",
      category: "Legs",
      weightKg: 100,
      reps: 0,
    },
    {
      weekStart: "2026-05-18",
      exerciseName: "Back Squat",
      category: "Legs",
      weightKg: 100,
      reps: null,
    },
  ];
  const result = aggregateMuscleVolumeRows(rows);
  assert.deepEqual(result.weekly, []);
  assert.deepEqual(result.totals, []);
});

test("aggregateMuscleVolumeRows distributes Bench Press tonnage to Chest/Shoulder/Arm", () => {
  const result = aggregateMuscleVolumeRows([
    {
      weekStart: "2026-05-18",
      exerciseName: "Bench Press",
      category: "Chest",
      weightKg: 100,
      reps: 5,
    },
  ]);
  const totals = Object.fromEntries(
    result.totals.map((t) => [t.muscleGroup, t.tonnageKg]),
  );
  assert.equal(totals.Chest, 500);
  assert.equal(totals.Shoulder, 150);
  assert.equal(totals.Arm, 150);
});

test("aggregateMuscleVolumeRows counts a set toward the primary muscle only", () => {
  const result = aggregateMuscleVolumeRows([
    {
      weekStart: "2026-05-18",
      exerciseName: "Deadlift",
      category: "Back",
      weightKg: 100,
      reps: 5,
    },
  ]);
  const totalsByGroup = Object.fromEntries(
    result.totals.map((t) => [t.muscleGroup, t.setCount]),
  );
  assert.equal(totalsByGroup.Back, 1);
  assert.equal(totalsByGroup.Hamstring ?? 0, 0);
  assert.equal(totalsByGroup.Glute ?? 0, 0);
});

test("aggregateMuscleVolumeRows sums multiple sets per week and across weeks", () => {
  const result = aggregateMuscleVolumeRows([
    {
      weekStart: "2026-05-11",
      exerciseName: "Back Squat",
      category: "Legs",
      weightKg: 100,
      reps: 5,
    },
    {
      weekStart: "2026-05-11",
      exerciseName: "Back Squat",
      category: "Legs",
      weightKg: 100,
      reps: 5,
    },
    {
      weekStart: "2026-05-18",
      exerciseName: "Back Squat",
      category: "Legs",
      weightKg: 100,
      reps: 5,
    },
  ]);
  assert.equal(result.weekly.length, 4); // Quad+Glute for each of the 2 weeks
  const week1Quad = result.weekly.find(
    (w) => w.weekStart === "2026-05-11" && w.muscleGroup === "Quad",
  );
  const week2Quad = result.weekly.find(
    (w) => w.weekStart === "2026-05-18" && w.muscleGroup === "Quad",
  );
  assert.equal(week1Quad?.tonnageKg, 1000);
  assert.equal(week1Quad?.setCount, 2);
  assert.equal(week2Quad?.tonnageKg, 500);
  assert.equal(week2Quad?.setCount, 1);

  const totalsQuad = result.totals.find((t) => t.muscleGroup === "Quad");
  assert.equal(totalsQuad?.tonnageKg, 1500);
  assert.equal(totalsQuad?.setCount, 3);
});

test("aggregateMuscleVolumeRows totals are sorted by tonnage descending", () => {
  const result = aggregateMuscleVolumeRows([
    {
      weekStart: "2026-05-18",
      exerciseName: "Bicep Curl",
      category: null,
      weightKg: 10,
      reps: 10,
    },
    {
      weekStart: "2026-05-18",
      exerciseName: "Back Squat",
      category: "Legs",
      weightKg: 100,
      reps: 5,
    },
  ]);
  const tonnages = result.totals.map((t) => t.tonnageKg);
  for (let i = 1; i < tonnages.length; i++) {
    assert.ok(tonnages[i - 1] >= tonnages[i], "totals should be sorted desc");
  }
  assert.equal(result.totals[0]?.muscleGroup, "Quad");
});

test("aggregateMuscleVolumeRows falls back to Other for unknown exercise/category", () => {
  const result = aggregateMuscleVolumeRows([
    {
      weekStart: "2026-05-18",
      exerciseName: "Mystery Move",
      category: null,
      weightKg: 50,
      reps: 5,
    },
  ]);
  assert.equal(result.totals[0]?.muscleGroup, "Other");
  assert.equal(result.totals[0]?.tonnageKg, 250);
  assert.equal(result.totals[0]?.setCount, 1);
});
