import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { authSession, appUser, type UserRole } from "@workout/core/db/schema";
import { acquireActiveAccountMutationLock } from "./account-lifecycle";
import {
  SESSION_IDLE_TTL_MS,
  SESSION_ABSOLUTE_MAX_MS,
  computeSlideTarget,
} from "./session-policy";
import { sessionTokenCandidates, storedSessionToken } from "./session-token";

const SESSION_COOKIE = "wl_session";
const TOKEN_BYTE_LENGTH = 32;

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTE_LENGTH));
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

export type SessionRecord = {
  token: string;
  userId: string;
  /** DB idle 만료(현재 창). 활동마다 슬라이딩된다. */
  expiresAt: Date;
  /** 쿠키 expires에 쓸 값(절대 상한). sliding DB 세션보다 오래 살도록 길게 잡는다. */
  cookieExpiresAt: Date;
};

export async function createSession(userId: string): Promise<SessionRecord> {
  const token = generateToken();
  // DB에는 해시만 둔다. 원문은 반환값(쿠키)으로만 나간다 — session-token.ts 참조.
  const storedToken = await storedSessionToken(token);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_IDLE_TTL_MS);
  const cookieExpiresAt = new Date(now + SESSION_ABSOLUTE_MAX_MS);
  await db.transaction(async (tx) => {
    await acquireActiveAccountMutationLock(tx, userId);
    await tx.insert(authSession).values({
      token: storedToken,
      userId,
      expiresAt,
    });
  });
  return { token, userId, expiresAt, cookieExpiresAt };
}

export async function findActiveSession(
  token: string,
): Promise<{ userId: string; role: UserRole } | null> {
  if (!token) return null;
  const candidates = await sessionTokenCandidates(token);
  const hashedToken = candidates[0];
  const now = new Date();
  const rows = await db
    .select({
      storedToken: authSession.token,
      userId: authSession.userId,
      role: appUser.role,
      expiresAt: authSession.expiresAt,
      createdAt: authSession.createdAt,
    })
    .from(authSession)
    // auth_session.user_id and app_user.id are both uuid — join directly.
    // 권한은 세션이 아니라 계정에서 매 요청 읽는다(이미 join하므로 추가 쿼리 0):
    // 세션에 구우면 승격·강등이 재로그인 전까지 반영되지 않는다.
    .innerJoin(appUser, eq(authSession.userId, appUser.id))
    .where(and(inArray(authSession.token, candidates), gt(authSession.expiresAt, now)))
    .limit(2);
  const r = rows.find((row) => row.storedToken === hashedToken) ?? rows[0];
  if (!r) return null;

  // 전환 전에 평문으로 저장된 행이면 이 자리에서 해시로 바꾼다. best-effort — 실패해도
  // 인증은 막지 않고 다음 요청이 다시 시도한다. 동시 요청이 먼저 바꿨으면 0행 갱신이다.
  let storedToken = r.storedToken;
  if (storedToken !== hashedToken) {
    const upgraded = await db
      .update(authSession)
      .set({ token: hashedToken })
      .where(eq(authSession.token, storedToken))
      .then(() => true)
      .catch(() => false);
    if (upgraded) storedToken = hashedToken;
  }

  // Sliding: 활동 시 idle 창을 연장(절대 상한 clamp, REFRESH_INTERVAL 스로틀).
  // best-effort — 갱신 실패는 인증을 막지 않는다(다음 요청에 재시도).
  const nextExpiry = computeSlideTarget(
    now.getTime(),
    r.expiresAt.getTime(),
    r.createdAt.getTime(),
  );
  if (nextExpiry) {
    await db
      .update(authSession)
      .set({ expiresAt: nextExpiry })
      // 아직 만료 전인 동일 토큰만 — 동시성/경합에 안전(무해).
      .where(and(eq(authSession.token, storedToken), gt(authSession.expiresAt, now)))
      .catch(() => {});
  }
  return { userId: r.userId, role: r.role };
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  const candidates = await sessionTokenCandidates(token);
  await db.delete(authSession).where(inArray(authSession.token, candidates));
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.delete(authSession).where(eq(authSession.userId, userId));
}

/**
 * 만료된 auth_session 행 삭제. sliding 만료로 세션은 연장되지만 만료된 행은 스스로
 * 사라지지 않아 스케줄러가 청소한다(Vercel cron / systemd timer). 호출지가 셋이라
 * (web ops·web cron·apps/api ops) 구현을 여기 하나로 둔다.
 *
 * @returns 삭제된 행 수
 */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await db
    .delete(authSession)
    .where(lt(authSession.expiresAt, new Date()));
  return (result as { rowCount?: number | null })?.rowCount ?? 0;
}

/**
 * prune dry-run — 만료된 세션 수를 센다(모니터링용).
 *
 * count 집계 대신 상한까지 select하고 길이를 센다. 만료 행이 많지 않다는 가정이며,
 * 상한에 닿으면 `truncated`로 알린다(그때는 SQL count로 교체할 시점).
 */
export async function countExpiredSessions(
  limit = 1000,
): Promise<{ expired: number; truncated: boolean }> {
  const rows = await db
    .select({ token: authSession.token })
    .from(authSession)
    .where(lt(authSession.expiresAt, new Date()))
    .limit(limit);
  return { expired: rows.length, truncated: rows.length === limit };
}

export type AuthUserSummary = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  emailVerifiedAt: Date | null;
};

export async function findUserById(
  id: string,
): Promise<AuthUserSummary | null> {
  const rows = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      displayName: appUser.displayName,
      role: appUser.role,
      emailVerifiedAt: appUser.emailVerifiedAt,
    })
    .from(appUser)
    .where(eq(appUser.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 계정 권한만 읽는다. **세션 없이 신원이 정해지는 경로 전용** — 로컬/CI의
 * `WORKOUT_AUTH_USER_ID` 폴백은 auth_session 행이 없어 findActiveSession의 join에
 * 얹을 수 없다. 세션 요청은 이 함수를 부르지 않는다(이미 실려 온다).
 *
 * 행이 없으면 null을 준다. 호출부는 이를 "권한 없음"으로 접어야 한다 — 폴백 uuid가
 * 실재하지 않는 계정을 가리킬 때 관리자로 열리면 안 된다.
 */
export async function findUserRole(userId: string): Promise<UserRole | null> {
  if (!userId) return null;
  const rows = await db
    .select({ role: appUser.role })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  return rows[0]?.role ?? null;
}
