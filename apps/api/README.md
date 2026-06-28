# ironlog-api (apps/api)

Standalone **Hono** backend (Node + Drizzle + node-postgres) that reuses the
shared business logic in `web/src/server/**` and exposes it with **token (Bearer)
auth** — so non-browser clients (the Go TUI in `apps/tui`) authenticate cleanly
without the cookie-scraping hack.

## Status: B1 done + B2 TUI Bearer cutover proven (deploy is the remaining step)
> The TUI's `api` client now authenticates via Bearer (token captured from the
> login/signup/password response body), verified end-to-end: the full
> `apps/tui` `live_test` suite (auth, logs, stats, plans, exercises, settings,
> sessions, password rotation, account deletion, export/import) passes against
> apps/api. `GET /api/auth/me` returns `{user:null}` (200, not 401) to match the
> web contract so a persisted token can be probed on startup. What's left for B2:
> deploy apps/api (container + DATABASE_URL/DB_SCHEMA/WORKOUT_APP_URL/RESEND_*)
> and flip the TUI's default server URL (ldflags) to it.

- Reuses `web/src/server` source via the `@/*` → `../../web/src/*` tsconfig alias.
  Web stays untouched apart from **additive, non-breaking** shared helpers
  (`server/db/ops.ts`, `getSettingsSnapshotForUser`) and one resilience tweak
  (`resolveRequestLocale` falls back to the default locale outside a request
  scope instead of throwing); physical extraction to `packages/core` is a later phase.
- Auth: `Authorization: Bearer <token>` **or** the `wl_session` cookie, both
  validated by the existing `auth_session` token (`findActiveSession`).
- Routes:
  - `GET /health`.
  - **auth** (`src/routes/auth.ts`): `POST /api/auth/{login,signup}` (mint a
    token, returned in the body), `GET /api/auth/me`, `POST /api/auth/logout`,
    `POST /api/auth/password` (change → rotates sessions, returns a fresh token),
    `DELETE /api/auth/account`, `POST /api/auth/password/reset/request`,
    `POST /api/auth/email/verification/request`, `GET`/`DELETE /api/auth/sessions`.
    Token model: the "current session" comes from the `Authorization` header
    (`sessionToken`), not a cookie; `assertSameOrigin` (CSRF) and per-route IP
    rate limiting are dropped for token clients. Deferred (browser/OAuth flows,
    TUI-unused): `email/verify`, `google/*`, `oauth/*`, `password/reset/confirm`,
    `password/setup`.
  - **logs** (`src/routes/logs.ts`): `GET`/`POST /api/logs`,
    `GET /api/logs/calendar`, `GET`/`PATCH`/`DELETE /api/logs/:logId` —
    cursor list, create/replace (shared `upsertWorkoutLogService`), month
    calendar, and detail with server-detected personal records.
  - **stats** (`src/routes/stats.ts`, all GET): `e1rm`, `bundle`,
    `volume-series`, `prs`, `strength-summary`, `volume` — the user-facing
    stats (service-backed where the web routes are; the two inline routes are
    ported verbatim). Deferred to a later sub-group: `page-bootstrap` (SSR
    aggregator, cookie-coupled, unused by the TUI) and the UX telemetry
    endpoints (`ux-snapshot`/`ux-funnel`/`ux-events-summary`/`migration-telemetry`).
  - **exercises** (`src/routes/exercises.ts`): `GET`/`POST /api/exercises`,
    `GET /api/exercises/categories`, `POST /api/exercises/alias`,
    `PATCH`/`DELETE /api/exercises/:exerciseId` — the global exercise dictionary
    (inline CRUD ported verbatim). The web routes are unauthenticated; here they
    require auth (a standalone backend shouldn't expose writes openly, and the
    TUI always sends a token).
  - **settings** (`src/routes/settings.ts`): `GET`/`PATCH /api/settings`
    (user prefs key/value, merged with defaults, with a table-missing fallback),
    `POST /api/settings/clear-cache` (invalidate stats cache),
    `POST /api/settings/app-reset` (destructive hard reset + reseed, confirmToken
    guarded — ported for parity, never exercised by the smoke test).
  - **plans** (`src/routes/plans.ts`): `GET`/`POST /api/plans`,
    `PATCH`/`DELETE /api/plans/:planId`, `POST /api/plans/:planId/generate`
    (session generation via the Next-free program-engine),
    `POST /api/plans/:planId/overrides` — the TUI-critical plan workflow
    (replaces the B0 vertical-slice `GET /api/plans`). Also (web-only, ported for
    completeness): `GET /api/plans/:planId/progression-state`,
    `POST /api/plans/:planId/runtime-targets`,
    `GET /api/plans/:planId/cycle-overview`.
  - **misc** (`src/routes/misc.ts`, each a sub-app at its own prefix):
    `GET`/`DELETE /api/templates` + `POST /api/templates/:slug/fork`
    (program store: list, delete own PRIVATE, fork), `GET /api/home`,
    `GET /api/export` (JSON/CSV), `POST /api/me/import` (dryRun/replace),
    `PUT /api/program-versions/:id` (edit owned version),
    `GET /api/generated-sessions`, `POST /api/ux-events` (telemetry ingest).
  - **ops** (`src/routes/ops.ts`, WORKOUT_OPS_TOKEN admin auth, not user-scoped):
    `GET`/`POST /api/ops/sessions/prune` (count / delete expired sessions — cron).
- Next-isms are replaced by `src/lib/http.ts`: `requireAuth` supplies the user
  id (no `cookies()`), `apiError`/`resolveLocale`/`normalizeTimezone` stand in
  for `apiErrorResponse`/`resolveRequestLocale`, and `apiLogger` replaces the
  `withApiLogging` request wrapper.
- **Every route the TUI calls is ported** (B2 TUI Bearer cutover proven). Web-only
  routes are being ported for a complete backend: plans
  progression-state/runtime-targets/cycle-overview ✅, templates delete/fork ✅,
  program-versions ✅, generated-sessions ✅, ux-events ✅, ops/sessions/prune ✅.
  Intentionally **not** ported (don't fit a headless token API / web-deploy
  specific): `ops/migrations` (reads `process.cwd()/src/.../migrations` — web
  layout), the stats UX telemetry dashboards (ux-snapshot/funnel/events-summary/
  migration-telemetry, ~1.6k lines of web-only analytics), and the auth
  browser/OAuth flows (email/verify, google/*, oauth/*, password/reset/confirm,
  password/setup — redirect/cookie flows). These stay in the web app.

## Run
```bash
pnpm -C apps/api install
DATABASE_URL=... pnpm -C apps/api start   # PORT defaults to 8787
# curl http://localhost:8787/health
# curl -H "Authorization: Bearer <token>" http://localhost:8787/api/auth/me
```

`DATABASE_URL` is the same Postgres connection string the web app uses.

## Roadmap
- **B1** ✅: logs, stats (core), exercises, settings, plans (core), misc (templates/home/export/import), auth — **all TUI-used routes ported**.
- **B2**: TUI Bearer client ✅ (dual-mode, live_test verified) + deploy artifacts ✅
  (`deploy/` — systemd unit, Caddyfile, Dockerfile/compose, `.env.example`, runbook
  `deploy/DEPLOY.md`). Remaining (your infra): run the deploy + flip the TUI default
  server URL (ldflags `defaultBase`) to it.
- **B-extract**: move `web/src/server` → `packages/core` for a clean shared package (repo-wide import rewrite).
