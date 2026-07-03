// Asymptote × Async Hybrid — e1RM 연속 모니터 (`web/docs/asymptote-async-hybrid.md` §3.5).
// AMRAP은 블록(12세션)마다라 그 사이가 깜깜이다. 드라이버 탑세트(SQ-A·BP-C·WPU-A)의 e1RM을
// N세션(기본 7) 이동평균으로 평활해, AMRAP 전에 정체/하락 조짐을 본다.
// 순수 함수 — DB/UI 비의존. e1rm-service 등에서 모은 탑세트 노출을 입력으로 받는다.

import { mapExerciseNameToTarget } from "@workout/core/strength-engine/target-mapping";

// 드라이버 한 노출(세션의 탑세트). 풀업은 bodyweightKg를 주면 총중량(BW+추중량)으로 환산한다.
export type DriverExposure = {
  performedAt: string; // ISO 또는 YYYY-MM-DD (정렬용)
  weightKg: number; // 풀업이면 "추중량"; bodyweightKg와 합산
  reps: number;
  bodyweightKg?: number | null;
};

export type E1rmTrendPoint = {
  performedAt: string;
  e1rm: number;
  movingAvg: number; // 해당 노출까지의 trailing N세션 이동평균
};

export type DriverTrendDirection = "RISING" | "FLAT" | "FALLING" | "INSUFFICIENT";

export type DriverTrendResult = {
  points: E1rmTrendPoint[];
  latestMovingAvg: number | null;
  trend: DriverTrendDirection;
};

export const ASYMPTOTE_MONITOR_WINDOW = 7;
// 이동평균 변화가 이 비율(±1.5%) 이내면 FLAT으로 본다(체중·라운딩 노이즈 흡수).
export const ASYMPTOTE_MONITOR_FLAT_BAND = 0.015;

// Epley 추정 1RM. e1rm-service의 epley1RM과 동일 공식(RIR 항 없음).
export function epleyE1rm(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

// 풀업 총중량 보정 포함 단일 노출 e1RM(소수 1자리).
function exposureE1rm(exposure: DriverExposure): number {
  const bw = Number.isFinite(exposure.bodyweightKg as number) ? (exposure.bodyweightKg as number) : 0;
  const totalLoad = exposure.weightKg + (bw > 0 ? bw : 0);
  return Math.round(epleyE1rm(totalLoad, exposure.reps) * 10) / 10;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// 드라이버 노출 시계열 → e1RM + trailing N세션 이동평균 + 추세 방향.
// 노출이 window 미만이면 trend = "INSUFFICIENT"(아직 판단 보류).
export function asymptoteDriverTrend(
  exposures: DriverExposure[],
  window: number = ASYMPTOTE_MONITOR_WINDOW,
): DriverTrendResult {
  const win = Math.max(1, Math.floor(window));
  const sorted = exposures
    .filter((e) => Number.isFinite(e.weightKg) && Number.isFinite(e.reps) && e.reps > 0)
    .slice()
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));

  const e1rms = sorted.map(exposureE1rm);
  const points: E1rmTrendPoint[] = sorted.map((exposure, i) => {
    const from = Math.max(0, i - win + 1);
    const movingAvg = Math.round(mean(e1rms.slice(from, i + 1)) * 10) / 10;
    return { performedAt: exposure.performedAt, e1rm: e1rms[i]!, movingAvg };
  });

  if (points.length < win) {
    return { points, latestMovingAvg: points.length ? points[points.length - 1]!.movingAvg : null, trend: "INSUFFICIENT" };
  }

  // 최신 완전창 이동평균 vs 한 창 이전(win 세션 전)의 이동평균을 비교해 추세 판정.
  const latest = points[points.length - 1]!.movingAvg;
  const prior = points[points.length - 1 - win]?.movingAvg ?? points[0]!.movingAvg;
  const band = prior * ASYMPTOTE_MONITOR_FLAT_BAND;
  const trend: DriverTrendDirection =
    latest > prior + band ? "RISING" : latest < prior - band ? "FALLING" : "FLAT";

  return { points, latestMovingAvg: latest, trend };
}

// ──────────────────────────────────────────────────────────────────────────────
// 로그 세트 → 드라이버별 노출 집계 (서비스 레이어가 DB 행을 먹이는 순수 어댑터)
// ──────────────────────────────────────────────────────────────────────────────

export type DriverKey = "SQUAT" | "BENCH" | "PULL";
export const ASYMPTOTE_DRIVERS: DriverKey[] = ["SQUAT", "BENCH", "PULL"];

export type LoggedSetRow = {
  performedAt: string | Date;
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
};

function toDayKey(performedAt: string | Date): string {
  const d = performedAt instanceof Date ? performedAt : new Date(performedAt);
  return Number.isNaN(d.getTime()) ? String(performedAt).slice(0, 10) : d.toISOString().slice(0, 10);
}

// 로그 세트들을 드라이버(SQ/BP/PULL)별 "일자별 탑세트(최대 e1RM)" 노출 시계열로 집계한다.
// 풀업은 bodyweightKg를 더해 총중량으로 환산(BW 미설정이면 추중량만). 비-드라이버 종목은 무시.
export function aggregateDriverExposures(
  rows: LoggedSetRow[],
  bodyweightKg: number | null,
): Record<DriverKey, DriverExposure[]> {
  const bestByDriverDay = new Map<string, { driver: DriverKey; exposure: DriverExposure; e1rm: number }>();
  for (const row of rows) {
    const target = mapExerciseNameToTarget(String(row.exerciseName ?? ""));
    if (target !== "SQUAT" && target !== "BENCH" && target !== "PULL") continue;
    const weightKg = Number(row.weightKg ?? 0);
    const reps = Number(row.reps ?? 0);
    if (!(weightKg > 0) || !(reps > 0)) continue;
    const bw = target === "PULL" && bodyweightKg && bodyweightKg > 0 ? bodyweightKg : undefined;
    const day = toDayKey(row.performedAt);
    const exposure: DriverExposure = { performedAt: day, weightKg, reps, bodyweightKg: bw };
    const e1rm = exposureE1rm(exposure);
    const key = `${target}|${day}`;
    const current = bestByDriverDay.get(key);
    if (!current || e1rm > current.e1rm) bestByDriverDay.set(key, { driver: target, exposure, e1rm });
  }

  const out: Record<DriverKey, DriverExposure[]> = { SQUAT: [], BENCH: [], PULL: [] };
  for (const { driver, exposure } of bestByDriverDay.values()) out[driver].push(exposure);
  for (const driver of ASYMPTOTE_DRIVERS) {
    out[driver].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  }
  return out;
}
