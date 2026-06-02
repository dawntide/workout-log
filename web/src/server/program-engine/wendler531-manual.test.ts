import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plannedExercisesFrom531ManualSession,
  resolveManualEntry,
} from "./generateSession";
import { resolveAutoProgressionProgram } from "@/server/progression/reducer";

// 531 슬롯형 커스터마이즈 — 운동명을 바꿔도 슬롯(메인/FSL/BBB)의 주차 흐름이 그대로 적용되고,
// 무게가 원본 generate531과 일치하는지 검증한다.
const TM = { trainingMaxKg: { SQUAT: 200, BENCH: 140, DEADLIFT: 240, OHP: 100 } };

function sessionD1(assistance?: "fsl" | "bbb") {
  const items: any[] = [
    {
      exerciseName: "Front Squat", // 원본 Back Squat에서 교체된 상태
      rowType: "AUTO",
      progressionTarget: "SQUAT",
      slot: { role: { ko: "메인", en: "Main" }, sessionKey: "D1", assistance: "main" },
      sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }],
    },
  ];
  if (assistance) {
    items.push({
      exerciseName: "Front Squat",
      rowType: "AUTO",
      progressionTarget: "SQUAT",
      slot: { role: { ko: "보조", en: "Assist" }, sessionKey: "D1", assistance },
      sets: [],
    });
  }
  return { key: "D1", items };
}

test("531 메인: 운동명 교체해도 주차 테이블 무게가 적용 (week1 = 65/75/85%, 마지막 AMRAP)", () => {
  const out = plannedExercisesFrom531ManualSession(sessionD1(), 1, TM, {});
  const main = out[0]!;
  assert.equal(main.exerciseName, "Front Squat");
  assert.equal(main.progressionKey, "SQUAT"); // reducer wendler-531 진행과 호환
  assert.equal(main.sets.length, 3);
  // TM SQUAT=200 → 130 / 150 / 170
  assert.equal(main.sets[0]!.targetWeightKg, 130);
  assert.equal(main.sets[1]!.targetWeightKg, 150);
  assert.equal(main.sets[2]!.targetWeightKg, 170);
  assert.equal(main.sets[2]!.amrap, true);
  assert.equal(main.sets[0]!.amrap, false);
});

test("531 메인: week3는 5/3/1 (75/85/95%)", () => {
  const out = plannedExercisesFrom531ManualSession(sessionD1(), 3, TM, {});
  const main = out[0]!;
  assert.equal(main.sets[0]!.reps, 5);
  assert.equal(main.sets[1]!.reps, 3);
  assert.equal(main.sets[2]!.reps, 1);
  assert.equal(main.sets[0]!.targetWeightKg, 150); // 200*0.75
  assert.equal(main.sets[2]!.targetWeightKg, 190); // 200*0.95
});

test("531 보조: FSL=첫세트% 5×5, BBB=TM50% 5×10, 진행 추적 안 함(ASSIST)", () => {
  const fsl = plannedExercisesFrom531ManualSession(sessionD1("fsl"), 1, TM, {})[1]!;
  assert.equal(fsl.role, "ASSIST");
  assert.equal(fsl.progressionKey, null);
  assert.equal(fsl.sets.length, 5);
  assert.equal(fsl.sets[0]!.reps, 5);
  assert.equal(fsl.sets[0]!.targetWeightKg, 130); // week1 첫세트 65% of 200

  const bbb = plannedExercisesFrom531ManualSession(sessionD1("bbb"), 1, TM, {})[1]!;
  assert.equal(bbb.sets.length, 5);
  assert.equal(bbb.sets[0]!.reps, 10);
  assert.equal(bbb.sets[0]!.targetWeightKg, 100); // 50% of 200
});

test("531 레지스트리/진행: fork(새 slug)도 wendler-531로 인식", () => {
  const entry = resolveManualEntry({ kind: "manual", programFamily: "wendler-531" });
  assert.equal(entry?.family, "wendler-531");
  assert.equal(entry?.manualPlanner, "wendler-531");
  assert.equal(entry?.flowStyle, "slotted");
  assert.equal(
    resolveAutoProgressionProgram("531-fork-xyz", { kind: "manual", programFamily: "wendler-531" }),
    "wendler-531",
  );
});
