/**
 * v2-session-summary 순수 모델 레이어 (React/DOM 무지).
 *
 * 세션 요약 타입과 도메인 로직 — 로그 응답을 요약 데이터(SummaryData)로
 * 접는 buildSummaryData, PR 카드/운동별 집계/최고 e1RM 추정, goal 해석·히어로 카피 등.
 * 뷰는 이 결과만 받아 표현만 담당한다. 유닛 테스트는 이 파일을 직접 대상으로 한다.
 */

import { estimateE1rmKg } from "@workout/core/stats/e1rm";
import { isWarmupSetType } from "@workout/core/workout-set-type";
import type { ProgressionSummaryPayload } from "@workout/core/progression/summary";
import type { TrainingGoalKey } from "@/lib/settings/workout-preferences";
import {
  resolveLoggedTotalLoadKg,
  resolveLoggedLoadDisplay,
} from "@workout/core/bodyweight-load";

/* ─── types (loose to fit /api/logs/[id] response) ─── */

export type V2SummarySet = {
  id?: string;
  exerciseName: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe?: number | null;
  isExtra: boolean;
  setType?: string | null;
  meta?: Record<string, unknown> | null;
};

export type V2SummaryLog = {
  id: string;
  performedAt: string;
  durationMinutes: number | null;
  notes: string | null;
  sets: V2SummarySet[];
  generatedSession?: {
    sessionKey?: string | null;
  } | null;
  progression?: ProgressionSummaryPayload | null;
  /** 서버 계산된 PR (best e1RM 비교 기반). detectPersonalRecords 결과. */
  personalRecords?: V2PersonalRecord[] | null;
  /** 사용자의 1순위 운동 목적. BigStat / hero 카피 차별화에 사용. */
  goal?: TrainingGoalKey | null;
};

export type V2PersonalRecord = {
  exerciseName: string;
  topWeightKg: number;
  topReps: number;
  estOneRm: number;
  previousBestE1rm: number | null;
  deltaE1rm: number;
};

export type PrCard = {
  target: string;
  afterWorkKg: number;
  beforeWorkKg: number | null;
  deltaKg: number;
  /** PR 카드 표시할 운동명 — exercise name과 비교 매칭에 사용 */
  matchKey: string;
  /** PR 종류: progression 이벤트 기반 / 절대 best e1RM 기반 */
  source: "progression" | "personal";
  /** personal 종류일 때만 — EST 1RM */
  estOneRm?: number;
};

export type ExerciseSummary = {
  name: string;
  setCount: number;
  topWeightKg: number;
  /** 맨몸 운동 총무게 뒤 추가중량 병기 (`(+20)`/`(체중)`). */
  topWeightSuffix: string | null;
  totalReps: number;
  volumeKg: number;
};

export type ResolvedGoal = "strength" | "hypertrophy" | "endurance" | "general";

/** 세션 요약 파생 데이터. */
export type SummaryData = {
  exerciseSummaries: ExerciseSummary[];
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  topEstOneRm: {
    exerciseName: string;
    weightKg: number;
    reps: number;
    estOneRm: number;
  } | null;
  prCards: PrCard[];
  prKeys: Set<string>;
};

/* ─── helpers ─── */

export function formatDurationLong(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const mm = Math.floor(minutes);
  const ss = Math.round((minutes - mm) * 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function formatPerformedAt(iso: string, locale: "ko" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildPrCards(
  progression: ProgressionSummaryPayload | null | undefined,
  personalRecords: V2PersonalRecord[] | null | undefined,
): PrCard[] {
  const out: PrCard[] = [];
  const seenKeys = new Set<string>();

  // 1) Personal records (절대 best e1RM 갱신) — 우선 표시
  for (const p of personalRecords ?? []) {
    const matchKey = p.exerciseName.trim().toLowerCase();
    if (!matchKey || seenKeys.has(matchKey)) continue;
    seenKeys.add(matchKey);
    out.push({
      target: p.exerciseName,
      afterWorkKg: p.topWeightKg,
      beforeWorkKg: null,
      deltaKg: p.deltaE1rm,
      matchKey,
      source: "personal",
      estOneRm: p.estOneRm,
    });
  }

  // 2) Progression event (프로그램 자동 진행)
  if (progression?.event) {
    for (const d of progression.event.targetDecisions) {
      if (d.eventType !== "INCREASE" || d.outcome !== "SUCCESS") continue;
      const after = d.afterWorkKg;
      const delta = d.deltaWorkKg;
      if (after == null || delta == null || delta <= 0) continue;
      const matchKey = d.target.trim().toLowerCase();
      if (seenKeys.has(matchKey)) continue;
      seenKeys.add(matchKey);
      out.push({
        target: d.target,
        afterWorkKg: after,
        beforeWorkKg: d.beforeWorkKg,
        deltaKg: delta,
        matchKey,
        source: "progression",
      });
    }
  }
  return out;
}

export function buildExerciseSummaries(sets: V2SummarySet[]): ExerciseSummary[] {
  const map = new Map<string, ExerciseSummary>();
  for (const s of sets) {
    const name = String(s.exerciseName ?? "").trim();
    if (!name) continue;
    // 웜업은 세트 수·볼륨·탑세트 어디에도 넣지 않는다. 서버 통계(SQL)와 같은 규칙을
    // 클라이언트 요약에서도 지켜야 두 화면의 숫자가 어긋나지 않는다.
    if (isWarmupSetType(s.setType)) continue;
    const cur = map.get(name) ?? {
      name,
      setCount: 0,
      topWeightKg: 0,
      topWeightSuffix: null,
      totalReps: 0,
      volumeKg: 0,
    };
    cur.setCount += 1;
    // 맨몸 운동은 총부하(체중+추가)로 top weight·볼륨을 집계한다.
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: name,
        weightKg: s.weightKg,
        meta: s.meta,
      }) ?? 0,
    );
    const r = Number(s.reps ?? 0);
    if (Number.isFinite(w) && w > cur.topWeightKg) {
      cur.topWeightKg = w;
      cur.topWeightSuffix = resolveLoggedLoadDisplay({
        exerciseName: name,
        weightKg: s.weightKg,
        meta: s.meta,
      }).suffix;
    }
    if (Number.isFinite(r)) cur.totalReps += r;
    if (Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0) {
      cur.volumeKg += w * r;
    }
    map.set(name, cur);
  }
  return Array.from(map.values());
}

/** 세션 전체에서 EST 1RM 기준 최고 세트 — 스트렝스/파워리프팅 BigStat에 사용. */
export function findTopEstOneRm(sets: V2SummarySet[]): {
  exerciseName: string;
  weightKg: number;
  reps: number;
  estOneRm: number;
} | null {
  let best: {
    exerciseName: string;
    weightKg: number;
    reps: number;
    estOneRm: number;
  } | null = null;
  for (const s of sets) {
    if (s.isExtra || isWarmupSetType(s.setType)) continue;
    const name = String(s.exerciseName ?? "").trim();
    // 맨몸 운동은 총부하(체중+추가)로 e1RM을 추정한다.
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: name,
        weightKg: s.weightKg,
        meta: s.meta,
      }) ?? 0,
    );
    const r = Number(s.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0)
      continue;
    const e = estimateE1rmKg(w, r);
    if (!best || e > best.estOneRm) {
      best = {
        exerciseName: name,
        weightKg: w,
        reps: r,
        estOneRm: e,
      };
    }
  }
  return best;
}

export function resolveGoal(goal: TrainingGoalKey | null | undefined): ResolvedGoal {
  if (goal === "strength" || goal === "powerlifting") return "strength";
  if (goal === "hypertrophy") return "hypertrophy";
  if (goal === "endurance") return "endurance";
  return "general";
}

export function getHeroCopy(
  resolved: ResolvedGoal,
  locale: "ko" | "en",
  freshComplete: boolean,
): { title: string; eyebrow: string } {
  if (!freshComplete) {
    return {
      title: locale === "ko" ? "세션 요약" : "Session Summary",
      eyebrow: locale === "ko" ? "수행 기록" : "PERFORMED",
    };
  }
  const eyebrow = locale === "ko" ? "세션 완료" : "SESSION COMPLETE";
  const titleMap: Record<ResolvedGoal, { ko: string; en: string }> = {
    strength: { ko: "강해졌어요.", en: "Stronger." },
    hypertrophy: { ko: "한 걸음 더.", en: "One step closer." },
    endurance: { ko: "꾸준함이 무기.", en: "Consistency pays." },
    general: { ko: "잘했어요.", en: "Well done." },
  };
  const t = titleMap[resolved];
  return { title: locale === "ko" ? t.ko : t.en, eyebrow };
}

/**
 * 로그 응답을 웹 세션 요약 데이터로 접는다.
 * (기존 V2SessionSummary useMemo 본문을 순수 함수로 추출 — 동작 동일.)
 */
export function buildSummaryData(log: V2SummaryLog): SummaryData {
  const exerciseSummaries = buildExerciseSummaries(log.sets);
  const totalVolume = exerciseSummaries.reduce((s, e) => s + e.volumeKg, 0);
  const totalSets = exerciseSummaries.reduce((s, e) => s + e.setCount, 0);
  const totalReps = exerciseSummaries.reduce((s, e) => s + e.totalReps, 0);
  const topEstOneRm = findTopEstOneRm(log.sets);
  const prCards = buildPrCards(log.progression, log.personalRecords);

  // 운동명별 top set 매칭 — progression 카드의 EST 1RM 보강에 사용
  const exerciseTopSet = new Map<string, { weightKg: number; reps: number }>();
  for (const s of log.sets) {
    const w = Number(s.weightKg ?? 0);
    const r = Number(s.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0) continue;
    const key = String(s.exerciseName ?? "").trim().toLowerCase();
    if (!key) continue;
    const cur = exerciseTopSet.get(key);
    if (!cur || w > cur.weightKg) {
      exerciseTopSet.set(key, { weightKg: w, reps: r });
    }
  }

  // PR 카드에 EST 1RM 보강 (progression 종류만; personal은 이미 서버에서 계산됨)
  const enrichedPrs = prCards.map((p) => {
    if (p.source === "personal") return p;
    const top = exerciseTopSet.get(p.matchKey);
    const reps = top?.reps ?? 1;
    return {
      ...p,
      estOneRm: estimateE1rmKg(p.afterWorkKg, reps),
    };
  });

  // 운동명 set: PR 배지 표시 여부 결정
  const prKeys = new Set(enrichedPrs.map((p) => p.matchKey));

  return {
    exerciseSummaries,
    totalVolume,
    totalSets,
    totalReps,
    topEstOneRm,
    prCards: enrichedPrs,
    prKeys,
  };
}
