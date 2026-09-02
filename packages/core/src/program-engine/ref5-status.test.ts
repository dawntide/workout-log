import assert from "node:assert/strict";
import test from "node:test";

import { createInitialRef5State, normalizeRef5StartConfig } from "./ref5";
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
    increases: 0,
    gainRate: null,
    recentResults: [],
  });
  assert.equal(status.directStandardsKg.sqH3Kg, 82.5);
  assert.equal(status.derivedStandardsKg.sqH2Kg, 87.5);
  assert.equal(status.controlRefsKg.sqKg, 104);
  assert.equal(status.auxiliaryCapsKg.ohpMaxKg, 32.5);
});

test("REF5 status surfaces §18 gain rate and the recent window flow", () => {
  const state = createInitialRef5State();
  state.mainWindows.SQ.completedWindowCount = 3;
  state.mainWindows.SQ.increaseWindowCount = 2;
  state.mainWindows.SQ.recentResults = ["INCREASE", "MAINTAIN", "INCREASE"];
  const status = buildRef5Status(state);
  assert.equal(status.windows.SQ.completed, 3);
  assert.equal(status.windows.SQ.increases, 2);
  assert.equal(status.windows.SQ.gainRate, 2 / 3);
  assert.deepEqual(status.windows.SQ.recentResults, ["INCREASE", "MAINTAIN", "INCREASE"]);
  // No completed window yet → gain rate is null (not 0/0), flow empty.
  assert.equal(status.windows.BP.gainRate, null);
  assert.deepEqual(status.windows.BP.recentResults, []);
});

test("REF5 status defaults gain-rate counters that a pre-gain-rate cached state omits", () => {
  const state = createInitialRef5State();
  const legacyWindow = state.mainWindows.SQ as { completedWindowCount: number; increaseWindowCount?: number; recentResults?: unknown };
  legacyWindow.completedWindowCount = 2;
  delete legacyWindow.increaseWindowCount;
  delete legacyWindow.recentResults;
  const status = buildRef5Status(state);
  assert.equal(status.windows.SQ.increases, 0);
  assert.equal(status.windows.SQ.gainRate, 0);
  assert.deepEqual(status.windows.SQ.recentResults, []);
});

test("REF5 status before the first session uses the plan's custom starts", () => {
  const starts = {
    sqH3Kg: 90,
    bpFocusKg: 90,
    pullFocusTotalKg: 100,
    deadliftKg: 80,
    ohpKg: 35,
  };
  const status = buildRef5Status(null, normalizeRef5StartConfig(starts));
  assert.deepEqual(status.directStandardsKg, starts);
  assert.equal(status.revision, 0);
  assert.equal(status.auxiliaryCapsKg.deadliftMaxKg, 80);
  assert.equal(status.auxiliaryCapsKg.ohpMaxKg, 35);
});
