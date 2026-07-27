import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSessionDateInTimezone,
  ref5SessionLabelFromSnapshot,
  sessionKeyToWDLabel,
} from "./format";

test("REF5 session keys map to the plan-timezone date of their actual start", () => {
  // REF5:<actualStartAt ISO>:<startEventId> — the instant decides the calendar day.
  const key = "REF5:2026-07-13T01:00:00.000Z:start-1";
  assert.equal(extractSessionDateInTimezone(key, "Asia/Seoul"), "2026-07-13");
  // 01:00Z is still the previous day in UTC-05.
  assert.equal(extractSessionDateInTimezone(key, "America/New_York"), "2026-07-12");
  // A start event id containing colons must not break the ISO extraction.
  assert.equal(
    extractSessionDateInTimezone("REF5:2026-07-13T01:00:00.000Z:start:retry:2", "Asia/Seoul"),
    "2026-07-13",
  );
});

test("non-REF5 session keys keep their existing date extraction", () => {
  assert.equal(extractSessionDateInTimezone("2026-07-13", "Asia/Seoul"), "2026-07-13");
  assert.equal(
    extractSessionDateInTimezone("2026-07-13@C1W2D3", "Asia/Seoul"),
    "2026-07-13",
  );
  // Wave keys carry no date at all.
  assert.equal(extractSessionDateInTimezone("W1D1", "Asia/Seoul"), null);
  assert.equal(extractSessionDateInTimezone("", "Asia/Seoul"), null);
});

test("REF5 session keys never render a week/day label (§18)", () => {
  assert.equal(sessionKeyToWDLabel("REF5:2026-07-13T01:00:00.000Z:start-1"), null);
  // Other programs still get their W#D# / C#W#D# labels.
  assert.equal(sessionKeyToWDLabel("W2D3"), "W2D3");
  assert.equal(sessionKeyToWDLabel("C1W2D3"), "C1W2D3");
});

test("REF5 snapshot decision composes the session identity label", () => {
  // Stored generated snapshot: top-level sessionType + ref5.decision (schema 4).
  assert.equal(
    ref5SessionLabelFromSnapshot({
      sessionType: "NORMAL",
      ref5: { decision: { sessionType: "NORMAL", squatPrescription: "H2", focus: "BP" } },
    }),
    "NORMAL · SQ H2 · BP",
  );
  // MICRO keeps the same shape (focus still recorded by the decision).
  assert.equal(
    ref5SessionLabelFromSnapshot({
      sessionType: "MICRO",
      ref5: { decision: { sessionType: "MICRO", squatPrescription: "V", focus: "PULL" } },
    }),
    "MICRO · SQ V · PULL",
  );
  // Decision-only snapshots (preview shape) still resolve the mode.
  assert.equal(
    ref5SessionLabelFromSnapshot({
      decision: { sessionType: "NORMAL", squatPrescription: "H3", focus: "BP" },
    }),
    "NORMAL · SQ H3 · BP",
  );
  // Partial data degrades to whatever is known; nothing known → null.
  assert.equal(ref5SessionLabelFromSnapshot({ sessionType: "NORMAL" }), "NORMAL");
  assert.equal(ref5SessionLabelFromSnapshot({}), null);
  assert.equal(ref5SessionLabelFromSnapshot(null), null);
});
