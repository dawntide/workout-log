/**
 * Google OAuth 2.0 helper (no SDK, fetch-based).
 *
 * Authorization Code flow + PKCE (RFC 7636). 서버에서 client_secret을
 * 보유하지만, 권장 모범 사례를 따라 PKCE도 함께 사용해 코드 가로채기
 * 공격에 추가 방어막을 둔다.
 *
 * 환경변수 (모두 미설정이면 OAuth 비활성):
 * - GOOGLE_OAUTH_CLIENT_ID
 * - GOOGLE_OAUTH_CLIENT_SECRET
 * - WORKOUT_APP_URL (callback redirect 절대 URL 생성에 사용; 미설정 시
 *   요청 헤더의 origin 기반 fallback)
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ALLOWED_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function isGoogleOAuthConfigured(): boolean {
  // Vercel preview는 배포마다 도메인이 달라 WORKOUT_APP_URL 고정 콜백과
  // 어긋난다 → start가 preview 도메인에 심은 state 쿠키를 콜백(다른 도메인)이
  // 못 읽어 항상 state_mismatch로 실패한다. OAuth가 구조적으로 불가하므로
  // 버튼을 숨긴다. preview는 이메일/비밀번호로, OAuth는 로컬/production에서 검증.
  if (process.env.VERCEL_ENV === "preview") return false;
  return Boolean(
    (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim() &&
      (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim(),
  );
}

export function resolveGoogleOAuthConfig(req: Request): GoogleOAuthConfig | null {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;

  const appUrl = (process.env.WORKOUT_APP_URL ?? "").trim();
  let baseUrl = appUrl;
  if (!baseUrl) {
    try {
      baseUrl = new URL(req.url).origin;
    } catch {
      return null;
    }
  }
  const redirectUri = `${baseUrl.replace(/\/$/, "")}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthorizeUrl({
  config,
  state,
  codeChallenge,
  scope = "openid email profile",
}: {
  config: GoogleOAuthConfig;
  state: string;
  codeChallenge: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
  refresh_token?: string;
};

export async function exchangeGoogleCode({
  config,
  code,
  codeVerifier,
}: {
  config: GoogleOAuthConfig;
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`google token exchange failed (${response.status}): ${text.slice(0, 256)}`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/**
 * Google ID token (JWT)을 RS256 서명 검증하고 클레임을 반환한다.
 *
 * - JWKS는 1시간 메모리 캐시
 * - iss / aud / exp 검증
 * - 검증된 sub/email/email_verified/name을 반환해 userinfo 호출을 대체할 수
 *   있게 한다 (callback 라우트에서 fallback 패턴으로 사용)
 */
export async function verifyGoogleIdToken({
  idToken,
  clientId,
}: {
  idToken: string;
  clientId: string;
}): Promise<GoogleUserInfo> {
  const { fetchJwks, findJwk } = await import("@/server/auth/jwks");
  const { verifyJwtRs256, importRsaPublicKeyFromJwk, decodeJwt } = await import(
    "@/server/auth/jwt-verify"
  );

  // Pre-decode header to find kid
  const decoded = decodeJwt(idToken);
  const kid = decoded.header.kid;
  if (!kid) throw new Error("google id token missing kid");

  const jwks = await fetchJwks({ url: JWKS_URL });
  const jwk = findJwk(
    jwks,
    (k) => k.kid === kid && (k.alg ?? "RS256") === "RS256",
  );
  if (!jwk) throw new Error(`google id token: no matching JWK for kid=${kid}`);
  const key = await importRsaPublicKeyFromJwk(jwk);

  const payload = await verifyJwtRs256(idToken, async () => key);

  // Claim checks
  if (typeof payload.iss !== "string" || !ALLOWED_ISSUERS.has(payload.iss)) {
    throw new Error(`google id token: bad issuer ${String(payload.iss)}`);
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) {
    throw new Error("google id token: aud mismatch");
  }
  const sub = String(payload.sub ?? "");
  if (!sub) throw new Error("google id token: missing sub");

  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    email_verified:
      typeof payload.email_verified === "boolean"
        ? payload.email_verified
        : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture:
      typeof payload.picture === "string"
        ? (payload.picture as string)
        : undefined,
  };
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`google userinfo failed (${response.status}): ${text.slice(0, 256)}`);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const sub = String(json.sub ?? "");
  if (!sub) throw new Error("google userinfo missing sub");
  return {
    sub,
    email: typeof json.email === "string" ? json.email : undefined,
    email_verified:
      typeof json.email_verified === "boolean"
        ? json.email_verified
        : undefined,
    name: typeof json.name === "string" ? json.name : undefined,
    picture: typeof json.picture === "string" ? json.picture : undefined,
  };
}
