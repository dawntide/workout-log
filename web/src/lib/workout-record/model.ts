import type { AppLocale } from "@/lib/i18n/messages";
import {
  REF5_IDENTIFIERS,
  REF5_PROTOCOL_VERSION,
  Ref5StaleVersionError,
  validateAndClassifyRef5Outcome,
} from "@workout/core/program-engine/ref5";
import { estimateE1rmKg } from "@workout/core/stats/e1rm";
import { toStoredRpe } from "@workout/core/settings/intensity";
import {
  normalizeWorkoutSetType,
  type WorkoutSetType,
} from "@workout/core/workout-set-type";

export type WorkoutWorkflowState = "idle" | "editing" | "saving" | "done";

export type WorkoutSetModel = {
  count: number;
  reps: number;
  repsPerSet: number[];
  rpePerSet: number[];
  /** 세트별 무게(kg). reps/rpe와 같이 세트마다 독립적으로 보관·수정한다. */
  weightKgPerSet: number[];
  /** 파생/레거시 값 = weightKgPerSet[0]. 표시 폴백 및 구버전 draft 호환용으로 유지. */
  weightKg: number;
  /**
   * 세트별 타입. null = 작업 세트라 구버전 draft·레거시 로그가 그대로 작업 세트가 된다.
   * `isExtra`(운동 단위)와 달리 세트마다 독립이므로 reps/rpe와 같은 병렬 배열이다.
   */
  setTypePerSet: Array<WorkoutSetType | null>;
};

export type WorkoutPlannedSetMeta = {
  percentPerSet: Array<number | null>;
  targetWeightKgPerSet: Array<number | null>;
  repsPerSet: Array<number | null>;
  rpePerSet: Array<number | null>;
  amrapPerSet: boolean[];
  /** 프로그램이 처방한 세트 후 휴식(초). 없으면 사용자 설정으로 폴백한다. */
  restSecondsPerSet: Array<number | null>;
};

export type WorkoutNoteModel = {
  memo: string;
};

export type WorkoutExerciseSource = "PROGRAM" | "USER";
export type WorkoutExerciseBadge = "AUTO" | "CUSTOM" | "ADDED";

export type Ref5TerminationReason =
  | "NORMAL"
  | "CLEAR_SLOWDOWN"
  | "FORCE_OR_TECHNIQUE"
  | "SAFETY"
  | "EXTERNAL";

export type WorkoutExerciseRef5Meta = {
  /** Immutable prescription metadata copied from the generated-session snapshot. */
  prescription: Record<string, unknown>;
  /** The reason applies to the exercise as a whole and is repeated on every saved set. */
  terminationReason: Ref5TerminationReason | null;
  /** Full original set metadata, retained so an edit is lossless. */
  originalSetMeta: Record<string, unknown>[];
};

export type WorkoutSessionRef5Meta = {
  protocolVersion: typeof REF5_PROTOCOL_VERSION;
  actualStartAt: string;
  startEventId: string;
  completionEventId: string;
  runtimeRevisionBefore: number;
  runtimeRevisionAfter: number;
  snapshot: Record<string, unknown>;
};

export type WorkoutExerciseModel = {
  id: string;
  exerciseId: string | null;
  exerciseName: string;
  source: WorkoutExerciseSource;
  badge?: WorkoutExerciseBadge | null;
  prescribedWeightKg?: number | null;
  plannedSetMeta?: WorkoutPlannedSetMeta | null;
  // 슬롯 자동진행: 처방 슬롯키/타깃을 로그 meta.plannedRef로 흘리기 위해 보존한다. 없으면
  // reducer가 family 폴백 → 처방-reducer 키 불일치로 슬롯 독립 진행이 무동작.
  // userExercises(사용자 추가 운동)엔 없음(진행 추적 안 함).
  progressionKey?: string | null;
  progressionTarget?: string | null;
  // gzclp 정석(v2) 슬롯형 처방의 표시 메타. tier=계층(T1/T2/T3), stage=현재 강등 단계
  // (T1/T2만 0=5×3 → 1=6×2 → 2=10×1; T3는 null). UI 배지 전용 — 비-v2/타 family엔 부재.
  tier?: string | null;
  stage?: number | null;
  // texas 주간(v2): 슬롯 요일 역할(volume/recovery/intensity). UI 배지 전용.
  texasRole?: string | null;
  // SS/StrongLifts 정석(v2): 고정 reps 미달을 실패로 감지하기 위해 reps-only plannedRef를
  // 흘릴지 마킹. progressionKey 없이 reps만 흘려 family 진행은 유지한다.
  enforcePlannedReps?: boolean;
  // 처방에는 포함되지만 자동 진행 판정에서는 제외(Texas v2 V/R).
  skipProgression?: boolean;
  ref5?: WorkoutExerciseRef5Meta | null;
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
  /** Finite program coordinate; REF5 is open-ended and keeps both null. */
  week: number | null;
  day: number | null;
  sessionType: string;
  estimatedE1rmKg: number | null;
  estimatedTmKg: number | null;
  // v0.5.1: 세션 수준 피드백 메타(snapshot에서 승격) — F3 AMRAP 보류 배너·F4 라이트 블록 배지.
  amrapDeferred?: boolean;
  lightBlockMode?: boolean;
  ref5?: WorkoutSessionRef5Meta | null;
  note: WorkoutNoteModel;
};

export type SeedExerciseEditPatch = {
  exerciseId?: string | null;
  exerciseName?: string;
  set?: Partial<WorkoutSetModel>;
  note?: Partial<WorkoutNoteModel>;
  ref5?: Partial<Pick<WorkoutExerciseRef5Meta, "terminationReason">>;
  deleted?: boolean;
};

export type WorkoutRecordDraft = {
  session: WorkoutSessionModel;
  seedExercises: WorkoutExerciseModel[];
  seedEditLayer: Record<string, SeedExerciseEditPatch>;
  userExercises: WorkoutExerciseModel[];
};

/**
 * A persisted REF5 editor draft may only be restored over the exact generated
 * v1.3 session that the server just loaded. This is the browser-cache boundary
 * for protocol upgrades and concurrent tabs; stale drafts must never hydrate an
 * active session.
 */
export function isWorkoutDraftProtocolCompatible(
  current: WorkoutRecordDraft | null,
  persisted: WorkoutRecordDraft,
): boolean {
  const currentSession = current?.session ?? null;
  const currentRef5 = currentSession?.ref5 ?? null;
  const persistedRef5 = persisted.session.ref5 ?? null;
  if (!currentRef5 && !persistedRef5) return true;
  if (!currentSession || !currentRef5 || !persistedRef5) return false;
  if (
    String(currentRef5.protocolVersion) !== REF5_PROTOCOL_VERSION ||
    String(persistedRef5.protocolVersion) !== REF5_PROTOCOL_VERSION
  ) {
    return false;
  }
  return (
    currentSession.generatedSessionId === persisted.session.generatedSessionId &&
    currentRef5.startEventId === persistedRef5.startEventId
  );
}

export type WorkoutExerciseViewModel = WorkoutExerciseModel & {
  isEdited: boolean;
  deleted: boolean;
};

export type GeneratedSessionLike = {
  id: string;
  planId: string;
  sessionKey: string;
  // generated-session jsonb: 프로그램별 가변 구조. unknown으로 두고 toRecord로 좁혀 소비한다.
  snapshot: unknown;
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
    setType?: string | null;
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
    /** null = 미입력. 0을 보내면 평균 RPE가 희석된다. */
    rpe: number | null;
    isExtra: boolean;
    setType: WorkoutSetType | null;
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
  restSeconds?: number;
  note?: string;
  meta?: unknown;
  ref5?: unknown;
};

type SnapshotExercise = {
  exerciseId?: string | null;
  exerciseName?: string;
  name?: string;
  role?: string | null;
  rowType?: string | null;
  slotRole?: string | null;
  progressionTarget?: string | null;
  progressionKey?: string | null;
  tier?: string | null;
  stage?: number | null;
  texasRole?: string | null;
  enforcePlannedReps?: boolean;
  skipProgression?: boolean;
  ref5?: unknown;
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
    invalidWeight: (row: number) => `${row}번째 운동의 무게는 0~9999kg 범위여야 합니다.`,
    missingRef5TerminationReason: (row: number) =>
      `${row}번째 REF5 운동의 종료 사유를 선택해 주세요.`,
    invalidRef5Outcome: (row: number) =>
      `${row}번째 REF5 운동의 유효 반복과 종료 사유 조합을 확인해 주세요.`,
  },
  en: {
    noExerciseInfo: "No Exercise Info",
    noProgramSelected: "No Program Selected",
    atLeastOneExercise: "At least one exercise is required.",
    emptyExerciseName: (row: number) => `Exercise ${row} is missing a name.`,
    invalidSetCount: (row: number) => `Exercise ${row} must have between 1 and 50 sets.`,
    invalidSetShape: (row: number) => `Exercise ${row} has invalid per-set rep data.`,
    invalidReps: (row: number, setIndex: number) => `Exercise ${row} set ${setIndex + 1} reps must be between 1 and 100.`,
    invalidWeight: (row: number) => `Exercise ${row} weight must be between 0 and 9999kg.`,
    missingRef5TerminationReason: (row: number) =>
      `Select a termination reason for REF5 exercise ${row}.`,
    invalidRef5Outcome: (row: number) =>
      `Check the effective reps and termination reason for REF5 exercise ${row}.`,
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
    restSecondsPerSet: sets.map((set) => {
      const restSeconds = Number(set?.restSeconds);
      return Number.isFinite(restSeconds) && restSeconds > 0 ? Math.round(restSeconds) : null;
    }),
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
  skipProgression: boolean;
};

function createPlannedSetMetaLookup(snapshotExercises: SnapshotExercise[]) {
  const lookup = new Map<string, PlannedSnapshotLookupEntry>();

  snapshotExercises.forEach((exercise) => {
    const exerciseName = nonEmpty(String(exercise.exerciseName ?? exercise.name ?? ""), "");
    if (!exerciseName) return;
    const entry: PlannedSnapshotLookupEntry = {
      plannedSetMeta: toPlannedSetMeta(exercise.sets),
      badge: toSnapshotExerciseBadge(exercise),
      skipProgression:
        exercise.skipProgression === true || String(exercise.role ?? "").toUpperCase() === "ASSIST",
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

/**
 * 길이를 세트 수에 맞춘다. reps/rpe와 달리 **마지막 값으로 확장하지 않는다** — 세트를
 * 늘렸을 때 방금 단 웜업 태그가 새 작업 세트까지 번지면 안 되기 때문이다. 모자란 자리는
 * 작업 세트(null)로 채운다.
 */
function normalizeSetTypePerSetArray(
  value: unknown,
  fallbackCount = 1,
): Array<WorkoutSetType | null> {
  const count = Math.min(50, Math.max(1, Math.round(toNumber(fallbackCount, 1))));
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: count }, (_, index) => normalizeWorkoutSetType(source[index]));
}

function normalizeWeightValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(9999, Math.max(0, parsed));
}

function normalizeWeightPerSetArray(
  value: unknown,
  fallbackWeight = 0,
  fallbackCount = 1,
): number[] {
  const count = Math.min(50, Math.max(1, Math.round(toNumber(fallbackCount, 1))));
  const fallback = normalizeWeightValue(fallbackWeight, 0);
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeWeightValue(entry, fallback))
      .filter((entry) => Number.isFinite(entry))
      .slice(0, 50);
    if (normalized.length > 0) {
      const last = normalized[normalized.length - 1] ?? fallback;
      return Array.from({ length: count }, (_, index) =>
        normalizeWeightValue(normalized[index], last),
      );
    }
  }

  return Array.from({ length: count }, () => fallback);
}

/**
 * set.weightKgPerSet 가 유효한 배열이면 그대로 정규화하고, 없으면(구버전 draft 등)
 * 단일 weightKg 에서 reps 길이만큼 균일 배열을 파생한다.
 */
function migrateWeightKgPerSet(set: WorkoutSetModel): number[] {
  const length = Math.min(
    50,
    Math.max(
      1,
      Array.isArray(set.repsPerSet) && set.repsPerSet.length > 0
        ? set.repsPerSet.length
        : Math.round(toNumber(set.count, 1)),
    ),
  );
  if (Array.isArray(set.weightKgPerSet) && set.weightKgPerSet.length > 0) {
    return normalizeWeightPerSetArray(set.weightKgPerSet, set.weightKg, length);
  }
  return normalizeWeightPerSetArray(undefined, set.weightKg, length);
}

function nonEmpty(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

const REF5_TERMINATION_REASONS = new Set<Ref5TerminationReason>([
  "NORMAL",
  "CLEAR_SLOWDOWN",
  "FORCE_OR_TECHNIQUE",
  "SAFETY",
  "EXTERNAL",
]);

function toRef5TerminationReason(value: unknown): Ref5TerminationReason | null {
  const normalized = String(value ?? "").trim().toUpperCase() as Ref5TerminationReason;
  return REF5_TERMINATION_REASONS.has(normalized) ? normalized : null;
}

function readRef5SessionMeta(snapshot: unknown): WorkoutSessionRef5Meta | null {
  const snap = toRecord(snapshot);
  const raw = toRecord(snap.ref5);
  if (String(toRecord(snap.program).slug ?? "") !== REF5_IDENTIFIERS.slug) return null;
  const protocolVersion = String(raw.protocolVersion ?? snap.protocolVersion ?? "");
  if (protocolVersion !== REF5_PROTOCOL_VERSION) throw new Ref5StaleVersionError(protocolVersion || null);
  const actualStartAt = String(raw.actualStartAt ?? snap.actualStartAt ?? "").trim();
  const startEventId = String(raw.startEventId ?? snap.startEventId ?? "").trim();
  if (!actualStartAt || !startEventId) return null;
  const before = Number(raw.runtimeRevisionBefore ?? 0);
  const after = Number(raw.runtimeRevisionAfter ?? before + 1);
  return {
    protocolVersion: REF5_PROTOCOL_VERSION,
    actualStartAt,
    startEventId,
    // Deterministic across reloads/retries. The generated session is the idempotency anchor.
    completionEventId: `${startEventId}:completion`,
    runtimeRevisionBefore: Number.isFinite(before) ? before : 0,
    runtimeRevisionAfter: Number.isFinite(after) ? after : 1,
    snapshot: structuredClone(raw),
  };
}

function readSnapshotRef5Exercise(exercise: SnapshotExercise): WorkoutExerciseRef5Meta | null {
  const prescription = toRecord(exercise.ref5);
  if (Object.keys(prescription).length === 0) return null;
  const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
  return {
    prescription: structuredClone(prescription),
    terminationReason: null,
    originalSetMeta: sets.map((set) => structuredClone(toRecord(set.meta))),
  };
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
      const e1rm = estimateE1rmKg(weightKg, reps);
      if (e1rm > 0) {
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
    const weightKgPerSet = migrateWeightKgPerSet(exercise.set);
    exercise.set.repsPerSet.forEach((reps, index) => {
      const weightKg = weightKgPerSet[index] ?? weightKgPerSet[0] ?? 0;
      const e1rm = estimateE1rmKg(weightKg, reps);
      if (e1rm > 0) {
        estimatedE1rmKg = estimatedE1rmKg === null ? e1rm : Math.max(estimatedE1rmKg, e1rm);
      }
    });
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

function sessionsPerWeekFromSnapshot(snapshot: unknown) {
  const snap = toRecord(snapshot);
  const blocks = Array.isArray(snap.blocks) ? snap.blocks : [];
  const firstBlock = toRecord(blocks[0]);
  const candidates = [
    toRecord(toRecord(snap.program).schedule).sessionsPerWeek,
    toRecord(toRecord(firstBlock.definition).schedule).sessionsPerWeek,
    toRecord(snap.schedule).sessionsPerWeek,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.max(1, Math.floor(parsed));
    }
  }

  return null;
}

function isOperatorSnapshot(snapshot: unknown, planName: string) {
  const snap = toRecord(snapshot);
  const blocks = Array.isArray(snap.blocks) ? snap.blocks : [];
  const firstBlock = toRecord(blocks[0]);
  const snapProgram = toRecord(snap.program);
  const firstBlockProgram = toRecord(firstBlock.program);
  const firstBlockDefinition = toRecord(firstBlock.definition);
  const candidates = [
    snapProgram.slug,
    snapProgram.name,
    firstBlockProgram.slug,
    firstBlockProgram.name,
    firstBlockDefinition.kind,
    firstBlockDefinition.programFamily,
    toRecord(snap.plan).name,
    planName,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  return candidates.some((value) => value.includes("operator"));
}

function toSessionType(
  day: number,
  snapshot: unknown,
  planName: string,
  sessionKey: string,
  planSchedule?: unknown,
) {
  const snap = toRecord(snapshot);
  const manualSessionKey = String(snap.manualSessionKey ?? "").trim();
  if (manualSessionKey) {
    return manualSessionKey;
  }

  const explicitSessionLabel = String(snap.sessionType ?? snap.sessionLabel ?? "").trim();
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
  const badge = toSnapshotExerciseBadge(exercise);
  const prescribedWeightKg = Math.max(0, toNumber(first.targetWeightKg ?? first.weightKg, 0));
  const plannedSetMeta = toPlannedSetMeta(sets);

  // AUTO(자동 진행) 운동은 프로그램이 세트별 처방 무게(targetWeightKgPerSet)를 가지므로
  // 5/3/1 램핑(65/75/85%)처럼 세트마다 다른 무게를 그대로 시딩한다.
  // CUSTOM/그 외는 첫 세트 처방값으로 균일 시딩한다.
  const weightKgPerSet =
    badge === "AUTO"
      ? buildAutoSeedWeightPerSet(plannedSetMeta, prescribedWeightKg, repsPerSet.length)
      : Array.from({ length: repsPerSet.length }, () => prescribedWeightKg);

  return {
    id: `seed-${index + 1}`,
    exerciseId: typeof exercise.exerciseId === "string" ? exercise.exerciseId : null,
    exerciseName: nonEmpty(String(exercise.exerciseName ?? exercise.name ?? ""), `Exercise ${index + 1}`),
    source: "PROGRAM",
    badge,
    prescribedWeightKg,
    plannedSetMeta,
    progressionKey: typeof exercise.progressionKey === "string" ? exercise.progressionKey : null,
    progressionTarget: typeof exercise.progressionTarget === "string" ? exercise.progressionTarget : null,
    tier: typeof exercise.tier === "string" ? exercise.tier : null,
    stage: typeof exercise.stage === "number" ? exercise.stage : null,
    texasRole: typeof exercise.texasRole === "string" ? exercise.texasRole : null,
    enforcePlannedReps: exercise.enforcePlannedReps === true ? true : undefined,
    skipProgression:
      exercise.skipProgression === true || String(exercise.role ?? "").toUpperCase() === "ASSIST"
        ? true
        : undefined,
    ref5: readSnapshotRef5Exercise(exercise),
    set: {
      count: repsPerSet.length,
      reps: repsPerSet[0] ?? 5,
      repsPerSet,
      rpePerSet: normalizeRpePerSetArray(null, repsPerSet.length),
      weightKgPerSet,
      weightKg: weightKgPerSet[0] ?? 0,
      // 처방은 웜업을 지시하지 않는다 — 태그는 사용자가 직접 단다(계획서 §3.4).
      setTypePerSet: normalizeSetTypePerSetArray(null, repsPerSet.length),
    },
    note: {
      memo: typeof first.note === "string" ? first.note : "",
    },
  };
}

/**
 * AUTO 운동의 세트별 시딩 무게. plannedSetMeta.targetWeightKgPerSet 의 각 세트 값을 쓰되,
 * null 이면 첫 유효 target → prescribedWeightKg → 0 순으로 폴백한다.
 */
function buildAutoSeedWeightPerSet(
  plannedSetMeta: WorkoutPlannedSetMeta | null,
  prescribedWeightKg: number,
  length: number,
): number[] {
  const targets = plannedSetMeta?.targetWeightKgPerSet ?? [];
  const firstValidTarget = targets.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  const fallback = firstValidTarget ?? prescribedWeightKg;
  return Array.from({ length }, (_, setIndex) => {
    const target = targets[setIndex];
    if (typeof target === "number" && Number.isFinite(target) && target >= 0) {
      return Math.max(0, target);
    }
    return Math.max(0, fallback);
  });
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

  const baseSetTypePerSet = normalizeSetTypePerSetArray(base.setTypePerSet, baseRepsPerSet.length);
  let nextSetTypePerSet = baseSetTypePerSet;
  if (patch?.setTypePerSet !== undefined) {
    nextSetTypePerSet = normalizeSetTypePerSetArray(patch.setTypePerSet, nextRepsPerSet.length);
  } else if (nextRepsPerSet.length !== baseSetTypePerSet.length) {
    // 세트를 늘렸을 때 마지막 태그를 이어받지 않는다 — 새 세트는 작업 세트로 시작한다.
    nextSetTypePerSet = Array.from(
      { length: nextRepsPerSet.length },
      (_, index) => baseSetTypePerSet[index] ?? null,
    );
  }

  const baseWeightPerSet = migrateWeightKgPerSet(base);
  let nextWeightPerSet = baseWeightPerSet;
  if (patch?.weightKgPerSet !== undefined) {
    nextWeightPerSet = normalizeWeightPerSetArray(
      patch.weightKgPerSet,
      base.weightKg,
      nextRepsPerSet.length,
    );
  } else if (patch?.weightKg !== undefined) {
    // 레거시 단일 무게 patch: 모든 세트를 동일 값으로 설정.
    const uniform = normalizeWeightValue(patch.weightKg, base.weightKg);
    nextWeightPerSet = Array.from({ length: nextRepsPerSet.length }, () => uniform);
  } else if (nextRepsPerSet.length !== baseWeightPerSet.length) {
    // reps 길이만 바뀐 경우(세트 추가/삭제) 무게 길이를 동기화한다.
    const last = baseWeightPerSet[baseWeightPerSet.length - 1] ?? base.weightKg;
    nextWeightPerSet = Array.from(
      { length: nextRepsPerSet.length },
      (_, index) => baseWeightPerSet[index] ?? last,
    );
  }

  return {
    count: nextRepsPerSet.length,
    reps: nextRepsPerSet[0] ?? 5,
    repsPerSet: nextRepsPerSet,
    rpePerSet: nextRpePerSet,
    weightKgPerSet: nextWeightPerSet,
    weightKg: nextWeightPerSet[0] ?? 0,
    setTypePerSet: nextSetTypePerSet,
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
    ref5: base.ref5
      ? {
          ...base.ref5,
          terminationReason:
            patch.ref5?.terminationReason !== undefined
              ? patch.ref5.terminationReason
              : base.ref5.terminationReason,
        }
      : base.ref5,
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
    weightKgPerSet: number[];
    setTypePerSet: Array<WorkoutSetType | null>;
    memo: string;
    plannedSetMeta: WorkoutPlannedSetMeta | null;
    badge: WorkoutExerciseBadge;
    skipProgression: boolean;
    ref5: WorkoutExerciseRef5Meta | null;
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
    const rawMeta = toRecord(rawSet?.meta);
    const loggedRef5 = toRecord(rawMeta.ref5);
    const isExtra = Boolean(rawSet?.isExtra);
    const setType = normalizeWorkoutSetType(rawSet?.setType);
    const previous = grouped[grouped.length - 1] ?? null;
    const isContinuation =
      previous !== null &&
      previous.exerciseId === exerciseId &&
      previous.exerciseName.trim().toLowerCase() === exerciseName.trim().toLowerCase() &&
      setNumber === previous.repsPerSet.length + 1;

    if (isContinuation && previous) {
      previous.repsPerSet.push(reps);
      previous.rpePerSet.push(rpe);
      previous.weightKgPerSet.push(weightKg);
      previous.setTypePerSet.push(setType);
      previous.ref5?.originalSetMeta.push(structuredClone(rawMeta));
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
      weightKgPerSet: [weightKg],
      setTypePerSet: [setType],
      memo,
      plannedSetMeta: snapshotExerciseEntry?.plannedSetMeta ?? null,
      badge: snapshotExerciseEntry?.badge ?? (isExtra ? "ADDED" : "AUTO"),
      skipProgression: snapshotExerciseEntry?.skipProgression === true,
      ref5:
        Object.keys(loggedRef5).length > 0
          ? {
              prescription: structuredClone(toRecord(loggedRef5.prescription ?? loggedRef5)),
              terminationReason: toRef5TerminationReason(loggedRef5.terminationReason),
              originalSetMeta: [structuredClone(rawMeta)],
            }
          : null,
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
    skipProgression: exercise.skipProgression ? true : undefined,
    ref5: exercise.ref5,
    set: {
      count: exercise.repsPerSet.length,
      reps: exercise.repsPerSet[0] ?? 5,
      repsPerSet: exercise.repsPerSet,
      rpePerSet: normalizeRpePerSetArray(
        exercise.rpePerSet,
        exercise.repsPerSet.length,
      ),
      weightKgPerSet: normalizeWeightPerSetArray(
        exercise.weightKgPerSet,
        exercise.weightKgPerSet[0] ?? 0,
        exercise.repsPerSet.length,
      ),
      weightKg: exercise.weightKgPerSet[0] ?? 0,
      setTypePerSet: normalizeSetTypePerSetArray(
        exercise.setTypePerSet,
        exercise.repsPerSet.length,
      ),
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
  const snapshot = toRecord(session.snapshot);
  const exercises = (Array.isArray(snapshot.exercises) ? snapshot.exercises : []) as SnapshotExercise[];
  const ref5Session = readRef5SessionMeta(snapshot);
  const week = ref5Session ? null : Math.max(1, Math.round(toNumber(snapshot.week, 1)));
  const day = ref5Session ? null : Math.max(1, Math.round(toNumber(snapshot.day, 1)));
  const estimate = ref5Session
    ? { estimatedE1rmKg: null, estimatedTmKg: null }
    : deriveEstimateFromSnapshot(exercises);
  const sessionDate =
    ref5Session && typeof snapshot.sessionDate === "string" && snapshot.sessionDate.trim()
      ? snapshot.sessionDate.trim()
      : typeof options.sessionDate === "string" && options.sessionDate.trim()
      ? options.sessionDate.trim()
      : nonEmpty(String(snapshot.sessionDate ?? session.sessionKey ?? ""), toLocalDateKey(new Date()));
  const timezone = nonEmpty(options.timezone ?? "", "UTC");
  const resolvedSessionKey = nonEmpty(String(snapshot.sessionKey ?? session.sessionKey ?? ""), "W1D1");

  return {
    session: {
      logId: null,
      generatedSessionId: session.id ?? null,
      performedAt: ref5Session?.actualStartAt ?? toPerformedAtForSessionDate(sessionDate),
      sessionDate,
      timezone: ref5Session
        ? nonEmpty(String(toRecord(snapshot.ref5).timezone ?? snapshot.timezone ?? timezone), timezone)
        : timezone,
      planId: session.planId,
      planName: nonEmpty(planName, copy.noProgramSelected),
      sessionKey: resolvedSessionKey,
      week,
      day,
      sessionType: toSessionType(day ?? 1, snapshot, planName, resolvedSessionKey, options.planSchedule),
      estimatedE1rmKg: estimate.estimatedE1rmKg,
      estimatedTmKg: estimate.estimatedTmKg,
      amrapDeferred: snapshot.amrapDeferred === true,
      lightBlockMode: snapshot.lightBlockMode === true,
      ref5: ref5Session,
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
  const snapshot = toRecord(log.generatedSession?.snapshot);
  const snapshotExercises = (Array.isArray(snapshot.exercises) ? snapshot.exercises : []) as SnapshotExercise[];
  const loggedExercises = groupLoggedExercises(Array.isArray(log.sets) ? log.sets : [], snapshotExercises, options.locale);
  const parsedPerformedAt = new Date(log.performedAt);
  const fallbackSessionDate =
    Number.isNaN(parsedPerformedAt.getTime()) ? toLocalDateKey(new Date()) : toLocalDateKey(parsedPerformedAt);
  const ref5Session = readRef5SessionMeta(snapshot);
  const week = ref5Session ? null : Math.max(1, Math.round(toNumber(snapshot.week, 1)));
  const day = ref5Session ? null : Math.max(1, Math.round(toNumber(snapshot.day, 1)));
  const estimateFromSnapshot = ref5Session
    ? { estimatedE1rmKg: null, estimatedTmKg: null }
    : deriveEstimateFromSnapshot(snapshotExercises);
  const estimateFromLog = ref5Session
    ? { estimatedE1rmKg: null }
    : deriveEstimateFromLoggedExercises(loggedExercises);
  const sessionDate =
    ref5Session && typeof snapshot.sessionDate === "string" && snapshot.sessionDate.trim()
      ? snapshot.sessionDate.trim()
      : typeof options.sessionDate === "string" && options.sessionDate.trim()
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
      sessionType: toSessionType(day ?? 1, snapshot, planName, resolvedSessionKey, options.planSchedule),
      estimatedE1rmKg: estimateFromLog.estimatedE1rmKg ?? estimateFromSnapshot.estimatedE1rmKg,
      estimatedTmKg: estimateFromSnapshot.estimatedTmKg,
      amrapDeferred: snapshot.amrapDeferred === true,
      lightBlockMode: snapshot.lightBlockMode === true,
      ref5: ref5Session,
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
        patch.set?.weightKgPerSet !== undefined ||
        patch.note?.memo !== undefined ||
        patch.ref5?.terminationReason !== undefined,
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
        ref5: {
          ...draft.seedEditLayer[seedId]?.ref5,
          ...patch.ref5,
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
      weightKgPerSet: Array.from({ length: repsPerSet.length }, () =>
        Math.max(0, input.weightKg),
      ),
      weightKg: Math.max(0, input.weightKg),
      setTypePerSet: normalizeSetTypePerSetArray(null, repsPerSet.length),
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
        ref5: exercise.ref5
          ? {
              ...exercise.ref5,
              terminationReason:
                patch.ref5?.terminationReason !== undefined
                  ? patch.ref5.terminationReason
                  : exercise.ref5.terminationReason,
            }
          : exercise.ref5,
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

function migrateExerciseModelWeights(exercise: WorkoutExerciseModel): WorkoutExerciseModel {
  const weightKgPerSet = migrateWeightKgPerSet(exercise.set);
  return {
    ...exercise,
    set: {
      ...exercise.set,
      weightKgPerSet,
      weightKg: weightKgPerSet[0] ?? 0,
    },
  };
}

/**
 * 영속(IndexedDB/localStorage) draft 복원 시 사용. weightKgPerSet 이 없는 구버전 draft 를
 * 단일 weightKg 에서 세트별 배열로 파생해 화면/스냅/payload 가 정상 동작하도록 한다.
 */
export function migrateWorkoutRecordDraft(draft: WorkoutRecordDraft): WorkoutRecordDraft {
  return {
    ...draft,
    seedExercises: draft.seedExercises.map(migrateExerciseModelWeights),
    userExercises: draft.userExercises.map(migrateExerciseModelWeights),
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
      const minimumReps = exercise.source === "PROGRAM" || exercise.ref5 || exercise.plannedSetMeta ? 0 : 1;
      if (!Number.isFinite(reps) || reps < minimumReps || reps > 100) {
        errors.push(copy.invalidReps(row, setIndex));
      }
    });
    const weightKgPerSet = migrateWeightKgPerSet(exercise.set);
    const hasInvalidWeight = weightKgPerSet.some(
      (weightKg) => !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 9999,
    );
    if (hasInvalidWeight) {
      errors.push(copy.invalidWeight(row));
    }
    if (exercise.ref5 && !exercise.ref5.terminationReason) {
      errors.push(copy.missingRef5TerminationReason(row));
    } else if (exercise.ref5?.terminationReason) {
      const planned = exercise.plannedSetMeta?.repsPerSet ?? [];
      const classified = validateAndClassifyRef5Outcome({
        sets: planned.map((plannedReps, setIndex) => ({
          plannedReps: Number(plannedReps),
          effectiveReps: Number(repsPerSet[setIndex]),
        })),
        endReason: exercise.ref5.terminationReason,
      });
      if (!classified.ok) errors.push(copy.invalidRef5Outcome(row));
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
    const setTypePerSet = normalizeSetTypePerSetArray(
      exercise.set.setTypePerSet,
      repsPerSet.length,
    );
    const weightKgPerSet = normalizeWeightPerSetArray(
      migrateWeightKgPerSet(exercise.set),
      exercise.set.weightKg,
      repsPerSet.length,
    );
    const exerciseName = exercise.exerciseName.trim();
    const attachBodyweightMeta =
      !exercise.ref5 &&
      Boolean(bodyweightKg) &&
      typeof isBodyweightExercise === "function" &&
      isBodyweightExercise(exerciseName);
    const amrapPerSet = exercise.plannedSetMeta?.amrapPerSet;
    repsPerSet.forEach((repsValue, index) => {
      const weightKg = roundTo2(Math.max(0, Number(weightKgPerSet[index] ?? weightKgPerSet[0] ?? 0)));
      const meta: Record<string, unknown> = exercise.ref5
        ? structuredClone(exercise.ref5.originalSetMeta[index] ?? {})
        : {};
      if (exercise.note.memo.trim()) meta.memo = exercise.note.memo.trim();
      if (attachBodyweightMeta && bodyweightKg !== null) {
        meta.bodyweightKg = bodyweightKg;
        meta.totalLoadKg = roundTo2(bodyweightKg + weightKg);
      }
      if (amrapPerSet?.[index] === true) {
        meta.amrap = true;
      }
      if (exercise.skipProgression) {
        meta.progressionExcluded = true;
      }
      if (exercise.ref5 && draft.session.ref5) {
        meta.ref5 = {
          prescription: structuredClone(exercise.ref5.prescription),
          terminationReason: exercise.ref5.terminationReason,
          protocolVersion: draft.session.ref5.protocolVersion,
          actualStartAt: draft.session.ref5.actualStartAt,
          startEventId: draft.session.ref5.startEventId,
          completionEventId: draft.session.ref5.completionEventId,
          runtimeRevisionBefore: draft.session.ref5.runtimeRevisionBefore,
          runtimeRevisionAfter: draft.session.ref5.runtimeRevisionAfter,
          plannedReps: exercise.plannedSetMeta?.repsPerSet?.[index] ?? null,
          actualReps: Math.max(0, Math.round(repsValue)),
          setIndex: index,
        };
      }
      // 슬롯 자동진행: 슬롯형(gzclp/texas, key=`{sessionKey}_s{n}`)만 plannedRef를 흘려 reducer가
      // 슬롯 독립 진행을 굴리게 한다. operator EX_키처럼 family와 1:1인 키는 부착 시 기존
      // family-state 진행이 단절되므로 제외 — operator/uniform LP는 family 폴백으로 이미 정상 동작.
      // 패턴은 buildSlottedLpSlot(model.ts)의 progressionKey 형식과 결합(테스트로 고정).
      if (typeof exercise.progressionKey === "string" && /_s\d+$/.test(exercise.progressionKey)) {
        const plannedReps = exercise.plannedSetMeta?.repsPerSet?.[index];
        const plannedRef: Record<string, unknown> = {
          progressionKey: exercise.progressionKey,
          progressionLabel: exerciseName,
        };
        if (exercise.progressionTarget) plannedRef.progressionTarget = exercise.progressionTarget;
        if (typeof plannedReps === "number" && plannedReps > 0) plannedRef.reps = plannedReps;
        if (amrapPerSet?.[index] === true) plannedRef.amrap = true;
        meta.plannedRef = plannedRef;
      } else if (exercise.enforcePlannedReps && amrapPerSet?.[index] !== true) {
        // SS/StrongLifts 정석(v2): 고정 reps 검증을 위해 reps-only plannedRef를 흘린다.
        // progressionKey를 의도적으로 생략 → reducer가 family 폴백으로 진행하므로(슬롯키 오염 없음)
        // family-state LP가 단절되지 않는다. AMRAP 세트는 처방 reps가 최소값이라 검증에서 제외.
        const plannedReps = exercise.plannedSetMeta?.repsPerSet?.[index];
        if (typeof plannedReps === "number" && plannedReps > 0) {
          const plannedRef: Record<string, unknown> = { reps: plannedReps };
          if (exercise.progressionTarget) plannedRef.progressionTarget = exercise.progressionTarget;
          meta.plannedRef = plannedRef;
        }
      }

      sets.push({
        exerciseId: exercise.exerciseId,
        exerciseName,
        setNumber: index + 1,
        reps: Math.max(0, Math.round(repsValue)),
        weightKg,
        // 화면 배열은 빈 셀을 0으로 들고 있다(입력 상태 표현). 저장은 "값 없음"이
        // NULL이어야 하므로 여기 전송 경계에서 한 번만 번역한다 — 화면 배열을
        // null 허용으로 바꾸면 입력·포커스·정규화 전부에 null 분기가 번진다.
        rpe: toStoredRpe(rpePerSet[index]),
        isExtra: exercise.badge === "ADDED",
        setType: setTypePerSet[index] ?? null,
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
