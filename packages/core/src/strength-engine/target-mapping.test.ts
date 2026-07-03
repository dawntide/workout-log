import assert from "node:assert/strict";
import test from "node:test";
import { mapExerciseNameToTarget, type StrengthTarget } from "./target-mapping";

// audit §3.6: reducer/generator가 공유하는 정규 매퍼의 분기·우선순위·tie-break를 고정한다.
// (단일화 이전에는 테이블 레벨 커버리지가 없었음)

const CASES: Array<{ name: string; expected: StrengthTarget | null }> = [
  // SQUAT
  { name: "Back Squat", expected: "SQUAT" },
  { name: "Front Squat", expected: "SQUAT" },
  { name: "  high-bar SQUAT  ", expected: "SQUAT" },
  // BENCH
  { name: "Bench Press", expected: "BENCH" },
  { name: "Close-Grip Bench", expected: "BENCH" },
  // DEADLIFT
  { name: "Deadlift", expected: "DEADLIFT" },
  { name: "Romanian Deadlift", expected: "DEADLIFT" },
  // OHP
  { name: "ohp", expected: "OHP" },
  { name: "OHP", expected: "OHP" },
  { name: "Overhead Press", expected: "OHP" },
  { name: "Seated Shoulder Press", expected: "OHP" },
  // PULL
  { name: "Barbell Row", expected: "PULL" },
  { name: "Weighted Pull-Up", expected: "PULL" },
  { name: "pull up", expected: "PULL" },
  { name: "Lat Pulldown", expected: "PULL" },
  // no match
  { name: "Bicep Curl", expected: null },
  { name: "", expected: null },
  { name: "   ", expected: null },
];

for (const c of CASES) {
  test(`mapExerciseNameToTarget("${c.name}") → ${c.expected}`, () => {
    assert.equal(mapExerciseNameToTarget(c.name), c.expected);
  });
}

// tie-break: 우선순위가 squat → bench → deadlift → ohp → pull 순임을 명시 고정.
// (한 이름이 여러 키워드를 포함할 때 먼저 매칭되는 타깃이 이긴다)
test("우선순위: 'squat'이 'bench'보다 먼저 매칭", () => {
  assert.equal(mapExerciseNameToTarget("squat bench combo"), "SQUAT");
});
test("우선순위: 'bench'가 'row'보다 먼저 매칭", () => {
  assert.equal(mapExerciseNameToTarget("bench row hybrid"), "BENCH");
});
