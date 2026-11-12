/**
 * 코치 처방 세션 — 순수 계약(검증·스냅샷 구성).
 *
 * 코치(사람 또는 LLM)가 정한 하루치 세션을 `generated_session`에 넣는 경로의 도메인
 * 부분이다. **무게를 계산하지 않는다** — 받은 처방을 검증하고 스냅샷 v3 모양으로
 * 옮길 뿐이다(진행 엔진에 LLM을 넣지 않는다는 원칙, `docs/public-api-mcp-plan.md`).
 *
 * DB를 읽는 부분은 `coach-session.ts`에 있다. 이 파일은 DB·시계를 모른다.
 * 설계 근거: `docs/coach-prescribed-sessions-proposal.md`, `docs/decisions.md`.
 */

import type { PlannedExercise } from "./generateSession";
import type { SnapshotPlanRef, SnapshotV3 } from "./snapshot";

export const COACH_IDENTIFIERS = {
  slug: "coach-prescribed",
  family: "coach",
  /** 기록 화면의 세션 라벨(`toSessionType`이 읽는다). */
  sessionType: "COACH",
} as const;

/**
 * 처방 한도. 범위 밖은 **조용히 고치지 않고 거부한다** — 고쳐서 받으면 코치가 보낸
 * 것과 화면에 뜨는 것이 달라지고, 그 차이를 아무도 모른다.
 */
export const COACH_LIMITS = {
  maxExercises: 12,
  maxSetsPerExercise: 12,
  minReps: 1,
  maxReps: 50,
  minWeightKg: 0,
  maxWeightKg: 500,
  minRpe: 1,
  maxRpe: 10,
  maxExerciseNameLength: 120,
  maxNoteLength: 200,
  maxRationaleLength: 2000,
} as const;

export type CoachPrescribedSet = {
  reps: number;
  targetWeightKg: number;
  rpe?: number;
  note?: string;
};

export type CoachPrescribedExercise = {
  exerciseName: string;
  role: "MAIN" | "ASSIST";
  sets: CoachPrescribedSet[];
};

export type CoachPrescription = {
  exercises: CoachPrescribedExercise[];
  /** 왜 이 처방인지. 화면 상단에 그대로 보여 사용자가 시작 전에 읽는다. */
  rationale: string;
};

export type CoachSessionMeta = {
  rationale: string;
  /** ISO 8601. 마지막으로 처방이 바뀐 시각. */
  prescribedAt: string;
  /** 같은 날짜의 처방을 고칠 때마다 1씩 오른다. */
  revision: number;
};

/** 코치 플랜의 세션 스냅샷. `coach`가 null이면 그 날짜에 처방이 없다. */
export type CoachSessionSnapshot = SnapshotV3 & {
  sessionType: typeof COACH_IDENTIFIERS.sessionType;
  coach: CoachSessionMeta | null;
};

export type CoachPrescriptionValidation =
  | { ok: true; value: CoachPrescription }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isCoachPlanParams(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return String(value.programFamily ?? "").trim().toLowerCase() === COACH_IDENTIFIERS.family;
}

/** 템플릿 slug 또는 정의의 `programFamily`로 코치 프로그램을 가린다. */
export function isCoachProgramDefinition(
  slug: string | null | undefined,
  definition: unknown,
): boolean {
  if (String(slug ?? "").trim().toLowerCase() === COACH_IDENTIFIERS.slug) return true;
  return isCoachPlanParams(definition);
}

/** 실제로 존재하는 달력 날짜인 `YYYY-MM-DD`만 통과시킨다(2026-02-30 거부). */
export function isCoachDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m! - 1 && parsed.getUTCDate() === d
  );
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

const EXERCISE_KEYS = ["exerciseName", "role", "sets"] as const;
const SET_KEYS = ["reps", "targetWeightKg", "rpe", "note"] as const;

/**
 * 요청 본문을 처방으로 검증한다. 오류는 **전부 모아** 돌려준다 — LLM 클라이언트가 한 번에
 * 고칠 수 있어야 재시도 루프가 짧다.
 *
 * 종목 이름이 카탈로그에 있는지는 여기서 보지 않는다(DB가 필요하다).
 */
export function validateCoachPrescription(raw: unknown): CoachPrescriptionValidation {
  const errors: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["본문은 JSON 객체여야 합니다."] };
  }

  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  if (!rationale) {
    errors.push("rationale(처방 근거)은 비워 둘 수 없습니다.");
  } else if (rationale.length > COACH_LIMITS.maxRationaleLength) {
    errors.push(`rationale은 ${COACH_LIMITS.maxRationaleLength}자 이하여야 합니다.`);
  }

  const rawExercises = raw.exercises;
  const exercises: CoachPrescribedExercise[] = [];
  if (!Array.isArray(rawExercises) || rawExercises.length === 0) {
    errors.push("exercises는 1개 이상이어야 합니다.");
  } else if (rawExercises.length > COACH_LIMITS.maxExercises) {
    errors.push(`exercises는 ${COACH_LIMITS.maxExercises}개 이하여야 합니다.`);
  } else {
    const seenNames = new Set<string>();
    rawExercises.forEach((rawExercise, exerciseIndex) => {
      const at = `exercises[${exerciseIndex}]`;
      if (!isPlainObject(rawExercise)) {
        errors.push(`${at}는 객체여야 합니다.`);
        return;
      }
      for (const key of unknownKeys(rawExercise, EXERCISE_KEYS)) {
        errors.push(`${at}.${key}는 모르는 필드입니다(허용: ${EXERCISE_KEYS.join(", ")}).`);
      }

      const exerciseName =
        typeof rawExercise.exerciseName === "string" ? rawExercise.exerciseName.trim() : "";
      if (!exerciseName) {
        errors.push(`${at}.exerciseName이 필요합니다.`);
      } else if (exerciseName.length > COACH_LIMITS.maxExerciseNameLength) {
        errors.push(`${at}.exerciseName은 ${COACH_LIMITS.maxExerciseNameLength}자 이하여야 합니다.`);
      } else if (seenNames.has(exerciseName.toLowerCase())) {
        // 기록 화면이 종목 이름으로 처방과 수행을 맞춘다. 같은 종목은 세트로 묶는다.
        errors.push(`${at}.exerciseName "${exerciseName}"이 중복됩니다. 같은 종목은 sets에 모으세요.`);
      } else {
        seenNames.add(exerciseName.toLowerCase());
      }

      const rawRole = rawExercise.role === undefined ? "MAIN" : rawExercise.role;
      if (rawRole !== "MAIN" && rawRole !== "ASSIST") {
        errors.push(`${at}.role은 "MAIN" 또는 "ASSIST"여야 합니다.`);
      }

      const rawSets = rawExercise.sets;
      const sets: CoachPrescribedSet[] = [];
      if (!Array.isArray(rawSets) || rawSets.length === 0) {
        errors.push(`${at}.sets는 1개 이상이어야 합니다.`);
      } else if (rawSets.length > COACH_LIMITS.maxSetsPerExercise) {
        errors.push(`${at}.sets는 ${COACH_LIMITS.maxSetsPerExercise}개 이하여야 합니다.`);
      } else {
        rawSets.forEach((rawSet, setIndex) => {
          const setAt = `${at}.sets[${setIndex}]`;
          if (!isPlainObject(rawSet)) {
            errors.push(`${setAt}는 객체여야 합니다.`);
            return;
          }
          for (const key of unknownKeys(rawSet, SET_KEYS)) {
            errors.push(`${setAt}.${key}는 모르는 필드입니다(허용: ${SET_KEYS.join(", ")}).`);
          }

          const reps = rawSet.reps;
          if (
            typeof reps !== "number" ||
            !Number.isInteger(reps) ||
            reps < COACH_LIMITS.minReps ||
            reps > COACH_LIMITS.maxReps
          ) {
            errors.push(
              `${setAt}.reps는 ${COACH_LIMITS.minReps}~${COACH_LIMITS.maxReps}의 정수여야 합니다.`,
            );
          }

          const weight = rawSet.targetWeightKg;
          if (
            typeof weight !== "number" ||
            !Number.isFinite(weight) ||
            weight < COACH_LIMITS.minWeightKg ||
            weight > COACH_LIMITS.maxWeightKg
          ) {
            errors.push(
              `${setAt}.targetWeightKg는 ${COACH_LIMITS.minWeightKg}~${COACH_LIMITS.maxWeightKg}의 숫자여야 합니다(맨몸은 0).`,
            );
          }

          const rpe = rawSet.rpe;
          if (
            rpe !== undefined &&
            (typeof rpe !== "number" ||
              !Number.isFinite(rpe) ||
              rpe < COACH_LIMITS.minRpe ||
              rpe > COACH_LIMITS.maxRpe ||
              !Number.isInteger(rpe * 2))
          ) {
            errors.push(
              `${setAt}.rpe는 ${COACH_LIMITS.minRpe}~${COACH_LIMITS.maxRpe}의 0.5 단위 숫자여야 합니다.`,
            );
          }

          const note = rawSet.note;
          if (note !== undefined && typeof note !== "string") {
            errors.push(`${setAt}.note는 문자열이어야 합니다.`);
          } else if (typeof note === "string" && note.trim().length > COACH_LIMITS.maxNoteLength) {
            errors.push(`${setAt}.note는 ${COACH_LIMITS.maxNoteLength}자 이하여야 합니다.`);
          }

          const next: CoachPrescribedSet = {
            reps: reps as number,
            targetWeightKg: weight as number,
          };
          if (typeof rpe === "number") next.rpe = rpe;
          if (typeof note === "string" && note.trim()) next.note = note.trim();
          sets.push(next);
        });
      }

      exercises.push({ exerciseName, role: rawRole === "ASSIST" ? "ASSIST" : "MAIN", sets });
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { exercises, rationale } };
}

function coachSnapshotBase(input: { plan: SnapshotPlanRef; date: string; timezone: string }) {
  return {
    schemaVersion: 3 as const,
    // 코치 플랜의 세션 키는 날짜다. `parseSessionKey`가 이미 아는 "date" 형태라
    // 캘린더·라벨 경로가 그대로 읽는다.
    sessionKey: input.date,
    sessionDate: input.date,
    timezone: input.timezone,
    week: 1,
    day: 1,
    plan: input.plan,
    sessionType: COACH_IDENTIFIERS.sessionType,
  };
}

/** 처방이 없는 날짜의 세션. 자유 기록을 할 수 있게 빈 운동 목록으로 연다. */
export function buildEmptyCoachSnapshot(input: {
  plan: SnapshotPlanRef;
  date: string;
  timezone: string;
}): CoachSessionSnapshot {
  return { ...coachSnapshotBase(input), exercises: [], coach: null };
}

export function buildCoachSnapshot(input: {
  plan: SnapshotPlanRef;
  date: string;
  timezone: string;
  prescription: CoachPrescription;
  /** 종목 이름(소문자) → 카탈로그의 id·정식 이름. */
  resolvedExercises: ReadonlyMap<string, { id: string; name: string }>;
  prescribedAt: string;
  revision: number;
}): CoachSessionSnapshot {
  const exercises: PlannedExercise[] = input.prescription.exercises.map((exercise, index) => {
    const resolved = input.resolvedExercises.get(exercise.exerciseName.toLowerCase());
    return {
      exerciseId: resolved?.id ?? null,
      exerciseName: resolved?.name ?? exercise.exerciseName,
      role: exercise.role,
      order: index + 1,
      // AUTO로 표시해야 기록 화면이 세트별 처방 무게를 그대로 시딩한다
      // (그 외는 첫 세트 무게로 균일하게 채운다).
      rowType: "AUTO",
      // 코치 플랜에는 진행 reducer가 없다. 판정에서 빼 둔다.
      skipProgression: true,
      sets: exercise.sets.map((set) => ({
        reps: set.reps,
        targetWeightKg: set.targetWeightKg,
        ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
        ...(set.note !== undefined ? { note: set.note } : {}),
      })),
    };
  });
  return {
    ...coachSnapshotBase(input),
    exercises,
    coach: {
      rationale: input.prescription.rationale,
      prescribedAt: input.prescribedAt,
      revision: input.revision,
    },
  };
}

export function readCoachSessionMeta(snapshot: unknown): CoachSessionMeta | null {
  if (!isPlainObject(snapshot) || !isPlainObject(snapshot.coach)) return null;
  const coach = snapshot.coach;
  const rationale = typeof coach.rationale === "string" ? coach.rationale : "";
  if (!rationale) return null;
  const revision = Number(coach.revision);
  return {
    rationale,
    prescribedAt: typeof coach.prescribedAt === "string" ? coach.prescribedAt : "",
    revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
  };
}

/**
 * 저장된 스냅샷이 이 처방과 같은 내용인지. 같으면 다시 PUT 해도 revision을 올리지 않는다
 * (재시도가 개정으로 보이면 안 된다).
 */
export function coachSnapshotMatchesPrescription(
  snapshot: unknown,
  next: Pick<CoachSessionSnapshot, "exercises" | "coach">,
): boolean {
  const meta = readCoachSessionMeta(snapshot);
  if (!meta || !next.coach || meta.rationale !== next.coach.rationale) return false;
  const stored = isPlainObject(snapshot) && Array.isArray(snapshot.exercises) ? snapshot.exercises : [];
  return canonicalJson(stored) === canonicalJson(next.exercises);
}

/**
 * 키 순서에 무관한 직렬화. jsonb는 키 순서를 보존하지 않으므로 되읽은 스냅샷을
 * `JSON.stringify`로 비교하면 같은 내용도 다르게 나온다(실제 Postgres 검증에서 드러났다).
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
