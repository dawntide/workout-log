import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRef5GeneratePayload,
  summarizeRef5Preview,
} from "../ui/ref5-session-start-panel";
import { isRef5PlanParams } from "@/lib/workout-record/ref5-plan";

test("REF5 plan detection accepts the family marker or immutable REF5 params", () => {
  assert.equal(isRef5PlanParams({ programFamily: "ref5" }), true);
  assert.equal(isRef5PlanParams({ ref5: { protocolVersion: "1.1" } }), true);
  assert.equal(isRef5PlanParams({ programFamily: "asymptote" }), false);
  assert.equal(isRef5PlanParams(null), false);
});

test("preview and start share one stable REF5 input envelope", () => {
  const values = {
    protocolVersion: "1.2",
    actualStartAt: "2026-07-13T03:04:05.000Z",
    bodyweightKg: 81.2,
    manualMicro: true,
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

test("preview summary reads the REF5 v1.2 snapshot contract", () => {
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
  assert.equal(summary.setCount, 3);
  assert.deepEqual(summary.exercises, [
    { name: "Back Squat", prescription: "2 × 5 · 72.5 kg" },
    { name: "Weighted Pull-up", prescription: "1 × 6 · 0 kg" },
  ]);
});

test("v1.2 preview contains the complete nine-set PULL-focus prescription", () => {
  const summary = summarizeRef5Preview({
    id: "preview-v12",
    planId: "plan-1",
    sessionKey: "ref5:preview:v12",
    snapshot: {
      ref5: {
        decision: { sessionType: "NORMAL", focus: "PULL", squatPrescription: "H3" },
      },
      exercises: [
        { exerciseName: "Back Squat", sets: Array.from({ length: 3 }, () => ({ plannedReps: 3, externalLoadKg: 82.5 })) },
        { exerciseName: "Weighted Pull-Up", sets: Array.from({ length: 3 }, () => ({ plannedReps: 3, externalLoadKg: 12.5 })) },
        { exerciseName: "Bench Press", sets: [{ plannedReps: 5, externalLoadKg: 70 }] },
        { exerciseName: "Deadlift", sets: Array.from({ length: 2 }, () => ({ plannedReps: 4, externalLoadKg: 72.5 })) },
      ],
    },
  });

  assert.equal(summary.setCount, 9);
  assert.deepEqual(summary.exercises.map((exercise) => exercise.name), [
    "Back Squat",
    "Weighted Pull-Up",
    "Bench Press",
    "Deadlift",
  ]);
  assert.equal(JSON.stringify(summary).includes("climb"), false);
});
