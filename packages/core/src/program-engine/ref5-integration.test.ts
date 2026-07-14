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
        protocolVersion: "1.2",
        actualStartAt: "2026-07-13T23:30:00.000Z",
        todayBodyweightKg: 75,
        manualMicro: false,
        startEventId: "start-timezone",
      },
    },
    { timezone: "Asia/Seoul", programFamily: "ref5", protocolVersion: "1.2" },
  );

  assert.equal(request.timezone, "Asia/Seoul");
  assert.equal(request.actualStartAt, "2026-07-13T23:30:00.000Z");
});

test("REF5 v1.2 rejects stale clients and every retired start input", () => {
  const base = {
    protocolVersion: "1.2" as const,
    actualStartAt: "2026-07-13T23:30:00.000Z",
    todayBodyweightKg: 75,
    manualMicro: false,
    startEventId: "start-version",
  };
  const params = { timezone: "Asia/Seoul", programFamily: "ref5", protocolVersion: "1.2" };
  assert.throws(
    () => normalizeRef5GenerationRequest({ userId: "u", planId: "p", ref5: { ...base, protocolVersion: "1.1" as never } }, params),
    /stale REF5 protocol version/,
  );
  for (const key of [
    "climb",
    "climbing",
    "climbingWithin48h",
    "strongClimbing",
    "pullFallback",
    "substitute",
    "substitution",
    "omitPullVolume",
    "omitted",
    "omittedPrescriptions",
  ]) {
    assert.throws(
      () => normalizeRef5GenerationRequest({
        userId: "u",
        planId: "p",
        ref5: { ...base, [key]: false },
      }, params),
      /stale REF5 protocol version/,
    );
  }
});
