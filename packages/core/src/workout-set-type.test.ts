import assert from "node:assert/strict";
import test from "node:test";
import {
  isWarmupSetType,
  normalizeWorkoutSetType,
  WORKOUT_SET_TYPES,
} from "./workout-set-type";

test("작업 세트는 null이다 — 값 집합에 별도 리터럴을 두지 않는다", () => {
  assert.deepEqual([...WORKOUT_SET_TYPES], ["WARMUP", "FAILURE"]);
  assert.equal(normalizeWorkoutSetType(null), null);
  assert.equal(normalizeWorkoutSetType(undefined), null);
  assert.equal(normalizeWorkoutSetType(""), null);
});

test("미지 값은 작업 세트로 떨어진다 (구 클라이언트·수동 import 내성)", () => {
  assert.equal(normalizeWorkoutSetType("DROPSET"), null);
  assert.equal(normalizeWorkoutSetType("WORKING"), null);
  assert.equal(normalizeWorkoutSetType(42), null);
  assert.equal(normalizeWorkoutSetType({ type: "WARMUP" }), null);
});

test("대소문자와 공백을 흡수한다", () => {
  assert.equal(normalizeWorkoutSetType("warmup"), "WARMUP");
  assert.equal(normalizeWorkoutSetType(" Failure "), "FAILURE");
});

test("웜업만 제외 대상이다 — 실패는 실제로 든 무게라 남는다", () => {
  assert.equal(isWarmupSetType("WARMUP"), true);
  assert.equal(isWarmupSetType("FAILURE"), false);
  assert.equal(isWarmupSetType(null), false);
});
