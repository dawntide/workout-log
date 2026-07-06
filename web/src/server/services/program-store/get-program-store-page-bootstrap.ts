/**
 * 프로그램 스토어 SSR 부트스트랩
 * DB를 직접 쿼리해서 클라이언트 API 호출 없이 초기 데이터를 반환합니다.
 */
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import {
  exercise,
  plan,
  programTemplate,
  programVersion,
} from "@workout/core/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import type { ProgramTemplate } from "@workout/core/program-store/model";
import type { ExerciseOption, PlanItem } from "@/features/program-store/model/types";

export type ProgramStorePageBootstrap = {
  initialTemplates: ProgramTemplate[];
  initialPlans: PlanItem[];
  initialExercises: ExerciseOption[];
};

export async function getProgramStorePageBootstrap(): Promise<ProgramStorePageBootstrap> {
  const userId = await requireAuthenticatedUserId();

  // 템플릿, 플랜, 운동 목록 병렬 조회
  const [templates, plans, exercises] = await Promise.all([
    fetchTemplatesServer(userId),
    fetchPlansServer(userId),
    fetchExercisesServer(),
  ]);

  return { initialTemplates: templates, initialPlans: plans, initialExercises: exercises };
}

async function fetchTemplatesServer(userId: string): Promise<ProgramTemplate[]> {
  const templateRows = await db
    .select()
    .from(programTemplate)
    .where(
      or(
        eq(programTemplate.visibility, "PUBLIC"),
        and(
          eq(programTemplate.visibility, "PRIVATE"),
          eq(programTemplate.ownerUserId, userId),
        ),
      ),
    )
    .orderBy(asc(programTemplate.name), asc(programTemplate.id))
    .limit(200);

  if (templateRows.length === 0) return [];

  const templateIds = templateRows.map((t) => t.id);
  const versionRows = await db
    .select()
    .from(programVersion)
    .where(inArray(programVersion.templateId, templateIds))
    .orderBy(asc(programVersion.templateId), desc(programVersion.version));

  const latestVersionByTemplateId = new Map<string, typeof versionRows[number]>();
  for (const row of versionRows) {
    if (!latestVersionByTemplateId.has(row.templateId)) {
      latestVersionByTemplateId.set(row.templateId, row);
    }
  }

  return templateRows.map((t) => {
    const v = latestVersionByTemplateId.get(t.id) ?? null;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      type: t.type as "LOGIC" | "MANUAL",
      visibility: t.visibility as "PUBLIC" | "PRIVATE",
      description: t.description ?? null,
      tags: t.tags ?? null,
      latestVersion: v
        ? {
            id: v.id,
            version: v.version,
            definition: v.definition,
            defaults: v.defaults,
          }
        : null,
    };
  });
}

async function fetchPlansServer(userId: string): Promise<PlanItem[]> {
  const rows = await db
    .select({
      id: plan.id,
      name: plan.name,
      type: plan.type,
      rootProgramVersionId: plan.rootProgramVersionId,
      params: plan.params,
    })
    .from(plan)
    .where(eq(plan.userId, userId))
    .orderBy(desc(plan.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as "SINGLE" | "COMPOSITE" | "MANUAL",
    rootProgramVersionId: r.rootProgramVersionId ?? null,
    params: r.params as Record<string, unknown> | null,
  }));
}

export async function fetchExercisesServer(): Promise<ExerciseOption[]> {
  const rows = await db
    .select({ id: exercise.id, name: exercise.name, category: exercise.category })
    .from(exercise)
    .orderBy(asc(exercise.name))
    .limit(250);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category ?? null,
  }));
}
