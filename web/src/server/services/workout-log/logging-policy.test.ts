import test from "node:test";
import assert from "node:assert/strict";
import { shouldBlockAutoProgressionNewLog } from "./logging-policy";

test("auto-progression new logs are allowed on past dates when there are no later logs", () => {
  assert.equal(
    shouldBlockAutoProgressionNewLog({
      planAutoProgression: true,
      hasExistingLogForDate: false,
      hasLaterLogs: false,
    }),
    false,
  );
});

test("auto-progression new logs are blocked only when later logs already exist", () => {
  assert.equal(
    shouldBlockAutoProgressionNewLog({
      planAutoProgression: true,
      hasExistingLogForDate: false,
      hasLaterLogs: true,
    }),
    true,
  );
});

test("existing logs can be loaded even when later logs exist", () => {
  assert.equal(
    shouldBlockAutoProgressionNewLog({
      planAutoProgression: true,
      hasExistingLogForDate: true,
      hasLaterLogs: true,
    }),
    false,
  );
});
