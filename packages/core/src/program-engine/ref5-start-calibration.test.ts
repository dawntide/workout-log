import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRef5StartRecommendation,
  deriveRef5StartCalibration,
  ref5CalibrationLiftForExerciseName,
} from "./ref5-start-calibration";

test("REF5 e1RM calibration reproduces the original direct starting standards", () => {
  const result = deriveRef5StartCalibration({
    SQ: 104,
    BP: 101,
    PULL: 108,
    DL: 100,
    OHP: 50,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.startConfig.startingValuesKg, {
    sqH3Kg: 82.5,
    bpFocusKg: 82.5,
    pullFocusTotalKg: 87.5,
    deadliftKg: 72.5,
    ohpKg: 32.5,
  });
  assert.deepEqual(result.value.capAdjustments, {});
});

test("REF5 e1RM calibration floors to 2.5 kg and exposes auxiliary cap adjustments", () => {
  const result = deriveRef5StartCalibration({
    SQ: 104.9,
    BP: 101.9,
    PULL: 108.9,
    DL: 200,
    OHP: 100,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.rawStartingValuesKg, {
    sqH3Kg: 82.5,
    bpFocusKg: 82.5,
    pullFocusTotalKg: 87.5,
    deadliftKg: 145,
    ohpKg: 65,
  });
  assert.deepEqual(result.value.startConfig.startingValuesKg, {
    sqH3Kg: 82.5,
    bpFocusKg: 82.5,
    pullFocusTotalKg: 87.5,
    deadliftKg: 75,
    ohpKg: 32.5,
  });
  assert.deepEqual(result.value.capAdjustments, {
    DL: { fromKg: 145, toKg: 75 },
    OHP: { fromKg: 65, toKg: 32.5 },
  });
});

test("REF5 calibration requires all five positive e1RMs", () => {
  const result = deriveRef5StartCalibration({ SQ: 104 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join(" "), /BP e1RM/);
  assert.match(result.errors.join(" "), /OHP e1RM/);
});

test("REF5 calibration matching stays on the exact five exercise identities", () => {
  assert.equal(ref5CalibrationLiftForExerciseName("Back Squat"), "SQ");
  assert.equal(ref5CalibrationLiftForExerciseName("High-Bar Back Squat"), "SQ");
  assert.equal(ref5CalibrationLiftForExerciseName("Weighted Pull-Up"), "PULL");
  assert.equal(ref5CalibrationLiftForExerciseName("Overhead Press"), "OHP");
  assert.equal(ref5CalibrationLiftForExerciseName("Front Squat"), null);
  assert.equal(ref5CalibrationLiftForExerciseName("Low Bar Squat"), null);
  assert.equal(ref5CalibrationLiftForExerciseName("Low-Bar Back Squat"), null);
  assert.equal(ref5CalibrationLiftForExerciseName("Squat"), null);
  assert.equal(ref5CalibrationLiftForExerciseName("스쿼트"), null);
  assert.equal(ref5CalibrationLiftForExerciseName("Romanian Deadlift"), null);
  assert.equal(ref5CalibrationLiftForExerciseName("Barbell Row"), null);
});

test("REF5 recommendation uses the strongest eligible recent record per lift", () => {
  const recommendation = buildRef5StartRecommendation([
    {
      exerciseName: "Back Squat",
      best: { date: "2026-07-10", e1rm: 102, weightKg: 92.5, reps: 3 },
    },
    {
      exerciseName: "High-Bar Squat",
      best: { date: "2026-07-12", e1rm: 104, weightKg: 95, reps: 3 },
    },
    {
      exerciseName: "Bench Press",
      best: { date: "2026-07-11", e1rm: 101, weightKg: 92.5, reps: 3 },
    },
    {
      exerciseName: "Weighted Pull-Up",
      best: { date: "2026-07-09", e1rm: 108, weightKg: 97.5, reps: 3 },
    },
    {
      exerciseName: "Deadlift",
      best: { date: "2026-07-08", e1rm: 100, weightKg: 90, reps: 3 },
    },
    {
      exerciseName: "Overhead Press",
      best: { date: "2026-07-07", e1rm: 50, weightKg: 40, reps: 8 },
    },
    {
      exerciseName: "Barbell Row",
      best: { date: "2026-07-13", e1rm: 140, weightKg: 100, reps: 12 },
    },
  ]);

  assert.deepEqual(recommendation.missingLifts, []);
  assert.equal(recommendation.items.find((item) => item.lift === "SQ")?.e1rmKg, 104);
  assert.equal(recommendation.calibration?.startConfig.startingValuesKg.sqH3Kg, 82.5);
});

test("REF5 recommendation reports missing lifts instead of filling personal defaults", () => {
  const recommendation = buildRef5StartRecommendation([
    {
      exerciseName: "Back Squat",
      best: { date: "2026-07-10", e1rm: 104, weightKg: 95, reps: 3 },
    },
  ]);
  assert.deepEqual(recommendation.missingLifts, ["BP", "PULL", "DL", "OHP"]);
  assert.equal(recommendation.calibration, null);
});
