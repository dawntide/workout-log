import { cookies } from "next/headers";
import { findActiveSession, SESSION_COOKIE_NAME } from "@workout/core/auth/session";

/**
 * 인증된 사용자가 없을 때 던지는 에러. API 에러 핸들러가 이를 HTTP 401로
 * 매핑한다 (web/src/app/api/_utils/error-response.ts +
 * web/src/server/observability/apiRoute.ts 참고).
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: no active session") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Sync variant — env-only. 세션 쿠키를 읽지 않으므로 **도메인 데이터 경로에서
 * 절대 사용하면 안 된다** (모든 사용자가 단일 env 유저로 붕괴됨). 요청 스코프가
 * 없는 코드 경로(배경 작업 / 스크립트)에서만 사용하며, 이 경우
 * WORKOUT_AUTH_USER_ID를 명시적으로 설정해야 한다.
 *
 * 요청 스코프(서버 컴포넌트 / API 라우트 / 서버 액션)에서는
 * {@link requireAuthenticatedUserId}를 사용한다.
 */
export function getAuthenticatedUserId(): string {
  const userId = (process.env.WORKOUT_AUTH_USER_ID ?? "").trim();
  if (!userId) {
    throw new Error(
      "WORKOUT_AUTH_USER_ID is not set. Use requireAuthenticatedUserId() for " +
        "request-scoped code, or set the env var explicitly for background jobs.",
    );
  }
  return userId;
}

/**
 * Cookie session 우선, 없으면 환경변수 fallback.
 * Server components / API routes / server actions에서 사용.
 */
export async function requireAuthenticatedUserId(): Promise<string> {
  const userId = await tryAuthenticatedUserId();
  if (!userId) {
    throw new UnauthorizedError();
  }
  return userId;
}

/**
 * 같은 우선순위지만 미인증 시 null 반환 (UnauthorizedError 던지지 않음).
 * 미들웨어가 보호하지 못하는 영역에서의 graceful fallback에 사용.
 */
export async function tryAuthenticatedUserId(): Promise<string | null> {
  let token: string | undefined;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    // cookies() may throw outside request scope (e.g. background jobs)
  }
  // DB failures must remain observable. Treating them as a missing session
  // masks schema/connection faults as logout and surfaces a misleading 401.
  if (token) {
    const session = await findActiveSession(token);
    if (session) return session.userId;
  }
  // env fallback은 LOCAL-DEV 편의용(.env.local의 WORKOUT_AUTH_USER_ID)으로,
  // 로그인 없이 앱을 쓸 수 있게 한다. 프로덕션에서는 반드시 UNSET이어야 한다 —
  // 설정돼 있으면 미인증 요청이 공유 env 유저로 해석된다.
  const env = (process.env.WORKOUT_AUTH_USER_ID ?? "").trim();
  if (env) return env;
  return null;
}
