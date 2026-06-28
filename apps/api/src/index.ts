import { serve } from "@hono/node-server";
import { Hono } from "hono";

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

const app = new Hono<AppEnv>();

// Request logging for every route (the Hono replacement for withApiLogging).
app.use("*", apiLogger);

// --- health (no auth, no DB) ---
app.get("/health", (c) => c.json({ ok: true, service: "ironlog-api" }));

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

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ironlog-api listening on :${info.port}`);
});
