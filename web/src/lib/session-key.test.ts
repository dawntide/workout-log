import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionKey,
  extractSessionDate,
  formatSessionKeyLabel,
  parseSessionKey,
} from "./session-key";

test("buildSessionKey keeps legacy date key when auto progression is disabled", () => {
  assert.equal(
    buildSessionKey({
      mode: "DATE",
      sessionDate: "2026-03-06",
      week: 2,
      day: 1,
      autoProgression: false,
    }),
    "2026-03-06",
  );
});

test("buildSessionKey appends cycle/week/day for auto progression date sessions", () => {
  assert.equal(
    buildSessionKey({
      mode: "DATE",
      sessionDate: "2026-03-06",
      cycle: 1,
      week: 2,
      day: 1,
      autoProgression: true,
    }),
    "2026-03-06@C1W2D1",
  );
});

test("buildSessionKey appends cycle/week/day for auto progression wave sessions", () => {
  assert.equal(
    buildSessionKey({
      mode: "PROGRESSION",
      sessionDate: "2026-03-06",
      cycle: 2,
      week: 1,
      day: 1,
      autoProgression: true,
    }),
    "C2W1D1",
  );
});

test("parseSessionKey supports legacy and progression-aware formats", () => {
  assert.deepEqual(parseSessionKey("2026-03-06"), {
    raw: "2026-03-06",
    kind: "date",
    sessionDate: "2026-03-06",
    cycle: null,
    week: null,
    day: null,
  });

  assert.deepEqual(parseSessionKey("W4D2"), {
    raw: "W4D2",
    kind: "wave",
    sessionDate: null,
    cycle: null,
    week: 4,
    day: 2,
  });

  assert.deepEqual(parseSessionKey("2026-03-06@C1W2D1"), {
    raw: "2026-03-06@C1W2D1",
    kind: "date-progression",
    sessionDate: "2026-03-06",
    cycle: 1,
    week: 2,
    day: 1,
  });

  assert.deepEqual(parseSessionKey("C2W1D1"), {
    raw: "C2W1D1",
    kind: "cycle-wave",
    sessionDate: null,
    cycle: 2,
    week: 1,
    day: 1,
  });
});

test("session key helpers expose readable labels and session dates", () => {
  assert.equal(extractSessionDate("2026-03-06@C1W2D1"), "2026-03-06");
  assert.equal(formatSessionKeyLabel("2026-03-06@C1W2D1"), "2026-03-06 · C1W2D1");
  assert.equal(formatSessionKeyLabel("W4D2"), "W4D2");
  assert.equal(formatSessionKeyLabel("C2W1D1"), "C2W1D1");
});
