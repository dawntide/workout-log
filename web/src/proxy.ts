import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "wl_session";

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

export function proxy(req: NextRequest) {
  // 1. Public paths bypass session check
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // 2. Dev fallback: WORKOUT_AUTH_USER_ID set → skip session check
  if ((process.env.WORKOUT_AUTH_USER_ID ?? "").trim()) {
    return NextResponse.next();
  }

  // 3. Session cookie check
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  // 4. Not authenticated — API → 401, page → redirect to /login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|images|icons|sw.js|workbox-|manifest).*)",
  ],
};
