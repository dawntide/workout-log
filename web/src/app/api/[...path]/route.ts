import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/locale-cookie";

// Catch-all for web /api/* data routes. The backend (apps/api, Hono) can be
// hosted two ways and this handler is the switch between them:
//
//   APPS_API_BASE set   → proxy mode: forward to a separately deployed apps/api
//                         (VPS/systemd, or the CI job that boots it on :8787).
//   APPS_API_BASE unset → in-process mode: mount the same Hono app inside this
//                         Next server (`app.fetch`), no network hop.
//
// Both modes normalize the request identically — cookie → `Authorization:
// Bearer`, app locale → `Accept-Language` — so handlers cannot tell which
// topology they are running under, and switching is an env change with no code
// change. Splitting the backend back out later is therefore just re-setting
// APPS_API_BASE, which is also the rollback lever if in-process hosting
// misbehaves in production.
//
// The web cookie value and the apps/api session token are the SAME auth_session
// row, so no exchange is needed. Concrete route.ts files always win over this
// catch-all (Next.js: static > dynamic > catch-all), so auth/ops/web-resident
// routes stay in web; only the ported data routes fall through here.

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

// Deferred so proxy-mode deployments never evaluate the backend module (and its
// DB client) at all; cached so in-process mode pays the import once per lambda.
let backendApp: Promise<{ app: { fetch: (req: Request) => Response | Promise<Response> } }> | null =
  null;
function loadBackendApp() {
  backendApp ??= import("@workout/api/app");
  return backendApp;
}

/**
 * Request normalization shared by both modes: drop hop-by-hop headers, carry the
 * session as a Bearer token, and pin the response language to the locale the
 * user picked in the app.
 */
async function upstreamHeaders(req: Request): Promise<Headers> {
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
  // 브라우저 OS 언어가 아니라 앱에서 고른 언어가 서버 조립 피드백·오류 문구의
  // 기준이다. 이 값을 덮지 않으면 한국어 UI 안에 영어 API 카피가 섞인다.
  const appLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (appLocale === "ko" || appLocale === "en") {
    headers.set("accept-language", appLocale);
  }
  return headers;
}

/**
 * Body handling shared by both modes. Returns `null` when the caller should
 * answer 204 immediately (a telemetry beacon that died with the tab).
 */
async function upstreamBody(
  req: Request,
  url: URL,
): Promise<{ body?: BodyInit; stream: boolean } | null> {
  if (req.method === "GET" || req.method === "HEAD") return { stream: false };

  // pagehide keepalive 요청을 상류 스트림과 직접 결합하면 탭 종료 시 중간 abort가
  // 본문 파서를 5xx로 만들 수 있다. 작은 텔레메트리만 먼저 버퍼링한다.
  const isUxTelemetry =
    url.pathname === "/api/ux-events" || url.pathname === "/api/ux-events/public";
  if (isUxTelemetry) {
    try {
      return { body: await req.arrayBuffer(), stream: false };
    } catch {
      // 선택적 텔레메트리는 다음 동기화 때 재시도된다. 사용자 화면에는 오류를 남기지 않는다.
      return null;
    }
  }

  // 대용량 export/import를 버퍼링 없이 흘려보낸다.
  return { body: req.body ?? undefined, stream: true };
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const headers = await upstreamHeaders(req);
  const bodySpec = await upstreamBody(req, url);
  if (!bodySpec) return new Response(null, { status: 204 });

  // `duplex: "half"` is required to stream a request body via undici; it isn't
  // in the DOM RequestInit type yet.
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };
  if (bodySpec.body !== undefined) {
    init.body = bodySpec.body;
    if (bodySpec.stream) init.duplex = "half";
  }

  const base = process.env.APPS_API_BASE;
  if (!base) {
    // In-process: same app object, called directly. No network hop, so no
    // timeout/abort plumbing — Vercel's function limit is the ceiling.
    const { app } = await loadBackendApp();
    return app.fetch(new Request(url, init));
  }

  // No basePath/rewrite in this app, so pathname is already exactly /api/...,
  // which is what apps/api mounts. Forward verbatim (encoding-safe).
  const target = base.replace(/\/$/, "") + url.pathname + url.search;
  init.signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

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
