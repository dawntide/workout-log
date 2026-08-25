import { Hono } from "hono";

import {
  deleteBodyweight,
  fetchBodyweightEntries,
  InvalidBodyweightError,
  recordBodyweight,
} from "@workout/core/stats/bodyweight-service";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, resolveLocale } from "../lib/http";

/**
 * 체중 기록 (`/api/bodyweight`).
 *
 * 설정의 `prefs.bodyweight.kg`(오늘 체중)와는 별개다 — 이쪽은 이력이고, 강도 점수·
 * asymptote 모니터가 세션 시점 체중을 찾는 데 쓴다(계획서 §1).
 */
export const bodyweightRoutes = new Hono<AppEnv>();
bodyweightRoutes.use("*", requireAuth);

function badRequest(c: Parameters<typeof apiError>[0], error: InvalidBodyweightError) {
  return c.json({ error: error.message }, 400);
}

// GET /api/bodyweight?days=365&limit=365 — 최근 기록(시각 내림차순)
bodyweightRoutes.get("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const days = Number(c.req.query("days") ?? "");
    const since =
      Number.isFinite(days) && days > 0
        ? new Date(Date.now() - Math.round(days) * 24 * 60 * 60 * 1000)
        : null;
    const limitRaw = Number(c.req.query("limit") ?? "");
    const entries = await fetchBodyweightEntries({
      userId,
      since,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
    });
    c.header("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return c.json({ items: entries });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/bodyweight — 기록(같은 measuredAt이면 덮어쓴다)
bodyweightRoutes.post("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const body = (await c.req.json().catch(() => ({}))) as {
      valueKg?: unknown;
      measuredAt?: unknown;
    };
    const entry = await recordBodyweight({
      userId,
      valueKg: body.valueKg,
      measuredAt: body.measuredAt,
    });
    return c.json({ item: entry }, 201);
  } catch (e) {
    if (e instanceof InvalidBodyweightError) return badRequest(c, e);
    return apiError(c, e, locale);
  }
});

// DELETE /api/bodyweight/:id
bodyweightRoutes.delete("/:id", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const deleted = await deleteBodyweight({ userId, id: c.req.param("id") });
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    return apiError(c, e, locale);
  }
});
