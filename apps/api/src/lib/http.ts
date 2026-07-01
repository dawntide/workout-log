import type { Context, Next } from "hono";
import { logError, logInfo } from "@/server/observability/logger";

export type Locale = "ko" | "en";

/**
 * Resolve the request locale from `Accept-Language`. Token clients like the Go
 * TUI usually send none, so we default to Korean (the app's primary locale).
 * This replaces the web `resolveRequestLocale`, which reads a cookie via
 * `next/headers` and is unavailable outside a Next request scope.
 */
export function resolveLocale(c: Context): Locale {
  const header = (c.req.header("accept-language") ?? "").trim().toLowerCase();
  return header.startsWith("en") ? "en" : "ko";
}

/**
 * Validate an IANA timezone, falling back to "UTC". Mirrors the `normalizeTimezone`
 * helper duplicated across the web log routes.
 */
export function normalizeTimezone(raw: string | null | undefined): string {
  const tz = raw?.trim();
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Map a thrown error to a JSON response, mirroring the web `apiErrorResponse`:
 * an `UnauthorizedError` becomes 401, anything else 500, with the error message
 * (services throw localized messages) in the body. `requireAuth` already guards
 * authentication, so the 401 branch here is a belt-and-suspenders path.
 */
export function apiError(c: Context, e: unknown, locale: Locale = "ko") {
  logError("api.handler_error", { error: e });
  const fallback =
    locale === "ko"
      ? "알 수 없는 오류가 발생했습니다."
      : "An unknown error occurred.";
  const message = e instanceof Error ? e.message : fallback;
  const isUnauthorized = (e as { name?: string })?.name === "UnauthorizedError";
  return c.json({ error: message }, isUnauthorized ? 401 : 500);
}

/**
 * Request logger middleware — the Hono replacement for the web `withApiLogging`
 * wrapper. Emits the same `api.request` event (method, route, status, latency).
 * Rate limiting is intentionally omitted for now (token clients are trusted).
 */
export async function apiLogger(c: Context, next: Next) {
  const startedAt = process.hrtime.bigint();
  await next();
  const latencyMs =
    Math.round((Number(process.hrtime.bigint() - startedAt) / 1_000_000) * 100) /
    100;
  logInfo("api.request", {
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    status: c.res.status,
    latencyMs,
  });
}
