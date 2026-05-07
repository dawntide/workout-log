import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "wl_session";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/health",
  "/api/ops",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function proxy(req: NextRequest) {
  // 1. Basic Auth (optional, enabled via env vars)
  const basicAuthUser = process.env.BASIC_AUTH_USER;
  const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;

  if (basicAuthUser && basicAuthPassword) {
    const basicAuth = req.headers.get("authorization");
    if (basicAuth) {
      const authValue = basicAuth.split(" ")[1];
      if (authValue) {
        const [user, pwd] = atob(authValue).split(":");
        if (user === basicAuthUser && pwd === basicAuthPassword) {
          // Basic auth passed — fall through to session check below
        } else {
          return new NextResponse("Authentication required", {
            status: 401,
            headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
          });
        }
      } else {
        return new NextResponse("Authentication required", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
        });
      }
    } else {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
      });
    }
  }

  // 2. Public paths bypass session check
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // 3. Dev fallback: WORKOUT_AUTH_USER_ID set → skip session check
  if ((process.env.WORKOUT_AUTH_USER_ID ?? "").trim()) {
    return NextResponse.next();
  }

  // 4. Session cookie check
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  // 5. Not authenticated — API → 401, page → redirect to /login
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
