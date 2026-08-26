import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { plan } from "@workout/core/db/schema";
import { isAdminRequest, requireAuthenticatedUserId } from "@/server/auth/user";
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
  // 관리자 표면 — 더보기 화면의 링크를 숨기는 것과 별개로 여기서 막는다. 링크가 없어도
  // URL은 남으므로 UI 게이트만으로는 경계가 되지 않는다. 403 대신 404로 접어 존재를 숨긴다.
  if (!(await isAdminRequest())) notFound();

  const [snapshot, plans] = await Promise.all([
    getSettingsSnapshot(),
    fetchPlansForThresholds(),
  ]);
  return <DebugContent initialSnapshot={snapshot} initialPlans={plans} />;
}
