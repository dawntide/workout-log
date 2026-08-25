import { resolveLoggedTotalLoadKg } from "@workout/core/bodyweight-load";
import {
  MUSCLE_GROUPS,
  type MuscleGroup,
  resolveMuscleContribution,
} from "@workout/core/muscle-groups/category-to-muscle";
import { MUSCLE_FRESHNESS_DEFAULTS } from "./muscle-freshness-constants";

/**
 * 근육군별 신선도 추정 — **파라미터 공개형 결정론 모델**.
 *
 * ```
 * freshness(g) = clamp01( 1 - Σ_sessions  load(g, s) / capacity(g) × decay(now - s.performedAt) )
 * decay(Δt)    = max(0, 1 - Δt / recoveryHours)
 * capacity(g)  = 최근 capacityWeeks주 총 부하 ÷ capacityWeeks   (= 주간 평균 볼륨)
 * ```
 *
 * ML이 아니라 식이 전부다. Fitbod·SHRED가 "추천 근거를 설명하지 않는다"고 비판받는
 * 지점을 뒤집는 것이 목적이라, 이 파일의 상수와 식이 그대로 UI에 노출된다.
 *
 * **`now`는 항상 인자로 받는다.** 내부에서 Date.now()를 부르면 시간 의존 단언이
 * 불가능해진다.
 */
// 상수는 의존성 0인 leaf에 산다 — 설정(클라이언트 진입점)이 기본값을 참조해야 하는데
// 이 파일은 카탈로그를 끌고 오기 때문이다. 자세한 사정은 그 파일 주석 참조.
export { MUSCLE_FRESHNESS_DEFAULTS } from "./muscle-freshness-constants";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type MuscleFreshnessInputRow = {
  logId: string;
  /** 세션 시각. **일 단위가 아니라 시각이다** — 6일 창에서 하루 오차는 17%다. */
  performedAt: string | Date;
  exerciseName: string;
  category: string | null;
  weightKg: number | null;
  reps: number | null;
  meta?: Record<string, unknown> | null;
};

/** 세션 × 부위로 접은 부하. **이것만 캐시한다** — 감쇠는 시간 함수라 매번 계산한다. */
export type MuscleSessionLoad = {
  logId: string;
  performedAt: string;
  muscleGroup: MuscleGroup;
  loadKg: number;
  setCount: number;
};

export type MuscleSessionLoadSummary = {
  sessions: MuscleSessionLoad[];
  /** 매핑 커버리지 리포트용(G3). 세트 단위다 — 부하로 세면 무게가 큰 종목에 쏠린다. */
  totalSets: number;
  otherSets: number;
};

export type MuscleFreshnessContribution = {
  logId: string;
  performedAt: string;
  loadKg: number;
  /** 0~1. recoveryHours가 지나면 0이다. */
  decay: number;
  /** 이 세션이 만든 피로량(= loadKg / capacityKg × decay). */
  fatigue: number;
};

export type MuscleFreshnessGroup = {
  muscleGroup: MuscleGroup;
  /** 0~100 정수. */
  freshnessPct: number;
  /** 클램프 **전** 누적 피로. 1을 넘으면 화면은 0%지만 근거 시트는 실제 값을 보여준다. */
  fatigue: number;
  capacityKg: number;
  /** 최근 기여 세션 — 신선도가 왜 그 값인지 설명하는 근거다. 최신순. */
  contributions: MuscleFreshnessContribution[];
};

export type MuscleFreshnessResult = {
  now: string;
  recoveryHours: number;
  capacityWeeks: number;
  groups: MuscleFreshnessGroup[];
  /** `Other`로 분류된 세트 비율(0~1). 10%를 넘으면 매핑 보강이 먼저다(G3). */
  otherSetShare: number;
};

function toTime(value: string | Date): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function roundKg(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 세트 행을 **세션 × 부위** 부하로 접는다.
 *
 * 일 단위가 아니라 세션 단위인 이유: workout_log.performedAt이 시각을 갖고 있고,
 * 감쇠 창이 6일이라 하루로 뭉개면 최대 17%가 틀어진다. 근거 시트가 요구하는 단위도
 * "기여한 세션 목록"이라 그대로 맞다.
 */
export function aggregateSessionMuscleLoad(
  rows: MuscleFreshnessInputRow[],
): MuscleSessionLoadSummary {
  const bucket = new Map<string, MuscleSessionLoad>();
  let totalSets = 0;
  let otherSets = 0;

  for (const row of rows) {
    const exerciseName = String(row.exerciseName ?? "");
    if (!exerciseName) continue;
    const reps = Number(row.reps ?? 0);
    if (reps <= 0) continue;
    const performedAtMs = toTime(row.performedAt);
    if (!Number.isFinite(performedAtMs)) continue;

    const weightKg = resolveLoggedTotalLoadKg({
      exerciseName,
      weightKg: row.weightKg,
      meta: row.meta,
    });
    const tonnage = (weightKg ?? 0) * reps;

    const contribution = resolveMuscleContribution(exerciseName, row.category);
    totalSets += 1;
    if (contribution.Other !== undefined) otherSets += 1;

    const performedAt = new Date(performedAtMs).toISOString();
    for (const group of MUSCLE_GROUPS) {
      const weight = contribution[group];
      if (weight === undefined || weight <= 0) continue;
      const key = `${row.logId}:${group}`;
      const existing = bucket.get(key);
      if (existing) {
        existing.loadKg += tonnage * weight;
        existing.setCount += 1;
      } else {
        bucket.set(key, {
          logId: row.logId,
          performedAt,
          muscleGroup: group,
          loadKg: tonnage * weight,
          setCount: 1,
        });
      }
    }
  }

  const sessions = [...bucket.values()].map((entry) => ({
    ...entry,
    loadKg: roundKg(entry.loadKg),
  }));
  sessions.sort(
    (a, b) =>
      toTime(b.performedAt) - toTime(a.performedAt) ||
      a.muscleGroup.localeCompare(b.muscleGroup),
  );

  return { sessions, totalSets, otherSets };
}

/** max(0, 1 - Δt / recoveryHours). 경과 시간이 음수(미래 기록)면 기여를 0으로 본다. */
export function decayAt(elapsedHours: number, recoveryHours: number): number {
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0) return 0;
  if (recoveryHours <= 0) return 0;
  return Math.max(0, 1 - elapsedHours / recoveryHours);
}

/**
 * 세션 부하 + 현재 시각 → 부위별 신선도.
 *
 * **감쇠 결과를 캐시하면 안 된다** — 시간 함수라 캐시가 곧 거짓이 된다. 이 함수는
 * 순수하고 값싸므로 요청마다 부른다.
 */
export function computeMuscleFreshness(input: {
  sessions: MuscleSessionLoad[];
  now: Date;
  recoveryHours?: number;
  capacityWeeks?: number;
  totalSets?: number;
  otherSets?: number;
}): MuscleFreshnessResult {
  const recoveryHours = input.recoveryHours ?? MUSCLE_FRESHNESS_DEFAULTS.recoveryHours;
  const capacityWeeks = input.capacityWeeks ?? MUSCLE_FRESHNESS_DEFAULTS.capacityWeeks;
  const nowMs = input.now.getTime();
  const capacityWindowMs = capacityWeeks * 7 * DAY_MS;

  const capacityTotals = new Map<MuscleGroup, number>();
  const contributionsByGroup = new Map<MuscleGroup, MuscleFreshnessContribution[]>();

  for (const session of input.sessions) {
    const performedAtMs = toTime(session.performedAt);
    if (!Number.isFinite(performedAtMs)) continue;
    const elapsedMs = nowMs - performedAtMs;
    // 미래 기록은 capacity에도 넣지 않는다 — 감쇠를 못 매기는 부하다.
    if (elapsedMs < 0) continue;

    if (elapsedMs <= capacityWindowMs) {
      capacityTotals.set(
        session.muscleGroup,
        (capacityTotals.get(session.muscleGroup) ?? 0) + session.loadKg,
      );
    }

    const decay = decayAt(elapsedMs / HOUR_MS, recoveryHours);
    if (decay <= 0) continue;
    const list = contributionsByGroup.get(session.muscleGroup) ?? [];
    list.push({
      logId: session.logId,
      performedAt: session.performedAt,
      loadKg: session.loadKg,
      decay,
      fatigue: 0, // capacity 확정 후 채운다
    });
    contributionsByGroup.set(session.muscleGroup, list);
  }

  const groups: MuscleFreshnessGroup[] = MUSCLE_GROUPS.map((muscleGroup) => {
    const capacityKg = (capacityTotals.get(muscleGroup) ?? 0) / capacityWeeks;
    const contributions = contributionsByGroup.get(muscleGroup) ?? [];

    // capacity가 0 = 그 창에서 한 번도 안 쓴 부위. 나눌 수 없고, 쌓인 피로도 없다.
    if (capacityKg <= 0) {
      return {
        muscleGroup,
        freshnessPct: 100,
        fatigue: 0,
        capacityKg: 0,
        contributions: contributions.map((entry) => ({ ...entry, fatigue: 0 })),
      };
    }

    let fatigue = 0;
    const scored = contributions.map((entry) => {
      const share = (entry.loadKg / capacityKg) * entry.decay;
      fatigue += share;
      return { ...entry, fatigue: share };
    });
    scored.sort((a, b) => toTime(b.performedAt) - toTime(a.performedAt));

    const freshness = Math.max(0, Math.min(1, 1 - fatigue));
    return {
      muscleGroup,
      freshnessPct: Math.round(freshness * 100),
      fatigue,
      capacityKg: roundKg(capacityKg),
      contributions: scored,
    };
  });

  const totalSets = input.totalSets ?? 0;
  return {
    now: new Date(nowMs).toISOString(),
    recoveryHours,
    capacityWeeks,
    groups,
    otherSetShare: totalSets > 0 ? (input.otherSets ?? 0) / totalSets : 0,
  };
}

/**
 * 조회 창. capacity가 capacityWeeks주를 보므로 **감쇠 창(6일)만으로는 부족하다** —
 * 계획서 §3.2의 "lookbackDays 기본 14일이면 충분"은 §3.1의 capacity 정의와 어긋난다.
 */
export function freshnessLookbackDays(
  capacityWeeks: number = MUSCLE_FRESHNESS_DEFAULTS.capacityWeeks,
  recoveryHours: number = MUSCLE_FRESHNESS_DEFAULTS.recoveryHours,
): number {
  return Math.max(capacityWeeks * 7, Math.ceil(recoveryHours / 24));
}
