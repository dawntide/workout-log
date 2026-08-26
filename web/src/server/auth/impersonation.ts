import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser, type UserRole } from "@workout/core/db/schema";

/**
 * 관리자 → 테스트 계정 전환(임시 신원 교체)의 서버측 부품.
 *
 * **설계 요지.** 신원 결정 경로(`findActiveSession`·`requireAuth`)에는 손대지 않는다.
 * 그 코드는 계정 수명주기 락과 재검증이 얽힌 가장 민감한 자리라, 분기를 하나 더 넣는
 * 것보다 **진짜 세션을 발급해 쿠키만 바꿔치는** 편이 안전하다. 전환 중에는 문자 그대로
 * 그 테스트 계정의 사용자이므로 데이터 API 전체가 아무 특수 처리 없이 그대로 돈다.
 */

/**
 * 전환 중 원래 관리자 신원으로 돌아갈 방법을 담아 두는 쿠키.
 *
 * 값은 두 형태다 — 어느 쪽인지 값 자체가 말하게 한다:
 * - `session:<token>` : 쿠키 로그인 관리자. 그 토큰으로 복귀한다(프로덕션 경로).
 * - `env`             : `WORKOUT_AUTH_USER_ID` 폴백으로 관리자인 경우(로컬·CI). 돌아갈
 *                       토큰이 없고, wl_session을 지우면 폴백이 다시 관리자로 인증한다.
 *
 * **쿠키 값은 신뢰하지 않는다.** 복귀 시 서버가 그 토큰이 지금도 살아 있는 관리자
 * 세션인지 다시 확인한다(`/api/admin/impersonate/return`).
 */
export const IMPERSONATION_RETURN_COOKIE = "wl_admin_return";

/** env 폴백 관리자를 나타내는 복귀 마커. */
export const RETURN_MARKER_ENV = "env";
const RETURN_MARKER_SESSION_PREFIX = "session:";

export function sessionReturnMarker(token: string): string {
  return `${RETURN_MARKER_SESSION_PREFIX}${token}`;
}

/** 복귀 마커를 해석한다. 형식이 어긋나면 null(호출부가 400으로 접는다). */
export function parseReturnMarker(
  marker: string,
): { kind: "env" } | { kind: "session"; token: string } | null {
  if (marker === RETURN_MARKER_ENV) return { kind: "env" };
  if (marker.startsWith(RETURN_MARKER_SESSION_PREFIX)) {
    const token = marker.slice(RETURN_MARKER_SESSION_PREFIX.length).trim();
    return token ? { kind: "session", token } : null;
  }
  return null;
}

export async function readReturnMarker(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(IMPERSONATION_RETURN_COOKIE)?.value ?? null;
  } catch {
    // cookies()는 요청 스코프 밖에서 throw할 수 있다.
    return null;
  }
}

/**
 * 전환 중인지 여부. **쿠키 존재만 본다** — 배너를 띄울지 판단하는 용도라 추가 조회를
 * 하지 않는다. 복귀 가능 여부(관리자 세션이 아직 살아 있는지)는 복귀 라우트가 판정한다.
 */
export async function isImpersonating(): Promise<boolean> {
  return (await readReturnMarker()) !== null;
}

/**
 * 로그인이 불가능함을 뜻하는 센티널. `verifyPassword`는 `pbkdf2$…` 형식만 통과시키므로
 * 이 값이 든 계정은 어떤 비밀번호로도 로그인되지 않는다 — 이 계정에 닿는 유일한 길이
 * 관리자의 전환뿐이라는 뜻이다. 시드의 폴백 센티널과 값을 나눠 둔 건 둘의 수명과 의미가
 * 달라서다(그쪽은 로컬 개발 신원, 이쪽은 전환 대상).
 */
const TEST_ACCOUNT_PASSWORD_SENTINEL = "impersonation-only-no-login";

/** 관리자 1명당 테스트 계정 1개. 결정적이라 재호출이 같은 계정을 준다. */
export function testAccountEmailFor(adminUserId: string): string {
  return `test+${adminUserId}@workout.local`;
}

export type TestAccount = { id: string; email: string; role: UserRole };

/**
 * 관리자 전용 테스트 계정을 보장한다(없으면 만든다).
 *
 * 수기 SQL 없이도 기능이 성립해야 해서 여기서 만든다. 만들어지는 계정은 role='test' +
 * 로그인 불가 센티널이라, 존재 자체가 권한을 늘리지 않는다.
 */
export async function ensureTestAccountFor(adminUserId: string): Promise<TestAccount> {
  const email = testAccountEmailFor(adminUserId);

  await db
    .insert(appUser)
    .values({
      email,
      passwordHash: TEST_ACCOUNT_PASSWORD_SENTINEL,
      displayName: "테스트 계정",
      role: "test",
    })
    .onConflictDoNothing({ target: appUser.email });

  const rows = await db
    .select({ id: appUser.id, email: appUser.email, role: appUser.role })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);

  const row = rows[0];
  if (!row) {
    // insert가 no-op이었는데 select도 비었다면 경합이 아니라 실제 이상이다.
    throw new Error(`test account provisioning failed for admin ${adminUserId}`);
  }
  return row;
}
