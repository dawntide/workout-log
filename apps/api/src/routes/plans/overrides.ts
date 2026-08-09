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
import {
  extractRef5DomainSnapshot,
  findRef5ResumableSession,
  isRef5PlanParams,
  readRef5PlanProtocolVersion,
} from "@workout/core/program-engine/ref5-integration";
import { apiError, normalizeTimezone, resolveLocale } from "../../lib/http";
import { type AppEnv } from "../../auth";
import {
  asRecord,
} from "./shared";

/**
 * 플랜 오버라이드 생성(ADD_ACCESSORY / REPLACE_EXERCISE).
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */
export function registerOverrideRoutes(plansRoutes: Hono<AppEnv>) {
  // POST /api/plans/:planId/overrides — create a plan override (ADD_ACCESSORY /
  // REPLACE_EXERCISE; PLAN or SESSION scope).
  plansRoutes.post("/:planId/overrides", async (c) => {
    const locale = resolveLocale(c);
    try {
      const planId = c.req.param("planId");
      const body = await c.req.json();
      const userId = c.get("userId");

      const planRow = await db.select().from(planTable).where(eq(planTable.id, planId)).limit(1);
      const p = planRow[0];
      if (!p)
        return c.json(
          { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
          404,
        );
      if (p.userId !== userId)
        return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);
      if (isRef5PlanParams(asRecord(p.params))) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "REF5 처방은 커스터마이즈하거나 덮어쓸 수 없습니다."
                : "REF5 prescriptions cannot be customized or overridden.",
          },
          400,
        );
      }

      const scope = body.scope;
      const patch = body.patch;

      if (!scope || !patch) {
        return c.json(
          { error: locale === "ko" ? "scope와 patch가 필요합니다." : "scope and patch are required." },
          400,
        );
      }

      const [created] = await db
        .insert(planOverride)
        .values({
          planId,
          scope,
          weekNumber: body.weekNumber ?? null,
          sessionKey: body.sessionKey ?? null,
          patch,
          note: body.note ?? null,
        })
        .returning();

      return c.json({ override: created }, 201);
    } catch (e) {
      return apiError(c, e, locale);
    }
  });
}
