import type { Context, Next } from "hono";
import { isApiTokenValue } from "@workout/core/auth/api-token";
import { findActiveSession, SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { logError } from "@workout/core/observability/logger";

import { acquireAccountRequestLock } from "./lib/account-lifecycle";

// Variables set on the Hono context by requireAuth.
export type AppEnv = {
  Variables: {
    userId: string;
    /**
     * PAT 요청에만 설정된다(`enforceApiTokenSurface`가 검증 후 싣는다).
     * 세션(웹·TUI)은 내부 클라이언트라 스코프가 없다.
     */
    apiTokenUserId?: string;
    apiTokenScope?: "read" | "read_write";
  };
};

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

/**
 * PAT 경로. 검증·표면 판단은 앱 최상단 미들웨어(`enforceApiTokenSurface`)가 이미
 * 끝냈다 — 여기서는 그 결과를 신원으로 옮긴다. **검증을 두 번 하지 않는다.**
 *
 * 미들웨어를 통과하지 못한 요청은 여기 오지 않고, 통과했는데 컨텍스트가 비어
 * 있다면 미들웨어가 안 걸린 것이므로 401로 막는다(열어 두는 쪽이 아니다).
 */
async function authenticateApiToken(c: Context<AppEnv>, next: Next) {
  const userId = c.get("apiTokenUserId");
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const release = await acquireAccountRequestLock(userId, false);
  try {
    c.set("userId", userId);
    await next();
  } finally {
    release();
  }
}

/** requireAuth rejects with 401 unless the request carries a valid session. */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = sessionToken(c);
  if (token && isApiTokenValue(token)) {
    return authenticateApiToken(c, next);
  }
  if (!token) {
    const userId = localDevUserId();
    if (userId) {
      const exclusive =
        c.req.method === "DELETE" && new URL(c.req.url).pathname === "/api/auth/account";
      const release = await acquireAccountRequestLock(userId, exclusive);
      try {
        c.set("userId", userId);
        await next();
      } finally {
        release();
      }
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
  const exclusive =
    c.req.method === "DELETE" && new URL(c.req.url).pathname === "/api/auth/account";
  const release = await acquireAccountRequestLock(session.userId, exclusive);
  try {
    // The request may have waited behind an account deletion. Revalidate under
    // the lifecycle lock so a session observed just before deletion cannot run
    // a late handler after the cleanup committed.
    let current: Awaited<ReturnType<typeof findActiveSession>>;
    try {
      current = await findActiveSession(token);
    } catch (e) {
      logError("api.session_recheck_failed", { error: e });
      return c.json({ error: "Service temporarily unavailable" }, 503);
    }
    if (!current || current.userId !== session.userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("userId", current.userId);
    await next();
  } finally {
    release();
  }
}
