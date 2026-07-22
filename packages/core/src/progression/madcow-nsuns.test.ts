import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceProgressionState, resolveAutoProgressionProgram, type LoggedSetInput } from "./reducer";
import { exerciseSlotKey } from "@workout/core/program-store/program-registry";

const SQUAT_KEY = exerciseSlotKey("High-Bar Back Squat");
const OHP_KEY = exerciseSlotKey("Overhead Press");
const SUMO_KEY = exerciseSlotKey("Sumo Deadlift");

function set(input: {
  exerciseName: string;
  key: string;
  target: string;
  reps: number;
  weightKg: number;
  amrap?: boolean;
  excluded?: boolean;
  plannedReps?: number;
}): LoggedSetInput {
  return {
    exerciseName: input.exerciseName,
    reps: input.reps,
    weightKg: input.weightKg,
    meta: {
      ...(input.excluded ? { progressionExcluded: true } : {}),
      plannedRef: {
        progressionKey: input.key,
        progressionTarget: input.target,
        reps: input.plannedReps ?? input.reps,
        ...(input.amrap ? { amrap: true } : {}),
      },
    },
  };
}

function stateWith(key: string, workKg: number, failureStreak = 0) {
  return {
    cycle: 1,
    week: 1,
    day: 1,
    targets: {
      [key]: { progressionTarget: "SQUAT", workKg, successStreak: 0, failureStreak },
    },
    lastAppliedLogId: null,
  };
}

// ── Madcow 5x5 ────────────────────────────────────────────────────────────────

test("madcow: 금요일 PR 트리플 성공 → 주간 탑세트 +2.5kg", () => {
  const result = reduceProgressionState({
    program: "madcow-5x5",
    previousState: stateWith(SQUAT_KEY, 100),
    planParams: {},
    sets: [set({ exerciseName: "High-Bar Back Squat", key: SQUAT_KEY, target: "SQUAT", reps: 3, weightKg: 102.5 })],
    logId: "log-1",
  });

  assert.equal(result.nextState.targets[SQUAT_KEY]!.workKg, 102.5);
  assert.equal(result.eventType, "INCREASE");
});

test("madcow: 1회 실패는 홀드, 2주 연속 실패면 ×0.9 디로드", () => {
  const first = reduceProgressionState({
    program: "madcow-5x5",
    previousState: stateWith(SQUAT_KEY, 100),
    planParams: {},
    sets: [
      set({ exerciseName: "High-Bar Back Squat", key: SQUAT_KEY, target: "SQUAT", reps: 2, weightKg: 102.5, plannedReps: 3 }),
    ],
    logId: "log-1",
  });
  assert.equal(first.nextState.targets[SQUAT_KEY]!.workKg, 100);
  // 상위 eventType은 세션 로테이션(M→W→F) 때문에 ADVANCE_WEEK이 된다 — 무게 판정은 타깃 결정에서 본다.
  assert.equal(first.targetDecisions[0]!.eventType, "HOLD");

  const second = reduceProgressionState({
    program: "madcow-5x5",
    previousState: first.nextState,
    planParams: {},
    sets: [
      set({ exerciseName: "High-Bar Back Squat", key: SQUAT_KEY, target: "SQUAT", reps: 2, weightKg: 102.5, plannedReps: 3 }),
    ],
    logId: "log-2",
  });
  assert.equal(second.eventType, "RESET");
  assert.equal(second.nextState.targets[SQUAT_KEY]!.workKg, 90);
});

test("madcow: 비-driver 요일(progressionExcluded)은 탑세트를 올리지 않는다", () => {
  const result = reduceProgressionState({
    program: "madcow-5x5",
    previousState: stateWith(SQUAT_KEY, 100),
    planParams: {},
    // 월요일 볼륨일 — 전 세트 완수했지만 판정 대상이 아니다.
    sets: [
      set({ exerciseName: "High-Bar Back Squat", key: SQUAT_KEY, target: "SQUAT", reps: 5, weightKg: 100, excluded: true }),
    ],
    logId: "log-1",
  });

  assert.equal(result.nextState.targets[SQUAT_KEY]!.workKg, 100);
  assert.equal(result.targetDecisions.length, 0);
});

test("madcow: 경량 리프트도 2.5kg 그리드에서 매주 실제로 오른다(퍼센트 누적 반올림 정체 회귀)", () => {
  // 원전의 "주 2.5%"를 그대로 쓰면 45×1.025=46.1 → 2.5 그리드 반올림 45로 되돌아가 영구 정체한다.
  // 고정 +2.5kg 채택으로 4주간 45 → 47.5 → 50 → 52.5가 되는지 확인한다.
  let state: unknown = {
    cycle: 1,
    week: 1,
    day: 1,
    targets: { [OHP_KEY]: { progressionTarget: "OHP", workKg: 45, successStreak: 0, failureStreak: 0 } },
    lastAppliedLogId: null,
  };
  const observed: number[] = [];

  for (let week = 0; week < 4; week += 1) {
    const result = reduceProgressionState({
      program: "madcow-5x5",
      previousState: state,
      planParams: {},
      sets: [set({ exerciseName: "Overhead Press", key: OHP_KEY, target: "OHP", reps: 5, weightKg: 45 })],
      logId: `log-${week}`,
    });
    state = result.nextState;
    observed.push(result.nextState.targets[OHP_KEY]!.workKg);
  }

  assert.deepEqual(observed, [47.5, 50, 52.5, 55]);
});

// ── nSuns LP ──────────────────────────────────────────────────────────────────

test("nsuns: T1 95% AMRAP 실측 reps가 TM 증가폭을 정한다", () => {
  const cases: Array<[number, number]> = [
    [3, 122.5], // 2~3회 → +2.5
    [5, 125], // 4~5회 → +5
    [7, 127.5], // 6회+ → +7.5
  ];

  for (const [amrapReps, expected] of cases) {
    const result = reduceProgressionState({
      program: "nsuns-lp",
      previousState: stateWith(SQUAT_KEY, 120),
      planParams: {},
      sets: [
        set({
          exerciseName: "High-Bar Back Squat",
          key: SQUAT_KEY,
          target: "SQUAT",
          reps: amrapReps,
          weightKg: 115,
          amrap: true,
          plannedReps: 1,
        }),
      ],
      logId: `log-${amrapReps}`,
    });

    assert.equal(result.nextState.targets[SQUAT_KEY]!.workKg, expected, `amrap ${amrapReps}회`);
    assert.equal(result.eventType, "INCREASE");
  }
});

test("nsuns: AMRAP 0~1회는 증량 없이 홀드, 2회 연속이면 TM ×0.9 재빌드", () => {
  const first = reduceProgressionState({
    program: "nsuns-lp",
    previousState: stateWith(SQUAT_KEY, 120),
    planParams: {},
    sets: [
      set({ exerciseName: "High-Bar Back Squat", key: SQUAT_KEY, target: "SQUAT", reps: 1, weightKg: 115, amrap: true, plannedReps: 1 }),
    ],
    logId: "log-1",
  });
  assert.equal(first.nextState.targets[SQUAT_KEY]!.workKg, 120);
  assert.equal(first.targetDecisions[0]!.eventType, "HOLD");

  const second = reduceProgressionState({
    program: "nsuns-lp",
    previousState: first.nextState,
    planParams: {},
    sets: [
      set({ exerciseName: "High-Bar Back Squat", key: SQUAT_KEY, target: "SQUAT", reps: 0, weightKg: 115, amrap: true, plannedReps: 1 }),
    ],
    logId: "log-2",
  });
  assert.equal(second.eventType, "RESET");
  // 120 × 0.9 = 108 → 2.5 그리드 107.5
  assert.equal(second.nextState.targets[SQUAT_KEY]!.workKg, 107.5);
});

test("nsuns: T2 보조 슬롯은 AMRAP 없이 전 세트 완수 기준 LP(하체 +5)", () => {
  const result = reduceProgressionState({
    program: "nsuns-lp",
    previousState: {
      cycle: 1,
      week: 1,
      day: 1,
      targets: { [SUMO_KEY]: { progressionTarget: "DEADLIFT", workKg: 140, successStreak: 0, failureStreak: 0 } },
      lastAppliedLogId: null,
    },
    planParams: {},
    sets: [set({ exerciseName: "Sumo Deadlift", key: SUMO_KEY, target: "DEADLIFT", reps: 5, weightKg: 98 })],
    logId: "log-1",
  });

  assert.equal(result.nextState.targets[SUMO_KEY]!.workKg, 145);
  assert.equal(result.eventType, "INCREASE");
});

test("slug/kind로 자동 진행 프로그램이 해석된다", () => {
  assert.equal(resolveAutoProgressionProgram("madcow-5x5"), "madcow-5x5");
  assert.equal(resolveAutoProgressionProgram("nsuns-lp-5day"), "nsuns-lp");
  // fork(새 slug)는 정의의 programFamily로 되살아난다.
  assert.equal(
    resolveAutoProgressionProgram("my-custom-fork", { kind: "manual", programFamily: "madcow-5x5" }),
    "madcow-5x5",
  );
  assert.equal(
    resolveAutoProgressionProgram("my-custom-fork", { kind: "manual", programFamily: "nsuns-lp" }),
    "nsuns-lp",
  );
});
