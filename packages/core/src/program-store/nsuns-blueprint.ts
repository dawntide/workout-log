// nSuns LP(5/3/1 LP) 세트 테이블 — seed(정의 생성)와 문서가 함께 참조하는 단일 진실원.
//
// TM = 1RM × 90%(531과 동일). 모든 세트는 해당 운동 TM의 퍼센트로 파생된다(percent-derived).
// 슬롯 진행키는 **운동별**이라 같은 리프트가 여러 날 등장해도 하나의 TM을 공유한다.
//
// T1(메인) 9세트: 75/85/95 → 백오프 90/85/80/75/70/65. reps 패턴만 리프트별로 다르다.
// T2(보조) 8세트: 자체 TM의 50/60/70. (Liftosaur가 45/54/63으로 표기하는 것은 T1 리프트 TM 기준
// 환산값 — T2 TM = T1 TM × 0.9이므로 0.9×50/60/70 = 45/54/63으로 일치한다.)
//
// ⚠️ 진행 드라이버: T1의 **95%×1+ 세트 하나만** amrap으로 표시한다. 마지막 백오프도 원전에선
// "5+/3+"지만, reducer는 amrap 세트의 마지막 실측값을 읽으므로(collectTargetOutcomes) 둘 다
// 표시하면 65% 세트가 판정을 덮어쓴다. 그래서 마지막 세트는 note로만 "5+"를 알리고 판정은
// 95% 세트가 단독으로 맡는다.

export type NsunsSetRow = {
  reps: number;
  percent: number;
  note: string;
  amrap?: boolean;
};

/** T1 공통 퍼센트(9세트). */
export const NSUNS_T1_PERCENTS: readonly number[] = [
  0.75, 0.85, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65,
];

/** T1 reps 패턴 — 리프트 성격별. 3번째(95%)가 진행 판정 AMRAP. */
export const NSUNS_T1_REPS: Record<"standard" | "bench" | "deadlift", readonly number[]> = {
  // Squat / OHP
  standard: [5, 3, 1, 3, 3, 3, 5, 5, 5],
  // Bench (5/3/1 데이)
  bench: [5, 3, 1, 3, 5, 3, 5, 3, 5],
  // Deadlift — 백오프 전량 3회
  deadlift: [5, 3, 1, 3, 3, 3, 3, 3, 3],
};

/** 벤치 볼륨일(D1) 전용 T1 — 피라미드 9세트. 진행 판정은 D5(5/3/1 데이)가 맡는다. */
export const NSUNS_BENCH_VOLUME_PERCENTS: readonly number[] = [
  0.65, 0.75, 0.85, 0.85, 0.85, 0.8, 0.75, 0.7, 0.65,
];
export const NSUNS_BENCH_VOLUME_REPS: readonly number[] = [8, 6, 4, 4, 4, 5, 6, 7, 8];

/** T2(보조) 8세트 — 자체 TM 기준. */
export const NSUNS_T2_PERCENTS: readonly number[] = [0.5, 0.6, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7];
export const NSUNS_T2_REPS: readonly number[] = [5, 5, 3, 5, 7, 4, 6, 8];

/** T1 AMRAP(95%) 실측 reps → TM 증가량(kg). 원전은 lb 범위 처방이라 결정론 고정값으로 채택. */
export const NSUNS_TM_INCREASE_BY_AMRAP: readonly { minReps: number; increaseKg: number }[] = [
  { minReps: 6, increaseKg: 7.5 },
  { minReps: 4, increaseKg: 5 },
  { minReps: 2, increaseKg: 2.5 },
];
export const NSUNS_FAIL_RESET_THRESHOLD = 2;
export const NSUNS_RESET_FACTOR = 0.9;

/** AMRAP reps에 대응하는 TM 증가량. 0~1회는 증량 없음(0). */
export function nsunsTmIncreaseKg(amrapReps: number): number {
  for (const row of NSUNS_TM_INCREASE_BY_AMRAP) {
    if (amrapReps >= row.minReps) return row.increaseKg;
  }
  return 0;
}

/** T1 9세트. 95% 세트만 amrap 판정 세트로 표시한다. */
export function nsunsT1Sets(pattern: keyof typeof NSUNS_T1_REPS): NsunsSetRow[] {
  const reps = NSUNS_T1_REPS[pattern];
  return NSUNS_T1_PERCENTS.map((percent, i) => {
    const isDriver = i === 2;
    const isLast = i === NSUNS_T1_PERCENTS.length - 1;
    return {
      reps: reps[i] ?? 3,
      percent,
      note: isDriver ? "T1 · 1+ AMRAP" : isLast ? `T1 · ${reps[i]}+` : "T1",
      ...(isDriver ? { amrap: true } : {}),
    };
  });
}

/** 벤치 볼륨일 T1 9세트(피라미드). 진행 판정은 하지 않으므로 amrap 표시가 없다. */
export function nsunsBenchVolumeSets(): NsunsSetRow[] {
  return NSUNS_BENCH_VOLUME_PERCENTS.map((percent, i) => ({
    reps: NSUNS_BENCH_VOLUME_REPS[i] ?? 5,
    percent,
    note: i === NSUNS_BENCH_VOLUME_PERCENTS.length - 1 ? "T1 volume · 8+" : "T1 volume",
  }));
}

/** T2 8세트. */
export function nsunsT2Sets(): NsunsSetRow[] {
  return NSUNS_T2_PERCENTS.map((percent, i) => ({
    reps: NSUNS_T2_REPS[i] ?? 5,
    percent,
    note: "T2",
  }));
}
