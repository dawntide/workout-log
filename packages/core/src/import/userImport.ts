import { asc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { type WorkoutExecutor, db } from "@workout/core/db/client";
import {
  exercise,
  generatedSession,
  plan,
  planModule,
  planOverride,
  bodyMeasurement,
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
import {
  readStoredDecisionsByLogId,
  rebuildAutoProgressionForPlan,
} from "../progression/autoProgression";

export { validateExportShape };

export type ImportMode = "dryRun" | "replace";

export type ImportTableSummary = {
  table: string;
  willDelete: number;
  willInsert: number;
  /**
   * 파일에서 복원하지 않고 import 후 **로그로부터 재계산**하는 파생 테이블 표시.
   * 이 행의 `willInsert`는 항상 0이다 — 파일에 담기지 않으므로 삽입할 것이 없다.
   * 이 표식이 없으면 미리보기가 `삭제 N → 삽입 0`으로 보여 데이터 손실처럼 읽힌다.
   */
  willRecompute?: true;
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
    existingBodyMeasurements,
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
    executor
      .select({ id: bodyMeasurement.id })
      .from(bodyMeasurement)
      .where(eq(bodyMeasurement.userId, userId)),
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
      bodyMeasurement: existingBodyMeasurements.length,
    },
  };
}

/**
 * import가 파일에서 복원하지 않고 재계산하는 테이블.
 *
 * `plan_runtime_state`는 로그에서 파생되는 상태다. replace import는 로그 자체를
 * 갈아끼우므로 파일에 담긴 옛 상태를 되살리면 새 로그와 어긋난다 — 그래서 export에
 * 넣는 대신 삽입이 끝난 뒤 `rebuildAutoProgressionForPlan`으로 다시 만든다.
 */
const RECOMPUTED_TABLES = new Set(["planRuntimeState"]);

/**
 * 재계산을 건너뛴 사유 중 **자동 진행 플랜인데 못 만든** 경우.
 *
 * `resolveAutoProgressionContext`는 `skip:disabled`(= autoProgression 미사용)를
 * 먼저 걸러내므로, 아래 사유까지 왔다면 그 플랜은 자동 진행이 켜져 있는데 프로그램을
 * 찾지 못한 것이다 → 진행 상태 없이 끝나므로 경고로 남긴다.
 */
const REBUILD_LOST_REASONS = new Set([
  "skip:no-root-program",
  "skip:version-missing",
  "skip:template-missing",
  "skip:unsupported-program",
]);

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
    "bodyMeasurement",
  ];
  return tables.map((table) => ({
    table,
    willDelete: existing.counts[table] ?? 0,
    willInsert: insertCounts[table] ?? 0,
    ...(RECOMPUTED_TABLES.has(table) ? { willRecompute: true as const } : {}),
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
  // 구 export 파일에는 이 키가 없다 — 부재를 빈 배열로 다룬다(형식 거부 아님).
  const bodyMeasurements = rewriteUserId(rowsAsRecords(data.bodyMeasurements ?? []), userId);

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
    // 파일에서 삽입하지 않는다 — import 후 로그에서 재계산한다(RECOMPUTED_TABLES).
    planRuntimeState: 0,
    generatedSession: generatedSessions.length,
    workoutLog: workoutLogs.length,
    workoutSet: workoutSets.length,
    bodyMeasurement: bodyMeasurements.length,
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

    // plan을 지우면 plan_progress_event가 cascade로 함께 사라진다. 그 안의
    // meta.targetDecisionsOverride(사용자가 세션마다 직접 고른 증감량)는 로그에서 다시
    // 유도할 수 없으므로 삭제 전에 걷어 두고 아래 재계산에 되돌려 넣는다. 자기 export를
    // 되돌리는 흔한 경우는 로그 id가 그대로라 결정이 그대로 살아난다.
    const carriedDecisionsByLogId = await readStoredDecisionsByLogId(tx, userId);

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
    if (bodyMeasurements.length > 0) {
      await tx
        .insert(bodyMeasurement)
        .values(
          toInsertRows<typeof bodyMeasurement.$inferInsert>(bodyMeasurement, bodyMeasurements, [
            "measuredAt",
            "createdAt",
          ]),
        );
    }

    // plan_runtime_state를 로그에서 다시 만든다.
    //
    // deleteUserDomainData가 이 테이블을 지우는데 export에는 없어서, 종전에는 replace
    // import가 자동 진행 상태(workKg·stage·failureStreak)를 지운 뒤 복원하지 않았다 →
    // 프로그램이 템플릿 시작 무게로 되돌아갔다. 파일에 담아 복원하는 대신 재계산하는
    // 이유는 이게 파생 상태이기 때문이다 — replace는 로그 자체를 갈아끼우므로 파일의
    // 옛 상태를 되살리면 새 로그와 어긋난다. plan_progress_event도 같은 이유로 옮기지
    // 않으며, 여기서 로그와 함께 다시 만들어진다.
    //
    // **트랜잭션 안에서** 돈다: 재계산이 실패한 채로 커밋되면 그게 바로 위 결함이므로,
    // 실패하면 import 전체를 롤백해 사용자의 기존 데이터를 그대로 남긴다.
    //
    // 순차 실행이 필수다 — 단일 커넥션 트랜잭션이라 쿼리를 병렬로 섞을 수 없다.
    // 방금 삽입된 것을 payload가 아니라 DB에서 되읽는다(id 없는 행까지 정확히 포함).
    const rebuildTargets = await tx
      .select({ id: plan.id })
      .from(plan)
      .where(eq(plan.userId, userId))
      .orderBy(asc(plan.createdAt), asc(plan.id));
    for (const target of rebuildTargets) {
      // 자동 진행이 아닌 플랜은 rebuild가 skip:disabled로 즉시 빠져나온다(쿼리 1회).
      const rebuilt = await rebuildAutoProgressionForPlan({
        tx,
        userId,
        planId: target.id,
        carriedDecisionsByLogId,
      });
      if (!rebuilt.applied && REBUILD_LOST_REASONS.has(rebuilt.reason)) {
        warnings.push(
          `auto-progression state not rebuilt for plan ${target.id} (${rebuilt.reason})`,
        );
      }
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
