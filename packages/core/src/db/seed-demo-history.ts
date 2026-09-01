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
 * 데모 체중 격자. 주 1회, 과거에서 현재로 오며 미래 측정은 넣지 않는다.
 *
 * 기록과 달리 시각을 당기지 않고 **건너뛴다** — 체중은 하나 빠져도 이력에 구멍이 날
 * 뿐이지만, 당기면 같은 날에 두 측정이 생겨 unique 제약에 걸린다.
 */
export function demoBodyweightEntries(input: {
  userId: string;
  weeks: number;
  now: Date;
}): (typeof bodyMeasurement.$inferInsert)[] {
  const { userId, weeks, now } = input;
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
  return values;
}

/**
 * 주 1회 체중 측정 이력을 **갈아 끼운다** — 이 계정의 체중 이력은 시드가 소유한다.
 *
 * onConflictDoNothing만으로는 쌓인다. 격자가 `오늘`에 앵커돼 있어 날짜가 하루만 바뀌어도
 * 12개가 통째로 밀리고, 그 전부가 새 시각이라 충돌하지 않는다(실측: 12 → 24건).
 *
 * **창을 좁게 잡는 방법은 통하지 않는다.** 새 격자의 시작점부터 지우면 옛 격자의 첫 행이
 * 그 앞에 남아 재시드마다 하나씩 샌다(실측: 13 → 14). 드리프트가 클수록 더 샌다 — 며칠을
 * 여유로 두든 그만큼 안 돌린 뒤에는 다시 샌다. 그래서 창을 넓히는 대신 전부 지운다.
 *
 * 대가는 이 계정의 수기 체중 입력이 함께 사라진다는 것이다. 기록(deleteDemoHistoryForUser)이
 * 태그 없는 것을 남기는 것과 다른 선택인데, 근거가 다르다 — 기록은 태그로 데모와 수기를
 * 가를 수 있지만 body_measurement에는 그럴 컬럼이 없다. 값으로 가르는 건 같은 체중을 실제로
 * 입력한 날 오작동한다. 로그인 불가 센티널 계정 전용이라 예측 가능한 쪽을 골랐다.
 */
export async function seedDemoBodyweightForUser({
  userId,
  weeks = 12,
  now = new Date(),
}: SeedDemoBodyweightOptions): Promise<SeedDemoBodyweightSummary> {
  const values = demoBodyweightEntries({ userId, weeks, now });

  await db
    .delete(bodyMeasurement)
    .where(and(eq(bodyMeasurement.userId, userId), eq(bodyMeasurement.kind, "weight")));
  if (values.length > 0) await db.insert(bodyMeasurement).values(values);

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
