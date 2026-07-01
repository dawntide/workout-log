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

// 자체 TM 없는 오프(OHP)는 rowType과 무관하게 같은 정책으로 파생돼야 한다. 예전에는 AUTO 행이
// crossLiftFallbackTm(TM 반내림)을, CUSTOM 0무게 행이 applyDerivedMainLifts(처방 파생)를 타서
// 같은 구성이 최대 2.5kg 다르게 처방되는 발산이 있었다(#476 후속에서 처방 파생으로 통일).
test("AUTO 오프(자체 TM 없음)도 CUSTOM처럼 벤치 처방에서 파생 — rowType 무관 동일값", () => {
  // BENCH_TM 102.5, W3(90%): 벤치 처방 round2p5(102.5×0.9)=92.5 → 오프 round2p5(92.5×0.5)=47.5.
  // 예전 crossLift 경로는 round2p5(floor2p5(102.5×0.5)×0.9)=45 로 CUSTOM(47.5)과 2.5kg 발산했다.
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 102.5 } };
  const build = (ohp: Item) => ({
    key: "D1",
    items: [
      { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
      { exerciseName: "Bench Press", rowType: "AUTO", progressionTarget: "BENCH", order: 1 },
      { exerciseName: "Overhead Press", role: "MAIN", progressionTarget: "OHP", order: 2, ...ohp },
    ],
  });
  const autoOut = plannedExercisesFromOperatorManualSession(build({ rowType: "AUTO" }), 3, params, params, {});
  const customOut = plannedExercisesFromOperatorManualSession(
    build({ rowType: "CUSTOM", sets: [{ reps: 1, targetWeightKg: 0 }] }), 3, params, params, {},
  );

  assert.equal(wOf(autoOut, "Overhead Press")[0], 47.5); //   벤치 처방 92.5 × 0.5 (crossLift의 45 아님)
  assert.equal(wOf(customOut, "Overhead Press")[0], 47.5); // AUTO와 동일 — 발산 제거
});

// 파생 소스(스쿼트/벤치)가 자체 TM이 없어 rep-only로 처방되면, 데드/오프도 무게를 만들 수 없다.
// 다만 reps는 소스를 그대로 추종한다(무게만 undefined).
test("소스 스쿼트가 무게 없으면(rep-only) 데드도 무게 없이 reps만 추종", () => {
  const session = {
    key: "D3",
    items: [
      { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
      { exerciseName: "Deadlift", rowType: "CUSTOM", role: "MAIN", progressionTarget: "DEADLIFT", sets: [{ reps: 1, targetWeightKg: 0 }], order: 1 },
    ],
  };
  const out = plannedExercisesFromOperatorManualSession(session, 4, { trainingMaxKg: {} }, { trainingMaxKg: {} }, {}); // W4 reps 5

  assert.equal(wOf(out, "Back Squat")[0], undefined); //  스쿼트 TM 없음 → rep-only
  assert.equal(wOf(out, "Deadlift")[0], undefined); //    소스 무게 없음 → 데드도 무게 없음
  assert.equal(setsOf(out, "Deadlift")[0]!.reps, 5); //   reps는 스쿼트 scheme(W4=5) 추종
});

// 파생은 "행의 모든 세트가 무게 없음"일 때만 한다. 일부 세트에만 무게가 있는 혼합 CUSTOM 행은
// 사용자가 의도적으로 짠 것으로 보고 손대지 않는다(입력 그대로 보존).
test("CUSTOM 행 세트가 혼합 무게(일부만 0)면 파생하지 않고 원본 보존", () => {
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 100 } };
  const mixed = {
    key: "D3",
    items: [
      { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
      {
        exerciseName: "Deadlift", rowType: "CUSTOM", role: "MAIN", progressionTarget: "DEADLIFT",
        sets: [{ reps: 5, targetWeightKg: 140 }, { reps: 5, targetWeightKg: 0 }], order: 1,
      },
    ],
  };
  const out = plannedExercisesFromOperatorManualSession(mixed, 4, params, params, {});

  assert.deepEqual(wOf(out, "Deadlift"), [140, 0]); // 혼합 → 파생 안 함, 입력 그대로
});

// 소스(스쿼트/벤치)가 같은 세션에 없어도 params에 인접 TM이 있으면 무게를 잃지 않는다 — override로
// 스쿼트/벤치를 뺀 프레스 데이 등. crossLiftFallbackTm 안전망을 applyDerivedMainLifts 2순위로
// 통합했으므로 AUTO·CUSTOM 모두 같은 추정 처방을 받는다(예전엔 AUTO만 폴백받아 발산·회귀).
test("소스가 세션에 없어도 인접 TM 있으면 안전망 처방 — AUTO·CUSTOM 동일", () => {
  // 오프만 있고 벤치는 세션에 없음. BENCH TM 100 → crossLift floor2p5(100×0.5)=50, W4(75%) → 37.5.
  const params = { trainingMaxKg: { BENCH: 100 } };
  const build = (ohp: Item) => ({
    key: "PRESS",
    items: [{ exerciseName: "Overhead Press", progressionTarget: "OHP", order: 0, ...ohp }],
  });
  const autoOut = plannedExercisesFromOperatorManualSession(build({ rowType: "AUTO" }), 4, params, params, {});
  const customOut = plannedExercisesFromOperatorManualSession(
    build({ rowType: "CUSTOM", role: "MAIN", sets: [{ reps: 1, targetWeightKg: 0 }] }), 4, params, params, {},
  );

  assert.equal(wOf(autoOut, "Overhead Press")[0], 37.5); //   벤치 세션에 없음 → BENCH TM×0.5 추정
  assert.equal(wOf(customOut, "Overhead Press")[0], 37.5); // AUTO와 동일 (안전망 회복 + 발산 없음)
});
