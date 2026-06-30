import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedExercisesFromOperatorManualSession } from "./generateSession";

// operator manual: 데드리프트/오버헤드프레스가 직접 무게를 갖지 않으면(미입력), 같은 세션에서
// 이미 처방된 스쿼트/벤치의 "그 주차 작업무게"에서 파생한다 — 데드 = 스쿼트 처방 × 1.0,
// 오프 = 벤치 처방 × 0.5. reps·세트수도 스쿼트/벤치를 그대로 복제한다(예: 스쿼트 100×3 →
// 데드 100×3, 벤치 90×3 → 오프 45×3). 직접 무게를 넣었거나 자체 TM이 있는 행은 손대지 않는다.

type Item = Record<string, unknown>;
const setsOf = (
  out: ReturnType<typeof plannedExercisesFromOperatorManualSession>,
  name: string,
) => out.find((e) => e.exerciseName === name)?.sets ?? [];
const wOf = (
  out: ReturnType<typeof plannedExercisesFromOperatorManualSession>,
  name: string,
) => setsOf(out, name).map((s) => s.targetWeightKg);

// 스쿼트/벤치(AUTO) + 데드/오프(CUSTOM, 무게 미입력). 데드/오프의 sets는 일부러 reps·세트수를
// 다르게(reps 1, 1세트) 둬서 스쿼트/벤치를 따라가는지 확인한다.
const session = (deadExtra: Item = {}, ohpExtra: Item = {}) => ({
  key: "D3",
  items: [
    { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
    { exerciseName: "Bench Press", rowType: "AUTO", progressionTarget: "BENCH", order: 1 },
    { exerciseName: "Deadlift", rowType: "CUSTOM", role: "MAIN", progressionTarget: "DEADLIFT", sets: [{ reps: 1, targetWeightKg: 0 }], order: 2, ...deadExtra },
    { exerciseName: "Overhead Press", rowType: "CUSTOM", role: "MAIN", progressionTarget: "OHP", sets: [{ reps: 1, targetWeightKg: 0 }], order: 3, ...ohpExtra },
  ],
});

test("CUSTOM 데드/오프(무게 미입력): 무게·횟수는 스쿼트/벤치 추종, 세트수는 원래 유지", () => {
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 100 } };
  const out = plannedExercisesFromOperatorManualSession(session(), 4, params, params, {}); // W4 = 75%, reps 5, 스쿼트 3세트

  assert.deepEqual(wOf(out, "Back Squat"), [75, 75, 75]); //  100 × 0.75 (스쿼트는 3세트)
  assert.deepEqual(wOf(out, "Deadlift"), [75]); //           데드 1세트(원래 유지), 무게 = 스쿼트 × 1.0
  assert.deepEqual(wOf(out, "Overhead Press"), [37.5]); //   오프 1세트, 무게 = 벤치 × 0.5
  assert.equal(setsOf(out, "Deadlift").length, 1); //        커스텀 세트수(1) 유지 — 스쿼트 3세트 안 따라감
  assert.equal(setsOf(out, "Overhead Press").length, 1);
  assert.equal(setsOf(out, "Deadlift")[0]!.reps, 5); //      횟수만 스쿼트 추종(item의 reps 1 무시)
});

test("데드 100% / 오프 50% 비율로 각각 파생 (스쿼트≠벤치)", () => {
  const params = { trainingMaxKg: { SQUAT: 80, BENCH: 120 } };
  const out = plannedExercisesFromOperatorManualSession(session(), 4, params, params, {}); // ×0.75

  assert.equal(wOf(out, "Deadlift")[0], 60); //        스쿼트 80×0.75=60 → 데드 60
  assert.equal(wOf(out, "Overhead Press")[0], 45); //  벤치 120×0.75=90 → 오프 45
});

test("CUSTOM 데드에 무게가 입력돼 있으면 파생하지 않고 보존", () => {
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 100 } };
  const out = plannedExercisesFromOperatorManualSession(
    session({ sets: [{ reps: 5, targetWeightKg: 130 }] }),
    4, params, params, {},
  );
  assert.equal(wOf(out, "Deadlift")[0], 130); // 입력 무게 보존
});

test("AUTO 데드(자체 TM 보유)는 자체 처방, 스쿼트에서 파생하지 않음", () => {
  const autoSession = {
    key: "D3",
    items: [
      { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
      { exerciseName: "Deadlift", rowType: "AUTO", progressionTarget: "DEADLIFT", order: 1 },
    ],
  };
  const params = { trainingMaxKg: { SQUAT: 100, DEADLIFT: 160 } };
  const out = plannedExercisesFromOperatorManualSession(autoSession, 4, params, params, {}); // ×0.75

  assert.equal(wOf(out, "Deadlift")[0], 120); // 데드 자체 TM 160×0.75 (스쿼트 75 파생 아님)
});

test("스쿼트/벤치가 세션에 없으면 파생 불가(무게 0 유지)", () => {
  const onlyDead = {
    key: "X",
    items: [
      { exerciseName: "Deadlift", rowType: "CUSTOM", role: "MAIN", progressionTarget: "DEADLIFT", sets: [{ reps: 5, targetWeightKg: 0 }], order: 0 },
    ],
  };
  const out = plannedExercisesFromOperatorManualSession(onlyDead, 4, { trainingMaxKg: {} }, { trainingMaxKg: {} }, {});

  assert.equal(wOf(out, "Deadlift")[0], 0); // 스쿼트 없음 → 파생 못 함
});
