# ironlog-api (apps/api)

Standalone **Hono** backend (Node + Drizzle + node-postgres) that reuses the
shared business logic in `web/src/server/**` and exposes it with **token (Bearer)
auth** — so non-browser clients (the Go TUI in `apps/tui`) authenticate cleanly
without the cookie-scraping hack.

## Status: B1 — all TUI-used data routes ported (auth-rest is the remaining TUI gap)
- Reuses `web/src/server` source via the `@/*` → `../../web/src/*` tsconfig alias.
  Web stays untouched apart from **additive, non-breaking** shared helpers
  (`server/db/ops.ts`, `getSettingsSnapshotForUser`) and one resilience tweak
  (`resolveRequestLocale` falls back to the default locale outside a request
  scope instead of throwing); physical extraction to `packages/core` is a later phase.
- Auth: `Authorization: Bearer <token>` **or** the `wl_session` cookie, both
  validated by the existing `auth_session` token (`findActiveSession`).
- Routes:
  - `GET /health`, `POST /api/auth/login` (mints + returns a token),
    `GET /api/auth/me`.
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
    (replaces the B0 vertical-slice `GET /api/plans`). Deferred to a later
    sub-group (TUI-unused): `progression-state`, `runtime-targets`,
    `cycle-overview`.
  - **misc** (`src/routes/misc.ts`, the remaining TUI-used routes, each a
    sub-app at its own prefix): `GET /api/templates` (program-store list),
    `GET /api/home` (today/home bootstrap), `GET /api/export` (JSON/CSV data
    download), `POST /api/me/import` (data import, dryRun/replace). Deferred
    (web-only / TUI-unused): `generated-sessions`, `program-versions`,
    `templates/[slug]` + fork, `ux-events`, `ops/*`.
- Next-isms are replaced by `src/lib/http.ts`: `requireAuth` supplies the user
  id (no `cookies()`), `apiError`/`resolveLocale`/`normalizeTimezone` stand in
  for `apiErrorResponse`/`resolveRequestLocale`, and `apiLogger` replaces the
  `withApiLogging` request wrapper.
- Remaining: the **auth group** beyond login/me (signup, logout, account,
  password, password/reset, email verification, sessions) — the last TUI-used
  surface — plus web-only deferrals (stats UX telemetry, plans
  progression-state/runtime-targets/cycle-overview, generated-sessions,
  program-versions, templates/[slug]+fork, ux-events, ops/*).

## Run
```bash
pnpm -C apps/api install
DATABASE_URL=... pnpm -C apps/api start   # PORT defaults to 8787
# curl http://localhost:8787/health
# curl -H "Authorization: Bearer <token>" http://localhost:8787/api/auth/me
```

`DATABASE_URL` is the same Postgres connection string the web app uses.

## Roadmap
- **B1**: logs ✅, stats ✅ (core), exercises ✅, settings ✅, plans ✅ (core), misc ✅ (templates/home/export/import) — then the auth group (signup/logout/account/password/sessions/…) to close the last TUI-used surface.
- **B2**: deploy independently (VPS/Railway) + point the TUI at it via Bearer; optionally migrate web client calls.
- **B-extract**: move `web/src/server` → `packages/core` for a clean shared package (repo-wide import rewrite).
