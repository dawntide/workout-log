// Wendler 5/3/1 주차 메인 세트 테이블 — lib/server 공유 단일 진실원.
// generate531(원본 LOGIC 처방, server)과 plannedExercisesFrom531ManualSession(커스터마이즈 처방)이
// 함께 참조해, fork 후에도 원본과 동일한 주차 % 흐름을 보장한다(drift 방지).
//
// 4주 사이클: W1 3×5(65/75/85+), W2 3×3(70/80/90+), W3 5/3/1(75/85/95+), W4 딜로드 3×5(40/50/60).
// 각 주차 마지막 세트가 AMRAP. 보조(FSL=첫세트% 5×5, BBB=TM50% 5×10)는 플래너가 처리한다.

export type Wendler531MainSet = {
  reps: number;
  percent: number;
  note?: string;
  amrap?: boolean;
};

export const WENDLER_531_MAIN_TABLE: Record<number, Wendler531MainSet[]> = {
  1: [
    { reps: 5, percent: 0.65 },
    { reps: 5, percent: 0.75 },
    { reps: 5, percent: 0.85, note: "5+", amrap: true },
  ],
  2: [
    { reps: 3, percent: 0.7 },
    { reps: 3, percent: 0.8 },
    { reps: 3, percent: 0.9, note: "3+", amrap: true },
  ],
  3: [
    { reps: 5, percent: 0.75 },
    { reps: 3, percent: 0.85 },
    { reps: 1, percent: 0.95, note: "1+", amrap: true },
  ],
  4: [
    { reps: 5, percent: 0.4, note: "deload" },
    { reps: 5, percent: 0.5 },
    { reps: 5, percent: 0.6 },
  ],
};

// 사이클 내 주차(week → 1..4)의 메인 세트. 블록 외 주차는 모듈러로 매핑된다.
export function wendler531WeekSets(week: number): Wendler531MainSet[] {
  return WENDLER_531_MAIN_TABLE[((week - 1) % 4) + 1] ?? WENDLER_531_MAIN_TABLE[1]!;
}

// FSL(First Set Last): 메인 첫 세트 % 로 5×5.
export const WENDLER_531_FSL_SETS = 5;
export const WENDLER_531_FSL_REPS = 5;
// BBB(Boring But Big): TM 50% 로 5×10.
export const WENDLER_531_BBB_SETS = 5;
export const WENDLER_531_BBB_REPS = 10;
export const WENDLER_531_BBB_PERCENT = 0.5;
