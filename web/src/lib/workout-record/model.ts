import type { AppLocale } from "@/lib/i18n/messages";

export type WorkoutWorkflowState = "idle" | "editing" | "saving" | "done";

export type WorkoutSetModel = {
  count: number;
  reps: number;
  repsPerSet: number[];
  rpePerSet: number[];
  weightKg: number;
};

export type WorkoutPlannedSetMeta = {
  percentPerSet: Array<number | null>;
  targetWeightKgPerSet: Array<number | null>;
  repsPerSet: Array<number | null>;
  rpePerSet: Array<number | null>;
  amrapPerSet: boolean[];
};

export type WorkoutNoteModel = {
  memo: string;
};

export type WorkoutExerciseSource = "PROGRAM" | "USER";
export type WorkoutExerciseBadge = "AUTO" | "CUSTOM" | "ADDED";

export type WorkoutExerciseModel = {
  id: string;
  exerciseId: string | null;
  exerciseName: string;
  source: WorkoutExerciseSource;
  badge?: WorkoutExerciseBadge | null;
  prescribedWeightKg?: number | null;
  plannedSetMeta?: WorkoutPlannedSetMeta | null;
  set: WorkoutSetModel;
  note: WorkoutNoteModel;
};

export type WorkoutSessionModel = {
  logId: string | null;
  generatedSessionId: string | null;
  performedAt: string;
  sessionDate: string;
  timezone: string;
  planId: string;
  planName: string;
  sessionKey: string;
  week: number;
  day: number;
  sessionType: string;
  estimatedE1rmKg: number | null;
  estimatedTmKg: number | null;
  note: WorkoutNoteModel;
};

export type SeedExerciseEditPatch = {
  exerciseId?: string | null;
  exerciseName?: string;
  set?: Partial<WorkoutSetModel>;
  note?: Partial<WorkoutNoteModel>;
  deleted?: boolean;
};

export type WorkoutRecordDraft = {
  session: WorkoutSessionModel;
  seedExercises: WorkoutExerciseModel[];
  seedEditLayer: Record<string, SeedExerciseEditPatch>;
  userExercises: WorkoutExerciseModel[];
};

export type WorkoutExerciseViewModel = WorkoutExerciseModel & {
  isEdited: boolean;
  deleted: boolean;
};

export type GeneratedSessionLike = {
  id: string;
  planId: string;
  sessionKey: string;
  snapshot: any;
};

export type ExistingWorkoutLogLike = {
  id: string;
  planId: string | null;
  generatedSessionId: string | null;
  performedAt: string;
  notes?: string | null;
  sets: Array<{
    exerciseId?: string | null;
    exerciseName?: string | null;
    sortOrder?: number | null;
    setNumber?: number | null;
    reps?: number | null;
    weightKg?: number | null;
    rpe?: number | null;
    isExtra?: boolean | null;
    meta?: unknown;
  }>;
  generatedSession?: (GeneratedSessionLike & { updatedAt?: string }) | null;
};

export type WorkoutRecordValidation = {
  valid: boolean;
  errors: string[];
};

export type WorkoutLogPayload = {
  planId: string;
  generatedSessionId: string | null;
  performedAt: string;
  timezone?: string;
  durationMinutes: number | null;
  notes: string | null;
  sets: Array<{
    exerciseId?: string | null;
    exerciseName: string;
    setNumber: number;
    reps: number;
    weightKg: number;
    rpe: number;
    isExtra: boolean;
    meta: Record<string, unknown>;
  }>;
};

type WorkoutLogBuildOptions = {
  bodyweightKg?: number | null;
  isBodyweightExercise?: (exerciseName: string) => boolean;
};

type SnapshotSet = {
  reps?: number;
  targetWeightKg?: number;
  weightKg?: number;
  percent?: number;
  note?: string;
};

type SnapshotExercise = {
  exerciseId?: string | null;
  exerciseName?: string;
  name?: string;
  rowType?: string | null;
  slotRole?: string | null;
  progressionTarget?: string | null;
  progressionKey?: string | null;
  sets?: SnapshotSet[];
};

type WorkoutRecordLocale = AppLocale;

const WORKOUT_RECORD_TEXT = {
  ko: {
    noExerciseInfo: "운동 정보 없음",
    noProgramSelected: "프로그램 미선택",
    atLeastOneExercise: "최소 1개 이상의 운동이 필요합니다.",
    emptyExerciseName: (row: number) => `${row}번째 운동의 종목명이 비어 있습니다.`,
    invalidSetCount: (row: number) => `${row}번째 운동의 세트 수는 1~50 범위여야 합니다.`,
    invalidSetShape: (row: number) => `${row}번째 운동의 세트별 횟수 정보가 올바르지 않습니다.`,
    invalidReps: (row: number, setIndex: number) => `${row}번째 운동의 ${setIndex + 1}세트 횟수는 1~100 범위여야 합니다.`,
    invalidWeight: (row: number) => `${row}번째 운동의 무게는 0~1000kg 범위여야 합니다.`,
  },
  en: {
    noExerciseInfo: "No Exercise Info",
    noProgramSelected: "No Program Selected",
    atLeastOneExercise: "At least one exercise is required.",
    emptyExerciseName: (row: number) => `Exercise ${row} is missing a name.`,
    invalidSetCount: (row: number) => `Exercise ${row} must have between 1 and 50 sets.`,
    invalidSetShape: (row: number) => `Exercise ${row} has invalid per-set rep data.`,
    invalidReps: (row: number, setIndex: number) => `Exercise ${row} set ${setIndex + 1} reps must be between 1 and 100.`,
    invalidWeight: (row: number) => `Exercise ${row} weight must be between 0 and 1000kg.`,
  },
} as const;

function normalizeExerciseLookupKey(exerciseId: string | null | undefined, exerciseName: string) {
  const idPart = typeof exerciseId === "string" && exerciseId.trim() ? exerciseId.trim() : "";
  return `${idPart}::${exerciseName.trim().toLowerCase()}`;
}

function toPlannedSetMeta(sets: SnapshotSet[] | undefined): WorkoutPlannedSetMeta | null {
  if (!Array.isArray(sets) || sets.length === 0) return null;
  return {
    percentPerSet: sets.map((set) => {
      const percent = Number(set?.percent);
      return Number.isFinite(percent) && percent > 0 ? percent : null;
    }),
    targetWeightKgPerSet: sets.map((set) => {
      const weightKg = Number(set?.targetWeightKg ?? set?.weightKg);
      return Number.isFinite(weightKg) && weightKg >= 0 ? weightKg : null;
    }),
    repsPerSet: sets.map((set) => {
      const reps = Number(set?.reps);
      return Number.isFinite(reps) && reps >= 0 ? reps : null;
    }),
    rpePerSet: sets.map((set) => {
      const rpe = Number((set as { rpe?: unknown })?.rpe);
      return Number.isFinite(rpe) && rpe > 0 ? rpe : null;
    }),
    amrapPerSet: sets.map((set) => (set as { amrap?: unknown })?.amrap === true),
  };
}

function toSnapshotExerciseBadge(exercise: SnapshotExercise): WorkoutExerciseBadge | null {
  const normalizedRowType = String(exercise.rowType ?? exercise.slotRole ?? "").trim().toUpperCase();
  if (normalizedRowType === "AUTO" || normalizedRowType === "ANCHOR" || normalizedRowType === "FLEX") {
    return "AUTO";
  }
  if (normalizedRowType === "CUSTOM") {
    return "CUSTOM";
  }
  return null;
}

type PlannedSnapshotLookupEntry = {
  plannedSetMeta: WorkoutPlannedSetMeta | null;
  badge: WorkoutExerciseBadge | null;
};

function createPlannedSetMetaLookup(snapshotExercises: SnapshotExercise[]) {
  const lookup = new Map<string, PlannedSnapshotLookupEntry>();

  snapshotExercises.forEach((exercise) => {
    const exerciseName = nonEmpty(String(exercise.exerciseName ?? exercise.name ?? ""), "");
    if (!exerciseName) return;
    const entry: PlannedSnapshotLookupEntry = {
      plannedSetMeta: toPlannedSetMeta(exercise.sets),
      badge: toSnapshotExerciseBadge(exercise),
    };

    const preferredKey = normalizeExerciseLookupKey(
      typeof exercise.exerciseId === "string" ? exercise.exerciseId : null,
      exerciseName,
    );
    if (!lookup.has(preferredKey)) {
      lookup.set(preferredKey, entry);
    }

    const fallbackKey = normalizeExerciseLookupKey(null, exerciseName);
    if (!lookup.has(fallbackKey)) {
      lookup.set(fallbackKey, entry);
    }
  });

  return lookup;
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeRepsValue(value: unknown, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeRpeValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(0, Math.round(parsed * 2) / 2));
}

function normalizeRepsPerSetArray(
  value: unknown,
  fallbackReps = 5,
  fallbackCount = 1,
): number[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeRepsValue(entry, fallbackReps))
      .filter((entry) => Number.isFinite(entry))
      .slice(0, 50);
    if (normalized.length > 0) return normalized;
  }

  const count = Math.min(50, Math.max(1, Math.round(toNumber(fallbackCount, 1))));
  const reps = normalizeRepsValue(fallbackReps, 5);
  return Array.from({ length: count }, () => reps);
}

function normalizeRpePerSetArray(
  value: unknown,
  fallbackCount = 1,
): number[] {
  const count = Math.min(50, Math.max(1, Math.round(toNumber(fallbackCount, 1))));
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeRpeValue(entry, 0))
      .filter((entry) => Number.isFinite(entry))
      .slice(0, 50);
    if (normalized.length > 0) {
      const fallback = normalized[normalized.length - 1] ?? 0;
      return Array.from({ length: count }, (_, index) =>
        normalizeRpeValue(normalized[index], fallback),
      );
    }
  }

  return Array.from({ length: count }, () => 0);
}

function nonEmpty(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function estimateE1rm(weightKg: number, reps: number) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps <= 0) return null;
  const effectiveReps = Math.min(reps, 15);
  return weightKg * (1 + effectiveReps / 30);
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPerformedAtForSessionDate(sessionDate: string, now: Date = new Date()) {
  const [year, month, day] = sessionDate.split("-").map((value) => Number(value));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return now.toISOString();
  }

  return new Date(
    year,
    Math.max(0, month - 1),
    Math.max(1, day),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  ).toISOString();
}

function extractMemoFromMeta(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const memo = (meta as { memo?: unknown }).memo;
  return typeof memo === "string" ? memo.trim() : "";
}

function deriveEstimateFromSnapshot(exercises: SnapshotExercise[]) {
  let estimatedE1rmKg: number | null = null;
  let estimatedTmKg: number | null = null;

  for (const exercise of exercises) {
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    for (const set of sets) {
      const reps = toNumber(set.reps, 0);
      const weightKg = toNumber(set.targetWeightKg ?? set.weightKg, 0);
      const e1rm = estimateE1rm(weightKg, reps);
      if (e1rm !== null) {
        estimatedE1rmKg = estimatedE1rmKg === null ? e1rm : Math.max(estimatedE1rmKg, e1rm);
      }

      const percent = Number(set.percent);
      if (Number.isFinite(percent) && percent > 0 && weightKg > 0) {
        const tm = weightKg / percent;
        estimatedTmKg = estimatedTmKg === null ? tm : Math.max(estimatedTmKg, tm);
      }
    }
  }

  return {
    estimatedE1rmKg: estimatedE1rmKg === null ? null : Math.round(estimatedE1rmKg),
    estimatedTmKg: estimatedTmKg === null ? null : Math.round(estimatedTmKg),
  };
}

function deriveEstimateFromLoggedExercises(exercises: WorkoutExerciseModel[]) {
  let estimatedE1rmKg: number | null = null;

  for (const exercise of exercises) {
    for (const reps of exercise.set.repsPerSet) {
      const e1rm = estimateE1rm(exercise.set.weightKg, reps);
      if (e1rm !== null) {
        estimatedE1rmKg = estimatedE1rmKg === null ? e1rm : Math.max(estimatedE1rmKg, e1rm);
      }
    }
  }

  return {
    estimatedE1rmKg: estimatedE1rmKg === null ? null : Math.round(estimatedE1rmKg),
    estimatedTmKg: null,
  };
}

function normalizeScheduleEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function sessionsPerWeekFromSnapshot(snapshot: any) {
  const firstBlock = Array.isArray(snapshot?.blocks) ? snapshot.blocks[0] ?? null : null;
  const candidates = [
    snapshot?.program?.schedule?.sessionsPerWeek,
    firstBlock?.definition?.schedule?.sessionsPerWeek,
    snapshot?.schedule?.sessionsPerWeek,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.max(1, Math.floor(parsed));
    }
  }

  return null;
}

function isOperatorSnapshot(snapshot: any, planName: string) {
  const firstBlock = Array.isArray(snapshot?.blocks) ? snapshot.blocks[0] ?? null : null;
  const candidates = [
    snapshot?.program?.slug,
    snapshot?.program?.name,
    firstBlock?.program?.slug,
    firstBlock?.program?.name,
    firstBlock?.definition?.kind,
    firstBlock?.definition?.programFamily,
    snapshot?.plan?.name,
    planName,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  return candidates.some((value) => value.includes("operator"));
}

function toSessionType(
  day: number,
  snapshot: any,
  planName: string,
  sessionKey: string,
  planSchedule?: unknown,
) {
  const manualSessionKey = String(snapshot?.manualSessionKey ?? "").trim();
  if (manualSessionKey) {
    return manualSessionKey;
  }

  const explicitSessionLabel = String(snapshot?.sessionType ?? snapshot?.sessionLabel ?? "").trim();
  if (explicitSessionLabel) {
    return explicitSessionLabel;
  }

  const scheduleEntries = normalizeScheduleEntries(planSchedule);
  if (scheduleEntries.length > 0) {
    return scheduleEntries[(Math.max(1, day) - 1) % scheduleEntries.length] ?? scheduleEntries[0]!;
  }

  if (isOperatorSnapshot(snapshot, planName)) {
    const matchedDay = /D(\d+)/i.exec(String(sessionKey ?? "").trim());
    if (matchedDay?.[1]) {
      return `D${matchedDay[1]}`;
    }
    return `D${((Math.max(1, day) - 1) % 3) + 1}`;
  }

  const sessionsPerWeek = sessionsPerWeekFromSnapshot(snapshot);
  if (sessionsPerWeek !== null) {
    if (sessionsPerWeek === 2) {
      return ["A", "B"][(Math.max(1, day) - 1) % 2]!;
    }
    return `D${((Math.max(1, day) - 1) % sessionsPerWeek) + 1}`;
  }

  return day % 2 === 1 ? "A" : "B";
}

function toSeedExercise(exercise: SnapshotExercise, index: number): WorkoutExerciseModel {
  const sets = Array.isArray(exercise.sets) && exercise.sets.length > 0 ? exercise.sets : [{}];
  const first = sets[0] ?? {};
  const repsPerSet = normalizeRepsPerSetArray(
    sets.map((set) => set?.reps),
    toNumber(first.reps, 5),
    sets.length,
  );

  return {
    id: `seed-${index + 1}`,
    exerciseId: typeof exercise.exerciseId === "string" ? exercise.exerciseId : null,
    exerciseName: nonEmpty(String(exercise.exerciseName ?? exercise.name ?? ""), `Exercise ${index + 1}`),
    source: "PROGRAM",
    badge: toSnapshotExerciseBadge(exercise),
    prescribedWeightKg: Math.max(0, toNumber(first.targetWeightKg ?? first.weightKg, 0)),
    plannedSetMeta: toPlannedSetMeta(sets),
    set: {
      count: repsPerSet.length,
      reps: repsPerSet[0] ?? 5,
      repsPerSet,
      rpePerSet: normalizeRpePerSetArray(null, repsPerSet.length),
      weightKg: Math.max(0, toNumber(first.targetWeightKg ?? first.weightKg, 0)),
    },
    note: {
      memo: typeof first.note === "string" ? first.note : "",
    },
  };
}

function mergeSetModel(base: WorkoutSetModel, patch?: Partial<WorkoutSetModel>): WorkoutSetModel {
  const baseRepsPerSet = normalizeRepsPerSetArray(base.repsPerSet, base.reps, base.count);
  const baseRpePerSet = normalizeRpePerSetArray(base.rpePerSet, baseRepsPerSet.length);
  let nextRepsPerSet = baseRepsPerSet;
  let nextRpePerSet = baseRpePerSet;

  if (patch?.repsPerSet !== undefined) {
    nextRepsPerSet = normalizeRepsPerSetArray(patch.repsPerSet, base.reps, base.count);
  } else {
    const requestedCount = patch?.count !== undefined ? Math.max(1, Math.min(50, Math.round(patch.count))) : baseRepsPerSet.length;
    const requestedReps = patch?.reps !== undefined ? normalizeRepsValue(patch.reps, base.reps) : null;

    if (requestedCount !== baseRepsPerSet.length || requestedReps !== null) {
      const fallbackReps = requestedReps ?? baseRepsPerSet[baseRepsPerSet.length - 1] ?? base.reps;
      nextRepsPerSet = Array.from({ length: requestedCount }, (_, index) =>
        requestedReps ?? baseRepsPerSet[index] ?? fallbackReps,
      );
    }
  }
  if (patch?.rpePerSet !== undefined) {
    nextRpePerSet = normalizeRpePerSetArray(patch.rpePerSet, nextRepsPerSet.length);
  } else if (nextRepsPerSet.length !== baseRpePerSet.length) {
    nextRpePerSet = Array.from(
      { length: nextRepsPerSet.length },
      (_, index) => baseRpePerSet[index] ?? 0,
    );
  }

  return {
    count: nextRepsPerSet.length,
    reps: nextRepsPerSet[0] ?? 5,
    repsPerSet: nextRepsPerSet,
    rpePerSet: nextRpePerSet,
    weightKg: patch?.weightKg !== undefined ? Math.max(0, Number(patch.weightKg)) : base.weightKg,
  };
}

function mergeSeedExercise(base: WorkoutExerciseModel, patch: SeedExerciseEditPatch | undefined): WorkoutExerciseViewModel {
  if (!patch) {
    return {
      ...base,
      isEdited: false,
      deleted: false,
    };
  }

  const next: WorkoutExerciseViewModel = {
    ...base,
    exerciseId: patch.exerciseId !== undefined ? patch.exerciseId : base.exerciseId,
    exerciseName: patch.exerciseName ?? base.exerciseName,
    set: mergeSetModel(base.set, patch.set),
    note: {
      memo: patch.note?.memo ?? base.note.memo,
    },
    isEdited: true,
    deleted: Boolean(patch.deleted),
  };

  return next;
}

function groupLoggedExercises(
  sets: ExistingWorkoutLogLike["sets"],
  snapshotExercises: SnapshotExercise[] = [],
  locale: WorkoutRecordLocale = "ko",
): WorkoutExerciseModel[] {
  const copy = WORKOUT_RECORD_TEXT[locale];
  const plannedSetMetaLookup = createPlannedSetMetaLookup(snapshotExercises);
  const grouped: Array<{
    exerciseId: string | null;
    exerciseName: string;
    isExtra: boolean;
    repsPerSet: number[];
    rpePerSet: number[];
    weightKg: number;
    memo: string;
    plannedSetMeta: WorkoutPlannedSetMeta | null;
    badge: WorkoutExerciseBadge;
  }> = [];

  for (const rawSet of sets ?? []) {
    const exerciseName = nonEmpty(String(rawSet?.exerciseName ?? ""), copy.noExerciseInfo);
    const exerciseId =
      typeof rawSet?.exerciseId === "string" && rawSet.exerciseId.trim() ? rawSet.exerciseId.trim() : null;
    const setNumber = Math.max(1, Math.round(toNumber(rawSet?.setNumber, 1)));
    const reps = normalizeRepsValue(rawSet?.reps, 5);
    const rpe = normalizeRpeValue(rawSet?.rpe, 0);
    const weightKg = Math.max(0, toNumber(rawSet?.weightKg, 0));
    const memo = extractMemoFromMeta(rawSet?.meta);
    const isExtra = Boolean(rawSet?.isExtra);
    const previous = grouped[grouped.length - 1] ?? null;
    const isContinuation =
      previous !== null &&
      previous.exerciseId === exerciseId &&
      previous.exerciseName.trim().toLowerCase() === exerciseName.trim().toLowerCase() &&
      setNumber === previous.repsPerSet.length + 1;

    if (isContinuation && previous) {
      previous.repsPerSet.push(reps);
      previous.rpePerSet.push(rpe);
      if (!previous.memo && memo) {
        previous.memo = memo;
      }
      continue;
    }

    const snapshotExerciseEntry =
      plannedSetMetaLookup.get(normalizeExerciseLookupKey(exerciseId, exerciseName)) ??
      plannedSetMetaLookup.get(normalizeExerciseLookupKey(null, exerciseName)) ??
      null;

    grouped.push({
      exerciseId,
      exerciseName,
      isExtra,
      repsPerSet: [reps],
      rpePerSet: [rpe],
      weightKg,
      memo,
      plannedSetMeta: snapshotExerciseEntry?.plannedSetMeta ?? null,
      badge: snapshotExerciseEntry?.badge ?? (isExtra ? "ADDED" : "AUTO"),
    });
  }

  return grouped.map((exercise, index) => ({
    id: `log-${index + 1}`,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    source: "USER",
    badge: exercise.badge,
    prescribedWeightKg: null,
    plannedSetMeta: exercise.plannedSetMeta,
    set: {
      count: exercise.repsPerSet.length,
      reps: exercise.repsPerSet[0] ?? 5,
      repsPerSet: exercise.repsPerSet,
      rpePerSet: normalizeRpePerSetArray(
        exercise.rpePerSet,
        exercise.repsPerSet.length,
      ),
      weightKg: exercise.weightKg,
    },
    note: {
      memo: exercise.memo,
    },
  }));
}

export function createWorkoutRecordDraft(
  session: GeneratedSessionLike,
  planName: string,
  options: {
    sessionDate?: string;
    timezone?: string;
    planSchedule?: unknown;
    locale?: WorkoutRecordLocale;
  } = {},
): WorkoutRecordDraft {
  const copy = WORKOUT_RECORD_TEXT[options.locale ?? "ko"];
  const snapshot = session.snapshot ?? {};
  const week = Math.max(1, Math.round(toNumber(snapshot.week, 1)));
  const day = Math.max(1, Math.round(toNumber(snapshot.day, 1)));
  const exercises = (Array.isArray(snapshot.exercises) ? snapshot.exercises : []) as SnapshotExercise[];
  const estimate = deriveEstimateFromSnapshot(exercises);
  const sessionDate =
    typeof options.sessionDate === "string" && options.sessionDate.trim()
      ? options.sessionDate.trim()
      : nonEmpty(String(snapshot.sessionDate ?? session.sessionKey ?? ""), toLocalDateKey(new Date()));
  const timezone = nonEmpty(options.timezone ?? "", "UTC");
  const resolvedSessionKey = nonEmpty(String(snapshot.sessionKey ?? session.sessionKey ?? ""), "W1D1");

  return {
    session: {
      logId: null,
      generatedSessionId: session.id ?? null,
      performedAt: toPerformedAtForSessionDate(sessionDate),
      sessionDate,
      timezone,
      planId: session.planId,
      planName: nonEmpty(planName, copy.noProgramSelected),
      sessionKey: resolvedSessionKey,
      week,
      day,
      sessionType: toSessionType(day, snapshot, planName, resolvedSessionKey, options.planSchedule),
      estimatedE1rmKg: estimate.estimatedE1rmKg,
      estimatedTmKg: estimate.estimatedTmKg,
      note: { memo: "" },
    },
    seedExercises: exercises.map(toSeedExercise),
    seedEditLayer: {},
    userExercises: [],
  };
}

export function createWorkoutRecordDraftFromLog(
  log: ExistingWorkoutLogLike,
  planName: string,
  options: {
    sessionDate?: string;
    timezone?: string;
    planSchedule?: unknown;
    locale?: WorkoutRecordLocale;
  } = {},
): WorkoutRecordDraft {
  const copy = WORKOUT_RECORD_TEXT[options.locale ?? "ko"];
  const snapshot = log.generatedSession?.snapshot ?? {};
  const week = Math.max(1, Math.round(toNumber(snapshot.week, 1)));
  const day = Math.max(1, Math.round(toNumber(snapshot.day, 1)));
  const snapshotExercises = (Array.isArray(snapshot.exercises) ? snapshot.exercises : []) as SnapshotExercise[];
  const loggedExercises = groupLoggedExercises(Array.isArray(log.sets) ? log.sets : [], snapshotExercises, options.locale);
  const estimateFromSnapshot = deriveEstimateFromSnapshot(
    snapshotExercises,
  );
  const estimateFromLog = deriveEstimateFromLoggedExercises(loggedExercises);
  const parsedPerformedAt = new Date(log.performedAt);
  const fallbackSessionDate =
    Number.isNaN(parsedPerformedAt.getTime()) ? toLocalDateKey(new Date()) : toLocalDateKey(parsedPerformedAt);
  const sessionDate =
    typeof options.sessionDate === "string" && options.sessionDate.trim()
      ? options.sessionDate.trim()
      : fallbackSessionDate;
  const timezone = nonEmpty(options.timezone ?? "", "UTC");
  const resolvedSessionKey = nonEmpty(
    String(snapshot.sessionKey ?? log.generatedSession?.sessionKey ?? sessionDate),
    sessionDate,
  );

  return {
    session: {
      logId: log.id,
      generatedSessionId: log.generatedSessionId ?? log.generatedSession?.id ?? null,
      performedAt: log.performedAt,
      sessionDate,
      timezone,
      planId: typeof log.planId === "string" ? log.planId : "",
      planName: nonEmpty(planName, copy.noProgramSelected),
      sessionKey: resolvedSessionKey,
      week,
      day,
      sessionType: toSessionType(day, snapshot, planName, resolvedSessionKey, options.planSchedule),
      estimatedE1rmKg: estimateFromLog.estimatedE1rmKg ?? estimateFromSnapshot.estimatedE1rmKg,
      estimatedTmKg: estimateFromSnapshot.estimatedTmKg,
      note: {
        memo: typeof log.notes === "string" ? log.notes.trim() : "",
      },
    },
    seedExercises: [],
    seedEditLayer: {},
    userExercises: loggedExercises,
  };
}

export function materializeWorkoutExercises(draft: WorkoutRecordDraft): WorkoutExerciseViewModel[] {
  const seeded = draft.seedExercises
    .map((exercise) => mergeSeedExercise(exercise, draft.seedEditLayer[exercise.id]))
    .filter((exercise) => !exercise.deleted);

  const users = draft.userExercises.map((exercise) => ({
    ...exercise,
    isEdited: true,
    deleted: false,
  }));

  return [...seeded, ...users];
}

export function hasWorkoutEdits(draft: WorkoutRecordDraft) {
  if ((draft.session.note.memo ?? "").trim() !== "") return true;
  if (draft.userExercises.length > 0) return true;
  return Object.values(draft.seedEditLayer).some((patch) => {
    if (!patch) return false;
    return Boolean(
      patch.deleted ||
        patch.exerciseId !== undefined ||
        patch.exerciseName !== undefined ||
        patch.set?.count !== undefined ||
        patch.set?.reps !== undefined ||
        patch.set?.repsPerSet !== undefined ||
        patch.set?.rpePerSet !== undefined ||
        patch.set?.weightKg !== undefined ||
        patch.note?.memo !== undefined,
    );
  });
}

export function patchSeedExercise(
  draft: WorkoutRecordDraft,
  seedId: string,
  patch: SeedExerciseEditPatch,
): WorkoutRecordDraft {
  return {
    ...draft,
    seedEditLayer: {
      ...draft.seedEditLayer,
      [seedId]: {
        ...draft.seedEditLayer[seedId],
        ...patch,
        set: {
          ...draft.seedEditLayer[seedId]?.set,
          ...patch.set,
        },
        note: {
          ...draft.seedEditLayer[seedId]?.note,
          ...patch.note,
        },
      },
    },
  };
}

export function removeSeedExercise(draft: WorkoutRecordDraft, seedId: string): WorkoutRecordDraft {
  return patchSeedExercise(draft, seedId, { deleted: true });
}

export function addUserExercise(
  draft: WorkoutRecordDraft,
  input: {
    exerciseId?: string | null;
    exerciseName: string;
    weightKg: number;
    sets?: number;
    reps?: number;
    repsPerSet?: number[];
    memo: string;
  },
): WorkoutRecordDraft {
  const userIndex = draft.userExercises.length + 1;
  const repsPerSet = normalizeRepsPerSetArray(input.repsPerSet, input.reps ?? 5, input.sets ?? 1);
  const userExercise: WorkoutExerciseModel = {
    id: `user-${Date.now()}-${userIndex}`,
    exerciseId: input.exerciseId ?? null,
    exerciseName: nonEmpty(input.exerciseName, `Custom Exercise ${userIndex}`),
    source: "USER",
    badge: "ADDED",
    prescribedWeightKg: null,
    plannedSetMeta: null,
    set: {
      count: repsPerSet.length,
      reps: repsPerSet[0] ?? 5,
      repsPerSet,
      rpePerSet: normalizeRpePerSetArray(null, repsPerSet.length),
      weightKg: Math.max(0, input.weightKg),
    },
    note: {
      memo: input.memo.trim(),
    },
  };

  return {
    ...draft,
    userExercises: [...draft.userExercises, userExercise],
  };
}

export function updateUserExercise(
  draft: WorkoutRecordDraft,
  userId: string,
  patch: SeedExerciseEditPatch,
): WorkoutRecordDraft {
  return {
    ...draft,
    userExercises: draft.userExercises.map((exercise) => {
      if (exercise.id !== userId) return exercise;
      return {
        ...exercise,
        exerciseId: patch.exerciseId !== undefined ? patch.exerciseId : exercise.exerciseId,
        exerciseName: patch.exerciseName ?? exercise.exerciseName,
        set: mergeSetModel(exercise.set, patch.set),
        note: {
          memo: patch.note?.memo ?? exercise.note.memo,
        },
      };
    }),
  };
}

export function removeUserExercise(draft: WorkoutRecordDraft, userId: string): WorkoutRecordDraft {
  return {
    ...draft,
    userExercises: draft.userExercises.filter((exercise) => exercise.id !== userId),
  };
}

export function validateWorkoutDraft(
  draft: WorkoutRecordDraft,
  locale: WorkoutRecordLocale = "ko",
): WorkoutRecordValidation {
  const copy = WORKOUT_RECORD_TEXT[locale];
  const exercises = materializeWorkoutExercises(draft);
  const errors: string[] = [];

  if (exercises.length === 0) {
    errors.push(copy.atLeastOneExercise);
  }

  exercises.forEach((exercise, index) => {
    const row = index + 1;
    if (!exercise.exerciseName.trim()) {
      errors.push(copy.emptyExerciseName(row));
    }
    if (!Number.isFinite(exercise.set.count) || exercise.set.count < 1 || exercise.set.count > 50) {
      errors.push(copy.invalidSetCount(row));
    }
    const repsPerSet = normalizeRepsPerSetArray(exercise.set.repsPerSet, exercise.set.reps, exercise.set.count);
    if (repsPerSet.length !== exercise.set.count) {
      errors.push(copy.invalidSetShape(row));
    }
    repsPerSet.forEach((reps, setIndex) => {
      if (!Number.isFinite(reps) || reps < 1 || reps > 100) {
        errors.push(copy.invalidReps(row, setIndex));
      }
    });
    if (!Number.isFinite(exercise.set.weightKg) || exercise.set.weightKg < 0 || exercise.set.weightKg > 1000) {
      errors.push(copy.invalidWeight(row));
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function toWorkoutLogPayload(
  draft: WorkoutRecordDraft,
  options: WorkoutLogBuildOptions = {},
): WorkoutLogPayload {
  const exercises = materializeWorkoutExercises(draft);
  const sets: WorkoutLogPayload["sets"] = [];
  const bodyweightKg =
    Number.isFinite(options.bodyweightKg) && Number(options.bodyweightKg) > 0
      ? roundTo2(Number(options.bodyweightKg))
      : null;
  const isBodyweightExercise = options.isBodyweightExercise;

  exercises.forEach((exercise) => {
    const repsPerSet = normalizeRepsPerSetArray(exercise.set.repsPerSet, exercise.set.reps, exercise.set.count);
    const rpePerSet = normalizeRpePerSetArray(
      exercise.set.rpePerSet,
      repsPerSet.length,
    );
    const weightKg = roundTo2(Math.max(0, Number(exercise.set.weightKg ?? 0)));
    const exerciseName = exercise.exerciseName.trim();
    const attachBodyweightMeta =
      Boolean(bodyweightKg) &&
      typeof isBodyweightExercise === "function" &&
      isBodyweightExercise(exerciseName);
    const amrapPerSet = exercise.plannedSetMeta?.amrapPerSet;
    repsPerSet.forEach((repsValue, index) => {
      const meta: Record<string, unknown> = exercise.note.memo.trim()
        ? { memo: exercise.note.memo.trim() }
        : {};
      if (attachBodyweightMeta && bodyweightKg !== null) {
        meta.bodyweightKg = bodyweightKg;
        meta.totalLoadKg = roundTo2(bodyweightKg + weightKg);
      }
      if (amrapPerSet?.[index] === true) {
        meta.amrap = true;
      }

      sets.push({
        exerciseId: exercise.exerciseId,
        exerciseName,
        setNumber: index + 1,
        reps: Math.max(0, Math.round(repsValue)),
        weightKg,
        rpe: rpePerSet[index] ?? 0,
        isExtra: exercise.badge === "ADDED",
        meta,
      });
    });
  });

  const note = draft.session.note.memo.trim();
  return {
    planId: draft.session.planId,
    generatedSessionId: draft.session.generatedSessionId,
    performedAt: draft.session.performedAt,
    timezone: draft.session.timezone,
    durationMinutes: null,
    notes: note.length > 0 ? note : null,
    sets,
  };
}
