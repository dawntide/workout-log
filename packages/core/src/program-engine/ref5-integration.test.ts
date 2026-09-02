import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRef5GenerationRequest,
  selectRef5ResumableSession,
  toRef5GeneratedSnapshot,
} from "./ref5-integration";
import {
  REF5_LEGACY_PROTOCOL_VERSION,
  REF5_PRIOR_PROTOCOL_VERSION,
  REF5_PROTOCOL_VERSION,
  createInitialRef5State,
  generateRef5Session,
} from "./ref5";

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
        protocolVersion: REF5_PROTOCOL_VERSION,
        actualStartAt: "2026-07-13T23:30:00.000Z",
        todayBodyweightKg: 75,
        manualMicro: false,
        oapSlotReverted: false,
        startEventId: "start-timezone",
      },
    },
    { timezone: "Asia/Seoul", programFamily: "ref5", protocolVersion: REF5_PROTOCOL_VERSION },
  );

  assert.equal(request.timezone, "Asia/Seoul");
  assert.equal(request.actualStartAt, "2026-07-13T23:30:00.000Z");
});

test("REF5 v1.4 rejects stale clients (v1.3 included) and every retired start input (§24.3)", () => {
  const base = {
    protocolVersion: REF5_PROTOCOL_VERSION,
    actualStartAt: "2026-07-13T23:30:00.000Z",
    todayBodyweightKg: 75,
    manualMicro: false,
    oapSlotReverted: false,
    startEventId: "start-version",
  };
  const params = {
    timezone: "Asia/Seoul",
    programFamily: "ref5",
    protocolVersion: REF5_PROTOCOL_VERSION,
  };
  for (const stale of [REF5_LEGACY_PROTOCOL_VERSION, REF5_PRIOR_PROTOCOL_VERSION]) {
    assert.throws(
      () => normalizeRef5GenerationRequest({ userId: "u", planId: "p", ref5: { ...base, protocolVersion: stale as never } }, params),
      /stale REF5 protocol version/,
      `client on ${stale} must be refused`,
    );
    // A current client against a plan still stamped with an earlier protocol is
    // equally stale — that plan is archived, never upgraded in place.
    assert.throws(
      () => normalizeRef5GenerationRequest(
        { userId: "u", planId: "p", ref5: base },
        { ...params, protocolVersion: stale },
      ),
      /stale REF5 protocol version/,
      `plan on ${stale} must be refused`,
    );
  }
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
