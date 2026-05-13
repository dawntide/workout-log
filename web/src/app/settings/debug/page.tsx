import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { plan } from "@/server/db/schema";
import { getAuthenticatedUserId } from "@/server/auth/user";
import { getSettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { DebugContent } from "./debug-content";

async function fetchPlansForThresholds() {
  const userId = getAuthenticatedUserId();
  const rows = await db
    .select({ id: plan.id, name: plan.name, type: plan.type })
    .from(plan)
    .where(eq(plan.userId, userId))
    .orderBy(desc(plan.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as "SINGLE" | "COMPOSITE" | "MANUAL",
  }));
}

export default async function SettingsDebugPage() {
  const [snapshot, plans] = await Promise.all([
    getSettingsSnapshot(),
    fetchPlansForThresholds(),
  ]);
  return <DebugContent initialSnapshot={snapshot} initialPlans={plans} />;
}
