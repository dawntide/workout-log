import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBodyweightTotalLoadKg,
  computeExternalLoadFromTotalKg,
  formatExerciseLoadLabel,
  resolveLoggedTotalLoadKg,
  bodyweightAddedSuffix,
  resolveLoggedLoadDisplay,
} from "./bodyweight-load";

test("computeExternalLoadFromTotalKg subtracts bodyweight for pull-up", () => {
  assert.equal(computeExternalLoadFromTotalKg("Pull-Up", 92.5, 70), 22.5);
  assert.equal(computeExternalLoadFromTotalKg("Pull-Up", 62.5, 70), 0);
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
