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
import { rebuildRef5ProgressionForPlan } from "@workout/core/progression/ref5-auto-progression";
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
import { apiError, normalizeTimezone, resolveLocale } from "../../lib/http";
import { type AppEnv } from "../../auth";
import {
  toRecord,
} from "./shared";

/**
 * 생성된 세션 조회·삭제.
 *
 * ⚠️ `/active`가 `/:sessionId`보다 **먼저** 등록돼야 한다 — Hono는 등록 순서로
 * 매칭하므로 순서가 뒤집히면 `active`가 sessionId로 먹힌다.
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */
export function registerGeneratedSessionRoutes(plansRoutes: Hono<AppEnv>) {
  // GET /api/plans/:planId/generated-sessions/active — find the earliest
  // unfinished session on a plan calendar date. Returning it before rendering the
  // start panel prevents an accidental second start from consuming REF5 state.
  plansRoutes.get("/:planId/generated-sessions/active", async (c) => {
    const locale = resolveLocale(c);
    c.header("Cache-Control", "private, no-store");
    try {
      const userId = c.get("userId");
      const planId = c.req.param("planId");
      const calendarDate = c.req.query("date")?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
        return c.json(
          { error: locale === "ko" ? "올바른 계획 날짜가 필요합니다." : "A valid plan date is required." },
          400,
        );
      }
      const planRows = await db
        .select({ userId: planTable.userId, params: planTable.params })
        .from(planTable)
        .where(eq(planTable.id, planId))
        .limit(1);
      const planRow = planRows[0];
      if (!planRow || planRow.userId !== userId || !isRef5PlanParams(planRow.params)) {
        return c.json(
          { error: locale === "ko" ? "REF5 플랜을 찾을 수 없습니다." : "REF5 plan not found." },
          404,
        );
      }
      const session = await findRef5ResumableSession({
        userId,
        planId,
        calendarDate,
      });
      return c.json({ session }, 200);
    } catch (e) {
      return apiError(c, e, locale);
    }
  });

  // GET /api/plans/:planId/generated-sessions/:sessionId — resume an explicitly
  // started, immutable REF5 session after reload or in another tab.
  plansRoutes.get("/:planId/generated-sessions/:sessionId", async (c) => {
    const locale = resolveLocale(c);
    c.header("Cache-Control", "private, no-store");
    try {
      const userId = c.get("userId");
      const planId = c.req.param("planId");
      const sessionId = c.req.param("sessionId");
      const [planRows, sessionRows] = await Promise.all([
        db
          .select({ userId: planTable.userId, params: planTable.params })
          .from(planTable)
          .where(eq(planTable.id, planId))
          .limit(1),
        db
          .select()
          .from(generatedSession)
          .where(
            and(
              eq(generatedSession.id, sessionId),
              eq(generatedSession.planId, planId),
              eq(generatedSession.userId, userId),
            ),
          )
          .limit(1),
      ]);
      const planRow = planRows[0];
      const session = sessionRows[0];
      const domain = session ? extractRef5DomainSnapshot(session.snapshot) : null;
      if (
        !planRow ||
        planRow.userId !== userId ||
        !isRef5PlanParams(planRow.params) ||
        !session ||
        !domain
      ) {
        return c.json(
          { error: locale === "ko" ? "시작된 REF5 세션을 찾을 수 없습니다." : "Started REF5 session not found." },
          404,
        );
      }
      const planProtocolVersion = readRef5PlanProtocolVersion(planRow.params);
      if (domain.protocolVersion !== planProtocolVersion) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "오래된 REF5 세션입니다. 화면을 새로고침한 뒤 다시 시작해 주세요."
                : "This REF5 session belongs to a stale protocol. Refresh and start again.",
            code: "REF5_STALE_VERSION",
            expectedProtocolVersion: REF5_PROTOCOL_VERSION,
          },
          409,
        );
      }
      const ref5Meta = toRecord(toRecord(session.snapshot).ref5);
      if (domain.protocolVersion === REF5_PROTOCOL_VERSION && ref5Meta.startCommitted !== true) {
        return c.json(
          { error: locale === "ko" ? "아직 시작되지 않은 REF5 세션입니다." : "REF5 session has not started." },
          404,
        );
      }
      return c.json({ session }, 200);
    } catch (e) {
      if (e instanceof Ref5StaleVersionError) {
        return c.json(
          {
            error: e.message,
            code: "REF5_STALE_VERSION",
            expectedProtocolVersion: REF5_PROTOCOL_VERSION,
          },
          409,
        );
      }
      return apiError(c, e, locale);
    }
  });

  // DELETE /api/plans/:planId/generated-sessions/:sessionId — cancel a REF5 session
  // that was started but never logged. Without this, a mistakenly started session
  // locks the plan selector for the rest of the calendar day: the session is
  // resumed on every visit and plan switching is blocked while it is open.
  plansRoutes.delete("/:planId/generated-sessions/:sessionId", async (c) => {
    const locale = resolveLocale(c);
    try {
      const userId = c.get("userId");
      const planId = c.req.param("planId");
      const sessionId = c.req.param("sessionId");

      const [planRows, sessionRows] = await Promise.all([
        db
          .select({ userId: planTable.userId, params: planTable.params })
          .from(planTable)
          .where(eq(planTable.id, planId))
          .limit(1),
        db
          .select({ id: generatedSession.id })
          .from(generatedSession)
          .where(
            and(
              eq(generatedSession.id, sessionId),
              eq(generatedSession.planId, planId),
              eq(generatedSession.userId, userId),
            ),
          )
          .limit(1),
      ]);
      const planRow = planRows[0];
      if (!planRow || planRow.userId !== userId || !isRef5PlanParams(planRow.params)) {
        return c.json(
          { error: locale === "ko" ? "REF5 플랜을 찾을 수 없습니다." : "REF5 plan not found." },
          404,
        );
      }
      if (!sessionRows[0]) {
        return c.json(
          { error: locale === "ko" ? "세션을 찾을 수 없습니다." : "Session not found." },
          404,
        );
      }

      // 이미 기록이 붙은 세션은 취소 대상이 아니다 — 그건 기록 삭제로 처리해야 한다.
      const loggedRows = await db
        .select({ id: workoutLog.id })
        .from(workoutLog)
        .where(and(eq(workoutLog.generatedSessionId, sessionId), eq(workoutLog.userId, userId)))
        .limit(1);
      if (loggedRows[0]) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "이미 기록이 저장된 세션입니다. 기록을 먼저 삭제해 주세요."
                : "This session already has a saved log. Delete the log first.",
            code: "REF5_SESSION_ALREADY_LOGGED",
          },
          409,
        );
      }

      await db.transaction(async (tx) => {
        await tx.delete(generatedSession).where(eq(generatedSession.id, sessionId));
        // 시작 이벤트가 전진시킨 runtime state를 남은 세션·기록으로 다시 접어 되돌린다.
        await rebuildRef5ProgressionForPlan({ tx, userId, planId });
        await invalidateStatsCacheForUser(userId, tx);
      });

      return c.json({ deleted: true, sessionId }, 200);
    } catch (e) {
      return apiError(c, e, locale);
    }
  });
}
