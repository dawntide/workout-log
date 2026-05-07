import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { authSession, appUser } from "@/server/db/schema";

const SESSION_COOKIE = "wl_session";
const TOKEN_BYTE_LENGTH = 32;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

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
  expiresAt: Date;
};

export async function createSession(userId: string): Promise<SessionRecord> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSession).values({
    token,
    userId,
    expiresAt,
  });
  return { token, userId, expiresAt };
}

export async function findActiveSession(
  token: string,
): Promise<{ userId: string } | null> {
  if (!token) return null;
  const rows = await db
    .select({ userId: authSession.userId, expiresAt: authSession.expiresAt })
    .from(authSession)
    .where(
      and(eq(authSession.token, token), gt(authSession.expiresAt, new Date())),
    )
    .limit(1);
  const r = rows[0];
  if (!r) return null;
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
