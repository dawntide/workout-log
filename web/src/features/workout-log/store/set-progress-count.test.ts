import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "jotai";
import {
  completedSetsCountAtom,
  draftAtom,
  totalSetsCountAtom,
} from "./workout-log-atoms";
import {
  createWorkoutRecordDraftFromLog,
  type ExistingWorkoutLogLike,
} from "@/lib/workout-record/model";

// 진행률 게이지는 분자(완료)와 분모(전체) 양쪽에서 웜업을 빼야 한다. 한쪽만 빼면
// 웜업을 다는 순간 게이지가 100%를 넘거나 영영 안 채워진다(계획서 §3.3).

function loggedSession(setTypes: Array<string | null>): ExistingWorkoutLogLike {
  return {
    id: "log-1",
    planId: "plan-1",
    generatedSessionId: null,
    performedAt: "2026-08-25T10:00:00.000Z",
    notes: null,
    sets: setTypes.map((setType, index) => ({
      exerciseId: "ex-1",
      exerciseName: "Back Squat",
      sortOrder: 0,
      setNumber: index + 1,
      reps: 5,
      weightKg: 100,
      rpe: 0,
      isExtra: false,
      setType,
      meta: {},
    })),
  };
}

function counts(setTypes: Array<string | null>) {
  const store = createStore();
  store.set(draftAtom, createWorkoutRecordDraftFromLog(loggedSession(setTypes), "Plan"));
  return {
    completed: store.get(completedSetsCountAtom),
    total: store.get(totalSetsCountAtom),
  };
}

test("웜업은 분자와 분모 양쪽에서 빠진다", () => {
  assert.deepEqual(counts(["WARMUP", null, null]), { completed: 2, total: 2 });
});

test("완료율이 100%를 넘지 않는다 — 전부 웜업이면 0/0", () => {
  const { completed, total } = counts(["WARMUP", "WARMUP"]);
  assert.equal(total, 0);
  assert.equal(completed, 0);
});

test("실패 세트는 진행률에 남는다 — 수행한 세트다", () => {
  assert.deepEqual(counts(["FAILURE", null]), { completed: 2, total: 2 });
});

test("태그 없는 레거시 세션은 종전대로 전부 잡힌다", () => {
  assert.deepEqual(counts([null, null, null]), { completed: 3, total: 3 });
});
