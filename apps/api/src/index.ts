import { serve } from "@hono/node-server";

import { app } from "./app";

// ─────────────────────────────────────────────────────────────────────────────
// Standalone (separated) hosting entry — a long-lived node process behind Caddy
// on the VPS, driven by systemd/Docker (see deploy/DEPLOY.md).
//
// This file is the ONLY node-server-specific code in apps/api. The routes live
// in ./app, which web can also mount in-process on Vercel, so switching between
// the two topologies never touches a handler. Keep `@hono/node-server` imports
// confined here — pulling them into ./app would drag a node-only server into
// web's serverless bundle.
// ─────────────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.APPS_API_HOST?.trim() || undefined;
serve({ fetch: app.fetch, port, hostname }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`ironlog-api listening on :${info.port}`);
});
