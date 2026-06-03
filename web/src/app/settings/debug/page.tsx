import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { plan } from "@/server/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import { getSettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { DebugContent } from "./debug-content";

// 인증·사용자별 데이터 페이지 — 정적 prerender 금지(세션 쿠키 기반 요청별 동적 렌더).
export const dynamic = "force-dynamic";

async function fetchPlansForThresholds() {
  const userId = await requireAuthenticatedUserId();
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
