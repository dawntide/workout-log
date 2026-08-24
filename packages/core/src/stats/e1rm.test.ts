import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { estimateE1rmKg } from "./e1rm";

test("a single rep returns the weight itself, not an Epley bump", () => {
  // Epley를 그대로 쓰면 103.33이 된다 — 1회 든 무게의 1RM은 정의상 그 무게다.
  assert.equal(estimateE1rmKg(100, 1), 100);
  assert.equal(estimateE1rmKg(142.5, 1), 142.5);
});

test("reps above 15 are clamped because Epley loses accuracy", () => {
  const at15 = estimateE1rmKg(100, 15);
  assert.equal(estimateE1rmKg(100, 20), at15);
  assert.equal(estimateE1rmKg(100, 100), at15);
});

test("non-positive and non-finite input returns zero", () => {
  assert.equal(estimateE1rmKg(0, 5), 0);
  assert.equal(estimateE1rmKg(-100, 5), 0);
  assert.equal(estimateE1rmKg(100, 0), 0);
  assert.equal(estimateE1rmKg(100, -3), 0);
  assert.equal(estimateE1rmKg(Number.NaN, 5), 0);
  assert.equal(estimateE1rmKg(100, Number.NaN), 0);
});

test("the estimate rises monotonically with reps up to the clamp", () => {
  let previous = 0;
  for (let reps = 1; reps <= 15; reps += 1) {
    const current = estimateE1rmKg(100, reps);
    assert.ok(current >= previous, `reps=${reps} dropped below reps=${reps - 1}`);
    previous = current;
  }
});
