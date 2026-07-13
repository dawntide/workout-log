import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRef5GenerationRequest } from "./ref5-integration";

test("REF5 generation always uses the plan timezone, never the caller timezone", () => {
  const request = normalizeRef5GenerationRequest(
    {
      userId: "user-1",
      planId: "plan-1",
      timezone: "America/New_York",
      ref5: {
        actualStartAt: "2026-07-13T23:30:00.000Z",
        todayBodyweightKg: 75,
        manualMicro: false,
        climbingWithin48h: false,
        startEventId: "start-timezone",
      },
    },
    { timezone: "Asia/Seoul", programFamily: "ref5" },
  );

  assert.equal(request.timezone, "Asia/Seoul");
  assert.equal(request.actualStartAt, "2026-07-13T23:30:00.000Z");
});
