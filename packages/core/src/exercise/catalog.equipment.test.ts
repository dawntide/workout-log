import { EXERCISE_CATALOG } from "./all-exercises";
import { CURATED_EXERCISE_CATALOG } from "./catalog";
import assert from "node:assert/strict";
import test from "node:test";
import {
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
  // 값 자체의 유효성은 전체 카탈로그에 적용된다.
  for (const item of EXERCISE_CATALOG) {
    assert.ok(
      valid.includes(item.equipment),
      `${item.name} has an invalid equipment value: ${String(item.equipment)}`,
    );
  }
  // "unknown을 쓰지 않는다"는 **수기 항목의 태깅 완결성** 검사다. 오픈 데이터에는
  // 케틀벨·밴드·메디신볼처럼 우리 6종에 없는 장비가 207종 있고, 그것들을 억지로
  // 끼워 맞추는 것보다 unknown이 옳다(계획서 §6-6).
  for (const item of CURATED_EXERCISE_CATALOG) {
    assert.notEqual(item.equipment, "unknown", `${item.name} is missing an equipment tag`);
  }
  assert.ok(CURATED_EXERCISE_CATALOG.length >= 30, "수기 카탈로그 스캔이 비었다");
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
