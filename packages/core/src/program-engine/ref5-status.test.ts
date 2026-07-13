import assert from "node:assert/strict";
import test from "node:test";

import { createInitialRef5State } from "./ref5";
import { buildRef5Status } from "./ref5-status";

test("REF5 status exposes open-ended queues, windows, refs and caps", () => {
  const state = createInitialRef5State();
  state.mainWindows.SQ.exposures.push({
    eventId: "event-1",
    sessionId: "session-1",
    stream: "SQ_H3",
    outcome: "PASS",
  });
  state.stagnation.BP.phase = "PENDING_MICRO";
  const status = buildRef5Status(state);
  assert.equal(status.nextFocus, "PULL");
  assert.equal(status.nextSquatHard, "H3");
  assert.deepEqual(status.pendingMicro.reasons, ["STAGNATION_BP"]);
  assert.deepEqual(status.windows.SQ, {
    current: 1,
    threshold: 6,
    volumeFailures: 0,
    completed: 0,
  });
  assert.equal(status.directStandardsKg.sqH3Kg, 82.5);
  assert.equal(status.derivedStandardsKg.sqH2Kg, 87.5);
  assert.equal(status.controlRefsKg.sqKg, 104);
  assert.equal(status.auxiliaryCapsKg.ohpMaxKg, 32.5);
});
