import { eq, getTableColumns, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { type WorkoutExecutor, db } from "@workout/core/db/client";
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
import { validateImportParentScope } from "./validateImportScope";
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

/**
 * import 행을 해당 테이블의 INSERT 페이로드로 만든다.
 *
 * 종전에는 파싱한 JSON 객체를 그대로 `.values(rows as any)`에 넘겼다. 그 `as any` 때문에
 * ① 어떤 키가 실제로 INSERT되는지 코드에서 안 보였고 ② 타입이 맞는지 아무도 확인하지 않았다.
 * 여기서 테이블 컬럼을 기준으로 **화이트리스트**해 모르는 키는 버리고, 타임스탬프 컬럼만
 * Date로 되돌린 뒤 INSERT 타입으로 좁힌다.
 *
 * 마지막 단언은 JSON 경계에서 불가피하다 — 다만 검사 없이 8곳에 흩어져 있던 `as any`와 달리
 * 컬럼을 실제로 추려낸 뒤 한 곳에서만 일어난다.
 */
export function toInsertRows<TInsert>(
  table: PgTable,
  rows: Record<string, unknown>[],
  dateKeys: readonly string[] = [],
): TInsert[] {
  const columnNames = Object.keys(getTableColumns(table));
  return rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const name of columnNames) {
      if (!(name in row)) continue;
      if (dateKeys.includes(name)) {
        next[name] = toDate(row[name]) ?? row[name];
      } else {
        next[name] = row[name];
      }
    }
    return next as TInsert;
  });
}

async function loadExistingCounts(executor: WorkoutExecutor, userId: string) {
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

  // 자식 행이 파일 밖(=남의) 부모를 가리키면 거부한다. dryRun에서도 막아야 미리보기가
  // "괜찮다"고 답한 뒤 replace에서만 터지는 일이 없다. 삭제보다 먼저 검사한다.
  const scope = validateImportParentScope({
    templates,
    templateVersions,
    plans,
    planModules,
    planOverrides,
    generatedSessions,
    workoutLogs,
    workoutSets,
  });
  if (!scope.ok) {
    const error = new Error(scope.errors.join("; "));
    (error as Error & { code?: string }).code = "INVALID_IMPORT_BODY";
    throw error;
  }

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
      await tx
        .insert(programTemplate)
        .values(
          toInsertRows<typeof programTemplate.$inferInsert>(programTemplate, templates, [
            "createdAt",
            "updatedAt",
          ]),
        );
    }
    if (templateVersions.length > 0) {
      await tx
        .insert(programVersion)
        .values(
          toInsertRows<typeof programVersion.$inferInsert>(programVersion, templateVersions, [
            "createdAt",
          ]),
        );
    }
    if (plans.length > 0) {
      await tx
        .insert(plan)
        .values(toInsertRows<typeof plan.$inferInsert>(plan, plans, ["createdAt", "updatedAt"]));
    }
    if (planModules.length > 0) {
      await tx
        .insert(planModule)
        .values(toInsertRows<typeof planModule.$inferInsert>(planModule, planModules, ["createdAt"]));
    }
    if (planOverrides.length > 0) {
      await tx
        .insert(planOverride)
        .values(
          toInsertRows<typeof planOverride.$inferInsert>(planOverride, planOverrides, ["createdAt"]),
        );
    }
    if (generatedSessions.length > 0) {
      await tx
        .insert(generatedSession)
        .values(
          toInsertRows<typeof generatedSession.$inferInsert>(generatedSession, generatedSessions, [
            "scheduledAt",
            "createdAt",
            "updatedAt",
          ]),
        );
    }
    if (workoutLogs.length > 0) {
      await tx
        .insert(workoutLog)
        .values(
          toInsertRows<typeof workoutLog.$inferInsert>(workoutLog, workoutLogs, [
            "performedAt",
            "createdAt",
          ]),
        );
    }
    if (sanitizedSets.length > 0) {
      await tx
        .insert(workoutSet)
        .values(toInsertRows<typeof workoutSet.$inferInsert>(workoutSet, sanitizedSets));
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
