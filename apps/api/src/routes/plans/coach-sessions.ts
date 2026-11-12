import { Hono } from "hono";

import {
  isCoachDateKey,
  validateCoachPrescription,
} from "@workout/core/program-engine/coach-prescription";
import {
  readCoachSession,
  upsertCoachPrescription,
} from "@workout/core/program-engine/coach-session";
import { apiError, resolveLocale, type Locale } from "../../lib/http";
import { type AppEnv } from "../../auth";

/**
 * 코치 처방 세션 — 한 날짜의 처방을 넣고 읽는다.
 *
 * 서버는 **검증하고 저장할 뿐 무게를 계산하지 않는다.** 코치 플랜
 * (`params.programFamily === "coach"`)에만 닿고, REF5를 포함한 다른 플랜은 400이다.
 * 삭제 경로는 없다 — 잘못 넣은 처방은 수행 전에 같은 날짜로 다시 PUT 한다.
 *
 * PAT 공개 표면에 열려 있다(`api-token-surface.ts`). 설계: `docs/decisions.md` 2026-11-12.
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */

function invalidDate(locale: Locale) {
  return locale === "ko"
    ? "날짜는 실제 달력 날짜인 YYYY-MM-DD여야 합니다."
    : "The date must be a real calendar date in YYYY-MM-DD.";
}

function planNotFound(locale: Locale) {
  return locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found.";
}

function notCoachPlan(locale: Locale) {
  return locale === "ko"
    ? "코치 처방 플랜이 아닙니다. 처방은 코치 플랜에만 넣을 수 있습니다."
    : "This is not a coach-prescribed plan. Prescriptions only apply to coach plans.";
}

export function registerCoachSessionRoutes(plansRoutes: Hono<AppEnv>) {
  // GET /api/plans/:planId/coach-sessions/:date — 그 날짜의 처방(없으면 session: null).
  plansRoutes.get("/:planId/coach-sessions/:date", async (c) => {
    const locale = resolveLocale(c);
    c.header("Cache-Control", "private, no-store");
    try {
      const date = c.req.param("date");
      if (!isCoachDateKey(date)) return c.json({ error: invalidDate(locale) }, 400);
      const result = await readCoachSession({
        userId: c.get("userId"),
        planId: c.req.param("planId"),
        date,
      });
      if (result.status === "plan_not_found") return c.json({ error: planNotFound(locale) }, 404);
      if (result.status === "not_coach_plan") {
        return c.json({ error: notCoachPlan(locale), code: "COACH_PLAN_REQUIRED" }, 400);
      }
      return c.json({ session: result.session, locked: result.locked }, 200);
    } catch (e) {
      return apiError(c, e, locale);
    }
  });

  // PUT /api/plans/:planId/coach-sessions/:date — 처방을 넣거나(201) 고친다(200).
  plansRoutes.put("/:planId/coach-sessions/:date", async (c) => {
    const locale = resolveLocale(c);
    try {
      const date = c.req.param("date");
      if (!isCoachDateKey(date)) return c.json({ error: invalidDate(locale) }, 400);

      const body = await c.req.json().catch(() => null);
      const validation = validateCoachPrescription(body);
      if (!validation.ok) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "처방이 올바르지 않습니다. details를 고쳐 다시 보내세요."
                : "The prescription is invalid. Fix the listed details and resend.",
            code: "COACH_PRESCRIPTION_INVALID",
            details: validation.errors,
          },
          400,
        );
      }

      const result = await upsertCoachPrescription({
        userId: c.get("userId"),
        planId: c.req.param("planId"),
        date,
        prescription: validation.value,
      });

      if (result.status === "plan_not_found") return c.json({ error: planNotFound(locale) }, 404);
      if (result.status === "not_coach_plan") {
        return c.json({ error: notCoachPlan(locale), code: "COACH_PLAN_REQUIRED" }, 400);
      }
      if (result.status === "unknown_exercises") {
        return c.json(
          {
            error:
              locale === "ko"
                ? "카탈로그에 없는 종목이 있습니다. GET /api/exercises로 이름을 확인하세요."
                : "Some exercises are not in the catalog. Check names with GET /api/exercises.",
            code: "COACH_UNKNOWN_EXERCISE",
            details: result.names,
          },
          400,
        );
      }
      if (result.status === "locked") {
        return c.json(
          {
            error:
              locale === "ko"
                ? "이미 수행 기록이 저장된 날짜입니다. 수행한 처방은 바꿀 수 없습니다."
                : "This date already has a saved workout. A performed prescription cannot change.",
            code: "COACH_SESSION_LOCKED",
          },
          409,
        );
      }

      return c.json(
        { session: result.session, created: result.created, unchanged: result.unchanged },
        result.created ? 201 : 200,
      );
    } catch (e) {
      return apiError(c, e, locale);
    }
  });
}
