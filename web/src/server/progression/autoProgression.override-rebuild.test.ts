import assert from "node:assert/strict";
import test from "node:test";
import { reduceProgressionState } from "./reducer";
import {
  applyTargetDecisionsToReduced,
  buildProgressionEventMeta,
  readStoredDecisionsFromMeta,
  type ProgressionTargetDecision,
} from "./autoProgression";

// 회귀: 사용자가 "사이클 종료 모달"에서 고른 운동별 증감량(progressionTargetDecisions)이
// progress_event.meta.targetDecisionsOverride 로 영속화되고, 이후 rebuild/replay가
// 과거 이벤트를 재계산할 때 그 결정을 복원해 다시 적용하는지 검증한다.
//
// 버그 시나리오(수정 전): 사용자가 블록 완료 시 스쿼트를 자동 +5(105) 대신 +2.5(102.5)로
// 골라도, 과거 날짜 기록 추가/수정/삭제로 rebuild가 한 번 돌면 decisions 없이 reducer
// 기본 룰로 재계산되어 105 로 되돌아갔다.

type LogSet = { name: string; reps: number; weight: number };

const WEEK_SCHEME: Record<number, { reps: number; pct: number }> = {
  1: { reps: 5, pct: 0.7 },
  2: { reps: 5, pct: 0.8 },
  3: { reps: 3, pct: 0.9 },
  4: { reps: 5, pct: 0.75 },
  5: { reps: 3, pct: 0.85 },
  6: { reps: 1, pct: 0.95 },
};

type TmMap = { SQUAT: number; BENCH: number; DEADLIFT: number; PULL: number };

function operatorSessionSets(day: number, tm: TmMap, reps: number, pct: number): LogSet[] {
  const round = (v: number) => Math.round(v * 100) / 100;
  const exercises =
    day === 3
      ? [
          { name: "Back Squat", weight: round(tm.SQUAT * pct) },
          { name: "Bench Press", weight: round(tm.BENCH * pct) },
          { name: "Deadlift", weight: round(tm.DEADLIFT * pct) },
        ]
      : [
          { name: "Back Squat", weight: round(tm.SQUAT * pct) },
          { name: "Bench Press", weight: round(tm.BENCH * pct) },
          { name: "Pull-Up", weight: round(tm.PULL * pct) },
        ];
  return exercises.flatMap((ex) =>
    Array.from({ length: 3 }, () => ({ name: ex.name, reps, weight: ex.weight })),
  );
}

type BlockEvent = { logId: string; meta: unknown };

// 한 Operator 블록(6주×3일=18세션)을 reduceProgressionState로 재생하고,
// 각 로그마다 (reducer 결과 + 그 로그에 적용할 사용자 결정)을 합성해
// 실제 저장 경로(applyTargetDecisionsToReduced → buildProgressionEventMeta)와 동일하게
// 다음 state / meta 를 만들어 누적한다.
function runBlock(opts: {
  startState: unknown;
  tm: TmMap;
  planParams: Record<string, unknown>;
  logIdPrefix: string;
  // logId / 블록종료여부 → 사용자 결정 (rebuild 시에는 저장본을 복원해 반환)
  decisionFor?: (logId: string, isBlockEnd: boolean) => Record<string, ProgressionTargetDecision> | null;
}) {
  let state: unknown = opts.startState;
  const events: BlockEvent[] = [];
  let logCounter = 0;
  for (let week = 1; week <= 6; week += 1) {
    const { reps, pct } = WEEK_SCHEME[week]!;
    for (let day = 1; day <= 3; day += 1) {
      logCounter += 1;
      const logId = `${opts.logIdPrefix}-${logCounter}`;
      const sets = operatorSessionSets(day, opts.tm, reps, pct).map((s) => ({
        exerciseName: s.name,
        reps: s.reps,
        weightKg: s.weight,
        meta: {},
      }));
      const reduced = reduceProgressionState({
        program: "operator",
        previousState: state,
        planParams: opts.planParams,
        sets,
        logId,
      });
      const isBlockEnd = week === 6 && day === 3;
      const decision = opts.decisionFor ? opts.decisionFor(logId, isBlockEnd) : null;
      const applied = applyTargetDecisionsToReduced(reduced, decision);
      events.push({ logId, meta: buildProgressionEventMeta(reduced, applied.appliedDecisions) });
      state = applied.nextState;
    }
  }
  return { state: state as any, events };
}

const PLAN_PARAMS = { trainingMaxKg: { SQUAT: 95, BENCH: 95, PULL: 100, DEADLIFT: 70 } };
const TM: TmMap = { SQUAT: 95, BENCH: 95, DEADLIFT: 70, PULL: 100 };
const USER_DECISION: Record<string, ProgressionTargetDecision> = {
  SQUAT: { mode: "increase", workKg: 102.5 },
};

test("operator: 블록 완료 시 사용자 override(+2.5)가 reducer 자동 +5를 덮는다", () => {
  const block1 = runBlock({ startState: {}, tm: TM, planParams: PLAN_PARAMS, logIdPrefix: "b1" });
  assert.equal(block1.state.targets.SQUAT.workKg, 100, "블록1 완료 → 자동 +5 → 100");

  const block2 = runBlock({
    startState: block1.state,
    tm: TM,
    planParams: PLAN_PARAMS,
    logIdPrefix: "b2",
    decisionFor: (_logId, isEnd) => (isEnd ? USER_DECISION : null),
  });
  assert.equal(block2.state.targets.SQUAT.workKg, 102.5, "사용자 override → 102.5 (자동 105 아님)");

  // 블록2 완료 로그 meta 에 결정이 영속화됐는지
  const blockEndEvent = block2.events[block2.events.length - 1]!;
  const stored = readStoredDecisionsFromMeta(blockEndEvent.meta);
  assert.ok(stored, "블록 완료 meta 에 targetDecisionsOverride 가 저장되어야 한다");
  assert.equal(stored!.SQUAT.workKg, 102.5);
});

test("operator: rebuild가 저장된 override를 복원해 102.5를 보존한다 (핵심 회귀)", () => {
  // 1) 최초 저장 — 블록2 완료 시 사용자가 스쿼트 102.5 선택
  const orig1 = runBlock({ startState: {}, tm: TM, planParams: PLAN_PARAMS, logIdPrefix: "b1" });
  const orig2 = runBlock({
    startState: orig1.state,
    tm: TM,
    planParams: PLAN_PARAMS,
    logIdPrefix: "b2",
    decisionFor: (_logId, isEnd) => (isEnd ? USER_DECISION : null),
  });

  // 2) 저장된 meta 에서 logId별 결정 수집 (autoProgression.rebuild 의 priorEvent 수집과 동일)
  const savedByLogId = new Map<string, Record<string, ProgressionTargetDecision>>();
  for (const ev of [...orig1.events, ...orig2.events]) {
    const d = readStoredDecisionsFromMeta(ev.meta);
    if (d) savedByLogId.set(ev.logId, d);
  }

  // 3) rebuild 재현 — 전체를 처음부터 재계산하되 저장된 결정을 복원
  const restoreDecision = (logId: string) => savedByLogId.get(logId) ?? null;
  const rebuilt1 = runBlock({ startState: {}, tm: TM, planParams: PLAN_PARAMS, logIdPrefix: "b1", decisionFor: restoreDecision });
  const rebuilt2 = runBlock({ startState: rebuilt1.state, tm: TM, planParams: PLAN_PARAMS, logIdPrefix: "b2", decisionFor: restoreDecision });

  assert.equal(rebuilt2.state.targets.SQUAT.workKg, 102.5, "rebuild 후에도 사용자 override(102.5)가 보존되어야 한다");
});

test("operator: (대조) override를 복원하지 않으면 자동 105로 덮인다 — 수정 전 버그", () => {
  // rebuild 가 decisions 를 복원하지 않던 기존 동작 재현
  const buggy1 = runBlock({ startState: {}, tm: TM, planParams: PLAN_PARAMS, logIdPrefix: "b1" });
  const buggy2 = runBlock({ startState: buggy1.state, tm: TM, planParams: PLAN_PARAMS, logIdPrefix: "b2" });
  assert.equal(buggy2.state.targets.SQUAT.workKg, 105, "복원 없이 재계산하면 자동 +5 → 105 (사용자가 겪은 버그)");
});

test("readStoredDecisionsFromMeta: 유효한 override만 파싱하고 2.5kg로 스냅한다", () => {
  assert.equal(readStoredDecisionsFromMeta(null), null);
  assert.equal(readStoredDecisionsFromMeta({}), null);
  assert.equal(readStoredDecisionsFromMeta({ targetDecisionsOverride: {} }), null);
  assert.equal(
    readStoredDecisionsFromMeta({ targetDecisionsOverride: { SQUAT: { mode: "bogus", workKg: 100 } } }),
    null,
    "알 수 없는 mode 는 무시",
  );

  const ok = readStoredDecisionsFromMeta({
    targetDecisionsOverride: { SQUAT: { mode: "increase", workKg: 102.5 } },
  });
  assert.deepEqual(ok, { SQUAT: { mode: "increase", workKg: 102.5 } });

  // round(101 / 2.5) * 2.5 = 100
  const snapped = readStoredDecisionsFromMeta({
    targetDecisionsOverride: { SQUAT: { mode: "hold", workKg: 101 } },
  });
  assert.equal(snapped!.SQUAT.workKg, 100, "2.5kg 그리드로 스냅");
});

test("applyTargetDecisionsToReduced: decisions 없으면 reducer 결과를 그대로 통과시킨다", () => {
  const reduced = reduceProgressionState({
    program: "operator",
    previousState: {},
    planParams: PLAN_PARAMS,
    sets: operatorSessionSets(1, TM, 5, 0.7).map((s) => ({
      exerciseName: s.name,
      reps: s.reps,
      weightKg: s.weight,
      meta: {},
    })),
    logId: "x-1",
  });
  const applied = applyTargetDecisionsToReduced(reduced, null);
  assert.equal(applied.nextState, reduced.nextState, "동일 참조를 그대로 반환");
  assert.equal(applied.eventType, reduced.eventType);
  assert.deepEqual(applied.appliedDecisions, {});
});
