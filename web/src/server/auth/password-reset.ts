import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { passwordResetToken } from "@/server/db/schema";
import { generateAuthTokenPair, sha256Hex } from "./token";

const TOKEN_TTL_MS = 60 * 60_000;

export async function createPasswordResetToken(userId: string) {
  const { token, tokenHash } = await generateAuthTokenPair();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(passwordResetToken).values({
    tokenHash,
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function consumePasswordResetToken(token: string) {
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const rows = await db
    .update(passwordResetToken)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetToken.tokenHash, tokenHash),
        isNull(passwordResetToken.usedAt),
        gt(passwordResetToken.expiresAt, now),
      ),
    )
    .returning({
      userId: passwordResetToken.userId,
      expiresAt: passwordResetToken.expiresAt,
    });
  return rows[0] ?? null;
}
