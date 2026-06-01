import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPrescription,
  formatPerformedSet,
  formatPerformedHistoryLine,
  formatPerformedHistoryCompact,
  formatPlannedGroups,
  summarizePerformedHistory,
} from "./format";

test("formatPrescription: 기본 `Sets × Reps @ Weight`", () => {
  assert.equal(
    formatPrescription({ sets: 3, reps: 5, weightKg: 100 }),
    "3 × 5 @ 100kg",
  );
});

test("formatPrescription: AMRAP 마지막 세트에 `+`", () => {
  assert.equal(
    formatPrescription({ sets: 3, reps: 5, weightKg: 100, lastSetAmrap: true }),
    "3 × 5+ @ 100kg",
  );
});

test("formatPrescription: 무게 미정이면 percent fallback", () => {
  assert.equal(
    formatPrescription({ sets: 3, reps: 5, percent: 80 }),
    "3 × 5 @ 80%",
  );
});

test("formatPrescription: weightSuffix는 무게 뒤에 병기 (맨몸 운동 총무게+추가)", () => {
  assert.equal(
    formatPrescription({ sets: 3, reps: 5, weightKg: 90, weightSuffix: "(+10)" }),
    "3 × 5 @ 90kg (+10)",
  );
});

test("formatPrescription: weightSuffix는 percent fallback에는 적용되지 않음", () => {
  assert.equal(
    formatPrescription({ sets: 3, reps: 5, percent: 70, weightSuffix: "(+10)" }),
    "3 × 5 @ 70%",
  );
});

test("formatPerformedHistoryCompact: weightSuffix 병기 (맨몸 총무게)", () => {
  assert.equal(
    formatPerformedHistoryCompact(90, 5, 3, "(+20)"),
    "90kg (+20) × 5 × 3",
  );
  assert.equal(
    formatPerformedHistoryCompact(70, 5, 1, "(체중)"),
    "70kg (체중) × 5",
  );
  // 무게 0이면 suffix 무시
  assert.equal(formatPerformedHistoryCompact(0, 5, 2, "(+20)"), "— × 5 × 2");
});

test("formatPrescription: RPE 처방 추가", () => {
  assert.equal(
    formatPrescription({ sets: 3, reps: 5, weightKg: 100, rpe: 8 }),
    "3 × 5 @ 100kg RPE 8",
  );
});

test("formatPrescription: sets===1이면 sets 부분 생략", () => {
  assert.equal(
    formatPrescription({ sets: 1, reps: 5, weightKg: 100 }),
    "5 @ 100kg",
  );
});

test("formatPrescription: 무게/퍼센트 둘 다 없으면 강도 생략", () => {
  assert.equal(formatPrescription({ sets: 3, reps: 5 }), "3 × 5");
});

test("formatPerformedSet: `Weight × Reps`", () => {
  assert.equal(formatPerformedSet({ weightKg: 100, reps: 5 }), "100kg × 5");
});

test("formatPerformedSet: AMRAP 세트에 `+`", () => {
  assert.equal(
    formatPerformedSet({ weightKg: 100, reps: 8, isAmrap: true }),
    "100kg × 8+",
  );
});

test("formatPerformedSet: 무게 0이면 `—` 표시", () => {
  assert.equal(formatPerformedSet({ weightKg: 0, reps: 10 }), "— × 10");
});

test("summarizePerformedHistory: 모든 세트 동일 + no AMRAP → compact", () => {
  const view = summarizePerformedHistory([
    { weightKg: 100, reps: 5 },
    { weightKg: 100, reps: 5 },
    { weightKg: 100, reps: 5 },
  ]);
  assert.deepEqual(view, {
    mode: "compact",
    weightKg: 100,
    reps: 5,
    sets: 3,
  });
});

test("summarizePerformedHistory: reps 다르면 expanded", () => {
  const sets = [
    { weightKg: 100, reps: 5 },
    { weightKg: 100, reps: 5 },
    { weightKg: 100, reps: 3 },
  ];
  const view = summarizePerformedHistory(sets);
  assert.equal(view.mode, "expanded");
});

test("summarizePerformedHistory: AMRAP 세트 있으면 무조건 expanded", () => {
  const sets = [
    { weightKg: 100, reps: 5 },
    { weightKg: 100, reps: 5 },
    { weightKg: 100, reps: 5, isAmrap: true },
  ];
  const view = summarizePerformedHistory(sets);
  assert.equal(
    view.mode,
    "expanded",
    "AMRAP 세트가 있으면 compact 금지 (정보 손실 방지)",
  );
});

test("formatPerformedHistoryLine: compact 한 줄", () => {
  assert.equal(
    formatPerformedHistoryLine([
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
    ]),
    "100kg × 5 × 3",
  );
});

test("formatPerformedHistoryLine: expanded는 ` / ` 구분", () => {
  assert.equal(
    formatPerformedHistoryLine([
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 3 },
    ]),
    "100kg × 5 / 100kg × 5 / 100kg × 3",
  );
});

test("formatPerformedHistoryLine: AMRAP 세트 포함 시 expanded + `+`", () => {
  assert.equal(
    formatPerformedHistoryLine([
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 8, isAmrap: true },
    ]),
    "100kg × 5 / 100kg × 5 / 100kg × 8+",
  );
});

test("formatPlannedGroups: 단일 그룹 `Sets × Reps @ Weight`", () => {
  assert.equal(
    formatPlannedGroups([{ count: 3, reps: 5, weightKg: 100 }]),
    "3 × 5 @ 100kg",
  );
});

test("formatPlannedGroups: 무게 없으면 강도 생략", () => {
  assert.equal(formatPlannedGroups([{ count: 3, reps: 5 }]), "3 × 5");
});

test("formatPlannedGroups: 다중 그룹 누적 + max weight", () => {
  assert.equal(
    formatPlannedGroups([
      { count: 3, reps: 5, weightKg: 100 },
      { count: 2, reps: 3, weightKg: 110 },
    ]),
    "3 × 5, 2 × 3 (max 110kg)",
  );
});

test("formatPlannedGroups: 다중 그룹 무게 없으면 max 생략", () => {
  assert.equal(
    formatPlannedGroups([
      { count: 3, reps: 5 },
      { count: 2, reps: 8 },
    ]),
    "3 × 5, 2 × 8",
  );
});

test("formatPlannedGroups: 빈 배열은 빈 문자열", () => {
  assert.equal(formatPlannedGroups([]), "");
});
