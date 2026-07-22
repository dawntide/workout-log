import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedExercisesFromSlottedLpManualSession } from "./generateSession";
import { exerciseSlotKey } from "@workout/core/program-store/program-registry";

// madcow/nsuns: 한 운동의 기준 무게(주간 탑세트 / TM)를 여러 요일이 공유하고, 세트 무게는
// 그 기준의 퍼센트로 파생된다. 진행 판정은 driver 슬롯 하나만 맡는다.

const SQUAT_KEY = exerciseSlotKey("High-Bar Back Squat");

function madcowSession(key: string, rows: Array<{ reps: number; percent: number }>, driver: boolean) {
  return {
    key,
    items: [
      {
        exerciseName: "High-Bar Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: {
          role: { ko: "슬롯", en: key },
          sessionKey: key,
          progressionKey: SQUAT_KEY,
          startWeightKg: 100,
          driver,
        },
        sets: rows.map((r) => ({ reps: r.reps, percent: r.percent, targetWeightKg: 100 * r.percent })),
      },
    ],
  };
}

test("madcow: 월요일 램프가 슬롯 workKg의 퍼센트로 파생된다", () => {
  const session = madcowSession(
    "M",
    [
      { reps: 5, percent: 0.5 },
      { reps: 5, percent: 0.625 },
      { reps: 5, percent: 0.75 },
      { reps: 5, percent: 0.875 },
      { reps: 5, percent: 1.0 },
    ],
    false,
  );
  const params = { trainingMaxKg: { [SQUAT_KEY]: 120 } };
  const out = plannedExercisesFromSlottedLpManualSession(session, params, {}, "madcow-5x5");

  assert.deepEqual(
    out[0]!.sets.map((s) => s.targetWeightKg),
    [60, 75, 90, 105, 120],
  );
});

test("madcow: 비-driver 요일은 진행 판정에서 빠진다(중복 증량 차단)", () => {
  const session = madcowSession("M", [{ reps: 5, percent: 1.0 }], false);
  const out = plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { [SQUAT_KEY]: 120 } },
    {},
    "madcow-5x5",
  );

  assert.equal(out[0]!.progressionKey, null);
  assert.equal(out[0]!.skipProgression, true);
});

test("madcow: 금요일 driver 행만 progressionKey를 흘리고 PR 트리플은 102.5%", () => {
  const session = madcowSession(
    "F",
    [
      { reps: 5, percent: 0.875 },
      { reps: 3, percent: 1.025 },
      { reps: 8, percent: 0.75 },
    ],
    true,
  );
  const out = plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { [SQUAT_KEY]: 100 } },
    {},
    "madcow-5x5",
  );

  assert.equal(out[0]!.progressionKey, SQUAT_KEY);
  assert.equal(out[0]!.skipProgression, undefined);
  // 100 × 1.025 = 102.5 (그리드에 정확히 떨어짐), 백오프 75
  assert.deepEqual(
    out[0]!.sets.map((s) => s.targetWeightKg),
    [87.5, 102.5, 75],
  );
});

test("madcow: 같은 운동은 요일이 달라도 같은 workKg를 읽는다", () => {
  const params = { trainingMaxKg: { [SQUAT_KEY]: 110 } };
  const monday = plannedExercisesFromSlottedLpManualSession(
    madcowSession("M", [{ reps: 5, percent: 1.0 }], false),
    params,
    {},
    "madcow-5x5",
  );
  const friday = plannedExercisesFromSlottedLpManualSession(
    madcowSession("F", [{ reps: 5, percent: 1.0 }], true),
    params,
    {},
    "madcow-5x5",
  );

  assert.equal(monday[0]!.sets[0]!.targetWeightKg, 110);
  assert.equal(friday[0]!.sets[0]!.targetWeightKg, 110);
});

test("첫 세션: 슬롯 키가 없으면 시작 화면이 저장한 family 키(SQUAT)로 기준 무게를 잡는다", () => {
  // 프로그램 시작 화면은 1RM을 운동별이 아니라 family 키로 저장한다. 슬롯 키만 조회하면
  // 첫 세션이 유저 입력 대신 seed 데모 무게(startWeightKg=100)로 처방된다.
  const session = madcowSession("F", [{ reps: 3, percent: 1.025 }], true);
  const out = plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { SQUAT: 140 } },
    {},
    "madcow-5x5",
  );

  // 140 × 1.025 = 143.5 → 2.5 그리드 142.5 (seed 데모 100 기반이었다면 102.5)
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 142.5);
});

test("슬롯 키(진행된 workKg)가 family 키보다 우선한다", () => {
  const session = madcowSession("F", [{ reps: 5, percent: 1.0 }], true);
  const out = plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { [SQUAT_KEY]: 115, SQUAT: 140 } },
    {},
    "madcow-5x5",
  );

  assert.equal(out[0]!.sets[0]!.targetWeightKg, 115);
});

test("nsuns: T1의 95% 세트만 amrap 판정 세트로 흐른다", () => {
  const session = {
    key: "D2",
    items: [
      {
        exerciseName: "High-Bar Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: {
          role: { ko: "T1", en: "T1" },
          sessionKey: "D2",
          progressionKey: SQUAT_KEY,
          startWeightKg: 120,
          driver: true,
        },
        sets: [
          { reps: 5, percent: 0.75, note: "T1" },
          { reps: 3, percent: 0.85, note: "T1" },
          { reps: 1, percent: 0.95, note: "T1 · 1+ AMRAP", amrap: true },
          { reps: 5, percent: 0.65, note: "T1 · 5+" },
        ],
      },
    ],
  };
  const out = plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { [SQUAT_KEY]: 120 } },
    {},
    "nsuns-lp",
  );

  assert.deepEqual(
    out[0]!.sets.map((s) => s.amrap === true),
    [false, false, true, false],
  );
  // 120 × 0.95 = 114 → 2.5 그리드 반올림 115
  assert.equal(out[0]!.sets[2]!.targetWeightKg, 115);
});

test("gzclp 회귀: 퍼센트 파생 family가 아니면 percent를 무시하고 flat workKg를 유지한다", () => {
  const session = {
    key: "D1",
    items: [
      {
        exerciseName: "High-Bar Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D1", tier: "T1", progressionKey: "EX_SQUAT_T1" },
        sets: [
          { reps: 3, percent: 0.85, targetWeightKg: 100 },
          { reps: 3, percent: 0.85, targetWeightKg: 100 },
        ],
      },
    ],
  };
  const out = plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { EX_SQUAT_T1: 110 } },
    {},
    "gzclp",
  );

  // percent(0.85)가 곱해지지 않고 슬롯 workKg가 그대로 전 세트에 적용된다.
  assert.deepEqual(
    out[0]!.sets.map((s) => s.targetWeightKg),
    [110, 110],
  );
});
