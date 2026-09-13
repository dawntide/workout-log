import { and, eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser, authOauthAccount } from "@workout/core/db/schema";

export type OAuthProvider = "google";

export type OAuthLinkInput = {
  provider: OAuthProvider;
  providerSubject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  /** Supplied only after validating the real session for an explicit link flow. */
  linkingUserId?: string | null;
};

export class OAuthAccountLinkRequiredError extends Error {
  constructor() {
    super("Sign in to the existing account before linking Google.");
    this.name = "OAuthAccountLinkRequiredError";
  }
}

export type OAuthLinkResult = {
  userId: string;
  isNewUser: boolean;
  isNewLink: boolean;
};

/**
 * OAuth 로그인 결과를 받아 사용자 계정을 찾거나 만들고, oauth_account
 * 행을 보장한다.
 *
 * 정책:
 * 1. (provider, providerSubject)로 이미 연결된 계정이 있으면 그 계정 사용
 *    - 이메일이 변경되었다면 oauth_account 메타 갱신
 * 2. 그렇지 않고, provider가 emailVerified=true 인 경우 같은 이메일을 가진
 *    app_user가 있으면 그 계정으로 인증한 명시적 연결만 허용
 * 3. 위 모두 해당 없으면 새 app_user를 만들고(passwordHash="oauth-only" 빈
 *    placeholder) link
 *
 * 주의: emailVerified=false 인 OAuth 응답은 같은 이메일 자동 link를 거부.
 *       이 경우 새 사용자로 가입한다.
 */
export async function findOrCreateUserFromOAuth(
  input: OAuthLinkInput,
): Promise<OAuthLinkResult> {
  return db.transaction(async (tx) => {
    const existingLink = await tx
      .select({
        id: authOauthAccount.id,
        userId: authOauthAccount.userId,
      })
      .from(authOauthAccount)
      .where(
        and(
          eq(authOauthAccount.provider, input.provider),
          eq(authOauthAccount.providerSubject, input.providerSubject),
        ),
      )
      .limit(1);

    if (existingLink[0]) {
      const userId = existingLink[0].userId;
      if (input.linkingUserId && input.linkingUserId !== userId) throw new OAuthAccountLinkRequiredError();
      await tx
        .update(authOauthAccount)
        .set({
          email: input.email,
          emailVerified: input.emailVerified,
          updatedAt: new Date(),
        })
        .where(eq(authOauthAccount.id, existingLink[0].id));
      return { userId, isNewUser: false, isNewLink: false };
    }

    if (input.email && input.emailVerified) {
      const matched = await tx
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, input.email))
        .limit(1);
      if (matched[0]) {
        const userId = matched[0].id;
        // Provider verification proves ownership of Google, not of a password
        // account someone else may have pre-registered with the same email.
        if (input.linkingUserId !== userId) throw new OAuthAccountLinkRequiredError();
        await tx.insert(authOauthAccount).values({
          userId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          email: input.email,
          emailVerified: input.emailVerified,
        });
        return { userId, isNewUser: false, isNewLink: true };
      }
    }

    if (input.linkingUserId) throw new OAuthAccountLinkRequiredError();
    const userEmail = input.email ?? `oauth+${input.providerSubject}@local`;
    const inserted = await tx
      .insert(appUser)
      .values({
        email: userEmail,
        passwordHash: "oauth-only",
        displayName: input.displayName ?? null,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
      })
      .returning({ id: appUser.id });
    const userId = inserted[0]?.id;
    if (!userId) throw new Error("failed to create app_user via oauth");

    await tx.insert(authOauthAccount).values({
      userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      email: input.email,
      emailVerified: input.emailVerified,
    });
    return { userId, isNewUser: true, isNewLink: true };
  });
}
