import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveMuscleContribution,
  resolvePrimaryMuscleGroup,
} from "./category-to-muscle";

test("resolveMuscleContribution maps Deadlift to Back+Hamstring+Glute", () => {
  const contribution = resolveMuscleContribution("Deadlift", "Back");
  assert.equal(contribution.Back, 1.0);
  assert.ok((contribution.Hamstring ?? 0) > 0);
  assert.ok((contribution.Glute ?? 0) > 0);
});

test("resolveMuscleContribution maps Romanian Deadlift to Hamstring primary", () => {
  const contribution = resolveMuscleContribution("Romanian Deadlift", "Legs");
  assert.equal(resolvePrimaryMuscleGroup("Romanian Deadlift", "Legs"), "Hamstring");
  assert.ok((contribution.Glute ?? 0) > 0);
});

test("resolveMuscleContribution maps Hip Thrust to Glute primary", () => {
  assert.equal(resolvePrimaryMuscleGroup("Hip Thrust", "Glute"), "Glute");
});

test("resolveMuscleContribution maps Bench Press to Chest primary", () => {
  const contribution = resolveMuscleContribution("Bench Press", "Chest");
  assert.equal(contribution.Chest, 1.0);
  assert.ok((contribution.Shoulder ?? 0) > 0);
  assert.ok((contribution.Arm ?? 0) > 0);
});

test("resolveMuscleContribution handles korean alias via category fallback", () => {
  // Names not in EXERCISE_CONTRIBUTIONS fall back to category mapping.
  const contribution = resolveMuscleContribution("덤벨 풀오버", "Back");
  assert.deepEqual(contribution, { Back: 1.0 });
});

test("resolveMuscleContribution falls back to Other when category is unknown/null", () => {
  assert.deepEqual(resolveMuscleContribution("Unknown Lift", null), { Other: 1.0 });
  assert.deepEqual(resolveMuscleContribution("Unknown Lift", undefined), { Other: 1.0 });
  assert.deepEqual(resolveMuscleContribution("Unknown Lift", ""), { Other: 1.0 });
});

test("resolveMuscleContribution normalizes exercise key (spaces, hyphens, case)", () => {
  assert.equal(resolveMuscleContribution("Bench Press", "Chest").Chest, 1.0);
  assert.equal(resolveMuscleContribution("bench-press", "Chest").Chest, 1.0);
  assert.equal(resolveMuscleContribution("BENCHPRESS", "Chest").Chest, 1.0);
  assert.equal(resolveMuscleContribution("Pull-Up", "Back").Back, 1.0);
});

test("resolvePrimaryMuscleGroup picks the highest-weighted group", () => {
  assert.equal(resolvePrimaryMuscleGroup("High-Bar Back Squat", "Legs"), "Quad");
  assert.equal(resolvePrimaryMuscleGroup("Low-Bar Back Squat", "Legs"), "Quad");
  assert.equal(resolvePrimaryMuscleGroup("Deadlift", "Back"), "Back");
  assert.equal(resolvePrimaryMuscleGroup("Lateral Raise", null), "Shoulder");
  assert.equal(resolvePrimaryMuscleGroup("Bicep Curl", null), "Arm");
});

test("seed exercises all resolve to a non-Other primary group", () => {
  const seedExercises: Array<[string, string]> = [
    ["High-Bar Back Squat", "Legs"],
    ["Low-Bar Back Squat", "Legs"],
    ["Bench Press", "Chest"],
    ["Deadlift", "Back"],
    ["Overhead Press", "Shoulder"],
    ["Barbell Row", "Back"],
    ["Pull-Up", "Back"],
    ["Weighted Pull-Up", "Back"],
    ["Power Clean", "Olympic Lift"],
    ["Front Squat", "Legs"],
    ["Incline Bench Press", "Chest"],
    ["Romanian Deadlift", "Legs"],
    ["Leg Press", "Legs"],
    ["Lat Pulldown", "Back"],
    ["Dumbbell Shoulder Press", "Shoulder"],
    ["Hip Thrust", "Glute"],
  ];
  for (const [name, category] of seedExercises) {
    const primary = resolvePrimaryMuscleGroup(name, category);
    assert.notEqual(primary, "Other", `${name} should not fall back to Other`);
  }
});
