import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyManualRuntimeWeightOverrides,
  plannedExercisesFromManualSession,
} from "./generateSession";
import { lookupProgramFamily } from "@workout/core/program-store/program-registry";
import { reduceProgressionState, resolveAutoProgressionProgram } from "../progression/reducer";

// PPL·PHUL처럼 보조가 많은 프로그램: 보조 행은 진행 판정과 무게 오버라이드 양쪽에서 빠져야 한다.
// 그러지 않으면 reducer가 운동명으로 family를 되짚어(progressionIdentityForSet) 보조가 메인
// 판정에 섞이고, family-target 오버라이드가 보조에 메인 작업중량을 덮어쓴다.

const pplSession = {
  key: "D3",
  items: [
    {
      exerciseName: "High-Bar Back Squat",
      role: "MAIN",
      rowType: "AUTO",
      progressionTarget: "SQUAT",
      sets: [{ reps: 5, targetWeightKg: 80 }],
    },
    {
      exerciseName: "Romanian Deadlift",
      role: "ASSIST",
      sets: [{ reps: 8, targetWeightKg: 60 }],
    },
    {
      exerciseName: "Seated Row",
      role: "ASSIST",
      sets: [{ reps: 8, targetWeightKg: 45 }],
    },
  ],
};

test("보조(ASSIST) 행은 skipProgression으로 진행 판정에서 빠진다", () => {
  const out = plannedExercisesFromManualSession(pplSession);

  assert.equal(out[0]!.role, "MAIN");
  assert.equal(out[0]!.skipProgression, undefined);
  assert.equal(out[1]!.skipProgression, true);
  assert.equal(out[2]!.skipProgression, true);
});

test("family-target 오버라이드가 보조 무게를 덮어쓰지 않는다", () => {
  const entry = lookupProgramFamily({ family: "reddit-ppl" });
  const planned = plannedExercisesFromManualSession(pplSession);
  const runtimeState = {
    targets: {
      SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 },
      DEADLIFT: { progressionTarget: "DEADLIFT", workKg: 140, successStreak: 0, failureStreak: 0 },
      PULL: { progressionTarget: "PULL", workKg: 70, successStreak: 0, failureStreak: 0 },
    },
  };

  const out = applyManualRuntimeWeightOverrides(entry, planned, runtimeState);

  // 메인 스쿼트는 진행된 workKg를 받는다.
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 100);
  // 보조는 시드 무게 유지 — RDL이 데드리프트 140kg을, Seated Row가 바벨로우 70kg을 받으면 안 된다.
  assert.equal(out[1]!.sets[0]!.targetWeightKg, 60);
  assert.equal(out[2]!.sets[0]!.targetWeightKg, 45);
});

test("보조 세트는 메인 리프트 진행 판정에 섞이지 않는다", () => {
  // 같은 PULL family인 Seated Row(보조)를 실패로 기록해도 Barbell Row(메인) 증량은 막히지 않는다.
  const result = reduceProgressionState({
    program: "reddit-ppl",
    previousState: {
      cycle: 1,
      week: 1,
      day: 1,
      targets: { PULL: { progressionTarget: "PULL", workKg: 50, successStreak: 0, failureStreak: 0 } },
      lastAppliedLogId: null,
    },
    planParams: {},
    sets: [
      {
        exerciseName: "Barbell Row",
        reps: 5,
        weightKg: 50,
        meta: { plannedRef: { progressionTarget: "PULL", reps: 5 } },
      },
      {
        exerciseName: "Seated Row",
        reps: 3,
        weightKg: 45,
        meta: { progressionExcluded: true, plannedRef: { reps: 8 } },
      },
    ],
    logId: "log-1",
  });

  assert.equal(result.nextState.targets.PULL!.workKg, 52.5);
  assert.equal(result.targetDecisions.length, 1);
});

test("PPL 증량폭은 원전과 같다(데드 +5kg, 나머지 +2.5kg)", () => {
  const run = (exerciseName: string, target: string, workKg: number) =>
    reduceProgressionState({
      program: "reddit-ppl",
      previousState: {
        cycle: 1,
        week: 1,
        day: 1,
        targets: { [target]: { progressionTarget: target, workKg, successStreak: 0, failureStreak: 0 } },
        lastAppliedLogId: null,
      },
      planParams: {},
      sets: [
        {
          exerciseName,
          reps: 5,
          weightKg: workKg,
          meta: { plannedRef: { progressionTarget: target, reps: 5 } },
        },
      ],
      logId: "log-1",
    }).nextState.targets[target]!.workKg;

  assert.equal(run("Deadlift", "DEADLIFT", 100), 105);
  assert.equal(run("Bench Press", "BENCH", 60), 62.5);
  assert.equal(run("High-Bar Back Squat", "SQUAT", 80), 82.5);
});

test("PPL: 처방 reps 미달은 실패이고 3연속이면 ×0.9 디로드", () => {
  let state: unknown = {
    cycle: 1,
    week: 1,
    day: 1,
    targets: { BENCH: { progressionTarget: "BENCH", workKg: 60, successStreak: 0, failureStreak: 0 } },
    lastAppliedLogId: null,
  };
  const events: string[] = [];

  for (let i = 0; i < 3; i += 1) {
    const result = reduceProgressionState({
      program: "reddit-ppl",
      previousState: state,
      planParams: {},
      sets: [
        {
          exerciseName: "Bench Press",
          reps: 3,
          weightKg: 60,
          meta: { plannedRef: { progressionTarget: "BENCH", reps: 5 } },
        },
      ],
      logId: `log-${i}`,
    });
    state = result.nextState;
    events.push(result.targetDecisions[0]!.eventType);
  }

  assert.deepEqual(events, ["HOLD", "HOLD", "RESET"]);
  assert.equal((state as { targets: Record<string, { workKg: number }> }).targets.BENCH!.workKg, 55);
});

test("PHUL·PPL slug/family가 자동 진행으로 해석된다", () => {
  assert.equal(resolveAutoProgressionProgram("reddit-ppl-6day"), "reddit-ppl");
  assert.equal(resolveAutoProgressionProgram("phul"), "phul");
  assert.equal(
    resolveAutoProgressionProgram("fork-abc", { kind: "manual", programFamily: "phul" }),
    "phul",
  );
});
