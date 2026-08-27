import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "./client";
import { bodyMeasurement, exercise, workoutLog, workoutSet } from "./schema";
import { EXERCISE_NAMES } from "../exercise/catalog";
import { roundToNearest2p5 } from "../program-engine/round";

/**
 * 테스트 계정용 예시 **운동 기록** 생성기.
 *
 * 플랜만 있고 기록이 없으면 앱의 절반이 빈 화면이다 — 통계(e1RM·볼륨·PR)·캘린더·
 * 부위 신선도·체중 추이는 전부 기록에서 나온다. 운영 환경에서 실데이터 없이 확인하려면
 * 그 화면들이 채워져 있어야 해서, 데모 시드가 기록까지 만든다.
 *
 * **플랜에 연결하지 않는다.** planId를 붙이면 자동 진행(progression) 상태와 생성 세션까지
 * 함께 움직여야 앞뒤가 맞는데, 그건 데모가 흉내 낼 영역이 아니다. 수기 기록과 같은 모양의
 * 독립 로그를 만든다 — 통계·캘린더·PR은 planId 없이도 전부 동작한다.
 *
 * PR(personalRecords)은 비워 둔다. 스키마 주석대로 null은 "미확정"이고 상세 첫 조회가
 * 계산·동결하므로, 여기서 채우면 오히려 그 경로를 건너뛴 가짜 값이 굳는다.
 */

/** 데모가 만든 기록임을 표시하는 태그. 재실행 시 이 태그만 지우고 다시 만든다. */
export const DEMO_HISTORY_TAG = "demo-seed";

type Movement = {
  name: string;
  /** 첫 주 작업 세트 무게(kg). null이면 맨몸(체중) 종목. */
  startKg: number | null;
  /** 주당 증가분(kg). */
  weeklyKg: number;
  workSets: number;
  reps: number;
};

/** 주 3회 분할. 하루 3종목이면 화면이 비지도, 과하지도 않다. */
const SESSION_PLAN: { label: string; movements: Movement[] }[] = [
  {
    label: "Squat · Bench · Row",
    movements: [
      { name: EXERCISE_NAMES.highBarBackSquat, startKg: 90, weeklyKg: 5, workSets: 3, reps: 5 },
      { name: EXERCISE_NAMES.benchPress, startKg: 65, weeklyKg: 2.5, workSets: 3, reps: 5 },
      { name: EXERCISE_NAMES.barbellRow, startKg: 55, weeklyKg: 2.5, workSets: 3, reps: 8 },
    ],
  },
  {
    label: "Deadlift · Press · Pull-Up",
    movements: [
      { name: EXERCISE_NAMES.deadlift, startKg: 115, weeklyKg: 5, workSets: 2, reps: 5 },
      { name: EXERCISE_NAMES.overheadPress, startKg: 40, weeklyKg: 2.5, workSets: 3, reps: 5 },
      { name: EXERCISE_NAMES.pullUp, startKg: null, weeklyKg: 0, workSets: 3, reps: 8 },
    ],
  },
  {
    label: "Squat · Incline · RDL",
    movements: [
      { name: EXERCISE_NAMES.highBarBackSquat, startKg: 80, weeklyKg: 5, workSets: 3, reps: 8 },
      { name: EXERCISE_NAMES.inclineBenchPress, startKg: 50, weeklyKg: 2.5, workSets: 3, reps: 8 },
      { name: EXERCISE_NAMES.romanianDeadlift, startKg: 80, weeklyKg: 5, workSets: 3, reps: 8 },
    ],
  },
];

/**
 * 4주 주기 디로드 — 단조 증가만 있으면 그래프가 현실과 다르게 보인다.
 *
 * 위상을 2주 당겨 **마지막 주가 디로드에 걸리지 않게** 한다. 마지막이 디로드면 통계 화면의
 * "현재"가 최고치보다 낮게 찍혀, 데모가 하필 하락으로 끝난다(실측: improvement -7.6%).
 */
function weekMultiplier(week: number): number {
  return (week + 2) % 4 === 0 ? 0.9 : 1;
}

function workingWeightKg(movement: Movement, week: number): number | null {
  if (movement.startKg === null) return null;
  const raw = (movement.startKg + movement.weeklyKg * week) * weekMultiplier(week);
  return roundToNearest2p5(raw);
}

/** 마지막 세트로 갈수록 RPE가 오른다(0.5 단위). */
function rpeForSet(setIndex: number, workSets: number): number {
  const base = 7 + (setIndex / Math.max(1, workSets - 1)) * 2;
  return Math.round(base * 2) / 2;
}

export type SeedDemoHistoryOptions = {
  userId: string;
  /** 생성할 주 수. 기본 12주(주 3회 = 36세션). */
  weeks?: number;
  /** 기준 시각. 테스트에서 고정할 수 있게 인자로 받는다. */
  now?: Date;
};

export type SeedDemoHistorySummary = {
  logCount: number;
  setCount: number;
  bodyweightCount: number;
};

export async function seedDemoHistoryForUser({
  userId,
  weeks = 12,
  now = new Date(),
}: SeedDemoHistoryOptions): Promise<SeedDemoHistorySummary> {
  // 종목 id 매핑. 카탈로그가 없어도 동작해야 하므로(exerciseId는 nullable) 이름만으로도
  // 기록은 남는다 — 다만 id가 있으면 종목별 통계가 이름 변경에도 이어진다.
  const names = [...new Set(SESSION_PLAN.flatMap((s) => s.movements.map((m) => m.name)))];
  const rows = await db
    .select({ id: exercise.id, name: exercise.name })
    .from(exercise)
    .where(inArray(exercise.name, names));
  const idByName = new Map(rows.map((r) => [r.name, r.id]));

  // 재실행은 덮어쓴다 — 플랜 upsert와 같은 성질이라 여러 번 눌러도 쌓이지 않는다.
  // 사용자가 테스트 계정에서 직접 남긴 기록은 태그가 없어 그대로 남는다.
  await deleteDemoHistoryForUser(userId);

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(9, 0, 0, 0);

  type PendingLog = { performedAt: Date; label: string; movements: Movement[]; week: number };
  const pending: PendingLog[] = [];

  // 최근이 마지막이 되도록 과거에서 현재로 채운다. 주당 3회(0·2·4일 오프셋).
  //
  // 기준을 하루 더 당기는 건(-5) 마지막 세션이 **항상 과거**가 되게 하기 위함이다. 오늘로
  // 두면 실행 시각이 기준 시각(09:00 UTC)보다 이르면 미래로 밀려 통째로 빠지고, 그 종목만
  // 최근 기록이 한 주 낡아 통계가 하락으로 보인다(실측: 36세션 중 35개만 생성).
  const dayOffsets = [0, 2, 4];
  for (let week = 0; week < weeks; week += 1) {
    const weeksAgo = weeks - 1 - week;
    for (let day = 0; day < SESSION_PLAN.length; day += 1) {
      const performedAt = new Date(startOfToday);
      performedAt.setUTCDate(performedAt.getUTCDate() - weeksAgo * 7 + dayOffsets[day] - 5);
      if (performedAt.getTime() > now.getTime()) continue;
      pending.push({
        performedAt,
        label: SESSION_PLAN[day].label,
        movements: SESSION_PLAN[day].movements,
        week,
      });
    }
  }

  let setCount = 0;
  for (const item of pending) {
    const inserted = await db
      .insert(workoutLog)
      .values({
        userId,
        performedAt: item.performedAt,
        durationMinutes: 55 + (item.week % 3) * 5,
        notes: item.label,
        tags: [DEMO_HISTORY_TAG],
      })
      .returning({ id: workoutLog.id });
    const logId = inserted[0]?.id;
    if (!logId) continue;

    const setValues: (typeof workoutSet.$inferInsert)[] = [];
    let sortOrder = 0;
    for (const movement of item.movements) {
      const workKg = workingWeightKg(movement, item.week);
      const exerciseId = idByName.get(movement.name) ?? null;

      // 웜업 2세트 — 실제 기록처럼 보이려면 필요하고, 웜업 제외 집계(볼륨)도 함께 검증된다.
      if (workKg !== null) {
        const warmups = [0.5, 0.75];
        warmups.forEach((ratio, index) => {
          setValues.push({
            logId,
            exerciseId,
            exerciseName: movement.name,
            sortOrder: sortOrder++,
            setNumber: index + 1,
            reps: 5,
            weightKg: roundToNearest2p5(workKg * ratio),
            setType: "WARMUP",
          });
        });
      }

      for (let index = 0; index < movement.workSets; index += 1) {
        setValues.push({
          logId,
          exerciseId,
          exerciseName: movement.name,
          sortOrder: sortOrder++,
          setNumber: index + 1,
          reps: movement.reps,
          weightKg: workKg,
          rpe: rpeForSet(index, movement.workSets),
        });
      }
    }

    if (setValues.length > 0) {
      await db.insert(workoutSet).values(setValues);
      setCount += setValues.length;
    }
  }

  // 체중 추이 — 주 1회. 체중 기반 종목(맨몸 풀업)의 부하 계산에도 쓰인다.
  const bodyweightValues: (typeof bodyMeasurement.$inferInsert)[] = [];
  for (let week = 0; week < weeks; week += 1) {
    const measuredAt = new Date(startOfToday);
    measuredAt.setUTCDate(measuredAt.getUTCDate() - (weeks - 1 - week) * 7 - 5);
    if (measuredAt.getTime() > now.getTime()) continue;
    bodyweightValues.push({
      userId,
      kind: "weight",
      valueKg: Math.round((72 + week * 0.15) * 10) / 10,
      measuredAt,
    });
  }
  if (bodyweightValues.length > 0) {
    await db
      .insert(bodyMeasurement)
      .values(bodyweightValues)
      .onConflictDoNothing({
        target: [bodyMeasurement.userId, bodyMeasurement.kind, bodyMeasurement.measuredAt],
      });
  }

  return {
    logCount: pending.length,
    setCount,
    bodyweightCount: bodyweightValues.length,
  };
}

/** 데모 태그가 붙은 기록만 지운다. 사용자가 직접 남긴 기록은 건드리지 않는다. */
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
