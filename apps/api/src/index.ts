import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { db } from "@/server/db/client";
import { eq } from "@/server/db/ops";
import { appUser, plan } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth/password";
import { createSession, findUserById } from "@/server/auth/session";

import { requireAuth, type AppEnv } from "./auth";
import { apiLogger } from "./lib/http";
import { logsRoutes } from "./routes/logs";
import { statsRoutes } from "./routes/stats";
import { exercisesRoutes } from "./routes/exercises";

const app = new Hono<AppEnv>();

// Request logging for every route (the Hono replacement for withApiLogging).
app.use("*", apiLogger);

// --- health (no auth, no DB) ---
app.get("/health", (c) => c.json({ ok: true, service: "ironlog-api" }));

// --- auth/login: verify password, mint a session token (returned in the body
// for token clients like the TUI). Mirrors web/src/app/api/auth/login. ---
app.post("/api/auth/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return c.json({ error: "Email and password required" }, 400);
  }
  const rows = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      passwordHash: appUser.passwordHash,
      displayName: appUser.displayName,
      emailVerifiedAt: appUser.emailVerifiedAt,
    })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  const user = rows[0];
  const ok = user && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const session = await createSession(user.id);
  return c.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  });
});

// --- auth/me: the authenticated user ---
app.get("/api/auth/me", requireAuth, async (c) => {
  const user = await findUserById(c.get("userId"));
  return c.json({ user });
});

// --- plans (vertical-slice data read; proves authed DB access) ---
app.get("/api/plans", requireAuth, async (c) => {
  const items = await db
    .select({
      id: plan.id,
      name: plan.name,
      type: plan.type,
      isArchived: plan.isArchived,
      createdAt: plan.createdAt,
    })
    .from(plan)
    .where(eq(plan.userId, c.get("userId")));
  return c.json({ items });
});

// --- logs group (GET/POST /api/logs, GET /api/logs/calendar, GET/PATCH/DELETE
// /api/logs/:logId) ---
app.route("/api/logs", logsRoutes);

// --- stats group (GET /api/stats/{e1rm,bundle,volume-series,prs,
// strength-summary,volume}) ---
app.route("/api/stats", statsRoutes);

// --- exercises group (GET/POST /api/exercises, GET /api/exercises/categories,
// POST /api/exercises/alias, PATCH/DELETE /api/exercises/:exerciseId) ---
app.route("/api/exercises", exercisesRoutes);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ironlog-api listening on :${info.port}`);
});
