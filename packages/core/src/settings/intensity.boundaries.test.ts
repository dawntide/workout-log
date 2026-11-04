import assert from "node:assert/strict";
import test from "node:test";
import { toDisplayIntensity, toStoredIntensity, toStoredRpe } from "./intensity";

test("toStoredRpe: quarter-step halfway values round up to the next 0.5", () => {
  assert.equal(toStoredRpe(0.25), 0.5);
  assert.equal(toStoredRpe(7.25), 7.5);
  assert.equal(toStoredRpe(7.75), 8);
  assert.equal(toStoredRpe(9.75), 10);
});

test("toStoredRpe: values just below/above the first half-step split to null/0.5", () => {
  assert.equal(toStoredRpe(0.25 - 1e-9), null);
  assert.equal(toStoredRpe(0.25 + 1e-9), 0.5);
  assert.equal(toStoredRpe(Number.MIN_VALUE), null);
});

test("toStoredRpe: clamp boundaries at 10 and non-finite input", () => {
  assert.equal(toStoredRpe(10), 10);
  assert.equal(toStoredRpe(10.25), 10);
  assert.equal(toStoredRpe(1e12), 10);
  assert.equal(toStoredRpe(Number.POSITIVE_INFINITY), null);
  assert.equal(toStoredRpe(Number.NEGATIVE_INFINITY), null);
  assert.equal(toStoredRpe(-0), null);
});

test("toStoredRpe: output is always a 0.5 multiple in (0, 10] or null", () => {
  for (let v = -1; v <= 11; v += 0.05) {
    const out = toStoredRpe(v);
    if (out === null) continue;
    assert.ok(out > 0 && out <= 10, `${v} -> ${out}`);
    assert.equal((out * 2) % 1, 0, `${v} -> ${out}`);
    assert.equal(toStoredRpe(out), out, `${v} -> ${out} not idempotent`);
  }
});

test("toStoredIntensity RIR: halfway values round up in rir, which lowers the stored rpe", () => {
  assert.equal(toStoredIntensity(0.25, "RIR"), 9.5);
  assert.equal(toStoredIntensity(0.75, "RIR"), 9);
  assert.equal(toStoredIntensity(4.75, "RIR"), 5);
});

test("toStoredIntensity RIR: clamp boundaries at 0 and 5", () => {
  assert.equal(toStoredIntensity(0, "RIR"), 10);
  assert.equal(toStoredIntensity(-0, "RIR"), 10);
  assert.equal(toStoredIntensity(-3, "RIR"), 10);
  assert.equal(toStoredIntensity(5, "RIR"), 5);
  assert.equal(toStoredIntensity(5.25, "RIR"), 5);
  assert.equal(toStoredIntensity(1e12, "RIR"), 5);
  assert.equal(toStoredIntensity(Number.POSITIVE_INFINITY, "RIR"), null);
  assert.equal(toStoredIntensity(Number.NaN, "RIR"), null);
});

test("toDisplayIntensity: tiny positive and non-finite stored values", () => {
  assert.equal(toDisplayIntensity(Number.MIN_VALUE, "RPE"), Number.MIN_VALUE);
  assert.equal(toDisplayIntensity(Number.POSITIVE_INFINITY, "RPE"), null);
  assert.equal(toDisplayIntensity(Number.NaN, "RIR"), null);
  assert.equal(toDisplayIntensity(-0, "RPE"), null);
  assert.equal(toDisplayIntensity(10, "RIR"), 0);
});
