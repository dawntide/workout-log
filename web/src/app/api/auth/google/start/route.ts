import { NextResponse } from "next/server";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";
import {
  buildGoogleAuthorizeUrl,
  resolveGoogleOAuthConfig,
} from "@/server/auth/oauth-google";
import {
  createOAuthState,
  createPkceVerifier,
  deriveS256Challenge,
  isSafeRelativePath,
} from "@/server/auth/oauth-state";

const STATE_COOKIE = "wl_oauth_state";
const VERIFIER_COOKIE = "wl_oauth_verifier";
const NEXT_COOKIE = "wl_oauth_next";
const COOKIE_TTL_SECONDS = 600; // 10 minutes

async function GETImpl(req: Request) {
  try {
    const config = resolveGoogleOAuthConfig(req);
    if (!config) {
      return NextResponse.json(
        { error: "Google OAuth is not configured on this server." },
        { status: 501 },
      );
    }

    const url = new URL(req.url);
    const nextParam = url.searchParams.get("next");
    const safeNext = isSafeRelativePath(nextParam) ? (nextParam as string) : "/";

    const state = createOAuthState();
    const verifier = createPkceVerifier();
    const challenge = await deriveS256Challenge(verifier);

    const authorizeUrl = buildGoogleAuthorizeUrl({
      config,
      state,
      codeChallenge: challenge,
    });

    const response = NextResponse.redirect(authorizeUrl, 302);
    const secure = process.env.NODE_ENV === "production";
    const baseCookie = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: COOKIE_TTL_SECONDS,
    };
    response.cookies.set({ ...baseCookie, name: STATE_COOKIE, value: state });
    response.cookies.set({ ...baseCookie, name: VERIFIER_COOKIE, value: verifier });
    response.cookies.set({ ...baseCookie, name: NEXT_COOKIE, value: safeNext });
    return response;
  } catch (e) {
    logError("api.handler_error", { error: e, route: "auth.google.start" });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);
