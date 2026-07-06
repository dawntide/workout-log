import { errorMessage } from "@/lib/error-message";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser, authOauthAccount } from "@workout/core/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { assertSameOrigin } from "@/server/auth/origin";
import { logAuthEvent } from "@workout/core/auth/security-events";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

const PASSWORD_HASH_PREFIX = "pbkdf2$";
const SUPPORTED_PROVIDERS = new Set(["google"]);

async function DELETEImpl(
  req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  try {
    const userId = await requireAuthenticatedUserId();
    const { provider } = await context.params;

    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return NextResponse.json(
        { error: `unsupported provider: ${provider}` },
        { status: 400 },
      );
    }

    const userRow = await db
      .select({ passwordHash: appUser.passwordHash })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    const hasPassword = Boolean(
      userRow[0]?.passwordHash?.startsWith(PASSWORD_HASH_PREFIX),
    );
    if (!hasPassword) {
      return NextResponse.json(
        {
          error:
            "Set a password before unlinking your only sign-in method. Use the password-reset flow with your email.",
          code: "PASSWORD_REQUIRED",
        },
        { status: 409 },
      );
    }

    const result = await db
      .delete(authOauthAccount)
      .where(
        and(
          eq(authOauthAccount.userId, userId),
          eq(authOauthAccount.provider, provider),
        ),
      );
    const removed =
      typeof (result as { rowCount?: number | null })?.rowCount === "number"
        ? (result as { rowCount: number }).rowCount
        : null;

    await logAuthEvent({
      userId,
      eventType: "OAUTH_LINK",
      req,
      success: true,
      meta: { provider, action: "unlink", removed },
    }).catch(() => {});

    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    if (errorMessage(e)?.startsWith("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("api.handler_error", {
      error: e,
      route: "auth.oauth.accounts.unlink",
    });
    return apiErrorResponse(e);
  }
}

export const DELETE = withApiLogging(DELETEImpl);
