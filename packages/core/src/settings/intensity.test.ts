import assert from "node:assert/strict";
import test from "node:test";
import { toStoredRpe } from "./intensity";

// 이 함수의 존재 이유는 "미입력을 0으로 저장하던 것"을 끊는 것이다. 0을 다시
// 통과시키면 평균 RPE가 조용히 희석된다(prod에서 실제로 0.16이 표시됐다).

test("미입력은 null이다 — 0을 저장하지 않는다", () => {
  assert.equal(toStoredRpe(0), null);
  assert.equal(toStoredRpe(null), null);
  assert.equal(toStoredRpe(undefined), null);
  assert.equal(toStoredRpe(Number.NaN), null);
  assert.equal(toStoredRpe(-3), null, "음수는 클램프 후 0 → null");
});

test("입력값은 0.5 단위로 스냅한다", () => {
  assert.equal(toStoredRpe(8), 8);
  assert.equal(toStoredRpe(8.5), 8.5);
  assert.equal(toStoredRpe(8.3), 8.5);
  assert.equal(toStoredRpe(8.2), 8);
});

test("범위를 벗어난 입력은 클램프된다", () => {
  assert.equal(toStoredRpe(99), 10);
  assert.equal(toStoredRpe(10.4), 10);
});

test("반올림이 0으로 떨어지면 null이다", () => {
  // 0.2 -> 0 -> null. 0을 반환하면 다시 희석이 시작된다.
  assert.equal(toStoredRpe(0.2), null);
  assert.equal(toStoredRpe(0.25), 0.5, "0.25는 0.5로 올라가 유효값이 된다");
});
