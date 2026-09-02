import { and, eq, inArray } from "drizzle-orm";

import { db } from "./client";
import { generatedSession, plan, planProgressEvent, planRuntimeState, workoutLog } from "./schema";
import { generateAndSaveSession } from "../program-engine/generateSession";
import { buildRef5LogSets } from "../program-engine/ref5-log-sets";
import { REF5_PROTOCOL_VERSION } from "../program-engine/ref5-protocol-version";
import {
  upsertWorkoutLogService,
  type WorkoutSetInput,
} from "../services/workout-log/upsert-log";
import { DEMO_HISTORY_TAG } from "./seed-demo-history";

/**
 * 테스트 계정용 **프로그램 흐름 재생**.
 *
 * 종전 데모 기록은 workout_log 행을 직접 심었다. 통계·PR·체중 추이는 그것으로 충분했지만
 * 캘린더에는 아무것도 뜨지 않았고(캘린더는 planId로만 조회한다) 세션 전환·자동 진행은
 * 아예 검증할 수 없었다 — 생성 세션도 진행 이벤트도 없었기 때문이다.
 *
 * 그래서 행을 심는 대신 **진짜 경로를 그대로 돌린다**:
 *
 *   generateAndSaveSession()  → 실제 엔진이 세션과 처방을 만든다
 *   upsertWorkoutLogService() → 실제 저장 경로가 PR·진행 이벤트·런타임 상태를 움직인다
 *
 * 그 결과 캘린더·세션 상세·자동 진행이 실사용과 같은 데이터 위에서 동작한다. 처방을
 * 흉내 내지 않으므로 프로그램 로직이 바뀌면 데모도 자동으로 그 로직을 따른다.
 */

/** 재생 대상. LOGIC(SINGLE) 플랜만 — MANUAL은 세션 생성 경로가 다르다. */
export type ReplayPlanName =
  | "Program Tactical Barbell Operator"
  | "Program REF5 Adaptive Strength";

const REF5_PLAN_NAME: ReplayPlanName = "Program REF5 Adaptive Strength";

export type SeedProgramReplayOptions = {
  userId: string;
  planName: ReplayPlanName;
  /** 재생할 세션 수. 주 3회 기준 12주면 36. */
  sessionCount?: number;
  timezone?: string;
  locale?: "ko" | "en";
  now?: Date;
  /** REF5는 세션마다 그날 체중을 입력받는다(맨몸 부하 계산에 쓰인다). */
  bodyweightKg?: number;
};

export type SeedProgramReplaySummary = {
  planId: string;
  sessionCount: number;
  loggedCount: number;
  skipped: number;
};

/**
 * 처방을 그대로 수행한 것으로 기록한다.
 *
 * 실패를 섞지 않는 것은 의도다 — 데모의 목적은 "정상 진행이 어떻게 보이는가"이고,
 * 실패 판정·디로드는 저장 실패 시뮬레이션처럼 **의도적으로** 만들어 봐야 의미가 있다.
 * percent만 있고 무게가 없는 세트는 기록하지 않는다(그 처방은 사용자 입력을 전제한다).
 *
 * REF5는 이 경로를 타지 않는다 — 세트마다 동결 처방과 대조되는 meta가 필요해서 조립
 * 규칙이 따로 있고, 그 규칙은 검증 스크립트와 공유한다(`buildRef5LogSets`).
 */
function toLoggedSets(snapshot: unknown): WorkoutSetInput[] {
  const snap = snapshot as { exercises?: Array<Record<string, any>> } | null;
  const out: WorkoutSetInput[] = [];
  let sortOrder = 0;
  for (const exercise of snap?.exercises ?? []) {
    const sets: Array<Record<string, any>> = Array.isArray(exercise.sets) ? exercise.sets : [];
    sets.forEach((set, index) => {
      const weightKg = typeof set.targetWeightKg === "number" ? set.targetWeightKg : null;
      if (weightKg === null) return;
      out.push({
        exerciseId: exercise.exerciseId ?? null,
        exerciseName: exercise.exerciseName,
        sortOrder: sortOrder++,
        setNumber: index + 1,
        reps: typeof set.reps === "number" ? set.reps : 5,
        weightKg,
      });
    });
  }
  return out;
}

/**
 * 재생 대상 플랜의 상태를 **통째로** 비운다 — 그 플랜의 기록·세션·진행 이벤트·런타임 상태.
 *
 * 태그로 좁히지 않는 건 의도다. 재생은 1주차부터 상태를 다시 쌓는데, 사용자가 그 플랜에
 * 남긴 기록이 섞여 있으면 진행 판정이 두 이력의 뒤섞임이 되어 무엇을 보고 있는지 알 수
 * 없게 된다. 테스트 계정 전용이고, 다른 플랜과 태그 없는 기록은 건드리지 않는다.
 */
async function clearReplayForPlan(userId: string, planId: string): Promise<void> {
  const logs = await db
    .select({ id: workoutLog.id })
    .from(workoutLog)
    .where(and(eq(workoutLog.userId, userId), eq(workoutLog.planId, planId)));
  const logIds = logs.map((row) => row.id);

  // 진행 이벤트는 로그·플랜 FK의 cascade로 함께 사라지지만, 재생은 런타임 상태를 처음부터
  // 다시 쌓아야 하므로 명시적으로 비운다 — 남아 있으면 두 번째 재생이 79주차에서 시작한다.
  if (logIds.length > 0) {
    await db.delete(planProgressEvent).where(inArray(planProgressEvent.logId, logIds));
    await db.delete(workoutLog).where(inArray(workoutLog.id, logIds));
  }
  await db.delete(generatedSession).where(eq(generatedSession.planId, planId));
  await db.delete(planRuntimeState).where(eq(planRuntimeState.planId, planId));
}

/**
 * 재생 세션의 수행 시각. 주 3회(이틀 간격) 과거에서 현재로 오고 **마지막은 오늘**이다 —
 * 캘린더는 오늘이 든 달로 열리므로 어제서 끊으면 월초에 시드했을 때 빈 달력이 뜬다.
 *
 * 미래로 새지 않도록 **두 기준 모두**에 대해 자른다: 호출자가 준 `now`와 진짜 벽시계.
 * REF5는 시작이 미래인 세션을 거부해(`completedAt cannot precede actualStartAt`) 시드가
 * 통째로 실패하는데, `now`만 보면 미래로 주입된 `now`가 그 함정을 그대로 연다(실측).
 *
 * 건너뛰지 않고 당기는 것이 중요하다 — seedDemoHistoryForUser는 미래 세션을 버리지만,
 * 재생에서 하나를 버리면 그 세션의 진행 이벤트까지 사라져 처방 사슬에 구멍이 난다.
 */
export function replaySessionPerformedAt(input: {
  now: Date;
  sessionCount: number;
  index: number;
  /** 테스트에서만 주입한다. 기본은 진짜 현재 시각. */
  wallClock?: Date;
}): Date {
  const { now, sessionCount, index, wallClock = new Date() } = input;
  const at = new Date(now);
  at.setUTCDate(at.getUTCDate() - (sessionCount - 1 - index) * 2);
  at.setUTCHours(9, 0, 0, 0);
  const ceiling = Math.min(now.getTime(), wallClock.getTime());
  return at.getTime() > ceiling ? new Date(ceiling) : at;
}

/** 세션 시작 이벤트의 식별자. 웹의 시작 패널과 같이 매 시작마다 새로 만든다. */
function newStartEventId(): string {
  return globalThis.crypto.randomUUID();
}

export async function seedDemoProgramReplay({
  userId,
  planName,
  sessionCount = 36,
  timezone = "Asia/Seoul",
  locale = "ko",
  now = new Date(),
  bodyweightKg = 73,
}: SeedProgramReplayOptions): Promise<SeedProgramReplaySummary> {
  const [target] = await db
    .select({ id: plan.id })
    .from(plan)
    .where(and(eq(plan.userId, userId), eq(plan.name, planName)))
    .limit(1);
  if (!target) {
    throw new Error(`demo replay plan not found: ${planName}`);
  }

  await clearReplayForPlan(userId, target.id);

  const isRef5 = planName === REF5_PLAN_NAME;
  let loggedCount = 0;
  let skipped = 0;

  for (let index = 0; index < sessionCount; index += 1) {
    const performedAt = replaySessionPerformedAt({ now, sessionCount, index });

    // REF5는 주차/요일이 아니라 **실제 시작 시각**에서 세션을 만든다(키가
    // `REF5:<actualStartAt>:<startEventId>`다). 그래서 주차 고정을 적용하지 않고, 웹의
    // 시작 패널이 보내는 것과 같은 입력을 그대로 만든다.
    //
    // 그 외 LOGIC 플랜은 **첫 세션만 주차를 고정한다.** 런타임 상태를 비운 직후의 첫
    // 생성은 상태가 없어 sessionKeyMode="DATE" 경로로 떨어지고, 시드 플랜의 startDate가
    // 과거라 79주차 같은 값이 나온다(실측). 이후 세션은 저장이 올린 상태를 이어받는다.
    const generated = (await generateAndSaveSession({
      userId,
      planId: target.id,
      timezone,
      ...(isRef5
        ? {
            ref5: {
              protocolVersion: REF5_PROTOCOL_VERSION,
              actualStartAt: performedAt.toISOString(),
              todayBodyweightKg: bodyweightKg,
              manualMicro: false,
              // 데모는 정본 v1.4 처방을 그대로 재생한다 — OAP 슬롯을 되돌리지 않는다.
              oapSlotReverted: false,
              startEventId: newStartEventId(),
            },
          }
        : index === 0
          ? { week: 1, day: 1 }
          : {}),
    })) as { id: string; snapshot: unknown };

    // REF5 세트는 동결 처방과 대조되므로 조립 규칙이 다르다. 그 규칙은 프로그램 워크플로
    // 검증 스크립트와 같은 함수를 쓴다 — 두 벌이 되면 한쪽만 고쳐지고 조용히 낡는다.
    const sets = isRef5
      ? buildRef5LogSets(generated.snapshot, { completedAt: performedAt.toISOString() })
      : toLoggedSets(generated.snapshot);
    if (sets.length === 0) {
      // 처방이 사용자 입력을 전제하는 세션(percent만 있는 경우)은 건너뛴다.
      skipped += 1;
      continue;
    }

    await upsertWorkoutLogService({
      userId,
      planId: target.id,
      generatedSessionId: generated.id,
      timezone,
      locale,
      performedAt,
      notes: `demo replay · ${planName}`,
      tags: [DEMO_HISTORY_TAG],
      sets,
    });
    loggedCount += 1;
  }

  return { planId: target.id, sessionCount, loggedCount, skipped };
}
