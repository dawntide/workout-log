import assert from "node:assert/strict";
import test from "node:test";
import { roundToNearest2p5 } from "./round";

test("roundToNearest2p5: exact positive halfway values round up", () => {
  assert.equal(roundToNearest2p5(1.25), 2.5);
  assert.equal(roundToNearest2p5(3.75), 5);
  assert.equal(roundToNearest2p5(6.25), 7.5);
  assert.equal(roundToNearest2p5(61.25), 62.5);
  assert.equal(roundToNearest2p5(121.25), 122.5);
});

test("roundToNearest2p5: values just below/above halfway split to opposite sides", () => {
  const eps = 1e-6;
  const cases: Array<[half: number, down: number, up: number]> = [
    [1.25, 0, 2.5],
    [3.75, 2.5, 5],
    [61.25, 60, 62.5],
    [121.25, 120, 122.5],
  ];
  for (const [half, down, up] of cases) {
    assert.equal(roundToNearest2p5(half - eps), down, `just below ${half}`);
    assert.equal(roundToNearest2p5(half + eps), up, `just above ${half}`);
  }
});

test("roundToNearest2p5: small positive inputs below the first half-step give 0", () => {
  for (const v of [Number.MIN_VALUE, 1e-9, 0.01, 1, 1.24]) {
    const out = roundToNearest2p5(v);
    assert.ok(Object.is(out, 0), `${v} -> ${out}`);
  }
});

test("roundToNearest2p5: zero, negative zero and invalid input return positive zero", () => {
  const inputs = [
    0,
    -0,
    -0.0001,
    -1,
    -2.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const v of inputs) {
    const out = roundToNearest2p5(v);
    assert.ok(Object.is(out, 0), `${String(v)} -> ${Object.is(out, -0) ? "-0" : out}`);
  }
});

test("roundToNearest2p5: exact 2.5 kg multiples are preserved", () => {
  for (let i = 0; i <= 120; i++) {
    const w = i * 2.5;
    assert.equal(roundToNearest2p5(w), w);
  }
});

test("roundToNearest2p5: every halfway point up to 300 kg rounds up", () => {
  for (let i = 0; i < 120; i++) {
    const half = i * 2.5 + 1.25;
    assert.equal(roundToNearest2p5(half), (i + 1) * 2.5, `${half}`);
  }
});

test("roundToNearest2p5: nearest-ulp neighbours of a halfway value split to opposite sides", () => {
  const half = 61.25;
  const below = half - 2 ** -47; // one ulp (2^-47 in [32, 64)) below 61.25
  const above = half + 2 ** -47;
  assert.ok(below < half && above > half);
  assert.equal(roundToNearest2p5(below), 60);
  assert.equal(roundToNearest2p5(above), 62.5);
});

test("roundToNearest2p5: values carrying floating point error land on the intended step", () => {
  assert.equal(roundToNearest2p5(0.1 + 0.2 + 59.7), 60); // 60.00000000000001
  assert.equal(roundToNearest2p5(100 * 0.7), 70); // 70.00000000000001 is a repeating-binary product
  assert.equal(roundToNearest2p5(62.49999999999999), 62.5);
  assert.equal(roundToNearest2p5(62.50000000000001), 62.5);
  assert.equal(roundToNearest2p5(142.5 * 0.8), 115); // 114.00000000000001-style percentage math
  assert.equal(roundToNearest2p5(0.85 * 100), 85);
});

test("roundToNearest2p5: very large finite values stay finite and 2.5 kg aligned", () => {
  for (const v of [1e6, 1e9, 2 ** 40, 1e15, Number.MAX_SAFE_INTEGER]) {
    const out = roundToNearest2p5(v);
    assert.ok(Number.isFinite(out), `${v} -> ${out}`);
    assert.ok(Math.abs(out - v) <= 1.25, `${v} -> ${out} is too far`);
    assert.equal(roundToNearest2p5(out), out, `${v} -> ${out} not idempotent`);
  }
  assert.equal(roundToNearest2p5(1e6 + 1.25), 1_000_002.5);
});

test("roundToNearest2p5: Number.MAX_VALUE does not overflow to Infinity", () => {
  const out = roundToNearest2p5(Number.MAX_VALUE);
  assert.ok(Number.isFinite(out), `got ${out}`);
});

test("roundToNearest2p5: output is a 2.5 kg multiple, within half a step, and idempotent", () => {
  for (let v = 0.25; v <= 300; v += 0.25) {
    const out = roundToNearest2p5(v);
    assert.equal(out % 2.5, 0, `${v} -> ${out} not a multiple of 2.5`);
    assert.ok(Math.abs(out - v) <= 1.25, `${v} -> ${out} is too far`);
    assert.equal(roundToNearest2p5(out), out, `${v} -> ${out} not idempotent`);
  }
});
