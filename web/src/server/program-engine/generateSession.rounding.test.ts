import assert from "node:assert/strict";
import test from "node:test";
import { roundUpToNearest2p5 } from "./round";

// Operator W1 70% scheme — historical TB Operator practice rounds prescribed
// weights to whole 2.5 kg plates. With round-to-nearest, a 2.5 kg TM bump
// from 95 → 97.5 produces 66.5 → 68.25 which both fall on 67.5 — so users see
// no change after a full cycle and (correctly) suspect the increment did not
// apply. We round up so the bar shows new weight whenever TM moves up.
test("roundUpToNearest2p5: Operator W1 reflects +2.5 kg TM bump as visible plate change", () => {
  // Cycle 1 with TM 95 kg — bar at 67.5 kg.
  assert.equal(roundUpToNearest2p5(95 * 0.7), 67.5);
  // Cycle 2 with TM 97.5 kg — bar must move to 70 kg (was 67.5 under round-nearest).
  assert.equal(roundUpToNearest2p5(97.5 * 0.7), 70);
});

test("roundUpToNearest2p5: Operator W6 reflects +2.5 kg TM bump", () => {
  // 95 × 0.95 = 90.25
  assert.equal(roundUpToNearest2p5(95 * 0.95), 92.5);
  // 97.5 × 0.95 = 92.625
  assert.equal(roundUpToNearest2p5(97.5 * 0.95), 95);
});

test("roundUpToNearest2p5: clean multiples are preserved", () => {
  assert.equal(roundUpToNearest2p5(70), 70);
  assert.equal(roundUpToNearest2p5(150 * 0.7), 105);
  assert.equal(roundUpToNearest2p5(0), 0);
});

test("roundUpToNearest2p5: non-finite / negative input returns 0", () => {
  assert.equal(roundUpToNearest2p5(Number.NaN), 0);
  assert.equal(roundUpToNearest2p5(-1), 0);
  assert.equal(roundUpToNearest2p5(Number.POSITIVE_INFINITY), 0);
});
