import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  resolveGoogleOAuthConfig,
  verifyGoogleIdToken,
  type GoogleUserInfo,
} from "@/server/auth/oauth-google";
import { findOrCreateUserFromOAuth } from "@/server/auth/oauth-link";
import { createSession, SESSION_COOKIE_NAME } from "@workout/core/auth/session";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { isSafeRelativePath } from "@/server/auth/oauth-state";
import { sessionCookieSecure } from "@/server/auth/session-cookie";

const STATE_COOKIE = "wl_oauth_state";
const VERIFIER_COOKIE = "wl_oauth_verifier";
const NEXT_COOKIE = "wl_oauth_next";

function clearOAuthFlowCookies(res: NextResponse) {
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(VERIFIER_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
}

function redirectWithError(req: Request, code: string): NextResponse {
  const target = new URL("/login", req.url);
  target.searchParams.set("oauth_error", code);
  const res = NextResponse.redirect(target.toString(), 302);
  clearOAuthFlowCookies(res);
  return res;
}

async function GETImpl(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      await logAuthEvent({
        userId: null,
        eventType: "OAUTH_LOGIN_FAIL",
        req,
        success: false,
        meta: { provider: "google", reason: errorParam },
      }).catch(() => {});
      return redirectWithError(req, errorParam);
    }

    if (!code || !stateParam) {
      return redirectWithError(req, "missing_params");
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(STATE_COOKIE)?.value ?? "";
    const verifier = cookieStore.get(VERIFIER_COOKIE)?.value ?? "";
    const nextRaw = cookieStore.get(NEXT_COOKIE)?.value ?? "/";
    const next = isSafeRelativePath(nextRaw) ? nextRaw : "/";

    if (!expectedState || !verifier || expectedState !== stateParam) {
      await logAuthEvent({
        userId: null,
        eventType: "OAUTH_LOGIN_FAIL",
        req,
        success: false,
        meta: { provider: "google", reason: "state_mismatch" },
      }).catch(() => {});
      return redirectWithError(req, "state_mismatch");
    }

    const config = resolveGoogleOAuthConfig(req);
    if (!config) {
      return redirectWithError(req, "not_configured");
    }

    const tokens = await exchangeGoogleCode({
      config,
      code,
      codeVerifier: verifier,
    }).catch((err: Error) => {
      logError("oauth.token_exchange_failed", { error: err });
      return null;
    });
    if (!tokens) return redirectWithError(req, "token_exchange_failed");

    // Prefer signed ID token verification (RS256 + JWKS). Falls back to
    // userinfo endpoint only when ID token is missing — Google always
    // returns one for the openid scope, so this should be the hot path.
    let profile: GoogleUserInfo | null = null;
    if (tokens.id_token) {
      profile = await verifyGoogleIdToken({
        idToken: tokens.id_token,
        clientId: config.clientId,
      }).catch((err: Error) => {
        logError("oauth.id_token_verify_failed", { error: err });
        return null;
      });
    }
    if (!profile) {
      profile = await fetchGoogleUserInfo(tokens.access_token).catch(
        (err: Error) => {
          logError("oauth.userinfo_failed", { error: err });
          return null;
        },
      );
    }
    if (!profile) return redirectWithError(req, "userinfo_failed");

    const linkResult = await findOrCreateUserFromOAuth({
      provider: "google",
      providerSubject: profile.sub,
      email: profile.email ?? null,
      emailVerified: profile.email_verified === true,
      displayName: profile.name ?? null,
    });

    const session = await createSession(linkResult.userId);

    await logAuthEvent({
      userId: linkResult.userId,
      eventType: linkResult.isNewUser ? "OAUTH_SIGNUP" : "OAUTH_LOGIN",
      req,
      success: true,
      meta: { provider: "google", isNewLink: linkResult.isNewLink },
    }).catch(() => {});

    if (linkResult.isNewLink && !linkResult.isNewUser) {
      await logAuthEvent({
        userId: linkResult.userId,
        eventType: "OAUTH_LINK",
        req,
        success: true,
        meta: { provider: "google" },
      }).catch(() => {});
    }

    const redirectUrl = new URL(next, req.url);
    const res = NextResponse.redirect(redirectUrl.toString(), 302);
    clearOAuthFlowCookies(res);
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure(),
      path: "/",
      expires: session.cookieExpiresAt, // sliding: 쿠키는 절대상한으로 길게(실제 게이트는 DB expiresAt)
    });
    return res;
  } catch (e) {
    logError("api.handler_error", { error: e, route: "auth.google.callback" });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);
