import assert from "node:assert/strict";
import test from "node:test";

import { buildRef5LogSets } from "./ref5-log-sets";

/**
 * 이 조립기는 저장 경로의 REF5 검증을 통과하는 것이 유일한 목적이다. 그 검증은 DB가
 * 있어야 돌아가므로 진짜 커버리지는 `db:verify:programs`에 있다. 여기서는 **DB 없이도
 * 잡을 수 있는 함정**만 잠근다 — 값이 조금 틀려도 저장은 성공하고 숫자만 조용히 틀리는 것들.
 */

function snapshotFixture() {
  return {
    protocolVersion: "1.3",
    ref5: {
      protocolVersion: "1.3",
      actualStartAt: "2026-06-22T09:00:00.000Z",
      startEventId: "start-1",
      runtimeRevisionBefore: 7,
      runtimeRevisionAfter: 8,
    },
    exercises: [
      {
        exerciseName: "High-Bar Back Squat",
        ref5: { prescriptionId: "SQ_H3", snapshotId: "snap-1" },
        sets: [
          { plannedReps: 3, targetWeightKg: 82.5 },
          { plannedReps: 3, targetWeightKg: 82.5 },
        ],
      },
      {
        exerciseName: "Weighted Pull-Up",
        ref5: { prescriptionId: "PULL_FOCUS", snapshotId: "snap-1" },
        // 맨몸 운동: 총 부하 95kg = 체중 80 + 외부 15.
        sets: [{ plannedReps: 3, externalLoadKg: 15, targetWeightKg: 95 }],
      },
    ],
  };
}

test("맨몸 운동은 총 부하가 아니라 외부 부하로 저장한다", () => {
  const sets = buildRef5LogSets(snapshotFixture());
  const pull = sets.find((set) => set.exerciseName === "Weighted Pull-Up");
  // targetWeightKg를 먼저 읽으면 저장 경로가 체중을 한 번 더 더해 175kg짜리 턱걸이가 된다.
  // 저장은 성공하므로 통계·PR가 조용히 틀어질 뿐, 아무 오류도 나지 않는다.
  assert.equal(pull?.weightKg, 15);
});

test("동결 처방과 대조되는 meta.ref5를 세트마다 싣는다", () => {
  const [first] = buildRef5LogSets(snapshotFixture());
  const ref5 = (first?.meta as Record<string, any>).ref5;
  assert.deepEqual(ref5.prescription, { prescriptionId: "SQ_H3", snapshotId: "snap-1" });
  assert.equal(ref5.protocolVersion, "1.3");
  assert.equal(ref5.actualStartAt, "2026-06-22T09:00:00.000Z");
  assert.equal(ref5.startEventId, "start-1");
  assert.equal(ref5.completionEventId, "start-1:completion");
  assert.equal(ref5.runtimeRevisionBefore, 7);
  assert.equal(ref5.runtimeRevisionAfter, 8);
  assert.equal(ref5.plannedReps, 3);
  assert.equal(ref5.actualReps, 3);
  assert.equal(ref5.setIndex, 0);
  assert.equal(ref5.terminationReason, "NORMAL");
});

test("종료 사유는 운동 단위라 한 운동의 세트가 서로 달라질 수 없다", () => {
  // 저장 경로가 "한 운동의 모든 세트는 같은 종료 사유"를 강제한다. 세트 단위로 열어 두면
  // 호출자가 거부당할 페이로드를 만들 수 있으므로, 시그니처 자체가 그것을 막는다.
  const sets = buildRef5LogSets(snapshotFixture(), {
    terminationReasonFor: ({ exerciseIndex }) =>
      exerciseIndex === 0 ? "FORCE_OR_TECHNIQUE" : "NORMAL",
  });
  const byExercise = new Map<string, Set<string>>();
  for (const set of sets) {
    const reason = String((set.meta as Record<string, any>).ref5.terminationReason);
    const seen = byExercise.get(set.exerciseName!) ?? new Set<string>();
    seen.add(reason);
    byExercise.set(set.exerciseName!, seen);
  }
  assert.deepEqual([...byExercise].map(([name, reasons]) => [name, [...reasons]]), [
    ["High-Bar Back Squat", ["FORCE_OR_TECHNIQUE"]],
    ["Weighted Pull-Up", ["NORMAL"]],
  ]);
});

test("실제 수행 횟수를 바꿔도 처방된 횟수는 그대로 남는다", () => {
  const sets = buildRef5LogSets(snapshotFixture(), {
    actualRepsFor: ({ setIndex, plannedReps }) => (setIndex === 0 ? plannedReps - 1 : plannedReps),
  });
  const first = sets[0]!.meta as Record<string, any>;
  // 저장 경로는 plannedReps를 처방과 대조하고 actualReps로 판정한다. 둘을 함께 깎으면
  // 실패가 아니라 "처방이 원래 2회였다"가 되어 PASS로 통과해 버린다.
  assert.equal(first.ref5.plannedReps, 3);
  assert.equal(first.ref5.actualReps, 2);
  assert.equal(sets[0]!.reps, 2);
});
