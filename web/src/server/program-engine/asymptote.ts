// Asymptote Protocol — DB와 무관한 순수 계산 헬퍼.
// `web/docs/asymptote-protocol.md` §4·§5 및 `web/docs/asymptote-test-guide.md`에 대응.
// 테스트에서도 import 가능하도록 generateSession.ts에서 분리.

export type AsymptoteLift = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

export const ASYMPTOTE_CYCLE_COEF: Record<number, number> = {
  1: 0.925,
  2: 0.95,
  3: 0.975,
  4: 0.85,
};

export const ASYMPTOTE_LIGHT_CYCLE_COEF: Record<number, number> = {
  1: 0.85,
  2: 0.9,
  3: 0.925,
  4: 0.80,
};

export type AsymptoteLiftRow = {
  target: AsymptoteLift;
  name: string;
  sets: number;
  reps: number;
  coef: number;
  amrap: boolean;
  note?: string;
};

export const ASYMPTOTE_SESSIONS: Record<number, AsymptoteLiftRow[]> = {
  1: [
    { target: "SQUAT", name: "Back Squat", sets: 4, reps: 3, coef: 0.875, amrap: true },
    { target: "BENCH", name: "Bench Press", sets: 4, reps: 5, coef: 0.775, amrap: false },
    { target: "PULL", name: "Weighted Pull-Up", sets: 4, reps: 3, coef: 0.85, amrap: true },
  ],
  2: [
    { target: "SQUAT", name: "Back Squat", sets: 5, reps: 5, coef: 0.70, amrap: false },
    { target: "DEADLIFT", name: "Deadlift", sets: 3, reps: 3, coef: 0.80, amrap: false },
    { target: "PULL", name: "Weighted Pull-Up", sets: 3, reps: 8, coef: 0.65, amrap: false },
  ],
  3: [
    { target: "SQUAT", name: "Back Squat", sets: 6, reps: 3, coef: 0.75, amrap: false, note: "explosive" },
    { target: "BENCH", name: "Bench Press", sets: 4, reps: 3, coef: 0.85, amrap: true },
    { target: "OHP", name: "Overhead Press", sets: 4, reps: 5, coef: 0.75, amrap: false },
  ],
};

export const ASYMPTOTE_SESSION_LABELS: Record<number, string> = { 1: "A", 2: "B", 3: "C" };

// 세션별 AMRAP 대상 리프트. ASYMPTOTE_SESSIONS(단일 진실원)에서 파생하므로
// 손으로 재타이핑하던 reducer의 맵과 silent drift가 불가능하다(audit §3.7).
// 결과: { 1: ["SQUAT","PULL"], 2: [], 3: ["BENCH"] }
export const ASYMPTOTE_AMRAP_TARGETS_BY_SESSION: Record<number, AsymptoteLift[]> =
  Object.fromEntries(
    Object.entries(ASYMPTOTE_SESSIONS).map(([session, rows]) => [
      Number(session),
      rows.filter((row) => row.amrap).map((row) => row.target),
    ]),
  );

// Asymptote 전용 floor 라운딩 (protocol §4.4: DOWN to 2.5 kg).
export function floorToMultiple2p5(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / 2.5) * 2.5;
}

export function calculateAsymptoteWorkingWeight(input: {
  tmKg: number;
  cycleInBlock: number; // 1..4
  sessionInCycle: number; // 1..3
  lift: AsymptoteLift;
  lightBlockMode?: boolean;
}): number | null {
  const cycleTable = input.lightBlockMode ? ASYMPTOTE_LIGHT_CYCLE_COEF : ASYMPTOTE_CYCLE_COEF;
  const cycleCoef = cycleTable[input.cycleInBlock];
  if (cycleCoef === undefined) return null;
  const session = ASYMPTOTE_SESSIONS[input.sessionInCycle];
  if (!session) return null;
  const row = session.find((r) => r.target === input.lift);
  if (!row) return null;
  return floorToMultiple2p5(input.tmKg * cycleCoef * row.coef);
}

export function asymptoteShouldAmrap(input: {
  cycleInBlock: number;
  sessionInCycle: number;
  lift: AsymptoteLift;
  setNumber: number;
  totalSets: number;
  lightBlockMode?: boolean;
}): boolean {
  if (input.cycleInBlock !== 3 || input.lightBlockMode === true) return false;
  if (input.setNumber !== input.totalSets) return false;
  const session = ASYMPTOTE_SESSIONS[input.sessionInCycle];
  if (!session) return false;
  const row = session.find((r) => r.target === input.lift);
  return row?.amrap === true;
}

export function deriveAsymptoteAuxTms(sqTmKg: number, bpTmKg: number): { dlTmKg: number; ohpTmKg: number } {
  return {
    dlTmKg: sqTmKg,
    ohpTmKg: Math.floor((bpTmKg * 0.5) / 2.5) * 2.5,
  };
}
