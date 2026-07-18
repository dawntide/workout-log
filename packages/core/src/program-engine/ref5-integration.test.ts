import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRef5GenerationRequest,
  selectRef5ResumableSession,
  toRef5GeneratedSnapshot,
} from "./ref5-integration";
import { createInitialRef5State, generateRef5Session } from "./ref5";

function resumableCandidate(input: {
  id: string;
  actualStartAt: string;
  status?: "PLANNED" | "DONE";
  startCommitted?: boolean;
}) {
  const sessionKey = `REF5:${input.actualStartAt}:${input.id}`;
  const domain = generateRef5Session(createInitialRef5State(), {
    sessionId: sessionKey,
    snapshotId: `${input.id}:snapshot`,
    actualStartAt: input.actualStartAt,
    timeZone: "Asia/Seoul",
    todayBodyweightKg: 75,
    recent7DayMeasurementCount: 0,
    recent7DayAverageKg: null,
    manualMicro: false,
  });
  return {
    id: input.id,
    sessionKey,
    status: input.status ?? "PLANNED",
    snapshot: toRef5GeneratedSnapshot({
      planId: "plan-1",
      planName: "REF5",
      sessionKey,
      domain,
      startEventId: input.id,
      runtimeRevisionAfter: 1,
      startCommitted: input.startCommitted ?? true,
    }),
  };
}

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

test("REF5 resume chooses the earliest unfinished committed session on the plan date", () => {
  const later = resumableCandidate({
    id: "later",
    actualStartAt: "2026-07-18T08:42:00.000Z",
  });
  const first = resumableCandidate({
    id: "first",
    actualStartAt: "2026-07-18T04:15:00.000Z",
  });
  const uncommitted = resumableCandidate({
    id: "preview-only",
    actualStartAt: "2026-07-18T03:00:00.000Z",
    startCommitted: false,
  });
  const done = resumableCandidate({
    id: "done",
    actualStartAt: "2026-07-18T02:00:00.000Z",
    status: "DONE",
  });
  const otherDate = resumableCandidate({
    id: "other-date",
    actualStartAt: "2026-07-17T04:00:00.000Z",
  });

  assert.equal(
    selectRef5ResumableSession(
      [later, otherDate, done, uncommitted, first],
      "2026-07-18",
    )?.id,
    "first",
  );
  assert.equal(selectRef5ResumableSession([otherDate], "2026-07-18"), null);
});
