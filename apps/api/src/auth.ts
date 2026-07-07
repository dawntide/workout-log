import type { Context, Next } from "hono";
import { findActiveSession, SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { logError } from "@workout/core/observability/logger";

// Variables set on the Hono context by requireAuth.
export type AppEnv = { Variables: { userId: string } };

/**
 * Extract the session token from a request: an `Authorization: Bearer <token>`
 * header (token clients like the Go TUI) OR the `wl_session` cookie (browsers).
 * The same opaque auth_session token backs both — no separate token scheme.
 */
export function sessionToken(c: Context): string {
  const auth = c.req.header("Authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const cookie = c.req.header("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return "";
}

/**
 * Explicit local-dev fallback shared with the Next.js app.
 *
 * This is opt-in and disabled in production so merely setting
 * WORKOUT_AUTH_USER_ID can never bypass API authentication in a deployment.
 */
function localDevUserId(): string {
  if (process.env.NODE_ENV === "production") return "";
  if (process.env.WORKOUT_API_ALLOW_ENV_AUTH !== "1") return "";
  return (process.env.WORKOUT_AUTH_USER_ID ?? "").trim();
}

/** requireAuth rejects with 401 unless the request carries a valid session. */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = sessionToken(c);
  if (!token) {
    const userId = localDevUserId();
    if (userId) {
      c.set("userId", userId);
      await next();
      return;
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
  let session: Awaited<ReturnType<typeof findActiveSession>>;
  try {
    session = await findActiveSession(token);
  } catch (e) {
    // A DB/network failure during session lookup is not an auth failure. Return
    // 503 (not 401) so clients — notably the TUI — don't misread a transient
    // outage as "logged out" and drop a valid session.
    logError("api.session_lookup_failed", { error: e });
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userId", session.userId);
  await next();
}
