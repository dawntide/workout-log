import { desc, eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { authEventLog } from "@workout/core/db/schema";

export type AuthEventType =
  | "SIGNUP"
  | "LOGIN"
  | "LOGIN_FAIL"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_CONFIRM"
  | "EMAIL_VERIFICATION_REQUEST"
  | "EMAIL_VERIFICATION_CONFIRM"
  | "SESSION_REVOKE_OTHERS"
  | "ACCOUNT_DELETE"
  | "OAUTH_LOGIN"
  | "OAUTH_LOGIN_FAIL"
  | "OAUTH_LINK"
  | "OAUTH_SIGNUP"
  | "API_TOKEN_ISSUE"
  | "API_TOKEN_REVOKE"
  // 관리자가 테스트 계정으로 전환/복귀. userId는 **전환을 실행한 관리자**로 남기고
  // 대상 계정은 meta.targetUserId에 둔다 — 감사에서 물어야 할 질문이 "누가 했나"라서다.
  | "IMPERSONATE_START"
  | "IMPERSONATE_END";

export type AuthEventInput = {
  userId?: string | null;
  eventType: AuthEventType;
  req?: Request;
  ip?: string | null;
  success: boolean;
  meta?: Record<string, unknown>;
};

export async function logAuthEvent(input: AuthEventInput): Promise<void> {
  const ip = input.ip ?? input.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? input.req?.headers.get("x-real-ip")
    ?? null;
  const userAgent = input.req?.headers.get("user-agent") ?? null;

  await db.insert(authEventLog).values({
    userId: input.userId ?? null,
    eventType: input.eventType,
    ip,
    userAgent,
    success: input.success,
    meta: input.meta ?? null,
  });
}

export async function listAuthEventsForUser(userId: string) {
  return db
    .select({
      id: authEventLog.id,
      eventType: authEventLog.eventType,
      ip: authEventLog.ip,
      userAgent: authEventLog.userAgent,
      success: authEventLog.success,
      meta: authEventLog.meta,
      createdAt: authEventLog.createdAt,
    })
    .from(authEventLog)
    .where(eq(authEventLog.userId, userId))
    .orderBy(desc(authEventLog.createdAt))
    .limit(50);
}
