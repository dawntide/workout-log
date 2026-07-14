import { NextResponse, type NextRequest } from "next/server";
import {
  findActiveSession,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/health",
  "/api/ops",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export async function proxy(req: NextRequest) {
  // 1. Public paths bypass session check
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // 2. A supplied cookie always follows the real session path. Keeping this
  // ahead of the local-dev fallback also lets CI exercise session revocation
  // while its seed user fallback remains enabled for unrelated smoke tests.
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    // API handlers preserve their own 401 response contract. Page requests need
    // a real active-session check before RSC rendering starts; otherwise a
    // revoked/expired cookie passes this proxy and becomes an error boundary.
    if (pathname.startsWith("/api/")) return NextResponse.next();
    if (await findActiveSession(token)) return NextResponse.next();
    return redirectToLogin(req);
  }

  // 3. Dev fallback: no cookie + WORKOUT_AUTH_USER_ID set → skip session check
  if ((process.env.WORKOUT_AUTH_USER_ID ?? "").trim()) {
    return NextResponse.next();
  }

  // 4. Not authenticated — API → 401, page → redirect to /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return redirectToLogin(req);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon|fonts|images|icons|sw.js|workbox-|manifest|offline.html).*)",
  ],
};
