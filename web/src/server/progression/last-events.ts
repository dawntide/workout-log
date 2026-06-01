import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { planProgressEvent } from "@/server/db/schema";

export type LastTargetEvent = {
  lastDeltaKg: number | null;
  lastEventType: "INCREASE" | "HOLD" | "RESET" | null;
};

const RECENT_EVENT_LIMIT = 20;
const roundDelta = (value: number) => Math.round(value * 100) / 100;

/**
 * 최근 progress_event의 meta.targetDecisions에서 progressionTarget별 "마지막 변동"을 추출한다.
 * cycle-overview route의 동일 계산(최근 이벤트의 before/after.workKg 차이)을 공용 헬퍼로 빼,
 * progression-state 등 다른 표시 경로에서도 재사용한다.
 *
 * 반환 Map의 key는 canonical progressionTarget(SQUAT/BENCH/DEADLIFT/OHP/PULL 등) 대문자.
 * 같은 target이 여러 번 등장하면 가장 최근(=createdAt desc 첫 등장) 것만 채택한다.
 */
export async function readLastTargetEvents(
  planId: string | null | undefined,
): Promise<Map<string, LastTargetEvent>> {
  const out = new Map<string, LastTargetEvent>();
  const trimmed = String(planId ?? "").trim();
  if (!trimmed) return out;

  const recentEvents = await db
    .select({ meta: planProgressEvent.meta })
    .from(planProgressEvent)
    .where(eq(planProgressEvent.planId, trimmed))
    .orderBy(desc(planProgressEvent.createdAt))
    .limit(RECENT_EVENT_LIMIT);

  for (const event of recentEvents) {
    const decisions = (event.meta as Record<string, unknown> | null)?.targetDecisions;
    if (!Array.isArray(decisions)) continue;
    for (const decision of decisions) {
      if (!decision || typeof decision !== "object") continue;
      const d = decision as Record<string, unknown>;
      const target = String(d.progressionTarget ?? d.target ?? "").toUpperCase();
      if (!target || out.has(target)) continue;
      const eventType = String(d.eventType ?? "").toUpperCase();
      if (eventType !== "INCREASE" && eventType !== "HOLD" && eventType !== "RESET") continue;
      const before = d.before as Record<string, unknown> | undefined;
      const after = d.after as Record<string, unknown> | undefined;
      const beforeKg = Number(before?.workKg);
      const afterKg = Number(after?.workKg);
      const lastDeltaKg =
        Number.isFinite(beforeKg) && Number.isFinite(afterKg)
          ? roundDelta(afterKg - beforeKg)
          : null;
      out.set(target, { lastDeltaKg, lastEventType: eventType });
    }
  }
  return out;
}
