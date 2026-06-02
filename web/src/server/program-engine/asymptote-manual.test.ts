import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedExercisesFromAsymptoteManualSession } from "./generateSession";
import { calculateAsymptoteWorkingWeight } from "./asymptote";

// 슬롯형(asymptote) 커스터마이즈 처방 — 운동 구성은 자유롭게 바꿔도(운동명 교체),
// 슬롯의 target 흐름(coef·sets·reps·AMRAP)이 운동에 그대로 입혀지는지 검증한다.
const TM = {
  trainingMaxKg: { SQUAT: 160, BENCH: 120, DEADLIFT: 200, PULL: 100, OHP: 60 },
};

// 세션 A 슬롯 구성. 운동명은 원본(Back Squat/Bench Press)에서 커스터마이즈로 교체된 상태를 가정.
function sessionA() {
  return {
    key: "A",
    items: [
      {
        exerciseName: "Front Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: { coef: 0.875, amrap: true, sessionKey: "A", role: { ko: "중강도·검증", en: "Moderate" } },
        sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }, { reps: 3 }],
      },
      {
        exerciseName: "Incline Bench",
        rowType: "AUTO",
        progressionTarget: "BENCH",
        slot: { coef: 0.775, amrap: false, sessionKey: "A", role: { ko: "볼륨", en: "Volume" } },
        sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }],
      },
    ],
  };
}

test("slotted: 운동명을 바꿔도 슬롯 target 흐름이 적용되고 무게가 원본 공식과 일치 (week1)", () => {
  const out = plannedExercisesFromAsymptoteManualSession(sessionA(), 1, TM, {});
  const squat = out[0]!;

  assert.equal(squat.exerciseName, "Front Squat");
  assert.equal(squat.progressionTarget, "SQUAT");
  // progressionKey는 family(target)로 둬 reducer의 asymptote AMRAP 게이팅과 호환
  assert.equal(squat.progressionKey, "SQUAT");
  assert.equal(squat.sets.length, 4);
  assert.equal(squat.sets[0]!.reps, 3);

  // Front Squat이지만 SQUAT 슬롯 흐름 → 원본 calculateAsymptoteWorkingWeight(A세션 SQUAT)와 동일
  const expected = calculateAsymptoteWorkingWeight({
    tmKg: 160,
    cycleInBlock: 1,
    sessionInCycle: 1,
    lift: "SQUAT",
  });
  assert.equal(squat.sets[0]!.targetWeightKg, expected);
  assert.equal(squat.sets[3]!.amrap, false); // week1(cycle1)은 AMRAP 아님
});

test("slotted: cycle3(week3)에서 amrap 슬롯의 마지막 세트만 AMRAP", () => {
  const out = plannedExercisesFromAsymptoteManualSession(sessionA(), 3, TM, {});
  const squat = out[0]!;
  const bench = out[1]!;

  // SQUAT 슬롯은 amrap=true → 마지막 세트 AMRAP
  assert.equal(squat.sets[3]!.amrap, true);
  assert.equal(squat.sets[0]!.amrap, false);
  assert.match(String(squat.sets[3]!.note), /AMRAP/);

  // BENCH 슬롯은 amrap=false → 검증 사이클이라도 AMRAP 아님
  assert.equal(bench.sets[3]!.amrap, false);

  const expected = calculateAsymptoteWorkingWeight({
    tmKg: 160,
    cycleInBlock: 3,
    sessionInCycle: 1,
    lift: "SQUAT",
  });
  assert.equal(squat.sets[0]!.targetWeightKg, expected);
});

test("slotted: CUSTOM 행은 슬롯 흐름 없이 저장 세트를 그대로 통과", () => {
  const session = {
    key: "A",
    items: [
      {
        exerciseName: "Bicep Curl",
        rowType: "CUSTOM",
        sets: [{ reps: 12, targetWeightKg: 20 }],
      },
    ],
  };
  const out = plannedExercisesFromAsymptoteManualSession(session, 1, TM, {});
  assert.equal(out[0]!.exerciseName, "Bicep Curl");
  assert.equal(out[0]!.progressionKey, null); // 자동진행 안 함
  assert.equal(out[0]!.sets[0]!.reps, 12);
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 20);
});

test("slotted: DEADLIFT 슬롯은 explicit TM 없으면 SQUAT TM로 폴백 (원본 규칙 유지)", () => {
  const session = {
    key: "B",
    items: [
      {
        exerciseName: "Trap Bar Deadlift",
        rowType: "AUTO",
        progressionTarget: "DEADLIFT",
        slot: { coef: 0.8, amrap: false, sessionKey: "B", role: { ko: "고강도", en: "Heavy" } },
        sets: [{ reps: 3 }, { reps: 3 }, { reps: 3 }],
      },
    ],
  };
  // DEADLIFT explicit TM 제거 → SQUAT(160)로 폴백
  const params = { trainingMaxKg: { SQUAT: 160, BENCH: 120 } };
  const out = plannedExercisesFromAsymptoteManualSession(session, 1, params, {});
  const expected = calculateAsymptoteWorkingWeight({
    tmKg: 160,
    cycleInBlock: 1,
    sessionInCycle: 2,
    lift: "DEADLIFT",
  });
  assert.equal(out[0]!.sets[0]!.targetWeightKg, expected);
});
