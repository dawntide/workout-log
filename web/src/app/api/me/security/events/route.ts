import { NextResponse } from "next/server";
import { listAuthEventsForUser } from "@/server/auth/security-events";
import { tryAuthenticatedUserId } from "@/server/auth/user";

export async function GET() {
  const userId = await tryAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await listAuthEventsForUser(userId);
  return NextResponse.json({ events });
}
