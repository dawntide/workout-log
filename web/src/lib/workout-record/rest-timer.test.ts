import assert from "node:assert/strict";
import test from "node:test";
import {
  elapsedSeconds,
  formatRestClock,
  isExpired,
  parseRestTimerState,
  progressRatio,
  remainingSeconds,
  type RestTimerState,
} from "./rest-timer";

const T0 = 1_700_000_000_000;
const base: RestTimerState = {
  exerciseId: "ex-1",
  setIndex: 0,
  startedAtMs: T0,
  targetSeconds: 90,
};

test("remainingSeconds derives from the timestamp difference, never a counter", () => {
  assert.equal(remainingSeconds(base, T0), 90);
  assert.equal(remainingSeconds(base, T0 + 1_000), 89);
  assert.equal(remainingSeconds(base, T0 + 89_500), 1);
  assert.equal(remainingSeconds(base, T0 + 90_000), 0);
});

test("remainingSeconds clamps at zero after expiry instead of going negative", () => {
  assert.equal(remainingSeconds(base, T0 + 120_000), 0);
  // 백그라운드에서 5분 점프해도 음수로 흐르지 않는다.
  assert.equal(remainingSeconds(base, T0 + 300_000), 0);
});

test("remainingSeconds ignores a clock that moves backwards", () => {
  assert.equal(remainingSeconds(base, T0 - 5_000), 90);
});

test("elapsedSeconds counts up from the start timestamp", () => {
  assert.equal(elapsedSeconds(base, T0), 0);
  assert.equal(elapsedSeconds(base, T0 + 45_000), 45);
  assert.equal(elapsedSeconds(base, T0 - 1_000), 0);
});

test("isExpired flips exactly at the target", () => {
  assert.equal(isExpired(base, T0 + 89_999), false);
  assert.equal(isExpired(base, T0 + 90_000), true);
});

test("progressRatio stays within 0..1 and handles a zero target", () => {
  assert.equal(progressRatio(base, T0), 0);
  assert.equal(progressRatio(base, T0 + 45_000), 0.5);
  assert.equal(progressRatio(base, T0 + 200_000), 1);
  assert.equal(progressRatio({ ...base, targetSeconds: 0 }, T0), 1);
});

test("formatRestClock renders M:SS and pads seconds", () => {
  assert.equal(formatRestClock(0), "0:00");
  assert.equal(formatRestClock(5), "0:05");
  assert.equal(formatRestClock(90), "1:30");
  assert.equal(formatRestClock(600), "10:00");
});

test("formatRestClock clamps negatives and non-finite input", () => {
  assert.equal(formatRestClock(-30), "0:00");
  assert.equal(formatRestClock(Number.NaN), "0:00");
});

test("parseRestTimerState restores a live timer", () => {
  const restored = parseRestTimerState(
    { exerciseId: "ex-1", setIndex: 2, startedAtMs: T0, targetSeconds: 90 },
    T0 + 30_000,
  );
  assert.deepEqual(restored, {
    exerciseId: "ex-1",
    setIndex: 2,
    startedAtMs: T0,
    targetSeconds: 90,
  });
});

test("parseRestTimerState drops an already expired timer", () => {
  const restored = parseRestTimerState(
    { exerciseId: "ex-1", setIndex: 0, startedAtMs: T0, targetSeconds: 90 },
    T0 + 90_000,
  );
  assert.equal(restored, null);
});

test("parseRestTimerState rejects malformed and future-dated payloads", () => {
  assert.equal(parseRestTimerState(null, T0), null);
  assert.equal(parseRestTimerState("nope", T0), null);
  assert.equal(parseRestTimerState({}, T0), null);
  assert.equal(
    parseRestTimerState({ exerciseId: "", setIndex: 0, startedAtMs: T0, targetSeconds: 90 }, T0),
    null,
  );
  assert.equal(
    parseRestTimerState({ exerciseId: "ex", setIndex: -1, startedAtMs: T0, targetSeconds: 90 }, T0),
    null,
  );
  assert.equal(
    parseRestTimerState({ exerciseId: "ex", setIndex: 0, startedAtMs: T0, targetSeconds: 0 }, T0),
    null,
  );
  // 시계가 되감겼거나 손상된 값
  assert.equal(
    parseRestTimerState(
      { exerciseId: "ex", setIndex: 0, startedAtMs: T0 + 10_000, targetSeconds: 90 },
      T0,
    ),
    null,
  );
});
