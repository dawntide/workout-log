import { eq, inArray } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  exercise,
  generatedSession,
  plan,
  planModule,
  planOverride,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
  workoutSet,
} from "@workout/core/db/schema";
import type { UserDataExport } from "../export/userExport";
import { validateExportShape } from "./validateExportShape";
import { deleteUserDomainData } from "../data/deleteUserData";
import { acquireActiveAccountMutationLock } from "../auth/account-lifecycle";
import { invalidatePersonalRecordsFrom } from "../services/workout-log/personal-records";

export { validateExportShape };

export type ImportMode = "dryRun" | "replace";

export type ImportTableSummary = {
  table: string;
  willDelete: number;
  willInsert: number;
};

export type ImportPlanResult = {
  applied: boolean;
  mode: ImportMode;
  schemaVersion: number;
  exportedAt: string;
  summary: ImportTableSummary[];
  warnings: string[];
};

type AnyExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function rowsAsRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function rewriteOwnerUserId<T extends Record<string, unknown>>(
  rows: T[],
  userId: string,
): T[] {
  return rows.map((row) => ({ ...row, ownerUserId: userId } as T));
}

function rewriteUserId<T extends Record<string, unknown>>(
  rows: T[],
  userId: string,
): T[] {
  return rows.map((row) => ({ ...row, userId } as T));
}

function deserializeTimestampColumns<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
): T[] {
  return rows.map((row) => {
    const next = { ...row } as Record<string, unknown>;
    for (const key of keys) {
      const parsed = toDate(next[key]);
      if (parsed) next[key] = parsed;
    }
    return next as T;
  });
}

async function loadExistingCounts(executor: AnyExecutor, userId: string) {
  const [userPlans, userLogs, userTemplates] = await Promise.all([
    executor.select({ id: plan.id }).from(plan).where(eq(plan.userId, userId)),
    executor
      .select({ id: workoutLog.id })
      .from(workoutLog)
      .where(eq(workoutLog.userId, userId)),
    executor
      .select({ id: programTemplate.id })
      .from(programTemplate)
      .where(eq(programTemplate.ownerUserId, userId)),
  ]);
  const planIds = userPlans.map((r) => r.id);
  const logIds = userLogs.map((r) => r.id);
  const templateIds = userTemplates.map((r) => r.id);

  const [
    existingPlanModules,
    existingPlanOverrides,
    existingPlanRuntimeStates,
    existingGeneratedSessions,
    existingWorkoutSets,
    existingTemplateVersions,
  ] = await Promise.all([
    planIds.length
      ? executor
          .select({ id: planModule.id })
          .from(planModule)
          .where(inArray(planModule.planId, planIds))
      : Promise.resolve([]),
    planIds.length
      ? executor
          .select({ id: planOverride.id })
          .from(planOverride)
          .where(inArray(planOverride.planId, planIds))
      : Promise.resolve([]),
    planIds.length
      ? executor
          .select({ id: planRuntimeState.id })
          .from(planRuntimeState)
          .where(inArray(planRuntimeState.planId, planIds))
      : Promise.resolve([]),
    planIds.length
      ? executor
          .select({ id: generatedSession.id })
          .from(generatedSession)
          .where(inArray(generatedSession.planId, planIds))
      : Promise.resolve([]),
    logIds.length
      ? executor
          .select({ id: workoutSet.id })
          .from(workoutSet)
          .where(inArray(workoutSet.logId, logIds))
      : Promise.resolve([]),
    templateIds.length
      ? executor
          .select({ id: programVersion.id })
          .from(programVersion)
          .where(inArray(programVersion.templateId, templateIds))
      : Promise.resolve([]),
  ]);

  return {
    planIds,
    logIds,
    templateIds,
    counts: {
      programTemplate: templateIds.length,
      programVersion: existingTemplateVersions.length,
      plan: planIds.length,
      planModule: existingPlanModules.length,
      planOverride: existingPlanOverrides.length,
      planRuntimeState: existingPlanRuntimeStates.length,
      generatedSession: existingGeneratedSessions.length,
      workoutLog: logIds.length,
      workoutSet: existingWorkoutSets.length,
    },
  };
}

function buildSummary(
  existing: { counts: Record<string, number> },
  insertCounts: Record<string, number>,
): ImportTableSummary[] {
  const tables = [
    "programTemplate",
    "programVersion",
    "plan",
    "planModule",
    "planOverride",
    "planRuntimeState",
    "generatedSession",
    "workoutLog",
    "workoutSet",
  ];
  return tables.map((table) => ({
    table,
    willDelete: existing.counts[table] ?? 0,
    willInsert: insertCounts[table] ?? 0,
  }));
}

export async function importUserData(
  userId: string,
  rawData: unknown,
  mode: ImportMode,
): Promise<ImportPlanResult> {
  const validation = validateExportShape(rawData);
  if (!validation.ok) {
    const error = new Error(validation.errors.join("; "));
    (error as Error & { code?: string }).code = "INVALID_IMPORT_BODY";
    throw error;
  }

  const data = rawData as UserDataExport;
  const warnings: string[] = [];

  const templates = rewriteOwnerUserId(rowsAsRecords(data.templates), userId);
  const templateVersions = rowsAsRecords(data.templateVersions);
  const plans = rewriteUserId(rowsAsRecords(data.plans), userId);
  const planModules = rowsAsRecords(data.planModules);
  const planOverrides = rowsAsRecords(data.planOverrides);
  const generatedSessions = rewriteUserId(
    rowsAsRecords(data.generatedSessions),
    userId,
  );
  const workoutLogs = rewriteUserId(rowsAsRecords(data.workoutLogs), userId);
  const workoutSets = rowsAsRecords(data.workoutSets);

  const insertCounts = {
    programTemplate: templates.length,
    programVersion: templateVersions.length,
    plan: plans.length,
    planModule: planModules.length,
    planOverride: planOverrides.length,
    planRuntimeState: 0,
    generatedSession: generatedSessions.length,
    workoutLog: workoutLogs.length,
    workoutSet: workoutSets.length,
  };

  if (mode === "dryRun") {
    const existing = await loadExistingCounts(db, userId);
    return {
      applied: false,
      mode,
      schemaVersion: Number(data.version) || 1,
      exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
      summary: buildSummary(existing, insertCounts),
      warnings,
    };
  }

  let summary: ImportTableSummary[] = [];

  await db.transaction(async (tx) => {
    await acquireActiveAccountMutationLock(tx, userId);
    const existing = await loadExistingCounts(tx, userId);
    summary = buildSummary(existing, insertCounts);

    const existingExerciseRows = await tx
      .select({ id: exercise.id })
      .from(exercise);
    const existingExerciseIds = new Set(
      existingExerciseRows.map((row) => row.id),
    );
    const sanitizedSets = workoutSets.map((row) => {
      const exId = row.exerciseId;
      if (typeof exId === "string" && exId && !existingExerciseIds.has(exId)) {
        warnings.push(
          `unknown exerciseId ${exId}; preserved name only on workoutSet ${row.id ?? ""}`,
        );
        return { ...row, exerciseId: null };
      }
      return row;
    });

    await deleteUserDomainData(tx, userId);

    if (templates.length > 0) {
      await tx.insert(programTemplate).values(
        deserializeTimestampColumns(templates, ["createdAt", "updatedAt"]) as any,
      );
    }
    if (templateVersions.length > 0) {
      await tx.insert(programVersion).values(
        deserializeTimestampColumns(templateVersions, ["createdAt"]) as any,
      );
    }
    if (plans.length > 0) {
      await tx.insert(plan).values(
        deserializeTimestampColumns(plans, ["createdAt", "updatedAt"]) as any,
      );
    }
    if (planModules.length > 0) {
      await tx.insert(planModule).values(
        deserializeTimestampColumns(planModules, ["createdAt"]) as any,
      );
    }
    if (planOverrides.length > 0) {
      await tx.insert(planOverride).values(
        deserializeTimestampColumns(planOverrides, ["createdAt"]) as any,
      );
    }
    if (generatedSessions.length > 0) {
      await tx.insert(generatedSession).values(
        deserializeTimestampColumns(generatedSessions, [
          "scheduledAt",
          "createdAt",
          "updatedAt",
        ]) as any,
      );
    }
    if (workoutLogs.length > 0) {
      await tx.insert(workoutLog).values(
        deserializeTimestampColumns(workoutLogs, [
          "performedAt",
          "createdAt",
        ]) as any,
      );
    }
    if (sanitizedSets.length > 0) {
      await tx.insert(workoutSet).values(sanitizedSets as any);
    }
  });

  // D1(frozen PR): import는 백데이트 로그를 삽입/치환할 수 있어 기존 로그들의
  // '그 당시 PR' 판정이 바뀔 수 있다 → 유저 전체 동결값 무효화(조회 시 lazy 재계산).
  await invalidatePersonalRecordsFrom({ userId, fromPerformedAt: new Date(0) });

  return {
    applied: true,
    mode,
    schemaVersion: Number(data.version) || 1,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
    summary,
    warnings,
  };
}
