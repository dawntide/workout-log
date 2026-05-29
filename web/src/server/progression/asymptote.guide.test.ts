// Asymptote Protocol 로직 테스트 — `web/docs/asymptote-test-guide.md` 기준.
// §3 계산 로직, §4 AMRAP/결정 로직, §5 엔드투엔드 시나리오를 모두 검증한다.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
  ASYMPTOTE_SESSIONS,
  asymptoteShouldAmrap,
  calculateAsymptoteWorkingWeight,
  deriveAsymptoteAuxTms,
  floorToMultiple2p5,
} from "../program-engine/asymptote";
import { reduceProgressionState } from "./reducer";

// ──────────────────────────────────────────────────────────────────────────────
// §3.1 — 무게 계산 (calculateWorkingWeight)
// ──────────────────────────────────────────────────────────────────────────────

type WeightCase = {
  tm: number;
  cycle: number;
  session: number; // 1=A, 2=B, 3=C
  lift: "SQUAT" | "BENCH" | "PULL" | "DEADLIFT" | "OHP";
  expected: number;
  label: string;
};

const WEIGHT_CASES: WeightCase[] = [
  { tm: 100, cycle: 1, session: 1, lift: "SQUAT", expected: 80, label: "TM=100 C1A SQ → 80" },
  { tm: 100, cycle: 2, session: 1, lift: "SQUAT", expected: 82.5, label: "TM=100 C2A SQ → 82.5" },
  { tm: 100, cycle: 3, session: 1, lift: "SQUAT", expected: 85, label: "TM=100 C3A SQ → 85" },
  { tm: 100, cycle: 4, session: 1, lift: "SQUAT", expected: 72.5, label: "TM=100 C4A SQ → 72.5" },
  { tm: 100, cycle: 1, session: 2, lift: "SQUAT", expected: 62.5, label: "TM=100 C1B SQ → 62.5 (boundary)" },
  { tm: 100, cycle: 3, session: 2, lift: "SQUAT", expected: 67.5, label: "TM=100 C3B SQ → 67.5" },
  { tm: 100, cycle: 1, session: 3, lift: "SQUAT", expected: 67.5, label: "TM=100 C1C SQ → 67.5" },
  { tm: 100, cycle: 3, session: 3, lift: "BENCH", expected: 82.5, label: "TM=100 C3C BP → 82.5" },
  { tm: 100, cycle: 1, session: 1, lift: "BENCH", expected: 70, label: "TM=100 C1A BP → 70" },
  { tm: 100, cycle: 1, session: 1, lift: "PULL", expected: 77.5, label: "TM=100 C1A WPU → 77.5 (boundary)" },
  { tm: 100, cycle: 1, session: 3, lift: "OHP", expected: 67.5, label: "TM=100 C1C OHP → 67.5" },
  { tm: 92.5, cycle: 1, session: 1, lift: "SQUAT", expected: 72.5, label: "TM=92.5 C1A SQ → 72.5" },
];

test("§3.1 working weight matches guide expectations", () => {
  for (const tc of WEIGHT_CASES) {
    const actual = calculateAsymptoteWorkingWeight({
      tmKg: tc.tm,
      cycleInBlock: tc.cycle,
      sessionInCycle: tc.session,
      lift: tc.lift,
    });
    assert.equal(actual, tc.expected, `${tc.label} (got ${actual})`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// §3.2 — 풀업 추중량 (working weight 기반 도출)
// 본 앱은 targetWeightKg에 총 작업 무게(BW + 추중량)를 저장한다.
// "추중량 = 작업무게 − BW" 자체는 UI 표시 책임이지만 가이드 표는 산식 검증용으로 동일하게 통과해야 한다.
// ──────────────────────────────────────────────────────────────────────────────

function calculatePullupDisplayAdded(wpuTm: number, bw: number, cycle: number, session: number) {
  const working = calculateAsymptoteWorkingWeight({
    tmKg: wpuTm,
    cycleInBlock: cycle,
    sessionInCycle: session,
    lift: "PULL",
  });
  if (working === null) return null;
  const added = working - bw;
  // 가이드 §3.2의 음수 케이스는 절대값 기준 floor 후 부호 복원(round-toward-zero).
  // 양수면 일반 floor와 동일.
  const sign = added < 0 ? -1 : 1;
  return sign * floorToMultiple2p5(Math.abs(added));
}

const PULLUP_CASES = [
  { wpuTm: 100, bw: 73, cycle: 1, session: 1, working: 77.5, added: 2.5 },
  { wpuTm: 100, bw: 73, cycle: 3, session: 1, working: 82.5, added: 7.5 },
  { wpuTm: 100, bw: 73, cycle: 1, session: 2, working: 60, added: -12.5 },
  { wpuTm: 80, bw: 73, cycle: 1, session: 1, working: 62.5, added: -10 },
  { wpuTm: 110, bw: 70, cycle: 3, session: 1, working: 90, added: 20 },
];

test("§3.2 pullup working weight + display added weight match guide", () => {
  for (const tc of PULLUP_CASES) {
    const working = calculateAsymptoteWorkingWeight({
      tmKg: tc.wpuTm,
      cycleInBlock: tc.cycle,
      sessionInCycle: tc.session,
      lift: "PULL",
    });
    assert.equal(working, tc.working, `working WPU TM=${tc.wpuTm} C${tc.cycle}${["A","B","C"][tc.session-1]} → ${tc.working} (got ${working})`);
    const added = calculatePullupDisplayAdded(tc.wpuTm, tc.bw, tc.cycle, tc.session);
    assert.equal(added, tc.added, `added BW=${tc.bw} → ${tc.added} (got ${added})`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// §3.3 — 보조 TM 도출 (deriveAuxTMs)
// ──────────────────────────────────────────────────────────────────────────────

const AUX_CASES = [
  { sq: 95, bp: 70, dl: 95, ohp: 35 },
  { sq: 100, bp: 75, dl: 100, ohp: 37.5 },
  { sq: 100, bp: 77.5, dl: 100, ohp: 37.5 },
  { sq: 100, bp: 82.5, dl: 100, ohp: 40 },
  { sq: 80, bp: 60, dl: 80, ohp: 30 },
];

test("§3.3 aux TM derivation: DL=SQ, OHP=floor(BP×0.5/2.5)×2.5", () => {
  for (const tc of AUX_CASES) {
    const { dlTmKg, ohpTmKg } = deriveAsymptoteAuxTms(tc.sq, tc.bp);
    assert.equal(dlTmKg, tc.dl, `DL SQ=${tc.sq} → ${tc.dl} (got ${dlTmKg})`);
    assert.equal(ohpTmKg, tc.ohp, `OHP BP=${tc.bp} → ${tc.ohp} (got ${ohpTmKg})`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// §4.1 — AMRAP 활성화 (shouldAMRAP)
// ──────────────────────────────────────────────────────────────────────────────

const AMRAP_ACTIVATION_CASES = [
  { cycle: 1, session: 1, lift: "SQUAT", set: 4, total: 4, expect: false, label: "C1 not AMRAP cycle" },
  { cycle: 3, session: 1, lift: "SQUAT", set: 1, total: 4, expect: false, label: "C3A SQ set 1 (not last)" },
  { cycle: 3, session: 1, lift: "SQUAT", set: 4, total: 4, expect: true,  label: "C3A SQ last set ✓" },
  { cycle: 3, session: 1, lift: "PULL",  set: 4, total: 4, expect: true,  label: "C3A WPU last set ✓" },
  { cycle: 3, session: 1, lift: "BENCH", set: 4, total: 4, expect: false, label: "C3A BP not AMRAP" },
  { cycle: 3, session: 2, lift: "SQUAT", set: 5, total: 5, expect: false, label: "C3B has no AMRAP" },
  { cycle: 3, session: 3, lift: "BENCH", set: 4, total: 4, expect: true,  label: "C3C BP last set ✓" },
  { cycle: 3, session: 3, lift: "SQUAT", set: 6, total: 6, expect: false, label: "C3C SQ not AMRAP" },
  { cycle: 3, session: 3, lift: "OHP",   set: 4, total: 4, expect: false, label: "C3C OHP not AMRAP" },
  { cycle: 2, session: 1, lift: "SQUAT", set: 4, total: 4, expect: false, label: "C2A SQ last set (cycle ≠ 3)" },
] as const;

test("§4.1 AMRAP activation matrix", () => {
  for (const tc of AMRAP_ACTIVATION_CASES) {
    const actual = asymptoteShouldAmrap({
      cycleInBlock: tc.cycle,
      sessionInCycle: tc.session,
      lift: tc.lift,
      setNumber: tc.set,
      totalSets: tc.total,
    });
    assert.equal(actual, tc.expect, `${tc.label} (got ${actual})`);
  }
});

test("§4.1 AMRAP disabled during light block", () => {
  const actual = asymptoteShouldAmrap({
    cycleInBlock: 3,
    sessionInCycle: 1,
    lift: "SQUAT",
    setNumber: 4,
    totalSets: 4,
    lightBlockMode: true,
  });
  assert.equal(actual, false, "light block disables cycle-3 AMRAP");
});

// ──────────────────────────────────────────────────────────────────────────────
// §4.2 — TM 업데이트 결정 (reducer block-end)
// reducer를 통해 검증한다. 사이클 3 마지막 세트에 해당 렙수를 logged set의 reps로 넣고,
// 블록 종료(week=4, day=3)까지 진행한 후 TM workKg을 확인한다.
// ──────────────────────────────────────────────────────────────────────────────

type AsymptoteLogSet = { name: string; reps: number; weight: number };

function makeRunner(planParams: Record<string, unknown>) {
  let state: any = {};
  let logCounter = 0;
  const log = (sets: AsymptoteLogSet[]) => {
    logCounter += 1;
    const result = reduceProgressionState({
      program: "asymptote",
      previousState: state,
      planParams,
      logId: `log-${logCounter}`,
      sets: sets.map((s) => ({
        exerciseName: s.name,
        reps: s.reps,
        weightKg: s.weight,
        meta: {},
      })),
    });
    state = result.nextState;
    return result;
  };
  return { log, getState: () => state };
}

const SESSION_ROWS: Record<number, Array<{ name: string; target: string; sets: number; reps: number; amrap: boolean }>> = {
  1: [
    { name: "Back Squat", target: "SQUAT", sets: 4, reps: 3, amrap: true },
    { name: "Bench Press", target: "BENCH", sets: 4, reps: 5, amrap: false },
    { name: "Weighted Pull-Up", target: "PULL", sets: 4, reps: 3, amrap: true },
  ],
  2: [
    { name: "Back Squat", target: "SQUAT", sets: 5, reps: 5, amrap: false },
    { name: "Deadlift", target: "DEADLIFT", sets: 3, reps: 3, amrap: false },
    { name: "Weighted Pull-Up", target: "PULL", sets: 3, reps: 8, amrap: false },
  ],
  3: [
    { name: "Back Squat", target: "SQUAT", sets: 6, reps: 3, amrap: false },
    { name: "Bench Press", target: "BENCH", sets: 4, reps: 3, amrap: true },
    { name: "Overhead Press", target: "OHP", sets: 4, reps: 5, amrap: false },
  ],
};

function sessionSets(
  cycleInBlock: number,
  sessionInCycle: number,
  amrapReps?: Partial<Record<"SQUAT" | "BENCH" | "PULL", number>>,
): AsymptoteLogSet[] {
  const rows = SESSION_ROWS[sessionInCycle]!;
  const out: AsymptoteLogSet[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.sets; i += 1) {
      const isLastSet = i === row.sets - 1;
      const isAmrapSet = cycleInBlock === 3 && row.amrap && isLastSet;
      const reps =
        isAmrapSet && amrapReps && amrapReps[row.target as "SQUAT" | "BENCH" | "PULL"] !== undefined
          ? amrapReps[row.target as "SQUAT" | "BENCH" | "PULL"]!
          : row.reps;
      out.push({ name: row.name, reps, weight: 50 });
    }
  }
  return out;
}

function runFullBlock(initialTm: Record<string, number>, amrapReps: { SQUAT?: number; BENCH?: number; PULL?: number }) {
  const runner = makeRunner({ trainingMaxKg: { ...initialTm } });
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    for (let session = 1; session <= 3; session += 1) runner.log(sessionSets(cycle, session));
  }
  runner.log(sessionSets(3, 1, { SQUAT: amrapReps.SQUAT, PULL: amrapReps.PULL }));
  runner.log(sessionSets(3, 2));
  runner.log(sessionSets(3, 3, { BENCH: amrapReps.BENCH }));
  for (let session = 1; session <= 3; session += 1) runner.log(sessionSets(4, session));
  return runner.getState();
}

const TM_UPDATE_CASES = [
  { current: 100, reps: 10, newTm: 102.5, light: false },
  { current: 100, reps: 8, newTm: 102.5, light: false },
  { current: 100, reps: 7, newTm: 100, light: false },
  { current: 100, reps: 5, newTm: 100, light: false },
  { current: 100, reps: 4, newTm: 97.5, light: false },
  { current: 100, reps: 3, newTm: 97.5, light: false },
  { current: 100, reps: 2, newTm: 95, light: true },
  { current: 100, reps: 1, newTm: 95, light: true },
  { current: 100, reps: 0, newTm: 95, light: true },
];

test("§4.2 TM update decision matrix per AMRAP reps", () => {
  for (const tc of TM_UPDATE_CASES) {
    // SQ를 테스트 대상으로. 다른 리프트는 hold 범위(5 reps)로 고정.
    const state = runFullBlock(
      { SQUAT: tc.current, BENCH: 75, PULL: 100, DEADLIFT: tc.current, OHP: 35 },
      { SQUAT: tc.reps, BENCH: 5, PULL: 5 },
    );
    assert.equal(
      state.targets.SQUAT?.workKg,
      tc.newTm,
      `SQ amrap=${tc.reps} reps → newTm=${tc.newTm} (got ${state.targets.SQUAT?.workKg})`,
    );
    assert.equal(
      state.lightBlockMode === true,
      tc.light,
      `SQ amrap=${tc.reps} reps → lightBlock=${tc.light} (got ${state.lightBlockMode})`,
    );
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// §4.3 — 다중 리프트 독립 결정
// ──────────────────────────────────────────────────────────────────────────────

test("§4.3 multi-lift independent block-end decisions", () => {
  const state = runFullBlock(
    { SQUAT: 95, BENCH: 72.5, PULL: 100, DEADLIFT: 95, OHP: 35 },
    { SQUAT: 8, BENCH: 4, PULL: 10 },
  );
  assert.equal(state.targets.SQUAT?.workKg, 97.5, "SQ +2.5 (AMRAP 8)");
  assert.equal(state.targets.BENCH?.workKg, 70, "BP −2.5 (AMRAP 4)");
  assert.equal(state.targets.PULL?.workKg, 102.5, "WPU +2.5 (AMRAP 10)");
  assert.equal(state.targets.DEADLIFT?.workKg, 97.5, "DL = new SQ");
  assert.equal(state.targets.OHP?.workKg, 35, "OHP = floor(70 × 0.5 / 2.5) × 2.5 = 35");
  assert.equal(state.lightBlockMode === true, false, "no ≤2 → normal next block");
});

// ──────────────────────────────────────────────────────────────────────────────
// §5.1 — 시나리오 1: 첫 블록 정상 진행
// ──────────────────────────────────────────────────────────────────────────────

test("§5.1 scenario: first-block normal progression (per guide)", () => {
  // 초기 TM
  const tm = { SQUAT: 92.5, BENCH: 72.5, PULL: 97.5, DEADLIFT: 92.5, OHP: 35 };

  // Session 0 (C1A) prescriptions
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.SQUAT, cycleInBlock: 1, sessionInCycle: 1, lift: "SQUAT" }), 72.5, "C1A SQ");
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.BENCH, cycleInBlock: 1, sessionInCycle: 1, lift: "BENCH" }), 50, "C1A BP");
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.PULL, cycleInBlock: 1, sessionInCycle: 1, lift: "PULL" }), 75, "C1A WPU");

  // Session 6 (C3A) prescriptions
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.SQUAT, cycleInBlock: 3, sessionInCycle: 1, lift: "SQUAT" }), 77.5, "C3A SQ");
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.BENCH, cycleInBlock: 3, sessionInCycle: 1, lift: "BENCH" }), 52.5, "C3A BP");
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.PULL, cycleInBlock: 3, sessionInCycle: 1, lift: "PULL" }), 80, "C3A WPU");

  // Session 8 (C3C) BP
  assert.equal(calculateAsymptoteWorkingWeight({ tmKg: tm.BENCH, cycleInBlock: 3, sessionInCycle: 3, lift: "BENCH" }), 60, "C3C BP");

  // AMRAP 결과: SQ=7, WPU=9, BP=6 → Block 2 TM
  const state = runFullBlock(tm, { SQUAT: 7, BENCH: 6, PULL: 9 });
  assert.equal(state.targets.SQUAT?.workKg, 92.5, "SQ hold (7 reps in 5-7 range)");
  assert.equal(state.targets.BENCH?.workKg, 72.5, "BP hold (6 reps)");
  assert.equal(state.targets.PULL?.workKg, 100, "WPU +2.5 (9 reps)");
  assert.equal(state.targets.DEADLIFT?.workKg, 92.5, "DL tracks SQ");
  assert.equal(state.targets.OHP?.workKg, 35, "OHP = floor(72.5 × 0.5 / 2.5) × 2.5");
  assert.equal(state.lightBlockMode === true, false, "nextBlockMode normal");
});

// ──────────────────────────────────────────────────────────────────────────────
// §5.2 — 시나리오 2: 정체 → light 블록
// ──────────────────────────────────────────────────────────────────────────────

test("§5.2 scenario: regression triggers light block", () => {
  const state = runFullBlock(
    { SQUAT: 100, BENCH: 75, PULL: 100, DEADLIFT: 100, OHP: 35 },
    { SQUAT: 1, BENCH: 4, PULL: 5 },
  );
  assert.equal(state.targets.SQUAT?.workKg, 95, "SQ −5 on AMRAP=1");
  assert.equal(state.targets.BENCH?.workKg, 72.5, "BP −2.5 on AMRAP=4");
  assert.equal(state.targets.PULL?.workKg, 100, "WPU hold on AMRAP=5");
  assert.equal(state.lightBlockMode, true, "any ≤2 → next block light");
  assert.equal(state.targets.DEADLIFT?.workKg, 95, "DL tracks new SQ");
});

test("§5.2 scenario: next block (light mode) uses light coefficients", () => {
  // Light 모드에서 C1A SQ: TM × 0.85 × 0.875 (일반: 0.925 × 0.875)
  const lightTm = 95;
  const lightWeight = calculateAsymptoteWorkingWeight({
    tmKg: lightTm,
    cycleInBlock: 1,
    sessionInCycle: 1,
    lift: "SQUAT",
    lightBlockMode: true,
  });
  assert.equal(lightWeight, 70, "light C1A SQ = floor(95 × 0.85 × 0.875 / 2.5) × 2.5 = 70");

  const normalWeight = calculateAsymptoteWorkingWeight({
    tmKg: lightTm,
    cycleInBlock: 1,
    sessionInCycle: 1,
    lift: "SQUAT",
    lightBlockMode: false,
  });
  assert.equal(normalWeight, 75, "normal C1A SQ = floor(95 × 0.925 × 0.875 / 2.5) × 2.5 = 75");
});

// ──────────────────────────────────────────────────────────────────────────────
// §6 일부 — 엣지 케이스
// ──────────────────────────────────────────────────────────────────────────────

test("§6 edge: AMRAP partial absence holds the unrecorded lifts", () => {
  // SQ만 AMRAP 기록, BP/WPU AMRAP 없음 (또는 정상 렙). reps=5는 hold 범위.
  const state = runFullBlock(
    { SQUAT: 100, BENCH: 75, PULL: 100, DEADLIFT: 100, OHP: 35 },
    { SQUAT: 8, BENCH: 5, PULL: 5 },
  );
  assert.equal(state.targets.SQUAT?.workKg, 102.5, "SQ +2.5");
  assert.equal(state.targets.BENCH?.workKg, 75, "BP hold");
  assert.equal(state.targets.PULL?.workKg, 100, "WPU hold");
});

test("§6 edge: floorToMultiple2p5 sanity", () => {
  assert.equal(floorToMultiple2p5(80.94), 80);
  assert.equal(floorToMultiple2p5(74.38), 72.5);
  assert.equal(floorToMultiple2p5(60.125), 60);
  assert.equal(floorToMultiple2p5(0), 0);
  assert.equal(floorToMultiple2p5(-5), 0);
  assert.equal(floorToMultiple2p5(2.5), 2.5);
  assert.equal(floorToMultiple2p5(2.499), 0);
});

// ──────────────────────────────────────────────────────────────────────────────
// §3.7 — AMRAP 대상 맵은 ASYMPTOTE_SESSIONS에서 파생된 단일 진실원이어야 한다 (audit)
// ──────────────────────────────────────────────────────────────────────────────

test("ASYMPTOTE_AMRAP_TARGETS_BY_SESSION: 과거 손코딩 맵과 동일 (회귀 고정)", () => {
  // 파생값이 reducer가 손으로 재타이핑하던 {1:[SQUAT,PULL],3:[BENCH]}와 동일한지 고정.
  // session 2는 undefined→[]로 바뀌지만 collectAsymptoteAmrapReps의 length===0 early-return으로 동치.
  assert.deepEqual(ASYMPTOTE_AMRAP_TARGETS_BY_SESSION, {
    1: ["SQUAT", "PULL"],
    2: [],
    3: ["BENCH"],
  });
});

test("ASYMPTOTE_AMRAP_TARGETS_BY_SESSION: asymptoteShouldAmrap(마지막 세트)와 교차 일치", () => {
  // 세션별 모든 리프트에 대해 파생 맵 멤버십 == 사이클3 마지막 세트의 asymptoteShouldAmrap.
  // reducer 맵과 generator 술어가 같은 진실원에서 나오는지 실행으로 보장.
  for (const [sessionStr, rows] of Object.entries(ASYMPTOTE_SESSIONS)) {
    const sessionInCycle = Number(sessionStr);
    const amrapTargets = ASYMPTOTE_AMRAP_TARGETS_BY_SESSION[sessionInCycle] ?? [];
    for (const row of rows) {
      const totalSets = row.sets;
      const shouldAmrap = asymptoteShouldAmrap({
        cycleInBlock: 3,
        sessionInCycle,
        lift: row.target,
        setNumber: totalSets,
        totalSets,
      });
      assert.equal(
        amrapTargets.includes(row.target),
        shouldAmrap,
        `session ${sessionInCycle} ${row.target}: 맵 멤버십과 asymptoteShouldAmrap 불일치`,
      );
    }
  }
});
