// Asymptote Protocol — DB와 무관한 순수 계산 헬퍼.
// 세션 구성(슬롯)은 @/lib/program-store/asymptote-blueprint(단일 진실원)에서 가져온다.
// 무게 계산·AMRAP 판정 등 server 전용 로직만 여기 남는다.
// `web/docs/asymptote-protocol.md` §4·§5 및 `web/docs/asymptote-test-guide.md`에 대응.

import {
  ASYMPTOTE_SESSIONS,
  ASYMPTOTE_SESSION_LABELS,
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
  type AsymptoteLift,
  type AsymptoteLiftRow,
} from "@/lib/program-store/asymptote-blueprint";

// 슬롯 구성은 청사진이 단일 진실원. 기존 import 경로(이 모듈) 호환을 위해 re-export.
export {
  ASYMPTOTE_SESSIONS,
  ASYMPTOTE_SESSION_LABELS,
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
};
export type { AsymptoteLift, AsymptoteLiftRow };

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
