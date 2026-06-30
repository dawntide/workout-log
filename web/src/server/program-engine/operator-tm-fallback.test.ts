import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedExercisesFromOperatorManualSession } from "./generateSession";

// Operator는 무게를 TM × 주차% 로 처방한다. 사용자가 메인 3리프트(스쿼트/벤치/풀)의
// TM만 입력하고 데드리프트/오버헤드프레스 TM을 비워둔 커스텀 operator에서, 예전에는
// 그 두 운동의 targetWeightKg가 비어(undefined) 소비자에서 0으로 표시됐다(버그).
// 이제 asymptote와 동일하게 인접 메인 리프트로 폴백한다: 데드←스쿼트 TM,
// 오프←벤치 TM×0.5. 직접 TM이 있으면 항상 그쪽이 우선한다.

type Item = Record<string, unknown>;
const operatorSession = (): { key: string; items: Item[] } => ({
  key: "D3",
  items: [
    { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
    { exerciseName: "Bench Press", rowType: "AUTO", progressionTarget: "BENCH", order: 1 },
    { exerciseName: "Deadlift", rowType: "AUTO", progressionTarget: "DEADLIFT", order: 2 },
    { exerciseName: "Overhead Press", rowType: "AUTO", progressionTarget: "OHP", order: 3 },
  ],
});

const tmOf = (out: ReturnType<typeof plannedExercisesFromOperatorManualSession>, name: string) =>
  out.find((e) => e.exerciseName === name)?.sets?.[0]?.targetWeightKg;

test("operator manual: 데드/오프 TM 미입력 → 인접 리프트 폴백 (데드←스쿼트, 오프←벤치×0.5)", () => {
  // 데드리프트/오버헤드프레스 TM이 trainingMaxKg에 없다 — 버그 재현 조건.
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 100 } };
  const out = plannedExercisesFromOperatorManualSession(operatorSession(), 1, params, params, {});

  // W1 = 70%
  assert.equal(tmOf(out, "Back Squat"), 70); //  100 × 0.7
  assert.equal(tmOf(out, "Bench Press"), 70); // 100 × 0.7
  assert.equal(tmOf(out, "Deadlift"), 70); //    SQUAT TM 100 × 0.7 (폴백)
  assert.equal(tmOf(out, "Overhead Press"), 35); // (BENCH 100 × 0.5 = 50) × 0.7 (폴백)
});

test("operator manual: 데드/오프 직접 TM이 있으면 폴백보다 우선", () => {
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 80, DEADLIFT: 150, OHP: 50 } };
  const out = plannedExercisesFromOperatorManualSession(operatorSession(), 1, params, params, {});

  assert.equal(tmOf(out, "Deadlift"), 105); //      150 × 0.7 (직접; 폴백이면 70)
  assert.equal(tmOf(out, "Overhead Press"), 35); // 50 × 0.7  (직접; 폴백이면 BENCH 80×0.5×0.7 = 28)
});

test("operator manual: 폴백 소스(스쿼트/벤치)조차 없으면 무게 미처방(reps-only) 유지", () => {
  // 벤치 TM이 없으면 오프는 폴백 불가 → 예전처럼 reps-only(무게 비움). 데드는 스쿼트로 폴백.
  const params = { trainingMaxKg: { SQUAT: 100 } };
  const out = plannedExercisesFromOperatorManualSession(operatorSession(), 1, params, params, {});

  assert.equal(tmOf(out, "Deadlift"), 70); //          SQUAT 100 × 0.7 (폴백)
  assert.equal(tmOf(out, "Overhead Press"), undefined); // 폴백 불가 → targetWeightKg 없음
});

test("operator manual: CUSTOM 메인 행(progressionTarget 보유)도 무게 0이면 폴백 처방", () => {
  // 실제 제보 케이스: 데드/오프가 manual 빌더에서 rowType=CUSTOM + targetWeightKg:0으로 추가됨.
  // AUTO 행이 아니라 mapManualSet 경로를 타 0이 그대로 보이던 것을 폴백 처방으로 채운다.
  const session = {
    key: "D3",
    items: [
      { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", order: 0 },
      { exerciseName: "Deadlift", rowType: "CUSTOM", role: "MAIN", progressionTarget: "DEADLIFT", sets: [{ reps: 5, targetWeightKg: 0 }], order: 1 },
      { exerciseName: "Overhead Press", rowType: "CUSTOM", role: "MAIN", progressionTarget: "OHP", sets: [{ reps: 5, targetWeightKg: 0 }], order: 2 },
      { exerciseName: "Bicep Curl", rowType: "CUSTOM", sets: [{ reps: 12, targetWeightKg: 0 }], order: 3 },
    ],
  };
  const params = { trainingMaxKg: { SQUAT: 100, BENCH: 100 } };
  const out = plannedExercisesFromOperatorManualSession(session, 1, params, params, {}); // W1 = 70%

  assert.equal(tmOf(out, "Deadlift"), 70); //        SQUAT 100 × 0.7 (CUSTOM이지만 폴백)
  assert.equal(tmOf(out, "Overhead Press"), 35); //  (BENCH 100 × 0.5 = 50) × 0.7
  assert.equal(tmOf(out, "Bicep Curl"), 0); //       progressionTarget 없음 → 처방 안 함(0 유지)
});

test("operator manual: CUSTOM 메인 행에 무게가 입력돼 있으면 폴백하지 않고 보존", () => {
  const session = {
    key: "D3",
    items: [
      { exerciseName: "Deadlift", rowType: "CUSTOM", role: "MAIN", progressionTarget: "DEADLIFT", sets: [{ reps: 5, targetWeightKg: 120 }], order: 0 },
    ],
  };
  const params = { trainingMaxKg: { SQUAT: 100 } };
  const out = plannedExercisesFromOperatorManualSession(session, 1, params, params, {});

  assert.equal(tmOf(out, "Deadlift"), 120); // 사용자 입력 무게 보존(폴백 미적용)
});
