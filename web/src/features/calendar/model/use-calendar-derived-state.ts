"use client";

import { useMemo } from "react";
import { dateOnlyInTimezone, sessionKeyToWDLabel } from "@/features/calendar/lib/format";
import { extractSessionDate, parseSessionKey } from "@workout/core/session-key";
import {
  formatPerformedHistoryCompact,
  formatPlannedGroups,
} from "@workout/core/workout-notation/format";
import { resolveLoggedLoadDisplay } from "@workout/core/bodyweight-load";
import type {
  CalendarExercisePreviewItem,
  CalendarPlan,
  CalendarRecentGeneratedSession,
  CalendarSnapshotSet,
  CalendarWorkoutLogForDate,
  CalendarWorkoutLogSummary,
} from "./types";

function daysBetween(aDateOnly: string, bDateOnly: string) {
  return Math.floor(
    (new Date(`${aDateOnly}T00:00:00Z`).getTime() -
      new Date(`${bDateOnly}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function summarizePlannedSets(
  sets: CalendarSnapshotSet[],
  exerciseName?: string,
  bodyweightKg?: number | null,
  locale: "ko" | "en" = "ko",
) {
  if (sets.length === 0) return "";

  const groups: Array<{ reps: number; weightKg: number; count: number }> = [];
  for (const set of sets) {
    const reps = Number(set.reps ?? 0);
    const weightKg = Number(set.targetWeightKg ?? 0);
    const last = groups[groups.length - 1];
    if (last && last.reps === reps && last.weightKg === weightKg) {
      last.count += 1;
      continue;
    }
    groups.push({ reps, weightKg, count: 1 });
  }

  // 목표 무게(targetWeightKg)는 이미 총부하(TM×%)이므로 맨몸 운동은 추가중량 병기.
  return formatPlannedGroups(groups, { exerciseName, bodyweightKg, locale });
}

export function buildPlannedExercisePreview(
  snapshot: {
    exercises?: Array<{
      exerciseName?: string;
      role?: "MAIN" | "ASSIST" | string;
      sets?: CalendarSnapshotSet[];
    }>;
  } | null,
  bodyweightKg?: number | null,
  locale: "ko" | "en" = "ko",
): CalendarExercisePreviewItem[] {
  const exercises = Array.isArray(snapshot?.exercises) ? snapshot.exercises : [];

  return exercises
    .map((exercise) => {
      const name = String(exercise?.exerciseName ?? "").trim();
      if (!name) return null;
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
      return {
        name,
        role: exercise?.role ?? "MAIN",
        summary: summarizePlannedSets(sets, name, bodyweightKg, locale),
      } satisfies CalendarExercisePreviewItem;
    })
    .filter((exercise): exercise is CalendarExercisePreviewItem => exercise !== null);
}

function buildLoggedExercisePreview(
  sets: CalendarWorkoutLogForDate["sets"],
  bodyweightKg?: number | null,
  locale: "ko" | "en" = "ko",
) {
  let totalVolume = 0;
  const grouped = new Map<
    string,
    { count: number; bestWeight: number; bestReps: number; bestSuffix: string | null }
  >();

  for (const set of sets) {
    const name = String(set.exerciseName ?? "").trim();
    if (!name) continue;

    const reps = Number(set.reps ?? 0);
    // 맨몸 운동은 총부하(체중+추가)로 환산해 best/볼륨을 집계한다.
    const display = resolveLoggedLoadDisplay({
      exerciseName: name,
      weightKg: set.weightKg,
      meta: set.meta,
      locale,
    });
    const weight = Number(display.totalKg ?? set.weightKg ?? 0);
    totalVolume += Math.max(0, reps) * Math.max(0, weight);

    const current = grouped.get(name);
    if (!current) {
      grouped.set(name, {
        count: 1,
        bestWeight: weight,
        bestReps: reps,
        bestSuffix: display.suffix,
      });
      continue;
    }

    current.count += 1;
    if (
      weight > current.bestWeight ||
      (weight === current.bestWeight && reps > current.bestReps)
    ) {
      current.bestWeight = weight;
      current.bestReps = reps;
      current.bestSuffix = display.suffix;
    }
  }

  return {
    exercises: Array.from(grouped.entries()).map(([name, value]) => ({
      name,
      role: "MAIN",
      summary: formatPerformedHistoryCompact(
        value.bestWeight,
        value.bestReps,
        value.count,
        value.bestSuffix,
      ),
    })),
    totalSets: sets.length,
    totalVolume: Math.round(totalVolume),
  };
}

function computePlanContextForDate(plan: CalendarPlan | null, dateOnly: string) {
  if (!plan) return null;
  const params = plan.params ?? {};
  const mode = String(params.sessionKeyMode ?? "").toUpperCase();
  const startDate =
    typeof params.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.startDate)
      ? params.startDate
      : null;

  let week = 1;
  let day = 1;
  let scheduleKey: string | null = null;
  let planned = true;

  if (startDate) {
    const delta = daysBetween(dateOnly, startDate);
    if (delta < 0) planned = false;
    const normalized = Math.max(0, delta);
    if (plan.type === "MANUAL") {
      const schedule = Array.isArray(params.schedule) ? params.schedule : [];
      const span = Math.max(1, schedule.length || 1);
      day = (normalized % span) + 1;
      week = Math.floor(normalized / span) + 1;
      if (schedule.length > 0) {
        scheduleKey = String(schedule[(day - 1) % schedule.length]);
      }
    } else {
      const sessionsPerWeek = Math.max(1, Number(params.sessionsPerWeek ?? 7));
      day = (normalized % sessionsPerWeek) + 1;
      week = Math.floor(normalized / sessionsPerWeek) + 1;
    }
  } else {
    planned = false;
  }

  const sessionKey = mode === "DATE" ? dateOnly : `W${week}D${day}`;
  return { planned, week, day, scheduleKey, sessionKey };
}

function getNextSessionLabel(sessionKey: string, sessionsPerWeek: number): string | null {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed || parsed.week === null || parsed.day === null) return null;
  const nextDay = parsed.day < sessionsPerWeek ? parsed.day + 1 : 1;
  const nextWeek = parsed.day < sessionsPerWeek ? parsed.week : parsed.week + 1;
  if (parsed.cycle != null) {
    return `C${parsed.cycle}W${nextWeek}D${nextDay}`;
  }
  return `W${nextWeek}D${nextDay}`;
}

type UseCalendarDerivedStateInput = {
  selectedPlan: CalendarPlan | null;
  selectedDate: string;
  today: string;
  timezone: string;
  recentSessions: CalendarRecentGeneratedSession[];
  allPlanLogs: CalendarWorkoutLogSummary[];
  currentSelectedLog: CalendarWorkoutLogForDate | null;
  bodyweightKg?: number | null;
  locale?: "ko" | "en";
};

export function useCalendarDerivedState({
  selectedPlan,
  selectedDate,
  today,
  timezone,
  recentSessions,
  allPlanLogs,
  currentSelectedLog,
  bodyweightKg = null,
  locale = "ko",
}: UseCalendarDerivedStateInput) {
  const generatedByDate = useMemo(() => {
    const map = new Map<string, CalendarRecentGeneratedSession>();
    for (const session of recentSessions) {
      const dateOnly = extractSessionDate(session.sessionKey);
      if (!dateOnly) continue;
      const current = map.get(dateOnly);
      if (
        !current ||
        new Date(current.updatedAt).getTime() < new Date(session.updatedAt).getTime()
      ) {
        map.set(dateOnly, session);
      }
    }
    return map;
  }, [recentSessions]);

  const generatedByKey = useMemo(() => {
    const map = new Map<string, CalendarRecentGeneratedSession>();
    for (const session of recentSessions) {
      map.set(session.sessionKey, session);
    }
    return map;
  }, [recentSessions]);

  const generatedById = useMemo(() => {
    const map = new Map<string, CalendarRecentGeneratedSession>();
    for (const session of recentSessions) {
      map.set(session.id, session);
    }
    return map;
  }, [recentSessions]);

  const sessionLoggedDateMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of allPlanLogs) {
      if (log.generatedSessionId) {
        map.set(
          log.generatedSessionId,
          dateOnlyInTimezone(new Date(log.performedAt), timezone),
        );
      }
    }
    return map;
  }, [allPlanLogs, timezone]);

  const logDates = useMemo(() => {
    const set = new Set<string>();
    for (const log of allPlanLogs) {
      set.add(dateOnlyInTimezone(new Date(log.performedAt), timezone));
    }
    return set;
  }, [allPlanLogs, timezone]);

  const lastLogSessionKey = useMemo(() => {
    const lastLog = allPlanLogs[0];
    if (!lastLog?.generatedSessionId) return null;
    return generatedById.get(lastLog.generatedSessionId)?.sessionKey ?? null;
  }, [allPlanLogs, generatedById]);

  // autoProgression은 cycle-wave 키(C{c}W{w}D{d})라 sessionKey의 날짜로 세션을 매핑할 수 없다.
  // "다음 할 세션" = 아직 기록되지 않은(미로그) 세션 중 가장 최근 생성/갱신된 것.
  // generateAndSaveSession이 runtime 위치 세션을 그때그때 upsert하므로 이 값이 현재 위치다.
  const nextPlannedSession = useMemo(() => {
    let best: CalendarRecentGeneratedSession | null = null;
    for (const session of recentSessions) {
      if (sessionLoggedDateMap.has(session.id)) continue; // 이미 기록된 세션 제외
      if (!best || new Date(best.updatedAt).getTime() < new Date(session.updatedAt).getTime()) {
        best = session;
      }
    }
    return best;
  }, [recentSessions, sessionLoggedDateMap]);

  const selectedCtx = useMemo(
    () => computePlanContextForDate(selectedPlan, selectedDate),
    [selectedDate, selectedPlan],
  );

  const selectedSession = useMemo(() => {
    const mode = String(selectedPlan?.params?.sessionKeyMode ?? "").toUpperCase();
    const isAutoProgression = selectedPlan?.params?.autoProgression === true;

    let session: CalendarRecentGeneratedSession | null = null;
    if (mode === "DATE" && !isAutoProgression) {
      // 순수 DATE 모드: sessionKey == 날짜 → 날짜로 매핑 (회귀 없음)
      session = generatedByDate.get(selectedDate) ?? null;
    } else if (mode !== "DATE") {
      // PROGRESSION 등: 논리 위치 키로 정확 매핑
      if (!selectedCtx) return null;
      session = generatedByKey.get(selectedCtx.sessionKey) ?? null;
    } else {
      // DATE + autoProgression: cycle-wave 키라 날짜 매핑 불가.
      // 미로그 최신 세션을 "다음 할 세션"으로 사용. 아래 가드가 과거/이후로그 케이스를
      // 차단하므로 실질적으로 "오늘 + 다음 세션"에서만 표시된다.
      session = nextPlannedSession;
    }
    if (!session) return null;

    const loggedDate = sessionLoggedDateMap.get(session.id);
    if (loggedDate && loggedDate !== selectedDate) return null;

    if (!loggedDate && isAutoProgression) {
      const hasLaterLog = Array.from(logDates).some((dateOnly) => dateOnly > selectedDate);
      if (selectedDate < today || hasLaterLog) return null;
    }

    return session;
  }, [
    generatedByDate,
    generatedByKey,
    nextPlannedSession,
    logDates,
    selectedCtx,
    selectedDate,
    selectedPlan,
    sessionLoggedDateMap,
    today,
  ]);

  const isAutoProgressionPlan = selectedPlan?.params?.autoProgression === true;
  const isPastDate = selectedDate < today;
  const hasLaterLogs = Array.from(logDates).some((d) => d > selectedDate);
  const isPastDateCreationBlocked =
    isAutoProgressionPlan && isPastDate && !currentSelectedLog && hasLaterLogs;

  const loggedSummary = useMemo(
    () =>
      buildLoggedExercisePreview(
        currentSelectedLog?.sets ?? [],
        bodyweightKg,
        locale,
      ),
    [currentSelectedLog, bodyweightKg, locale],
  );

  const selectedDayLabel = useMemo(() => {
    if (!selectedCtx) return null;
    if (selectedPlan?.type === "MANUAL" && selectedCtx.scheduleKey) {
      return selectedCtx.scheduleKey;
    }
    const lastCycle = lastLogSessionKey ? parseSessionKey(lastLogSessionKey)?.cycle ?? null : null;
    if (lastCycle != null) {
      return `C${lastCycle}W${selectedCtx.week}D${selectedCtx.day}`;
    }
    return `W${selectedCtx.week}D${selectedCtx.day}`;
  }, [selectedCtx, selectedPlan?.type, lastLogSessionKey]);

  const nextSessionLabel = useMemo(() => {
    if (!lastLogSessionKey || !selectedPlan) return null;
    const sessionsPerWeek = Math.max(1, Number(selectedPlan.params?.sessionsPerWeek ?? 7));
    return getNextSessionLabel(lastLogSessionKey, sessionsPerWeek);
  }, [lastLogSessionKey, selectedPlan]);

  const loggedDayLabel = useMemo(() => {
    if (!currentSelectedLog?.generatedSessionId) return selectedDayLabel;
    return (
      sessionKeyToWDLabel(
        generatedById.get(currentSelectedLog.generatedSessionId)?.sessionKey ?? "",
      ) ?? selectedDayLabel
    );
  }, [currentSelectedLog, generatedById, selectedDayLabel]);

  const selectedSessionWDLabel = useMemo(() => {
    if (!selectedSession) return null;
    return sessionKeyToWDLabel(selectedSession.sessionKey);
  }, [selectedSession]);

  const recentPastLogs = useMemo(() => {
    return allPlanLogs
      .filter(
        (log) => dateOnlyInTimezone(new Date(log.performedAt), timezone) !== today,
      )
      .slice(0, 5);
  }, [allPlanLogs, timezone, today]);

  // 가장 최신 운동기록인지 여부 (삭제/날짜변경 허용 조건)
  const isLatestLog = useMemo(
    () => currentSelectedLog != null && allPlanLogs[0]?.id === currentSelectedLog.id,
    [currentSelectedLog, allPlanLogs],
  );

  // 날짜 이동 시 선택 가능한 최소 날짜 (이전 세션 날짜 + 1일)
  const moveDateMinDate = useMemo(() => {
    if (!isLatestLog || allPlanLogs.length < 2) return null;
    // allPlanLogs[0]이 현재 최신 세션, allPlanLogs[1]이 이전 세션
    const prevLog = allPlanLogs[1]!;
    const prevDate = dateOnlyInTimezone(new Date(prevLog.performedAt), timezone);
    const d = new Date(`${prevDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, [isLatestLog, allPlanLogs, timezone]);

  return {
    generatedById,
    logDates,
    selectedCtx,
    selectedSession,
    isPastDateCreationBlocked,
    hasLaterLogs,
    loggedSummary,
    selectedDayLabel,
    nextSessionLabel,
    loggedDayLabel,
    selectedSessionWDLabel,
    recentPastLogs,
    isLatestLog,
    moveDateMinDate,
  };
}
