import type {
  WorkoutRecordDraft,
} from "@/entities/workout-record";
import { formatPerformedHistoryCompact } from "@/lib/workout-notation";
import { parseSessionKey } from "@workout/core/session-key";
import {
  daysBetweenDateKeys,
  isDateOnlyString,
  normalizeSchedule,
  toDateKey,
} from "./query-context";
import type {
  WorkoutLogLastSessionSummary,
  WorkoutLogRecentLogItem,
} from "./types";

function resolveLastSessionWeekAndType(
  log: WorkoutLogRecentLogItem,
  planParams: Record<string, unknown> | null | undefined,
) {
  const parsedSession = log.generatedSession?.sessionKey
    ? parseSessionKey(log.generatedSession.sessionKey)
    : null;
  const schedule = normalizeSchedule(planParams?.schedule);
  const sessionsPerWeekRaw = Number(planParams?.sessionsPerWeek ?? 0);
  const sessionsPerWeek = Number.isFinite(sessionsPerWeekRaw) && sessionsPerWeekRaw > 0
    ? Math.max(1, Math.floor(sessionsPerWeekRaw))
    : Math.max(1, schedule.length || 1);

  let week = parsedSession?.week ?? null;
  let day = parsedSession?.day ?? null;

  if ((week === null || day === null) && isDateOnlyString(planParams?.startDate)) {
    const logDateKey = toDateKey(new Date(log.performedAt));
    const delta = daysBetweenDateKeys(logDateKey, planParams.startDate);
    if (delta >= 0) {
      week = Math.floor(delta / sessionsPerWeek) + 1;
      day = (delta % sessionsPerWeek) + 1;
    }
  }

  const weekLabel = week !== null ? `Week ${week}` : "-";
  let sessionLabel = "-";
  if (schedule.length > 0 && day !== null) {
    sessionLabel = schedule[(day - 1) % schedule.length] ?? schedule[0] ?? "-";
  } else if (day !== null) {
    sessionLabel = day <= 2 ? (["A", "B"][(day - 1) % 2] ?? "-") : `D${day}`;
  }

  return { weekLabel, sessionLabel };
}

function extractBodyweightKg(log: WorkoutLogRecentLogItem, fallbackBodyweightKg: number | null): number | null {
  for (const set of log.sets) {
    const bodyweightKg = Number((set.meta as { bodyweightKg?: unknown } | null)?.bodyweightKg);
    if (Number.isFinite(bodyweightKg) && bodyweightKg > 0) {
      return bodyweightKg;
    }
  }
  return fallbackBodyweightKg;
}

export function formatDateFriendly(isoOrDateKey: string, locale: "ko" | "en") {
  const date = new Date(`${isoOrDateKey.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoOrDateKey;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function applyRecentWeightsToCustomExercises(
  draft: WorkoutRecordDraft,
  recentLogs: WorkoutLogRecentLogItem[],
): WorkoutRecordDraft {
  const nextSeedExercises = draft.seedExercises.map((exercise) => {
    const hasWeight = (exercise.set.weightKgPerSet ?? []).some((w) => w > 0);
    if (exercise.badge !== "CUSTOM" || hasWeight) return exercise;
    const name = exercise.exerciseName.toLowerCase();
    let foundWeight: number | null = null;
    outer: for (const log of recentLogs) {
      for (const set of log.sets) {
        if (
          set.exerciseName.toLowerCase() === name &&
          set.weightKg != null &&
          set.weightKg > 0
        ) {
          foundWeight = set.weightKg;
          break outer;
        }
      }
    }
    const weightKg = foundWeight ?? 50;
    const length = Math.max(1, exercise.set.repsPerSet.length);
    return {
      ...exercise,
      set: {
        ...exercise.set,
        weightKgPerSet: Array.from({ length }, () => weightKg),
        weightKg,
      },
    };
  });

  return {
    ...draft,
    seedExercises: nextSeedExercises,
  };
}

export function buildLastSessionSummary(
  logs: WorkoutLogRecentLogItem[],
  todayKey: string,
  planParams: Record<string, unknown> | null | undefined,
  fallbackBodyweightKg: number | null,
  locale: "ko" | "en",
): WorkoutLogLastSessionSummary {
  const selected = logs.find((entry) => toDateKey(new Date(entry.performedAt)) !== todayKey) ?? logs[0] ?? null;
  if (!selected) {
    return {
      dateLabel: null,
      weekLabel: "-",
      sessionLabel: "-",
      bodyweightKg: null,
      totalSets: 0,
      totalVolume: 0,
      exercises: [],
    };
  }

  const { weekLabel, sessionLabel } = resolveLastSessionWeekAndType(selected, planParams);

  let totalVolume = 0;
  const exerciseMap = new Map<string, { sets: number; bestWeight: number; bestReps: number }>();
  for (const set of selected.sets) {
    const weight = set.weightKg ?? 0;
    const reps = set.reps ?? 0;
    totalVolume += weight * reps;
    const name = set.exerciseName;
    const existing = exerciseMap.get(name);
    if (!existing) {
      exerciseMap.set(name, { sets: 1, bestWeight: weight, bestReps: reps });
    } else {
      existing.sets += 1;
      if (weight > existing.bestWeight || (weight === existing.bestWeight && reps > existing.bestReps)) {
        existing.bestWeight = weight;
        existing.bestReps = reps;
      }
    }
  }

  const exercises = Array.from(exerciseMap.entries()).map(([name, data]) => ({
    name,
    sets: data.sets,
    // 히스토리 컨벤션: `Weight × Reps × Sets` (compact). 무게 0이면 `— × Reps × Sets`.
    // bestSet은 단일 best 세트 데이터로 compact 표시하는 요약이므로 정확한 per-set 분포는 알 수 없음.
    bestSet: formatPerformedHistoryCompact(
      data.bestWeight,
      data.bestReps,
      data.sets,
    ),
  }));

  return {
    dateLabel: formatDateFriendly(toDateKey(new Date(selected.performedAt)), locale),
    weekLabel,
    sessionLabel,
    bodyweightKg: extractBodyweightKg(selected, fallbackBodyweightKg),
    totalSets: selected.sets.length,
    totalVolume: Math.round(totalVolume),
    exercises,
  };
}
