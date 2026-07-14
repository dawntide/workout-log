import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { authSession, appUser } from "@workout/core/db/schema";
import { acquireActiveAccountMutationLock } from "./account-lifecycle";
import {
  SESSION_IDLE_TTL_MS,
  SESSION_ABSOLUTE_MAX_MS,
  computeSlideTarget,
} from "./session-policy";

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
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_IDLE_TTL_MS);
  const cookieExpiresAt = new Date(now + SESSION_ABSOLUTE_MAX_MS);
  await db.transaction(async (tx) => {
    await acquireActiveAccountMutationLock(tx, userId);
    await tx.insert(authSession).values({
      token,
      userId,
      expiresAt,
    });
  });
  return { token, userId, expiresAt, cookieExpiresAt };
}

export async function findActiveSession(
  token: string,
): Promise<{ userId: string } | null> {
  if (!token) return null;
  const now = new Date();
  const rows = await db
    .select({
      userId: authSession.userId,
      expiresAt: authSession.expiresAt,
      createdAt: authSession.createdAt,
    })
    .from(authSession)
    // Domain/auth owner ids are intentionally stored as text while app_user.id
    // is uuid. Cast the uuid side explicitly; PostgreSQL cannot compare the two
    // column types implicitly (text = uuid).
    .innerJoin(appUser, sql`${authSession.userId} = ${appUser.id}::text`)
    .where(and(eq(authSession.token, token), gt(authSession.expiresAt, now)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;

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
      .where(and(eq(authSession.token, token), gt(authSession.expiresAt, now)))
      .catch(() => {});
  }
  return { userId: r.userId };
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(authSession).where(eq(authSession.token, token));
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.delete(authSession).where(eq(authSession.userId, userId));
}

export type AuthUserSummary = {
  id: string;
  email: string;
  displayName: string | null;
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
      emailVerifiedAt: appUser.emailVerifiedAt,
    })
    .from(appUser)
    .where(eq(appUser.id, id))
    .limit(1);
  return rows[0] ?? null;
}
