import assert from "node:assert/strict";
import test from "node:test";
import {
  EXERCISE_CATALOG,
  EXERCISE_NAMES,
  resolveExerciseEquipment,
  supportsPlateBreakdown,
  type ExerciseEquipment,
} from "./catalog";

test("every catalog entry declares equipment", () => {
  const valid: ExerciseEquipment[] = [
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "bodyweight",
    "unknown",
  ];
  for (const item of EXERCISE_CATALOG) {
    assert.ok(
      valid.includes(item.equipment),
      `${item.name} has an invalid equipment value: ${String(item.equipment)}`,
    );
    // 카탈로그가 unknown을 쓰면 태깅을 빠뜨린 것이다 — unknown은 카탈로그 밖 전용이다.
    assert.notEqual(item.equipment, "unknown", `${item.name} is missing an equipment tag`);
  }
});

test("resolveExerciseEquipment reads through aliases and trims input", () => {
  assert.equal(resolveExerciseEquipment(EXERCISE_NAMES.benchPress), "barbell");
  assert.equal(resolveExerciseEquipment("  bench press  "), "barbell");
  assert.equal(resolveExerciseEquipment("BENCH PRESS"), "barbell");
  // Back Squat은 High-Bar Back Squat의 별칭이다.
  assert.equal(resolveExerciseEquipment("Back Squat"), "barbell");
});

test("resolveExerciseEquipment returns unknown for exercises outside the catalog", () => {
  assert.equal(resolveExerciseEquipment("Sled Push"), "unknown");
  assert.equal(resolveExerciseEquipment(""), "unknown");
});

test("plate breakdown shows for barbell lifts", () => {
  for (const name of [
    EXERCISE_NAMES.highBarBackSquat,
    EXERCISE_NAMES.benchPress,
    EXERCISE_NAMES.deadlift,
    EXERCISE_NAMES.overheadPress,
    EXERCISE_NAMES.barbellRow,
  ]) {
    assert.equal(supportsPlateBreakdown(name), true, `${name} should show a plate breakdown`);
  }
});

test("plate breakdown hides for non-barbell lifts", () => {
  for (const name of [
    EXERCISE_NAMES.pullUp, // bodyweight
    EXERCISE_NAMES.bicepCurl, // dumbbell
    EXERCISE_NAMES.latPulldown, // cable stack
    EXERCISE_NAMES.legExtension, // machine
  ]) {
    assert.equal(supportsPlateBreakdown(name), false, `${name} should not show a plate breakdown`);
  }
});

test("plate breakdown shows for user-created exercises (permissive fallback)", () => {
  // 카탈로그 밖 종목은 바벨일 수도 있으므로 노출한다 — 안 쓰면 안 누르면 그만이다.
  assert.equal(supportsPlateBreakdown("My Custom Barbell Lift"), true);
});
