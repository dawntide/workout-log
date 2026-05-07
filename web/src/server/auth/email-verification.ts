import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailVerificationToken } from "@/server/db/schema";
import { generateAuthTokenPair, sha256Hex } from "./token";

const TOKEN_TTL_MS = 60 * 60_000;

export async function createEmailVerificationToken(userId: string) {
  const { token, tokenHash } = await generateAuthTokenPair();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(emailVerificationToken).values({
    tokenHash,
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function consumeEmailVerificationToken(token: string) {
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const rows = await db
    .update(emailVerificationToken)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationToken.tokenHash, tokenHash),
        isNull(emailVerificationToken.usedAt),
        gt(emailVerificationToken.expiresAt, now),
      ),
    )
    .returning({
      userId: emailVerificationToken.userId,
      expiresAt: emailVerificationToken.expiresAt,
    });
  return rows[0] ?? null;
}
