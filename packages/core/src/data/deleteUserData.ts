import { eq, inArray } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  generatedSession,
  plan,
  planModule,
  planOverride,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
  bodyMeasurement,
  workoutSet,
} from "@workout/core/db/schema";

type AnyExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 단일 사용자의 도메인 데이터를 모두 삭제한다.
 *
 * 대상: programTemplate / programVersion / plan / planModule / planOverride /
 *       planRuntimeState / generatedSession / workoutLog / workoutSet
 *
 * 보존: 공용 exercise 카탈로그, exerciseAlias, userSetting, 인증 데이터
 *       (auth_session, app_user 등)
 *
 * import의 replace 모드와 account delete에서 모두 사용된다.
 */
export async function deleteUserDomainData(
  executor: AnyExecutor,
  userId: string,
): Promise<void> {
  const userPlans = await executor
    .select({ id: plan.id })
    .from(plan)
    .where(eq(plan.userId, userId));
  const planIds = userPlans.map((row) => row.id);

  const userLogs = await executor
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(eq(workoutLog.userId, userId));
  const logIds = userLogs.map((row) => row.id);

  if (logIds.length > 0) {
    await executor.delete(workoutSet).where(inArray(workoutSet.logId, logIds));
  }
  await executor.delete(workoutLog).where(eq(workoutLog.userId, userId));
  await executor.delete(bodyMeasurement).where(eq(bodyMeasurement.userId, userId));

  if (planIds.length > 0) {
    await executor
      .delete(planRuntimeState)
      .where(inArray(planRuntimeState.planId, planIds));
    await executor
      .delete(planModule)
      .where(inArray(planModule.planId, planIds));
    await executor
      .delete(planOverride)
      .where(inArray(planOverride.planId, planIds));
    await executor
      .delete(generatedSession)
      .where(inArray(generatedSession.planId, planIds));
  }
  await executor.delete(plan).where(eq(plan.userId, userId));

  const userTemplates = await executor
    .select({ id: programTemplate.id })
    .from(programTemplate)
    .where(eq(programTemplate.ownerUserId, userId));
  const templateIds = userTemplates.map((row) => row.id);
  if (templateIds.length > 0) {
    await executor
      .delete(programVersion)
      .where(inArray(programVersion.templateId, templateIds));
  }
  await executor
    .delete(programTemplate)
    .where(eq(programTemplate.ownerUserId, userId));
}
