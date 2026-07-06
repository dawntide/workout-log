import { cookies } from "next/headers";
import { and, desc, eq, gte } from "drizzle-orm";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { db } from "@workout/core/db/client";
import { generatedSession, plan, workoutLog } from "@workout/core/db/schema";

type SerializedPlan = {
  id: string;
  userId: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
  params: Record<string, unknown> | null;
  createdAt: string;
};

type SerializedGeneratedSession = {
  id: string;
  sessionKey: string;
  updatedAt: string;
};

type SerializedWorkoutLog = {
  id: string;
  performedAt: string;
  generatedSessionId: string | null;
};

export type CalendarPageBootstrap = {
  initialPlans: SerializedPlan[];
  initialSessions: SerializedGeneratedSession[];
  initialLogs: SerializedWorkoutLog[];
  initialTimezone: string;
  initialToday: string;
};

function dateOnlyInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((part) => part.type === "year")?.value ?? "1970";
  const m = parts.find((part) => part.type === "month")?.value ?? "01";
  const d = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export async function getCalendarPageBootstrap(): Promise<CalendarPageBootstrap> {
  const userId = await requireAuthenticatedUserId();
  const cookieStore = await cookies();
  const timezone = cookieStore.get("timezone")?.value ?? "UTC";

  const now = new Date();
  const today = dateOnlyInTimezone(now, timezone);
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [plans, recentSessions, recentLogs] = await Promise.all([
    db
      .select()
      .from(plan)
      .where(eq(plan.userId, userId))
      .orderBy(desc(plan.createdAt)),
    db
      .select({
        id: generatedSession.id,
        sessionKey: generatedSession.sessionKey,
        updatedAt: generatedSession.updatedAt,
      })
      .from(generatedSession)
      .where(
        and(
          eq(generatedSession.userId, userId),
          gte(generatedSession.updatedAt, threeMonthsAgo),
        ),
      )
      .orderBy(desc(generatedSession.updatedAt))
      .limit(300),
    db
      .select({
        id: workoutLog.id,
        performedAt: workoutLog.performedAt,
        generatedSessionId: workoutLog.generatedSessionId,
      })
      .from(workoutLog)
      .where(
        and(eq(workoutLog.userId, userId), gte(workoutLog.performedAt, threeMonthsAgo)),
      )
      .orderBy(desc(workoutLog.performedAt))
      .limit(300),
  ]);

  return {
    initialPlans: plans.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      name: entry.name,
      type: entry.type,
      params: entry.params as Record<string, unknown> | null,
      createdAt: entry.createdAt.toISOString(),
    })),
    initialSessions: recentSessions.map((entry) => ({
      id: entry.id,
      sessionKey: entry.sessionKey,
      updatedAt: entry.updatedAt.toISOString(),
    })),
    initialLogs: recentLogs.map((entry) => ({
      id: entry.id,
      performedAt: entry.performedAt.toISOString(),
      generatedSessionId: entry.generatedSessionId ?? null,
    })),
    initialTimezone: timezone,
    initialToday: today,
  };
}
