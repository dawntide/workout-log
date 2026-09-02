import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { and, count, desc, eq, inArray, isNotNull, max, or } from "@workout/core/db/ops";
import {
  generatedSession,
  plan as planTable,
  planModule,
  planOverride,
  planProgressEvent,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
} from "@workout/core/db/schema";
import { invalidateStatsCacheForUser } from "@workout/core/stats/cache";
import {
  extractRef5DomainSnapshot,
  findRef5ResumableSession,
  isRef5PlanParams,
  readRef5PlanProtocolVersion,
} from "@workout/core/program-engine/ref5-integration";
import {
  REF5_IDENTIFIERS,
  REF5_PROTOCOL_VERSION,
  Ref5StaleVersionError,
  Ref5ValidationError,
  readRef5PlanStartConfig,
} from "@workout/core/program-engine/ref5";
import { isProgramTemplateAccessible } from "@workout/core/program-store/template-access";
import { apiError, normalizeTimezone, resolveLocale } from "../../lib/http";
import { resolveRef5PlanStartConfig } from "../../lib/ref5-plan-creation";
import { type AppEnv } from "../../auth";
import {
  withAutoProgressionDefaults,
  validateIncrementOverrides,
  asRecord,
} from "./shared";

/**
 * 플랜 CRUD — 목록·생성·수정·삭제.
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */
export function registerPlanCrudRoutes(plansRoutes: Hono<AppEnv>) {
  // GET /api/plans — the user's plans, each with baseProgramName + lastPerformedAt.
  plansRoutes.get("/", async (c) => {
    const locale = resolveLocale(c);
    try {
      const userId = c.get("userId");

      const baseItems = await db
        .select()
        .from(planTable)
        .where(eq(planTable.userId, userId))
        .orderBy(desc(planTable.createdAt));

      if (baseItems.length === 0) {
        return c.json({ items: [] });
      }

      const rootVersionIds = Array.from(
        new Set(
          baseItems
            .map((item) => item.rootProgramVersionId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const planIds = baseItems.map((item) => item.id);
      const [versionRows, logRows] = await Promise.all([
        rootVersionIds.length > 0
          ? db
              .select({
                versionId: programVersion.id,
                templateName: programTemplate.name,
                templateVisibility: programTemplate.visibility,
                templateOwnerUserId: programTemplate.ownerUserId,
              })
              .from(programVersion)
              .leftJoin(programTemplate, eq(programTemplate.id, programVersion.templateId))
              .where(inArray(programVersion.id, rootVersionIds))
          : Promise.resolve(
              [] as Array<{
                versionId: string;
                templateName: string | null;
                templateVisibility: string | null;
                templateOwnerUserId: string | null;
              }>,
            ),
        // PERF: plan별 최근 수행일만 필요 → 전 로그를 당겨 JS로 첫 행을 취하지 않고
        // SQL max()+groupBy로 plan당 1행만 전송 (전송량이 학습 이력 밀도와 무관).
        // logCount는 같은 groupBy에 얹는 집계라 추가 왕복 없이 나온다 — 삭제 확인에서
        // "기록 N건이 함께 지워진다"를 사전에 보여주는 데 쓴다.
        db
          .select({
            planId: workoutLog.planId,
            lastPerformedAt: max(workoutLog.performedAt),
            logCount: count(workoutLog.id),
          })
          .from(workoutLog)
          .where(
            and(
              eq(workoutLog.userId, userId),
              isNotNull(workoutLog.planId),
              inArray(workoutLog.planId, planIds),
            ),
          )
          .groupBy(workoutLog.planId),
      ]);

      const versionNameById = new Map<string, string>();
      const versionAccessibleById = new Map<string, boolean>();
      for (const row of versionRows) {
        if (!row.versionId) continue;
        const label = String(row.templateName ?? "").trim();
        if (label) versionNameById.set(row.versionId, label);
        versionAccessibleById.set(
          row.versionId,
          isProgramTemplateAccessible(
            { visibility: row.templateVisibility, ownerUserId: row.templateOwnerUserId },
            userId,
          ),
        );
      }
      const lastPerformedAtByPlanId = new Map<string, Date>();
      const logCountByPlanId = new Map<string, number>();
      for (const row of logRows) {
        const planId = row.planId;
        if (!planId) continue;
        if (row.lastPerformedAt) lastPerformedAtByPlanId.set(planId, row.lastPerformedAt);
        logCountByPlanId.set(planId, Number(row.logCount ?? 0));
      }

      const items = baseItems.map((item) => {
        const baseProgramName =
          (item.rootProgramVersionId && versionNameById.get(item.rootProgramVersionId)) ??
          (item.type === "COMPOSITE"
            ? locale === "ko"
              ? "복합 플랜"
              : "Composite Plan"
            : locale === "ko"
              ? "프로그램 정보 없음"
              : "No Program Info");
        return {
          ...item,
          baseProgramName,
          lastPerformedAt: lastPerformedAtByPlanId.get(item.id) ?? null,
          logCount: logCountByPlanId.get(item.id) ?? 0,
          // COMPOSITE는 root 버전이 없고 모듈별 프로그램을 쓰므로 이 경고 대상이 아니다.
          baseProgramAccessible: item.rootProgramVersionId
            ? (versionAccessibleById.get(item.rootProgramVersionId) ?? false)
            : true,
        };
      });

      c.header("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
      return c.json({ items });
    } catch (e) {
      return apiError(c, e, locale);
    }
  });

  /**
   * COMPOSITE 플랜 생성 요청의 `modules[]` 원소 — 이 핸들러가 **읽는 필드만** 적는다.
   *
   * 요청 본문이라 값은 여전히 신뢰하지 않는다: `target`·`programVersionId`가 실제로
   * 유효한지는 종전과 동일하게 DB(enum·FK)가 거른다. 달라지는 건 선언하지 않은 필드를
   * 읽는 오타가 컴파일에서 걸린다는 것뿐이고, 런타임 동작은 그대로다.
   */
  type PlanModuleInput = {
    target: typeof planModule.$inferInsert["target"];
    programVersionId: typeof planModule.$inferInsert["programVersionId"];
    priority?: number;
    params?: typeof planModule.$inferInsert["params"];
  };

  // POST /api/plans — create a SINGLE / MANUAL / COMPOSITE plan.
  plansRoutes.post("/", async (c) => {
    const locale = resolveLocale(c);
    try {
      const body = await c.req.json();
      const userId = c.get("userId");
      const name = body.name;
      const type = body.type;

      if (!name || !type) {
        return c.json(
          { error: locale === "ko" ? "name과 type이 필요합니다." : "name and type are required." },
          400,
        );
      }

      if (type === "COMPOSITE") {
        const modules: PlanModuleInput[] = Array.isArray(body.modules) ? body.modules : [];
        if (modules.length === 0) {
          return c.json(
            {
              error:
                locale === "ko"
                  ? "COMPOSITE 플랜에는 modules가 필요합니다."
                  : "modules are required for COMPOSITE.",
            },
            400,
          );
        }

        const created = await db.transaction(async (tx) => {
          const [p] = await tx
            .insert(planTable)
            .values({ userId, name, type, params: withAutoProgressionDefaults(body.params) })
            .returning();

          await tx.insert(planModule).values(
            modules.map((m) => ({
              planId: p.id,
              target: m.target,
              programVersionId: m.programVersionId,
              priority: m.priority ?? 0,
              params: m.params ?? {},
            })),
          );

          return p;
        });

        return c.json({ plan: created }, 201);
      }

      // SINGLE or MANUAL
      const rootProgramVersionId = body.rootProgramVersionId;
      if (!rootProgramVersionId) {
        return c.json(
          {
            error:
              locale === "ko" ? "rootProgramVersionId가 필요합니다." : "rootProgramVersionId is required.",
          },
          400,
        );
      }

      const versionRows = await db
        .select({
          definition: programVersion.definition,
          defaults: programVersion.defaults,
          templateId: programVersion.templateId,
        })
        .from(programVersion)
        .where(eq(programVersion.id, rootProgramVersionId))
        .limit(1);
      const rootVersion = versionRows[0];
      if (!rootVersion) {
        return c.json(
          { error: locale === "ko" ? "프로그램 버전을 찾을 수 없습니다." : "Program version not found." },
          404,
        );
      }
      const templateRows = await db
        .select({ slug: programTemplate.slug })
        .from(programTemplate)
        .where(eq(programTemplate.id, rootVersion.templateId))
        .limit(1);
      const definition = asRecord(rootVersion.definition);
      const isRef5Root =
        templateRows[0]?.slug === REF5_IDENTIFIERS.slug ||
        String(definition.kind ?? "").trim().toLowerCase() === REF5_IDENTIFIERS.kind ||
        String(definition.family ?? "").trim().toLowerCase() === REF5_IDENTIFIERS.family;
      const submittedParams = asRecord(body.params);
      const versionDefaults = asRecord(rootVersion.defaults);
      if (isRef5Root && String(definition.protocolVersion ?? "") !== REF5_PROTOCOL_VERSION) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "이 REF5 버전은 오래되었습니다. 최신 프로그램 버전을 다시 선택해 주세요."
                : "This REF5 version is stale. Select the latest program version.",
            code: "REF5_STALE_VERSION",
            expectedProtocolVersion: REF5_PROTOCOL_VERSION,
          },
          409,
        );
      }
      const ref5StartConfig = isRef5Root
        ? resolveRef5PlanStartConfig(submittedParams, versionDefaults)
        : null;
      if (ref5StartConfig && !ref5StartConfig.ok) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "REF5 시작 중량은 2.5~500kg 범위의 2.5kg 단위여야 하며 DL/OHP 상한을 넘을 수 없습니다. OAP 시작 단은 1~6의 정수여야 합니다."
                : "REF5 starting loads must use the 2.5 kg grid from 2.5 to 500 kg and stay within the DL/OHP caps. OAP start rungs must be integers from 1 to 6.",
            code: "REF5_INVALID_START_CONFIG",
            details: ref5StartConfig.errors,
          },
          400,
        );
      }
      const canonicalParams = isRef5Root
        ? {
            timezone: normalizeTimezone(
              typeof submittedParams.timezone === "string" ? submittedParams.timezone : null,
            ),
            autoProgression: true,
            programFamily: REF5_IDENTIFIERS.family,
            protocolVersion: REF5_PROTOCOL_VERSION,
            ref5: ref5StartConfig!.value,
          }
        : withAutoProgressionDefaults(body.params);

      const [p] = await db
        .insert(planTable)
        .values({
          userId,
          name,
          type,
          rootProgramVersionId,
          params: canonicalParams,
        })
        .returning();

      return c.json({ plan: p }, 201);
    } catch (e) {
      return apiError(c, e, locale);
    }
  });

  // PATCH /api/plans/:planId — rename / patch params (incl. autoProgression,
  // incrementOverrides validation).
  plansRoutes.patch("/:planId", async (c) => {
    const locale = resolveLocale(c);
    try {
      const planId = c.req.param("planId");
      const userId = c.get("userId");
      const body = (await c.req.json().catch(() => ({}))) as {
        name?: unknown;
        params?: unknown;
        autoProgression?: unknown;
        isArchived?: unknown;
      };

      const rows = await db.select().from(planTable).where(eq(planTable.id, planId)).limit(1);
      const found = rows[0];
      if (!found)
        return c.json(
          { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
          404,
        );
      if (found.userId !== userId)
        return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

      const hasNamePatch = typeof body.name === "string";
      const nextName = hasNamePatch ? String(body.name).trim() : "";
      if (hasNamePatch && !nextName) {
        return c.json(
          {
            error:
              locale === "ko" ? "플랜 이름은 비워둘 수 없습니다." : "Plan name must not be empty.",
          },
          400,
        );
      }
      const hasParamsPatch =
        (body.params !== undefined &&
          body.params !== null &&
          typeof body.params === "object" &&
          !Array.isArray(body.params)) ||
        typeof body.autoProgression === "boolean";
      // 보관은 기록을 지우지 않고 목록에서만 내리는 되돌릴 수 있는 상태 변경이라,
      // params 불변(REF5) 규칙과 무관하게 모든 플랜에 허용된다.
      const hasArchivePatch = typeof body.isArchived === "boolean";
      if (!hasNamePatch && !hasParamsPatch && !hasArchivePatch) {
        return c.json(
          { error: locale === "ko" ? "수정할 내용이 없습니다." : "No patch payload." },
          400,
        );
      }

      if (isRef5PlanParams(asRecord(found.params)) && hasParamsPatch) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "REF5의 버전 고정 파라미터는 수정할 수 없습니다."
                : "REF5 versioned parameters are immutable.",
          },
          400,
        );
      }

      const currentParams = asRecord(found.params);
      const paramPatch = asRecord(body.params);
      const nextParams: Record<string, unknown> = { ...currentParams, ...paramPatch };

      if (Object.prototype.hasOwnProperty.call(paramPatch, "incrementOverrides")) {
        const validation = validateIncrementOverrides(paramPatch.incrementOverrides, locale);
        if (!validation.ok) {
          return c.json({ error: validation.error }, 400);
        }
        if (validation.value === null) {
          delete nextParams.incrementOverrides;
        } else {
          nextParams.incrementOverrides = validation.value;
        }
      }

      if (typeof body.autoProgression === "boolean") {
        nextParams.autoProgression = body.autoProgression;
      }

      const [updated] = await db
        .update(planTable)
        .set({
          name: hasNamePatch ? nextName : undefined,
          params: hasParamsPatch ? nextParams : undefined,
          isArchived: hasArchivePatch ? (body.isArchived as boolean) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(planTable.id, planId))
        .returning();

      // 홈 payload는 플랜 목록을 90초간 캐시한다. 보관/해제는 홈이 제안하는 플랜을
      // 즉시 바꿔야 하므로 여기서 캐시를 비운다(이름/파라미터 수정은 홈 표시와 무관).
      if (hasArchivePatch) {
        await invalidateStatsCacheForUser(userId).catch(() => {});
      }

      return c.json({ plan: updated }, 200);
    } catch (e) {
      return apiError(c, e, locale);
    }
  });

  // DELETE /api/plans/:planId — delete a plan and its logs/generated sessions.
  plansRoutes.delete("/:planId", async (c) => {
    const locale = resolveLocale(c);
    try {
      const planId = c.req.param("planId");
      const userId = c.get("userId");

      const rows = await db.select().from(planTable).where(eq(planTable.id, planId)).limit(1);
      const found = rows[0];
      if (!found)
        return c.json(
          { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
          404,
        );
      if (found.userId !== userId)
        return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

      const result = await db.transaction(async (tx) => {
        const sessionRows = await tx
          .select({ id: generatedSession.id })
          .from(generatedSession)
          .where(eq(generatedSession.planId, planId));
        const sessionIds = sessionRows.map((row) => row.id);

        const deletedLogs = await tx
          .delete(workoutLog)
          .where(
            sessionIds.length > 0
              ? or(eq(workoutLog.planId, planId), inArray(workoutLog.generatedSessionId, sessionIds))
              : eq(workoutLog.planId, planId),
          )
          .returning({ id: workoutLog.id });

        await tx.delete(planTable).where(eq(planTable.id, planId));
        await invalidateStatsCacheForUser(userId, tx);

        return {
          deletedLogCount: deletedLogs.length,
          deletedGeneratedSessionCount: sessionIds.length,
        };
      });

      return c.json(
        {
          deleted: true,
          planId,
          deletedLogCount: result.deletedLogCount,
          deletedGeneratedSessionCount: result.deletedGeneratedSessionCount,
        },
        200,
      );
    } catch (e) {
      return apiError(c, e, locale);
    }
  });
}
