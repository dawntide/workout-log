import type { Context, Next } from "hono";
import { findActiveSession, SESSION_COOKIE_NAME } from "@/server/auth/session";

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

/** requireAuth rejects with 401 unless the request carries a valid session. */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = sessionToken(c);
  const session = token ? await findActiveSession(token) : null;
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("userId", session.userId);
  await next();
}
