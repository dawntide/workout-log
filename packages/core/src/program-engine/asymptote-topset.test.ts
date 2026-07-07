// v0.5 프라이밍 탑세트(proximity patch §A·§B) 테스트 —
// `web/docs/asymptote-hybrid-v0.5-proximity-patch.md` §A.4 기준.
// 1) 블루프린트: topSet은 강도 슬롯(S1 SQUAT·S1 PULL·S3 BENCH)에만, cycles=[2,3].
// 2) 처방: 사이클2·3에서 선두 1세트(무게=TM×cycleCoef×1.0, 2.5 내림, amrap=false·
//    stopOnGrind=true·meta.topSet=true), 사이클1·4·lightBlockMode 미생성.
// 3) LOGIC/slot 두 처방 경로 동일 출력.
// 4) reducer: 탑세트 렙 미달이 failureStreak·진행에 무영향, C3 AMRAP 수집 무간섭.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASYMPTOTE_SESSIONS,
  ASYMPTOTE_SQUAT_A_COEF,
  ASYMPTOTE_TOP_SET,
} from "./asymptote";
import {
  plannedExercisesFromAsymptoteManualSession,
  previewSessionExercises,
  type PlannedExercise,
} from "./generateSession";
import {
  reduceProgressionState,
  type ProgressionRuntimeState,
  type ProgressionTarget,
} from "../progression/reducer";

const TM = { trainingMaxKg: { SQUAT: 100, BENCH: 80, PULL: 100, DEADLIFT: 100, OHP: 40 } };

function logicSession(week: number, day: number, extraParams: Record<string, unknown> = {}) {
  return previewSessionExercises({
    planType: "SINGLE",
    planParams: { ...TM, ...extraParams },
    runtimeState: null,
    rootVersion: { definition: { kind: "asymptote" }, defaults: {} },
    week,
    day,
  });
}

function byTarget(exercises: PlannedExercise[], target: string): PlannedExercise {
  const found = exercises.find((exercise) => exercise.progressionTarget === target);
  assert.ok(found, `${target} 처방 존재`);
  return found!;
}

// ──────────────────────────────────────────────────────────────────────────────
// 블루프린트 (§A.1 대상 슬롯 + §B 다이얼)
// ──────────────────────────────────────────────────────────────────────────────

test("블루프린트: topSet은 강도 슬롯(S1 SQUAT·S1 PULL·S3 BENCH)에만 존재", () => {
  const placements: string[] = [];
  for (const [session, rows] of Object.entries(ASYMPTOTE_SESSIONS)) {
    for (const row of rows) {
      if (row.topSet) {
        placements.push(`${session}:${row.target}`);
        assert.deepEqual(row.topSet, { reps: 3, coef: 1.0, cycles: [2, 3] }, `${session}:${row.target} 스펙`);
      }
    }
  }
  assert.deepEqual(placements.sort(), ["1:PULL", "1:SQUAT", "3:BENCH"]);
  assert.deepEqual(ASYMPTOTE_TOP_SET, { reps: 3, coef: 1.0, cycles: [2, 3] });
});

test("§B 다이얼: 기본 OFF — 세션A 스쿼트 계수 0.875 유지(단일 소스)", () => {
  assert.equal(ASYMPTOTE_SQUAT_A_COEF, 0.875);
  const squatA = ASYMPTOTE_SESSIONS[1]!.find((row) => row.target === "SQUAT")!;
  assert.equal(squatA.coef, ASYMPTOTE_SQUAT_A_COEF);
});

// ──────────────────────────────────────────────────────────────────────────────
// LOGIC 경로 처방 (§A.1 발동·무게·플래그)
// ──────────────────────────────────────────────────────────────────────────────

test("LOGIC 처방: 사이클2 세션A — SQ·PULL 선두 탑세트, BENCH(볼륨)는 없음", () => {
  const exercises = logicSession(2, 1); // week 2 → C2, day 1 → 세션 A
  const squat = byTarget(exercises, "SQUAT");
  assert.equal(squat.sets.length, 5, "작업 4 + 탑세트 1");
  const top = squat.sets[0]!;
  assert.equal(top.reps, 3);
  assert.equal(top.amrap, false, "탑세트는 진행 신호가 아님(amrap 금지)");
  assert.equal(top.stopOnGrind, true, "그라인딩-정지가 유일한 밸브");
  assert.equal(top.meta?.topSet, true);
  assert.equal(top.targetWeightKg, 95, "floor2.5(100×0.95×1.0)");
  assert.equal(top.rpe, undefined, "탑세트는 RPE 처방 없음(실측 영역)");
  for (const set of squat.sets.slice(1)) {
    assert.equal(set.targetWeightKg, 82.5, "작업 세트 불변: floor2.5(100×0.95×0.875)");
    assert.notEqual(set.meta?.topSet, true);
  }

  const pull = byTarget(exercises, "PULL");
  assert.equal(pull.sets.length, 5);
  assert.equal(pull.sets[0]!.meta?.topSet, true);
  assert.equal(pull.sets[0]!.targetWeightKg, 95, "floor2.5(100×0.95×1.0)");

  const bench = byTarget(exercises, "BENCH");
  assert.equal(bench.sets.length, 4, "볼륨 슬롯은 탑세트 없음");
  assert.ok(bench.sets.every((set) => set.meta?.topSet !== true));
});

test("LOGIC 처방: 사이클3 세션C — BENCH 탑세트 + 마지막 세트 AMRAP 게이팅 불변", () => {
  const exercises = logicSession(3, 3); // week 3 → C3, day 3 → 세션 C
  const bench = byTarget(exercises, "BENCH");
  assert.equal(bench.sets.length, 5);
  const top = bench.sets[0]!;
  assert.equal(top.meta?.topSet, true);
  assert.equal(top.targetWeightKg, 77.5, "floor2.5(80×0.975×1.0)");
  assert.equal(top.amrap, false);
  assert.equal(bench.sets.at(-1)!.amrap, true, "AMRAP은 여전히 마지막 작업 세트");

  const squat = byTarget(exercises, "SQUAT"); // 세션C 스쿼트는 폭발 슬롯 — 대상 아님
  assert.ok(squat.sets.every((set) => set.meta?.topSet !== true));
});

test("발동 사이클 밖(C1·C4)·lightBlockMode에서는 탑세트 미생성", () => {
  for (const [week, label] of [
    [1, "C1(적응)"],
    [4, "C4(디로드)"],
  ] as const) {
    const exercises = logicSession(week, 1);
    assert.equal(byTarget(exercises, "SQUAT").sets.length, 4, `${label} 세트 수 불변`);
    for (const exercise of exercises) {
      assert.ok(exercise.sets.every((set) => set.meta?.topSet !== true), `${label} 탑세트 없음`);
    }
  }
  const light = logicSession(2, 1, { lightBlockMode: true });
  assert.equal(byTarget(light, "SQUAT").sets.length, 4, "light 블록 세트 수 불변");
  for (const exercise of light) {
    assert.ok(exercise.sets.every((set) => set.meta?.topSet !== true), "light 블록 탑세트 없음");
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// slot 커스터마이즈 경로 = LOGIC 경로 (§A.3 두 경로 일치)
// ──────────────────────────────────────────────────────────────────────────────

function manualSessionA() {
  return {
    items: [
      {
        exerciseName: "Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: { coef: ASYMPTOTE_SQUAT_A_COEF, amrap: true, sessionKey: "A" },
        sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }, { reps: 3 }],
        order: 0,
      },
      {
        exerciseName: "Bench Press",
        rowType: "AUTO",
        progressionTarget: "BENCH",
        slot: { coef: 0.775, amrap: false, sessionKey: "A" },
        sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }],
        order: 1,
      },
      {
        exerciseName: "Weighted Pull-Up",
        rowType: "AUTO",
        progressionTarget: "PULL",
        slot: { coef: 0.85, amrap: true, sessionKey: "A" },
        sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }, { reps: 3 }],
        order: 2,
      },
    ],
  };
}

test("slot 경로 = LOGIC 경로: 사이클2·3 세션A 세트 배열 동일(탑세트 포함)", () => {
  for (const week of [2, 3]) {
    const logic = logicSession(week, 1);
    const slot = plannedExercisesFromAsymptoteManualSession(manualSessionA(), week, TM, {});
    for (const target of ["SQUAT", "BENCH", "PULL"]) {
      assert.deepEqual(
        byTarget(slot, target).sets,
        byTarget(logic, target).sets,
        `week${week} ${target} 세트 동일`,
      );
    }
  }
});

test("slot 경로: 운동명 변경(스왑)에도 슬롯(sessionKey·target) 기준으로 탑세트 유지", () => {
  const session = manualSessionA();
  session.items[0]!.exerciseName = "Low-Bar Squat"; // 유저가 슬롯 운동명만 교체
  const slot = plannedExercisesFromAsymptoteManualSession(session, 2, TM, {});
  const squat = byTarget(slot, "SQUAT");
  assert.equal(squat.exerciseName, "Low-Bar Squat");
  assert.equal(squat.sets[0]!.meta?.topSet, true, "흐름은 슬롯에 종속(운동명 무관)");
});

// ──────────────────────────────────────────────────────────────────────────────
// reducer 무영향 (§A.1 진행 로직 무영향 — reducer 무변경 검증)
// ──────────────────────────────────────────────────────────────────────────────

function baseState(week: number, day: number): ProgressionRuntimeState {
  const target = (progressionTarget: ProgressionTarget) => ({
    progressionTarget,
    workKg: 100,
    successStreak: 0,
    failureStreak: 0,
  });
  return {
    cycle: 1,
    week,
    day,
    lastAppliedLogId: null,
    targets: {
      SQUAT: target("SQUAT"),
      BENCH: target("BENCH"),
      PULL: target("PULL"),
      DEADLIFT: target("DEADLIFT"),
      OHP: target("OHP"),
    },
  };
}

// 저장 경로 그대로: asymptote는 plannedRef를 스탬프하지 않고, 탑세트는 meta.amrap도 없다.
const loggedTopSetShort = { exerciseName: "Back Squat", reps: 2, weightKg: 95, meta: { topSet: true } };
const loggedWorkSets = Array.from({ length: 4 }, () => ({
  exerciseName: "Back Squat",
  reps: 3,
  weightKg: 82.5,
  meta: {},
}));

test("reducer: 탑세트 렙 미달(3→2)이 failureStreak·진행에 무영향", () => {
  const run = (sets: Array<Record<string, unknown>>) =>
    reduceProgressionState({
      program: "asymptote",
      previousState: baseState(2, 1),
      planParams: TM,
      logId: "log-topset",
      sets: sets as never,
    });
  const withTop = run([loggedTopSetShort, ...loggedWorkSets]);
  const withoutTop = run([...loggedWorkSets]);

  assert.equal(withTop.nextState.targets.SQUAT!.failureStreak, 0, "렙 미달이어도 실패 아님");
  assert.equal(
    withTop.nextState.targets.SQUAT!.failureStreak,
    withoutTop.nextState.targets.SQUAT!.failureStreak,
  );
  assert.equal(
    withTop.nextState.targets.SQUAT!.successStreak,
    withoutTop.nextState.targets.SQUAT!.successStreak,
  );
  assert.equal(withTop.nextState.targets.SQUAT!.workKg, withoutTop.nextState.targets.SQUAT!.workKg);
  assert.equal(withTop.nextState.week, withoutTop.nextState.week, "세션 advance 동일");
  assert.equal(withTop.nextState.day, withoutTop.nextState.day);
});

test("reducer: 사이클3 AMRAP 수집은 탑세트 선두 삽입과 무간섭(마지막 세트 기준)", () => {
  const sets = [
    loggedTopSetShort,
    ...Array.from({ length: 3 }, () => ({ exerciseName: "Back Squat", reps: 3, weightKg: 85, meta: {} })),
    { exerciseName: "Back Squat", reps: 8, weightKg: 85, meta: { amrap: true } },
  ];
  const next = reduceProgressionState({
    program: "asymptote",
    previousState: baseState(3, 1),
    planParams: TM,
    logId: "log-amrap",
    sets: sets as never,
  }).nextState;
  assert.equal(next.targets.SQUAT!.amrapReps, 8, "AMRAP 실측 8 보존(탑세트 2렙 아님)");
});
