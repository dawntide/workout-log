import { desc, eq } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { planProgressEvent } from "@workout/core/db/schema";

import {
  buildProgressionFeedbackFromEvent,
  type FeedbackLocale,
  type ProgressReportRow,
} from "./feedback-catalog";

/**
 * 누적 판정 이력 — "지난 두 달 동안 스쿼트가 몇 번 리셋됐나"에 답한다.
 *
 * 판정 카드는 다음 세션을 시작하면 사라진다(수명 설계상 의도된 동작). 그래서 지나간
 * 판정을 되짚을 화면이 없었고, 누적 목록은 REF5 엔진 상태에만 있었다
 * (계획서 docs/judgment-history-and-roadmap-plan.md §2.2).
 *
 * **문구를 여기서 만들지 않는다.** 이벤트 행을 `buildProgressionFeedbackFromEvent`에
 * 그대로 통과시킨다 — 그 함수가 REF5의 `meta.changes` 계보와 나머지의
 * `targetDecisions` 계보를 이미 갈라서 처리하고, 로케일 문구까지 조립한다. 이력이
 * 문구를 복제하기 시작하면 카드와 이력이 같은 판정을 다르게 말하게 된다.
 */

export type JudgmentHistoryEntry = {
  eventId: string;
  createdAt: string;
  eventType: string;
  programSlug: string;
  /** 카탈로그가 조립한 제목(예: "진행 판정 — 무게 변경 요약", "REF5 창 판정"). */
  title: string;
  rows: ProgressReportRow[];
};

/** 훑을 이벤트 수 상한. 표시 개수보다 넉넉히 읽어 보고할 게 없는 이벤트를 흡수한다. */
const SCAN_LIMIT = 200;

export async function readJudgmentHistory(input: {
  planId: string;
  locale: FeedbackLocale;
  limit?: number;
  /** 비-REF5 프로그램 판정에 필요한 루트 DSL. 없으면 slug만으로 해석한다. */
  definition?: unknown;
}): Promise<JudgmentHistoryEntry[]> {
  const planId = String(input.planId ?? "").trim();
  if (!planId) return [];
  const limit = Math.min(50, Math.max(1, Math.round(input.limit ?? 20)));

  const rows = await db
    .select({
      id: planProgressEvent.id,
      eventType: planProgressEvent.eventType,
      programSlug: planProgressEvent.programSlug,
      reason: planProgressEvent.reason,
      meta: planProgressEvent.meta,
      createdAt: planProgressEvent.createdAt,
    })
    .from(planProgressEvent)
    .where(eq(planProgressEvent.planId, planId))
    .orderBy(desc(planProgressEvent.createdAt))
    .limit(SCAN_LIMIT);

  const out: JudgmentHistoryEntry[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    // 보고할 판정이 없는 이벤트(변경 없는 HOLD·세션 전진만 한 이벤트)는 report가 null이다.
    // 카드가 생략하는 것과 같은 기준이라, 이력에도 노이즈가 쌓이지 않는다.
    const { report } = buildProgressionFeedbackFromEvent(
      { eventRow: row, definition: input.definition },
      input.locale,
    );
    if (!report) continue;
    out.push({
      eventId: report.eventId,
      createdAt: row.createdAt.toISOString(),
      eventType: row.eventType,
      programSlug: row.programSlug,
      title: report.title,
      rows: report.rows,
    });
  }
  return out;
}
