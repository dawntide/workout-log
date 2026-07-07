import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { sql } from "@workout/core/db/ops";
import { logError } from "@workout/core/observability/logger";

import { type AppEnv } from "./auth";
import { apiLogger } from "./lib/http";
import { authRoutes } from "./routes/auth";
import { logsRoutes } from "./routes/logs";
import { statsRoutes } from "./routes/stats";
import { exercisesRoutes } from "./routes/exercises";
import { settingsRoutes } from "./routes/settings";
import { plansRoutes } from "./routes/plans";
import {
  templatesRoutes,
  homeRoutes,
  exportRoutes,
  importRoutes,
  programVersionsRoutes,
  generatedSessionsRoutes,
  uxEventsRoutes,
} from "./routes/misc";
import { opsRoutes } from "./routes/ops";

const app = new Hono<AppEnv>();

// Request logging for every route (the Hono replacement for withApiLogging).
app.use("*", apiLogger);

// --- health (no auth) — pings the DB so monitors don't read healthy while every
// real request 500s. systemd uses process liveness (Type=simple), not this
// endpoint, so a DB blip here won't trigger a restart loop. ---
app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, service: "ironlog-api", db: "ok" });
  } catch (e) {
    logError("api.health_db_check_failed", { error: e });
    return c.json({ ok: false, service: "ironlog-api", db: "down" }, 503);
  }
});

// --- auth group (login/signup/me/logout/password/account/password-reset/
// email-verification/sessions) ---
app.route("/api/auth", authRoutes);

// --- logs group (GET/POST /api/logs, GET /api/logs/calendar, GET/PATCH/DELETE
// /api/logs/:logId) ---
app.route("/api/logs", logsRoutes);

// --- stats group (GET /api/stats/{e1rm,bundle,volume-series,prs,
// strength-summary,volume}) ---
app.route("/api/stats", statsRoutes);

// --- exercises group (GET/POST /api/exercises, GET /api/exercises/categories,
// POST /api/exercises/alias, PATCH/DELETE /api/exercises/:exerciseId) ---
app.route("/api/exercises", exercisesRoutes);

// --- settings group (GET/PATCH /api/settings, POST /api/settings/clear-cache,
// POST /api/settings/app-reset) ---
app.route("/api/settings", settingsRoutes);

// --- plans group (GET/POST /api/plans, PATCH/DELETE /api/plans/:planId,
// POST /api/plans/:planId/{generate,overrides}) ---
app.route("/api/plans", plansRoutes);

// --- misc TUI-used routes ---
app.route("/api/templates", templatesRoutes); // GET — program store list
app.route("/api/home", homeRoutes); // GET — today/home bootstrap
app.route("/api/export", exportRoutes); // GET — JSON/CSV data download
app.route("/api/me/import", importRoutes); // POST — data import (dryRun/replace)
app.route("/api/program-versions", programVersionsRoutes); // PUT — edit version
app.route("/api/generated-sessions", generatedSessionsRoutes); // GET — session list
app.route("/api/ux-events", uxEventsRoutes); // POST — UX telemetry ingest
app.route("/api/ops", opsRoutes); // GET/POST /sessions/prune — infra (WORKOUT_OPS_TOKEN)

// --- consistent JSON for unmatched routes + any error that escapes a handler's
// own try/catch (e.g. a DB failure inside requireAuth/apiLogger middleware). ---
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  logError("api.unhandled_error", {
    error: err,
    method: c.req.method,
    route: new URL(c.req.url).pathname,
  });
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.APPS_API_HOST?.trim() || undefined;
serve({ fetch: app.fetch, port, hostname }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ironlog-api listening on :${info.port}`);
});
