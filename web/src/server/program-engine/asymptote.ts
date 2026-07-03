// Asymptote Protocol — DB와 무관한 순수 계산 헬퍼.
// 세션 구성(슬롯)은 @workout/core/program-store/asymptote-blueprint(단일 진실원)에서 가져온다.
// 무게 계산·AMRAP 판정 등 server 전용 로직만 여기 남는다.
// `web/docs/asymptote-protocol.md` §4·§5 및 `web/docs/asymptote-test-guide.md`에 대응.

import {
  ASYMPTOTE_SESSIONS,
  ASYMPTOTE_SESSION_LABELS,
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
  ASYMPTOTE_HYBRID_TM_PERCENT,
  type AsymptoteLift,
  type AsymptoteLiftRow,
} from "@workout/core/program-store/asymptote-blueprint";

// 슬롯 구성·하이브리드 상수는 청사진이 단일 진실원. 기존 import 경로(이 모듈) 호환을 위해 re-export.
export {
  ASYMPTOTE_SESSIONS,
  ASYMPTOTE_SESSION_LABELS,
  ASYMPTOTE_AMRAP_TARGETS_BY_SESSION,
  ASYMPTOTE_HYBRID_TM_PERCENT,
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

// ──────────────────────────────────────────────────────────────────────────────
// 하이브리드(Asymptote × Async) 확장 — Async의 강점을 Asymptote 골격에 얹는 두 규칙.
// `web/docs/asymptote-async-hybrid.md` §3 참조.
//   1) 그라인딩-정지: AMRAP이 아닌 작업 세트는 "바가 눈에 띄게 느려지는 첫 렙에서 정지"가 기본
//      가이드. 진행은 사이클3 AMRAP 렙수로만 게이팅되므로 작업 세트의 렙 미달은 실패가 아니라
//      그날의 자동 보정(특히 연속일 피로 흡수)이다.
//   2) 연속일 AMRAP 가드: AMRAP은 거시 진행 신호라 누적 피로로 오염되면 안 된다. 직전 세션과의
//      간격(restDayGap)이 최소 휴식일 미만이면 그날 AMRAP을 보류하고 작업 세트(그라인딩-정지)로
//      강등한다. 해당 리프트는 이번 블록 AMRAP 결측 → reducer가 TM을 유지(안전 강등).
// 두 규칙 모두 순수 함수로 노출해 처방 레이어가 조합한다.
// ──────────────────────────────────────────────────────────────────────────────

// AMRAP(거시 진행 신호)을 신뢰하려면 필요한 직전 세션과의 최소 휴식일. 미만이면 보류.
export const ASYMPTOTE_AMRAP_MIN_REST_DAYS = 2;

export type AsymptoteSetGuidance = "AMRAP" | "STOP_ON_GRIND";

// 사이클3 AMRAP 적격 세트가 직전 세션과 너무 붙어(연속일) 있으면 보류해야 하는지 판정.
// restDayGap: 직전 세션과의 일(日) 간격. null/undefined/비유한(정보 없음)이면 보류하지 않는다
// (restDayGap을 주지 않는 기존 호출부의 동작을 그대로 보존).
export function asymptoteShouldDeferAmrap(input: {
  amrapEligible: boolean;
  restDayGap?: number | null;
  minRestDays?: number;
}): boolean {
  if (!input.amrapEligible) return false;
  const gap = input.restDayGap;
  if (gap === null || gap === undefined || !Number.isFinite(gap)) return false;
  const minRestDays = input.minRestDays ?? ASYMPTOTE_AMRAP_MIN_REST_DAYS;
  return gap < minRestDays;
}

// 한 세트의 최종 가이드를 결정한다.
//   - AMRAP 적격 + 충분한 휴식 → "AMRAP" (RPE9 한도까지 rep-out, 진행 신호).
//   - 그 외(비-AMRAP 작업 세트, 또는 연속일로 보류된 AMRAP) → "STOP_ON_GRIND" (그라인딩 정지).
export function asymptoteSetGuidance(input: {
  amrapEligible: boolean;
  restDayGap?: number | null;
  minRestDays?: number;
}): AsymptoteSetGuidance {
  return input.amrapEligible && !asymptoteShouldDeferAmrap(input) ? "AMRAP" : "STOP_ON_GRIND";
}

// 두 'YYYY-MM-DD'(plan timezone 기준) 날짜 사이의 일(日) 간격. 연속일 AMRAP 가드의 restDayGap 입력.
// lastDate 미상/파싱 불가/미래(음수)면 null(가드 비활성). 처방 레이어가 직전 세션 날짜와 함께 호출한다.
export function asymptoteDayGap(sessionDate: string, lastDate: string | null | undefined): number | null {
  if (!lastDate) return null;
  const current = Date.parse(`${sessionDate}T00:00:00Z`);
  const previous = Date.parse(`${lastDate}T00:00:00Z`);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const gap = Math.round((current - previous) / 86_400_000);
  return gap >= 0 ? gap : null;
}
