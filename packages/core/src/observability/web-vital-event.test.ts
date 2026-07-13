import assert from "node:assert/strict";
import test from "node:test";

import {
  ANONYMOUS_WEB_VITAL_USER_ID,
  normalizePublicWebVitalEvent,
} from "./web-vital-event";

const now = new Date("2026-07-13T03:00:00.000Z");

function validEvent() {
  return {
    id: "evt_12345678",
    name: "web_vital",
    recordedAt: "2026-07-13T02:59:00.000Z",
    props: {
      id: "metric-id-is-not-persisted",
      metric: "LCP",
      value: 1234.56,
      rating: "good",
      navigationType: "navigate",
      route: "/login",
      arbitrary: "drop-me",
    },
  };
}

test("normalizes a privacy-minimized anonymous Web Vital event", () => {
  const normalized = normalizePublicWebVitalEvent(validEvent(), now);

  assert.deepEqual(normalized, {
    id: "evt_12345678",
    name: "web_vital",
    recordedAt: "2026-07-13T02:59:00.000Z",
    props: {
      metric: "LCP",
      value: 1234.56,
      rating: "good",
      navigationType: "navigate",
      route: "/login",
    },
  });
  assert.equal(ANONYMOUS_WEB_VITAL_USER_ID, "__anonymous_web_vitals__");
});

test("rejects business events and routes containing query data", () => {
  assert.equal(
    normalizePublicWebVitalEvent({ ...validEvent(), name: "signup" }, now),
    null,
  );
  assert.equal(
    normalizePublicWebVitalEvent(
      {
        ...validEvent(),
        props: { ...validEvent().props, route: "/reset-password?token=secret" },
      },
      now,
    ),
    null,
  );
});

test("rejects stale, future, non-finite, and unsupported metrics", () => {
  assert.equal(
    normalizePublicWebVitalEvent(
      { ...validEvent(), recordedAt: "2026-06-01T00:00:00.000Z" },
      now,
    ),
    null,
  );
  assert.equal(
    normalizePublicWebVitalEvent(
      { ...validEvent(), recordedAt: "2026-07-13T04:00:00.000Z" },
      now,
    ),
    null,
  );
  assert.equal(
    normalizePublicWebVitalEvent(
      { ...validEvent(), props: { ...validEvent().props, value: Number.NaN } },
      now,
    ),
    null,
  );
  assert.equal(
    normalizePublicWebVitalEvent(
      { ...validEvent(), props: { ...validEvent().props, metric: "custom" } },
      now,
    ),
    null,
  );
});
