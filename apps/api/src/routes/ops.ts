import { Hono } from "hono";
import type { Context } from "hono";

import { db } from "@/server/db/client";
import { lt } from "@/server/db/ops";
import { authSession } from "@/server/db/schema";

import { apiError } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Ops — infra/cron endpoints (NOT user-scoped). Auth is the WORKOUT_OPS_TOKEN
// admin secret via Authorization: Bearer, matching the web route; if the env var
// is unset the endpoint is open (dev convenience — set it in production). Ported
// from web/src/app/api/ops/sessions/prune. (ops/migrations is intentionally not
// ported: it reads the migrations dir from process.cwd(), which is web-layout
// specific, and is a web-deployment health check.)
// ─────────────────────────────────────────────────────────────────────────────

/** WORKOUT_OPS_TOKEN gate: 401 only when the env var is set and the Bearer token mismatches. */
function opsTokenOk(c: Context): boolean {
  const expected = (process.env.WORKOUT_OPS_TOKEN ?? "").trim();
  if (!expected) return true;
  const auth = c.req.header("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return provided === expected;
}

export const opsRoutes = new Hono();

// GET /api/ops/sessions/prune — dry-run: count expired sessions (monitoring).
opsRoutes.get("/sessions/prune", async (c) => {
  if (!opsTokenOk(c)) return c.json({ error: "Unauthorized" }, 401);
  try {
    const rows = await db
      .select({ token: authSession.token })
      .from(authSession)
      .where(lt(authSession.expiresAt, new Date()))
      .limit(1000);
    return c.json({
      expired: rows.length,
      truncated: rows.length === 1000,
      at: new Date().toISOString(),
    });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/ops/sessions/prune — delete expired auth_session rows.
opsRoutes.post("/sessions/prune", async (c) => {
  if (!opsTokenOk(c)) return c.json({ error: "Unauthorized" }, 401);
  try {
    const result = await db.delete(authSession).where(lt(authSession.expiresAt, new Date()));
    const deleted = (result as { rowCount?: number | null })?.rowCount ?? 0;
    return c.json({ deleted, at: new Date().toISOString() });
  } catch (e) {
    return apiError(c, e);
  }
});
