import assert from "node:assert/strict";
import test from "node:test";

import { extractSessionDateInTimezone, sessionKeyToWDLabel } from "./format";

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
