import { errorMessage } from "@/lib/error-message";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser, authOauthAccount } from "@workout/core/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

const PASSWORD_HASH_PREFIX = "pbkdf2$";

function maskSubject(subject: string): string {
  if (subject.length <= 8) return subject;
  return `${subject.slice(0, 4)}…${subject.slice(-4)}`;
}

async function GETImpl(_req: Request) {
  void _req;
  try {
    const userId = await requireAuthenticatedUserId();

    const [accounts, userRow] = await Promise.all([
      db
        .select({
          id: authOauthAccount.id,
          provider: authOauthAccount.provider,
          providerSubject: authOauthAccount.providerSubject,
          email: authOauthAccount.email,
          emailVerified: authOauthAccount.emailVerified,
          createdAt: authOauthAccount.createdAt,
        })
        .from(authOauthAccount)
        .where(eq(authOauthAccount.userId, userId))
        .orderBy(desc(authOauthAccount.createdAt)),
      db
        .select({ passwordHash: appUser.passwordHash })
        .from(appUser)
        .where(eq(appUser.id, userId))
        .limit(1),
    ]);

    const hasPassword = Boolean(
      userRow[0]?.passwordHash?.startsWith(PASSWORD_HASH_PREFIX),
    );

    return NextResponse.json({
      hasPassword,
      items: accounts.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerSubjectMasked: maskSubject(row.providerSubject),
        email: row.email,
        emailVerified: row.emailVerified,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (errorMessage(e)?.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("api.handler_error", { error: e, route: "auth.oauth.accounts.list" });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);
