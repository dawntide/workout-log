import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBodyweightTotalLoadKg,
  computeExternalLoadFromTotalKg,
  formatExerciseLoadLabel,
  resolveLoggedTotalLoadKg,
  bodyweightAddedSuffix,
  resolveLoggedLoadDisplay,
  prescriptionToExternalLoadKg,
  sessionHasBodyweightAmrap,
  sessionHasBodyweightExercise,
} from "./bodyweight-load";

test("computeExternalLoadFromTotalKg subtracts bodyweight for pull-up", () => {
  assert.equal(computeExternalLoadFromTotalKg("Pull-Up", 92.5, 70), 22.5);
  assert.equal(computeExternalLoadFromTotalKg("Pull-Up", 62.5, 70), 0);
});

test("prescriptionToExternalLoadKg: 처방 총부하를 외부 추가중량으로 변환", () => {
  // 맨몸 + 체중 설정: 총부하 − 체중
  assert.equal(prescriptionToExternalLoadKg("Pull-Up", 97.5, 72.5), 25);
  // 맨몸 + 체중 미설정: 변환 불가 → 0 (총부하를 외부중량으로 저장하던 버그 방지)
  assert.equal(prescriptionToExternalLoadKg("Pull-Up", 97.5, null), 0);
  assert.equal(prescriptionToExternalLoadKg("Pull-Up", 97.5, 0), 0);
  // 비-맨몸 운동: 처방값 그대로
  assert.equal(prescriptionToExternalLoadKg("Back Squat", 95, null), 95);
  assert.equal(prescriptionToExternalLoadKg("Back Squat", 95, 72.5), 95);
});

test("resolveLoggedTotalLoadKg prefers logged total load meta for bodyweight exercise", () => {
  assert.equal(
    resolveLoggedTotalLoadKg({
      exerciseName: "Pull-Up",
      weightKg: 20,
      meta: { totalLoadKg: 90 },
    }),
    90,
  );
  assert.equal(
    resolveLoggedTotalLoadKg({
      exerciseName: "Bench Press",
      weightKg: 90,
      meta: { totalLoadKg: 120 },
    }),
    90,
  );
});

test("formatExerciseLoadLabel shows total load first with added weight in parens", () => {
  assert.equal(
    formatExerciseLoadLabel({
      exerciseName: "Pull-Up",
      weightKg: 92.5,
      bodyweightKg: 70,
      source: "total",
    }),
    "92.5kg (+22.5)",
  );
  assert.equal(
    formatExerciseLoadLabel({
      exerciseName: "Pull-Up",
      weightKg: 20,
      bodyweightKg: 70,
      source: "external",
    }),
    "90kg (+20)",
  );
  assert.equal(
    formatExerciseLoadLabel({
      exerciseName: "Pull-Up",
      weightKg: 0,
      bodyweightKg: 70,
      source: "external",
      locale: "en",
    }),
    "70kg (BW)",
  );
  assert.equal(computeBodyweightTotalLoadKg("Pull-Up", 20, 70), 90);
});

test("bodyweightAddedSuffix: 총무게 뒤 추가중량/체중 병기", () => {
  assert.equal(bodyweightAddedSuffix("Pull-Up", 90, 70, "ko"), "(+20)");
  assert.equal(bodyweightAddedSuffix("Pull-Up", 70, 70, "ko"), "(체중)");
  assert.equal(bodyweightAddedSuffix("Pull-Up", 70, 70, "en"), "(BW)");
  // 총무게 < 체중(보조 영역)은 추가중량 0으로 클램프 → 체중 표기
  assert.equal(bodyweightAddedSuffix("Pull-Up", 60, 70, "ko"), "(체중)");
  // 비-맨몸 운동/체중 미상은 병기 없음
  assert.equal(bodyweightAddedSuffix("Bench Press", 100, 70, "ko"), null);
  assert.equal(bodyweightAddedSuffix("Pull-Up", 90, null, "ko"), null);
});

test("resolveLoggedLoadDisplay: 로그 세트를 총무게+추가 병기로 환산", () => {
  assert.deepEqual(
    resolveLoggedLoadDisplay({
      exerciseName: "Pull-Up",
      weightKg: 20,
      meta: { totalLoadKg: 90 },
      locale: "ko",
    }),
    { totalKg: 90, suffix: "(+20)" },
  );
  assert.deepEqual(
    resolveLoggedLoadDisplay({
      exerciseName: "Pull-Up",
      weightKg: 0,
      meta: { totalLoadKg: 70 },
      locale: "ko",
    }),
    { totalKg: 70, suffix: "(체중)" },
  );
  // 총부하 메타 없으면 환산 불가 → 원래 값, 병기 없음
  assert.deepEqual(
    resolveLoggedLoadDisplay({
      exerciseName: "Pull-Up",
      weightKg: 20,
      meta: null,
      locale: "ko",
    }),
    { totalKg: 20, suffix: null },
  );
  // 비-맨몸 운동은 그대로
  assert.deepEqual(
    resolveLoggedLoadDisplay({
      exerciseName: "Bench Press",
      weightKg: 90,
      meta: { totalLoadKg: 120 },
      locale: "ko",
    }),
    { totalKg: 90, suffix: null },
  );
});

test("sessionHasBodyweightAmrap: 풀업 AMRAP 세트가 있으면 true", () => {
  const exercises = [
    { exerciseName: "Back Squat", plannedSetMeta: { amrapPerSet: [false, false, false, true] } },
    { exerciseName: "Weighted Pull-Up", plannedSetMeta: { amrapPerSet: [false, false, false, true] } },
  ];
  assert.equal(sessionHasBodyweightAmrap(exercises), true);
});

test("sessionHasBodyweightAmrap: 맨몸 운동에 AMRAP 세트가 없으면 false", () => {
  const exercises = [
    { exerciseName: "Weighted Pull-Up", plannedSetMeta: { amrapPerSet: [false, false, false] } },
    { exerciseName: "Back Squat", plannedSetMeta: { amrapPerSet: [true] } }, // 스쿼트 AMRAP은 맨몸 아님
  ];
  assert.equal(sessionHasBodyweightAmrap(exercises), false);
});

test("sessionHasBodyweightAmrap: plannedSetMeta 없거나 빈 세션은 false", () => {
  assert.equal(sessionHasBodyweightAmrap([]), false);
  assert.equal(sessionHasBodyweightAmrap([{ exerciseName: "Pull-Up" }]), false);
  assert.equal(
    sessionHasBodyweightAmrap([{ exerciseName: "Pull-Up", plannedSetMeta: { amrapPerSet: null } }]),
    false,
  );
});

test("sessionHasBodyweightExercise: 중량풀업이 있으면 true (AMRAP 무관)", () => {
  assert.equal(
    sessionHasBodyweightExercise([
      { exerciseName: "Back Squat" },
      { exerciseName: "Weighted Pull-Up" },
    ]),
    true,
  );
  // AMRAP 세트가 없어도 풀업이면 true (TB/5x5 등 적용)
  assert.equal(sessionHasBodyweightExercise([{ exerciseName: "Pull-Up" }]), true);
  assert.equal(sessionHasBodyweightExercise([{ exerciseName: "친업" }]), true);
});

test("sessionHasBodyweightExercise: 맨몸 운동이 없으면 false", () => {
  assert.equal(
    sessionHasBodyweightExercise([
      { exerciseName: "Back Squat" },
      { exerciseName: "Bench Press" },
      { exerciseName: "Deadlift" },
    ]),
    false,
  );
  assert.equal(sessionHasBodyweightExercise([]), false);
});
