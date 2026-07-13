import assert from "node:assert/strict";
import test from "node:test";

import { parseDatabaseDate, requireDatabaseDate } from "./date";

test("parseDatabaseDate normalizes SQL aggregate timestamp strings", () => {
  const value = parseDatabaseDate("2026-07-03T12:34:56.000Z");

  assert.ok(value instanceof Date);
  assert.equal(value.toISOString(), "2026-07-03T12:34:56.000Z");
});

test("parseDatabaseDate clones Date values and preserves null", () => {
  const source = new Date("2026-07-03T12:34:56.000Z");
  const parsed = parseDatabaseDate(source);

  assert.ok(parsed instanceof Date);
  assert.notEqual(parsed, source);
  assert.equal(parsed.getTime(), source.getTime());
  assert.equal(parseDatabaseDate(null), null);
});

test("requireDatabaseDate rejects invalid driver values", () => {
  assert.throws(
    () => requireDatabaseDate("not-a-date", "plan.createdAt"),
    /plan\.createdAt is not a valid database date/,
  );
});
