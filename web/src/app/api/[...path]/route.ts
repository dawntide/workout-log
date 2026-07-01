import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/server/auth/session";

// Catch-all proxy: forwards web /api/* to the standalone apps/api (Hono) backend.
// The browser keeps calling same-origin /api/* (httpOnly wl_session cookie sent
// automatically); this server-side handler reads that cookie and re-issues the
// request to APPS_API_BASE with `Authorization: Bearer <token>` — the web cookie
// value and the apps/api session token are the SAME auth_session row, so no
// exchange is needed. Concrete route.ts files always win over this catch-all
// (Next.js: static > dynamic > catch-all), so auth/ops/unported routes stay in
// web; only deleted data routes fall through here.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Hop-by-hop + connection-specific request headers that must not be forwarded.
const STRIP_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "cookie",
]);

// undici has already decoded the upstream body, so forwarding the original
// encoding/length headers would corrupt it.
const STRIP_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"];

const UPSTREAM_TIMEOUT_MS = 55_000;

async function handler(req: Request): Promise<Response> {
  const base = process.env.APPS_API_BASE;
  if (!base) {
    // Fail loud so a missing dev/preview env var is obvious, not a silent 404.
    return Response.json({ error: "APPS_API_BASE is not configured" }, { status: 500 });
  }

  // No basePath/rewrite in this app, so pathname is already exactly /api/...,
  // which is what apps/api mounts. Forward verbatim (encoding-safe).
  const url = new URL(req.url);
  const target = base.replace(/\/$/, "") + url.pathname + url.search;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  // `duplex: "half"` is required to stream a request body via undici (large
  // export/import without buffering); it isn't in the DOM RequestInit type yet.
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    const name = (err as Error | undefined)?.name;
    const timedOut = name === "AbortError" || name === "TimeoutError";
    return Response.json(
      { error: timedOut ? "Upstream timed out" : "Upstream unavailable" },
      { status: timedOut ? 504 : 502 },
    );
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const h of STRIP_RESPONSE_HEADERS) responseHeaders.delete(h);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};
