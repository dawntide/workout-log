import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  exercise,
  exerciseAlias,
  generatedSession,
  plan,
  planModule,
  planOverride,
  programTemplate,
  programVersion,
  workoutLog,
  bodyMeasurement,
  workoutSet,
} from "@workout/core/db/schema";

export type UserDataExport = {
  version: 1;
  exportedAt: string;
  userId: string;
  templates: unknown[];
  templateVersions: unknown[];
  plans: unknown[];
  planModules: unknown[];
  planOverrides: unknown[];
  generatedSessions: unknown[];
  workoutLogs: unknown[];
  workoutSets: unknown[];
  exercises: unknown[];
  exerciseAliases: unknown[];
  /**
   * v1 이후 추가된 키. **구 export 파일에는 없다** — import는 부재를 정상으로 다뤄야
   * 하므로 validateExportShape의 필수 배열 목록에는 넣지 않는다.
   */
  bodyMeasurements?: unknown[];
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildUserDataExport(userId: string): Promise<UserDataExport> {
  const templates = await db
    .select()
    .from(programTemplate)
    .where(eq(programTemplate.ownerUserId, userId))
    .orderBy(asc(programTemplate.createdAt));

  const templateIds = templates.map((t) => t.id);
  const templateVersions =
    templateIds.length > 0
      ? await db
          .select()
          .from(programVersion)
          .where(inArray(programVersion.templateId, templateIds))
          .orderBy(asc(programVersion.templateId), asc(programVersion.version))
      : [];

  const plans = await db
    .select()
    .from(plan)
    .where(eq(plan.userId, userId))
    .orderBy(asc(plan.createdAt));

  const planIds = plans.map((p) => p.id);
  const planModules =
    planIds.length > 0
      ? await db
          .select()
          .from(planModule)
          .where(inArray(planModule.planId, planIds))
          .orderBy(asc(planModule.createdAt))
      : [];

  const planOverrides =
    planIds.length > 0
      ? await db
          .select()
          .from(planOverride)
          .where(inArray(planOverride.planId, planIds))
          .orderBy(asc(planOverride.createdAt))
      : [];

  const generatedSessions = await db
    .select()
    .from(generatedSession)
    .where(eq(generatedSession.userId, userId))
    .orderBy(asc(generatedSession.createdAt));

  const workoutLogs = await db
    .select()
    .from(workoutLog)
    .where(eq(workoutLog.userId, userId))
    .orderBy(asc(workoutLog.performedAt));

  const logIds = workoutLogs.map((l) => l.id);
  const workoutSets =
    logIds.length > 0
      ? await db
          .select()
          .from(workoutSet)
          .where(inArray(workoutSet.logId, logIds))
          .orderBy(asc(workoutSet.logId), asc(workoutSet.sortOrder), asc(workoutSet.setNumber))
      : [];

  const exerciseIds = Array.from(
    new Set(workoutSets.map((s) => s.exerciseId).filter((id): id is string => Boolean(id))),
  );

  const exercises =
    exerciseIds.length > 0
      ? await db.select().from(exercise).where(inArray(exercise.id, exerciseIds)).orderBy(asc(exercise.name))
      : [];

  const exerciseAliases =
    exerciseIds.length > 0
      ? await db
          .select()
          .from(exerciseAlias)
          .where(inArray(exerciseAlias.exerciseId, exerciseIds))
          .orderBy(asc(exerciseAlias.alias))
      : [];

  const bodyMeasurements = await db
    .select()
    .from(bodyMeasurement)
    .where(eq(bodyMeasurement.userId, userId))
    .orderBy(asc(bodyMeasurement.measuredAt));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId,
    templates,
    templateVersions,
    plans,
    planModules,
    planOverrides,
    generatedSessions,
    workoutLogs,
    workoutSets,
    exercises,
    exerciseAliases,
    bodyMeasurements,
  };
}

/**
 * CSV 열 순서. `workout_set`의 모든 컬럼(`id`는 `setId`로) + 조인해 오는 로그 3열이다.
 * JSON export는 `db.select()`라 컬럼이 자동으로 따라오지만 **CSV는 이 배열이 전부**다 —
 * 컬럼을 추가하고 여기를 빠뜨리면 조용히 누락된다. userExport.test.ts가 그걸 막는다.
 */
export const WORKOUT_SET_CSV_HEADER = [
  "setId",
  "logId",
  "performedAt",
  "planId",
  "generatedSessionId",
  "exerciseId",
  "exerciseName",
  "sortOrder",
  "setNumber",
  "reps",
  "weightKg",
  "rpe",
  "isExtra",
  "setType",
  "meta",
] as const;

export async function buildWorkoutSetCsv(userId: string): Promise<string> {
  const rows = await db
    .select({
      setId: workoutSet.id,
      logId: workoutSet.logId,
      performedAt: workoutLog.performedAt,
      planId: workoutLog.planId,
      generatedSessionId: workoutLog.generatedSessionId,
      exerciseId: workoutSet.exerciseId,
      exerciseName: workoutSet.exerciseName,
      sortOrder: workoutSet.sortOrder,
      setNumber: workoutSet.setNumber,
      reps: workoutSet.reps,
      weightKg: workoutSet.weightKg,
      rpe: workoutSet.rpe,
      isExtra: workoutSet.isExtra,
      setType: workoutSet.setType,
      meta: workoutSet.meta,
    })
    .from(workoutSet)
    .innerJoin(workoutLog, eq(workoutLog.id, workoutSet.logId))
    .where(eq(workoutLog.userId, userId))
    .orderBy(asc(workoutLog.performedAt), asc(workoutSet.sortOrder), asc(workoutSet.setNumber));

  const lines = [WORKOUT_SET_CSV_HEADER.join(",")];

  for (const r of rows) {
    lines.push(
      [
        r.setId,
        r.logId,
        r.performedAt instanceof Date ? r.performedAt.toISOString() : r.performedAt,
        r.planId,
        r.generatedSessionId,
        r.exerciseId,
        r.exerciseName,
        r.sortOrder,
        r.setNumber,
        r.reps,
        r.weightKg,
        r.rpe,
        r.isExtra,
        r.setType,
        r.meta,
      ]
        .map((v) => csvCell(v))
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}
