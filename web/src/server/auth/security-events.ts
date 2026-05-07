import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { authEventLog } from "@/server/db/schema";

export type AuthEventType =
  | "SIGNUP"
  | "LOGIN"
  | "LOGIN_FAIL"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_CONFIRM"
  | "EMAIL_VERIFICATION_REQUEST"
  | "EMAIL_VERIFICATION_CONFIRM";

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
