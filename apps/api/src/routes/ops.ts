import { Hono } from "hono";

import { opsTokenAuthorized } from "@workout/core/auth/ops-token";
import { countExpiredSessions, pruneExpiredSessions } from "@workout/core/auth/session";

import { apiError } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Ops — infra/cron endpoints (NOT user-scoped). Auth is the WORKOUT_OPS_TOKEN
// admin secret via Authorization: Bearer. These endpoints are destructive
// (delete expired sessions) and publicly reachable, so the gate FAILS CLOSED:
// an unset token denies access unless WORKOUT_OPS_ALLOW_NO_TOKEN=1 opts in for
// local dev. Both the gate and the prune query now live in @workout/core so the
// web route (which used to fail OPEN) cannot drift from this one again.
// (ops/migrations is intentionally not ported: it reads the migrations dir from
// process.cwd(), which is web-layout specific, and is a web-deployment health
// check.)
// ─────────────────────────────────────────────────────────────────────────────

export const opsRoutes = new Hono();

// GET /api/ops/sessions/prune — dry-run: count expired sessions (monitoring).
opsRoutes.get("/sessions/prune", async (c) => {
  if (!opsTokenAuthorized(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const { expired, truncated } = await countExpiredSessions();
    return c.json({ expired, truncated, at: new Date().toISOString() });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/ops/sessions/prune — delete expired auth_session rows.
opsRoutes.post("/sessions/prune", async (c) => {
  if (!opsTokenAuthorized(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const deleted = await pruneExpiredSessions();
    return c.json({ deleted, at: new Date().toISOString() });
  } catch (e) {
    return apiError(c, e);
  }
});
