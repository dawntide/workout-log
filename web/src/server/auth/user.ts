import { cookies } from "next/headers";
import {
  findActiveSession,
  findUserRole,
  SESSION_COOKIE_NAME,
} from "@workout/core/auth/session";
import type { UserRole } from "@workout/core/db/schema";
import { devFallbackUserId } from "./dev-fallback";

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
 * 인증은 됐지만 권한이 모자랄 때. 401(누구인지 모름)과 구분해야 클라이언트가
 * 재로그인으로 오해하지 않는다 — 같은 에러 핸들러가 403으로 매핑한다.
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden: admin role required") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type AuthenticatedUser = { userId: string; role: UserRole };

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
  return (await tryAuthenticatedUser())?.userId ?? null;
}

/**
 * 신원 + 권한을 함께 해석한다. 신원 결정 순서는 tryAuthenticatedUserId와 동일하며
 * (쿠키 세션 → env 폴백), 권한만 각 경로에서 얻는 방식이 다르다.
 */
export async function tryAuthenticatedUser(): Promise<AuthenticatedUser | null> {
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
    // 권한은 이 join에 이미 실려 온다 — 추가 조회 없음.
    const session = await findActiveSession(token);
    if (session) return { userId: session.userId, role: session.role };
  }
  // env fallback은 LOCAL-DEV 편의용(.env.local의 WORKOUT_AUTH_USER_ID)으로,
  // 로그인 없이 앱을 쓸 수 있게 한다. **프로덕션 런타임에서는 명시 opt-in 없이 죽어 있다** —
  // 종전에는 "프로덕션에선 UNSET이어야 한다"는 규율에만 기대고 있었다(devFallbackUserId).
  const env = devFallbackUserId();
  if (env) {
    // 세션이 없어 권한을 계정에서 직접 읽는다. 행이 없으면(폴백 uuid가 실재하지 않는
    // 계정을 가리킴) 일반 사용자로 접는다 — 없는 계정이 관리자로 열리면 안 된다.
    const role = await findUserRole(env);
    return { userId: env, role: role ?? "user" };
  }
  return null;
}

/**
 * 관리자 표면의 서버측 경계. **UI 숨김은 경계가 아니다** — 링크를 지워도 URL은 남으므로
 * 관리자 전용 페이지·API는 반드시 이 함수(또는 isAdminRequest)를 통과해야 한다.
 *
 * @throws UnauthorizedError 미인증(401)
 * @throws ForbiddenError 인증됐으나 admin 아님(403)
 */
export async function requireAdminUserId(): Promise<string> {
  const user = await tryAuthenticatedUser();
  if (!user) throw new UnauthorizedError();
  if (user.role !== "admin") throw new ForbiddenError();
  return user.userId;
}

/**
 * 던지지 않는 관리자 판정. RSC 페이지에서 notFound()로 접을 때 쓴다 —
 * 관리자 표면은 403보다 존재를 숨기는 편이 낫다.
 */
export async function isAdminRequest(): Promise<boolean> {
  const user = await tryAuthenticatedUser();
  return user?.role === "admin";
}
