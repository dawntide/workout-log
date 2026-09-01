import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client";
import { bodyMeasurement, workoutLog, workoutSet } from "./schema";

/**
 * 테스트 계정용 데모 데이터의 **비-기록 부분**과 정리 도구.
 *
 * 예전에는 여기서 운동 기록도 만들었다 — planId 없는 평평한 로그를 12주치. 통계·PR·부위
 * 신선도는 그것으로 채워졌지만 **캘린더에는 아무것도 뜨지 않았고**(캘린더는 planId로만
 * 조회한다) 세션 전환·자동 진행은 검증할 수 없었다.
 *
 * 지금은 기록을 `seedDemoProgramReplay`가 **실제 엔진으로 재생해서** 만든다. 그쪽이 생성
 * 세션·진행 이벤트·런타임 상태까지 진짜로 쌓으므로, 평평한 로그를 함께 두면 통계에서 두
 * 출처가 섞이기만 한다. 그래서 걷어냈다.
 *
 * 체중은 남는다 — 기록에서 파생되는 값이 아니라 **독립 이력**이고, 체중 이력 화면·강도
 * 점수·asymptote 모니터가 세션 시점 체중을 여기서 찾는다.
 */

/** 데모가 만든 기록임을 표시하는 태그. 재실행 시 이 태그만 지우고 다시 만든다. */
export const DEMO_HISTORY_TAG = "demo-seed";

export type SeedDemoBodyweightOptions = {
  userId: string;
  /** 생성할 주 수. 기본 12주(주 1회 측정). */
  weeks?: number;
  /** 기준 시각. 테스트에서 고정할 수 있게 인자로 받는다. */
  now?: Date;
};

export type SeedDemoBodyweightSummary = {
  bodyweightCount: number;
};

/**
 * 주 1회 체중 측정 이력을 만든다.
 *
 * 미래 측정은 넣지 않는다 — 기록과 달리 체중은 하나 빠져도 이력에 구멍이 날 뿐이라,
 * 시각을 당기는 대신 건너뛴다.
 */
export async function seedDemoBodyweightForUser({
  userId,
  weeks = 12,
  now = new Date(),
}: SeedDemoBodyweightOptions): Promise<SeedDemoBodyweightSummary> {
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(9, 0, 0, 0);

  const values: (typeof bodyMeasurement.$inferInsert)[] = [];
  for (let week = 0; week < weeks; week += 1) {
    const measuredAt = new Date(startOfToday);
    measuredAt.setUTCDate(measuredAt.getUTCDate() - (weeks - 1 - week) * 7 - 5);
    if (measuredAt.getTime() > now.getTime()) continue;
    values.push({
      userId,
      kind: "weight",
      valueKg: Math.round((72 + week * 0.15) * 10) / 10,
      measuredAt,
    });
  }

  if (values.length > 0) {
    await db
      .insert(bodyMeasurement)
      .values(values)
      .onConflictDoNothing({
        target: [bodyMeasurement.userId, bodyMeasurement.kind, bodyMeasurement.measuredAt],
      });
  }

  return { bodyweightCount: values.length };
}

/**
 * 데모 태그가 붙은 기록만 지운다. 사용자가 직접 남긴 기록은 건드리지 않는다.
 *
 * 재생이 만든 기록에도 같은 태그가 붙으므로 **재생보다 먼저** 불러야 한다. 옛 평평한
 * 로그(planId 없음)도 이 술어에 걸려 함께 사라진다 — 이미 심어 둔 계정을 따로 손보지
 * 않아도 다음 시드 한 번으로 정리된다.
 */
export async function deleteDemoHistoryForUser(userId: string): Promise<void> {
  const logs = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(and(eq(workoutLog.userId, userId), sql`${workoutLog.tags} @> ARRAY[${DEMO_HISTORY_TAG}]::text[]`));
  const logIds = logs.map((row) => row.id);
  if (logIds.length === 0) return;
  await db.delete(workoutSet).where(inArray(workoutSet.logId, logIds));
  await db.delete(workoutLog).where(inArray(workoutLog.id, logIds));
}
