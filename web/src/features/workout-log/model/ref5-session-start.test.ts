import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRef5GeneratePayload,
  describeRef5HardGate,
  formatRef5Duration,
  summarizeRef5Preview,
} from "../ui/ref5-session-start-panel";
import { isRef5PlanParams } from "@/lib/workout-record/ref5-plan";
import { REF5_PROTOCOL_VERSION } from "@workout/core/program-engine/ref5-protocol-version";

test("REF5 plan detection accepts the family marker or immutable REF5 params", () => {
  assert.equal(isRef5PlanParams({ programFamily: "ref5" }), true);
  assert.equal(isRef5PlanParams({ ref5: { protocolVersion: "1.1" } }), true);
  assert.equal(isRef5PlanParams({ programFamily: "asymptote" }), false);
  assert.equal(isRef5PlanParams(null), false);
});

test("preview and start share one stable REF5 input envelope", () => {
  const values = {
    protocolVersion: REF5_PROTOCOL_VERSION,
    actualStartAt: "2026-07-13T03:04:05.000Z",
    bodyweightKg: 81.2,
    manualMicro: true,
    oapSlotReverted: false,
    startEventId: "start-event-1",
  } as const;

  assert.deepEqual(buildRef5GeneratePayload(true, values), {
    preview: true,
    ref5: values,
  });
  assert.deepEqual(buildRef5GeneratePayload(false, values), {
    preview: false,
    ref5: values,
  });
});

test("preview summary reads the REF5 snapshot contract", () => {
  const summary = summarizeRef5Preview({
    id: "preview-only",
    planId: "plan-1",
    sessionKey: "ref5:preview:start-event-1",
    snapshot: {
      decision: {
        sessionType: "MICRO",
        microReasons: ["MANUAL", "DENSITY"],
        focus: "PULL",
        squatPrescription: "V",
      },
      totalWorkingSets: 4,
      exercises: [
        {
          lift: "SQ",
          exerciseName: "Back Squat",
          sets: [
            { setNumber: 1, plannedReps: 5, externalLoadKg: 72.5 },
            { setNumber: 2, plannedReps: 5, externalLoadKg: 72.5 },
          ],
        },
        {
          lift: "PULL",
          exerciseName: "Weighted Pull-up",
          sets: [{ setNumber: 1, plannedReps: 6, externalLoadKg: 0 }],
        },
      ],
    },
  });

  assert.equal(summary.mode, "MICRO");
  assert.equal(summary.squat, "V");
  assert.equal(summary.focus, "PULL");
  assert.deepEqual(summary.reasons, ["MANUAL", "DENSITY"]);
  // 엔진이 동결한 totalWorkingSets가 정본이다 — 운동 행 합산이 아니다.
  assert.equal(summary.setCount, 4);
  assert.deepEqual(summary.exercises, [
    { name: "Back Squat", prescription: "2 × 5 · 72.5 kg" },
    { name: "Weighted Pull-up", prescription: "1 × 6 · 0 kg" },
  ]);
});

test("v1.3 preview contains the complete ten-set PULL-focus prescription", () => {
  const summary = summarizeRef5Preview({
    id: "preview-v13",
    planId: "plan-1",
    sessionKey: "ref5:preview:v13",
    snapshot: {
      ref5: {
        decision: { sessionType: "NORMAL", focus: "PULL", squatPrescription: "H3" },
      },
      exercises: [
        { exerciseName: "Back Squat", sets: Array.from({ length: 3 }, () => ({ plannedReps: 3, externalLoadKg: 82.5 })) },
        { exerciseName: "Weighted Pull-Up", sets: Array.from({ length: 3 }, () => ({ plannedReps: 3, externalLoadKg: 12.5 })) },
        // v1.3 normal BP volume is two sets (§7.2).
        { exerciseName: "Bench Press", sets: Array.from({ length: 2 }, () => ({ plannedReps: 5, externalLoadKg: 70 })) },
        { exerciseName: "Deadlift", sets: Array.from({ length: 2 }, () => ({ plannedReps: 4, externalLoadKg: 72.5 })) },
      ],
    },
  });

  assert.equal(summary.setCount, 10);
  assert.deepEqual(summary.exercises.map((exercise) => exercise.name), [
    "Back Squat",
    "Weighted Pull-Up",
    "Bench Press",
    "Deadlift",
  ]);
  assert.equal(JSON.stringify(summary).includes("climb"), false);
  // 게이트 근거가 없는 스냅샷에서는 하드 판정 블록 자체를 그리지 않는다.
  assert.equal(summary.hard, null);
  assert.equal(describeRef5HardGate(summary), null);
});

const HOUR = 60 * 60 * 1000;

test("preview summary carries the §9 hard-gate evidence for the start screen", () => {
  const summary = summarizeRef5Preview({
    id: "preview-gate",
    planId: "plan-1",
    sessionKey: "ref5:preview:gate",
    snapshot: {
      ref5: {
        actualStartAt: "2026-08-05T10:00:00.000Z",
        decision: {
          sessionType: "NORMAL",
          focus: "BP",
          squatPrescription: "V",
          hard: {
            allowed: false,
            lastStartAt: "2026-08-04T10:00:00.000Z",
            startsIn168Hours: 1,
          },
        },
      },
      exercises: [],
    },
  });

  assert.deepEqual(summary.hard, {
    allowed: false,
    lastStartAt: "2026-08-04T10:00:00.000Z",
    startsIn168Hours: 1,
  });
  assert.equal(summary.actualStartAt, "2026-08-05T10:00:00.000Z");

  const gate = describeRef5HardGate(summary);
  assert.ok(gate);
  // 판정은 서버 값 그대로. 경과/잔여 시간만 UI가 파생한다.
  assert.equal(gate.allowed, false);
  assert.equal(gate.micro, false);
  assert.equal(gate.elapsedMs, 24 * HOUR);
  assert.equal(gate.elapsedMet, false);
  assert.equal(gate.remainingMs, 24 * HOUR);
  assert.equal(gate.startsIn168Hours, 1);
  assert.equal(gate.densityMet, true);
});

test("the displayed 48-hour boundary matches the engine exactly", () => {
  const lastStartAt = "2026-08-03T10:00:00.000Z";
  const gateAfter = (elapsedMs: number) =>
    describeRef5HardGate({
      mode: "NORMAL",
      actualStartAt: new Date(Date.parse(lastStartAt) + elapsedMs).toISOString(),
      hard: { allowed: true, lastStartAt, startsIn168Hours: 0 },
    });

  assert.equal(gateAfter(48 * HOUR)?.elapsedMet, true);
  assert.equal(gateAfter(48 * HOUR)?.remainingMs, null);
  assert.equal(gateAfter(48 * HOUR - 1)?.elapsedMet, false);
  assert.equal(gateAfter(48 * HOUR - 1)?.remainingMs, 1);
});

test("hard-gate view explains the first hard, the density cap, and micro sessions", () => {
  const firstEver = describeRef5HardGate({
    mode: "NORMAL",
    actualStartAt: "2026-08-05T10:00:00.000Z",
    hard: { allowed: true, lastStartAt: null, startsIn168Hours: 0 },
  });
  assert.equal(firstEver?.elapsedMet, true);
  assert.equal(firstEver?.elapsedMs, null);
  assert.equal(firstEver?.remainingMs, null);

  const dense = describeRef5HardGate({
    mode: "NORMAL",
    actualStartAt: "2026-08-05T10:00:00.000Z",
    hard: { allowed: false, lastStartAt: "2026-08-01T10:00:00.000Z", startsIn168Hours: 2 },
  });
  assert.equal(dense?.elapsedMet, true);
  assert.equal(dense?.densityMet, false);
  assert.equal(dense?.allowed, false);

  const micro = describeRef5HardGate({
    mode: "MICRO",
    actualStartAt: "2026-08-05T10:00:00.000Z",
    hard: { allowed: false, lastStartAt: "2026-08-01T10:00:00.000Z", startsIn168Hours: 0 },
  });
  assert.equal(micro?.micro, true);
  assert.equal(micro?.allowed, false);
});

test("gate durations read as whole hours and minutes in both locales", () => {
  assert.equal(formatRef5Duration(36 * HOUR + 12 * 60_000, "ko"), "36시간 12분");
  assert.equal(formatRef5Duration(36 * HOUR + 12 * 60_000, "en"), "36h 12m");
  assert.equal(formatRef5Duration(45 * 60_000, "ko"), "45분");
  assert.equal(formatRef5Duration(45 * 60_000, "en"), "45m");
  // 좁은 화면에서 줄바꿈을 유발하던 "72시간 0분"은 시간만 남긴다.
  assert.equal(formatRef5Duration(72 * HOUR, "ko"), "72시간");
  assert.equal(formatRef5Duration(72 * HOUR, "en"), "72h");
  assert.equal(formatRef5Duration(-1, "ko"), "0분");
});

test("the §7.6 revert rides the same immutable envelope as every other start input", () => {
  const reverted = {
    protocolVersion: REF5_PROTOCOL_VERSION,
    actualStartAt: "2026-07-13T03:04:05.000Z",
    bodyweightKg: 81.2,
    manualMicro: false,
    oapSlotReverted: true,
    startEventId: "start-event-2",
  } as const;

  // Preview and start must send byte-identical inputs: a retry that changed the
  // revert would hand back a snapshot prescribing a different third slot.
  assert.deepEqual(buildRef5GeneratePayload(true, reverted).ref5, reverted);
  assert.deepEqual(buildRef5GeneratePayload(false, reverted).ref5, reverted);
});

test("preview set count counts the OAP pair once, as the engine does (§7.3)", () => {
  const summary = summarizeRef5Preview({
    id: "preview-oap",
    planId: "plan-1",
    sessionKey: "ref5:preview:start-event-oap",
    snapshot: {
      decision: {
        sessionType: "NORMAL",
        microReasons: [],
        focus: "BP",
        squatPrescription: "H3",
      },
      // 좌/우가 각각 2세트라 행 합산은 12가 되지만, 페어 회계로는 10이다.
      totalWorkingSets: 10,
      exercises: [
        {
          lift: "SQ",
          exerciseName: "High-Bar Back Squat",
          sets: [
            { setNumber: 1, plannedReps: 3, externalLoadKg: 82.5 },
            { setNumber: 2, plannedReps: 3, externalLoadKg: 82.5 },
            { setNumber: 3, plannedReps: 3, externalLoadKg: 82.5 },
          ],
        },
        {
          lift: "BP",
          exerciseName: "Bench Press",
          sets: [
            { setNumber: 1, plannedReps: 3, externalLoadKg: 82.5 },
            { setNumber: 2, plannedReps: 3, externalLoadKg: 82.5 },
            { setNumber: 3, plannedReps: 3, externalLoadKg: 82.5 },
          ],
        },
        {
          lift: "OAP",
          exerciseName: "Assisted OAP · Left",
          sets: [
            { setNumber: 1, plannedReps: 3, externalLoadKg: 0 },
            { setNumber: 2, plannedReps: 3, externalLoadKg: 0 },
          ],
        },
        {
          lift: "OAP",
          exerciseName: "Assisted OAP · Right",
          sets: [
            { setNumber: 1, plannedReps: 3, externalLoadKg: 0 },
            { setNumber: 2, plannedReps: 3, externalLoadKg: 0 },
          ],
        },
        {
          lift: "OHP",
          exerciseName: "Overhead Press",
          sets: [
            { setNumber: 1, plannedReps: 6, externalLoadKg: 32.5 },
            { setNumber: 2, plannedReps: 6, externalLoadKg: 32.5 },
          ],
        },
      ],
    },
  });

  assert.equal(summary.focus, "BP");
  assert.equal(summary.setCount, 10);
  assert.deepEqual(
    summary.exercises.map((exercise) => exercise.name),
    [
      "High-Bar Back Squat",
      "Bench Press",
      "Assisted OAP · Left",
      "Assisted OAP · Right",
      "Overhead Press",
    ],
  );
});
