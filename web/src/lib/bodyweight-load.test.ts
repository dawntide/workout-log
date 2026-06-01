import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBodyweightTotalLoadKg,
  computeExternalLoadFromTotalKg,
  formatExerciseLoadLabel,
  resolveLoggedTotalLoadKg,
} from "./bodyweight-load";

test("computeExternalLoadFromTotalKg subtracts bodyweight for pull-up", () => {
  assert.equal(computeExternalLoadFromTotalKg("Pull-Up", 92.5, 70), 22.5);
  assert.equal(computeExternalLoadFromTotalKg("Pull-Up", 62.5, 70), 0);
});

test("resolveLoggedTotalLoadKg prefers logged total load meta for bodyweight exercise", () => {
  assert.equal(
    resolveLoggedTotalLoadKg({
      exerciseName: "Pull-Up",
      weightKg: 20,
      meta: { totalLoadKg: 90 },
    }),
    90,
  );
  assert.equal(
    resolveLoggedTotalLoadKg({
      exerciseName: "Bench Press",
      weightKg: 90,
      meta: { totalLoadKg: 120 },
    }),
    90,
  );
});

test("formatExerciseLoadLabel shows total load first with added weight in parens", () => {
  assert.equal(
    formatExerciseLoadLabel({
      exerciseName: "Pull-Up",
      weightKg: 92.5,
      bodyweightKg: 70,
      source: "total",
    }),
    "92.5kg (+22.5)",
  );
  assert.equal(
    formatExerciseLoadLabel({
      exerciseName: "Pull-Up",
      weightKg: 20,
      bodyweightKg: 70,
      source: "external",
    }),
    "90kg (+20)",
  );
  assert.equal(
    formatExerciseLoadLabel({
      exerciseName: "Pull-Up",
      weightKg: 0,
      bodyweightKg: 70,
      source: "external",
      locale: "en",
    }),
    "70kg (BW)",
  );
  assert.equal(computeBodyweightTotalLoadKg("Pull-Up", 20, 70), 90);
});
