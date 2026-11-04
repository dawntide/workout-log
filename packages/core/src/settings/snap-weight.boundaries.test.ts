import assert from "node:assert/strict";
import test from "node:test";
import { snapWeightToIncrementKg } from "./workout-preferences";

test("snapWeightToIncrementKg: exact halfway values round up", () => {
  assert.equal(snapWeightToIncrementKg(1.25, 2.5), 2.5);
  assert.equal(snapWeightToIncrementKg(3.75, 2.5), 5);
  assert.equal(snapWeightToIncrementKg(0.625, 1.25), 1.25);
  assert.equal(snapWeightToIncrementKg(2.5, 5), 5);
  assert.equal(snapWeightToIncrementKg(7.5, 5), 10);
});

test("snapWeightToIncrementKg: values just below/above halfway split to opposite sides", () => {
  const eps = 1e-6;
  assert.equal(snapWeightToIncrementKg(1.25 - eps, 2.5), 0);
  assert.equal(snapWeightToIncrementKg(1.25 + eps, 2.5), 2.5);
  assert.equal(snapWeightToIncrementKg(61.25 - eps, 2.5), 60);
  assert.equal(snapWeightToIncrementKg(61.25 + eps, 2.5), 62.5);
});

test("snapWeightToIncrementKg: zero, negative and non-finite weights snap to 0", () => {
  for (const v of [0, -0, -1, -2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const out = snapWeightToIncrementKg(v, 2.5);
    assert.ok(Object.is(out, 0), `${String(v)} -> ${Object.is(out, -0) ? "-0" : out}`);
  }
});

test("snapWeightToIncrementKg: fractional increments do not leak floating point noise", () => {
  assert.equal(snapWeightToIncrementKg(0.3, 0.25), 0.25);
  assert.equal(snapWeightToIncrementKg(0.1 + 0.2, 0.25), 0.25);
  assert.equal(snapWeightToIncrementKg(0.4, 0.25), 0.5);
  assert.equal(snapWeightToIncrementKg(100 * 0.7, 1.25), 70);
  assert.equal(snapWeightToIncrementKg(1.1, 0.5), 1);
  // 0.7 * 3 = 2.0999999999999996 style products must come out clean at 2 decimals
  for (let i = 0; i <= 400; i++) {
    const out = snapWeightToIncrementKg(i * 0.25, 0.25);
    assert.equal(out, i * 0.25, `${i * 0.25}`);
    assert.equal(out, Math.round(out * 100) / 100);
  }
});

test("snapWeightToIncrementKg: invalid increments fall back instead of dividing by zero", () => {
  // normalizeIncrementKg clamps finite values into [0.25, 25] and falls back to 2.5 otherwise
  assert.equal(snapWeightToIncrementKg(61, Number.NaN), 60);
  assert.equal(snapWeightToIncrementKg(61, 0), 61);
  assert.equal(snapWeightToIncrementKg(61, -5), 61);
  assert.equal(snapWeightToIncrementKg(61, Number.POSITIVE_INFINITY), 60);
  assert.equal(snapWeightToIncrementKg(61, 1000), 50);
  assert.ok(Number.isFinite(snapWeightToIncrementKg(61, Number.NaN)));
});

test("snapWeightToIncrementKg: very large weights stay finite and increment aligned", () => {
  for (const v of [1e6, 1e9, 1e15]) {
    const out = snapWeightToIncrementKg(v, 2.5);
    assert.ok(Number.isFinite(out), `${v} -> ${out}`);
    assert.ok(Math.abs(out - v) <= 1.25, `${v} -> ${out}`);
  }
});

test("snapWeightToIncrementKg: output is idempotent", () => {
  for (const inc of [0.25, 0.5, 1, 1.25, 2.5, 5]) {
    for (let v = 0; v <= 200; v += 0.37) {
      const out = snapWeightToIncrementKg(v, inc);
      assert.equal(snapWeightToIncrementKg(out, inc), out, `${v} @ ${inc} -> ${out}`);
    }
  }
});
