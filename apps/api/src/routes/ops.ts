import { Hono } from "hono";

import { opsTokenAuthorized } from "@workout/core/auth/ops-token";
import { countExpiredSessions, pruneExpiredSessions } from "@workout/core/auth/session";
import { dispatchDueRestPushes } from "@workout/core/push/rest-push";

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

// POST /api/ops/rest-push/dispatch — 만료된 휴식 종료 푸시를 보낸다. 호출자는 prod의
// Supabase Cron(pg_net)이고 만료 행이 있을 때만 부른다(web/scripts/setup-rest-push-cron.sql).
// CRON_SECRET도 받는다 — prod Vercel에 이미 있는 시크릿을 Vault에 옮겨 쓰면 새 시크릿이 필요 없다.
opsRoutes.post("/rest-push/dispatch", async (c) => {
  if (!opsTokenAuthorized(c.req.header("authorization"), ["cron-secret", "ops-token"])) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    return c.json(await dispatchDueRestPushes());
  } catch (e) {
    return apiError(c, e);
  }
});
