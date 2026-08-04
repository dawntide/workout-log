import "./load-env";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import {
  appUser,
  generatedSession,
  plan as planTable,
  programTemplate,
  programVersion,
  workoutLog,
} from "@workout/core/db/schema";
import { generateAndSaveSession } from "@workout/core/program-engine/generateSession";

/**
 * 불변식: **이미 저장된 운동기록이 가리키는 generated_session 스냅샷은 재생성으로 덮어써지지
 * 않는다.** 그 스냅샷은 "그때 실제로 수행한 처방"이고, 기록 수정 시 그 안의 amrap ·
 * progressionExcluded로 자동 진행 판정이 다시 돌기 때문에 사후에 바뀌면 결과가 조용히 뒤집힌다
 * (#648). 가드는 upsert의 DO UPDATE에 CASE로 들어가 있다.
 *
 * 왜 유닛 테스트가 아니라 여기인가: 가드가 SQL 안에 있어 실제 Postgres 없이는 검증되지 않는다.
 * 유닛 하네스에는 DB가 없고, 브라우저 E2E로는 이 경로에 결정적으로 도달하기 어렵다 —
 * 세션 키가 날짜가 아니라 현재 사이클 위치에서 파생돼 UI 흐름만으로는 "같은 행 재생성"을
 * 만들기 힘들기 때문이다. CI E2E 잡의 Postgres를 쓰는 다른 db:verify:* 들과 같은 자리다.
 *
 * 설계 요점 — **대조군**: 재생성이 스냅샷을 실제로 바꿀 수 있는 상태를 먼저 만든다(프로그램
 * 정의를 v1→v2로 갱신). 그래야 참조된 행의 "변하지 않음"이 가드 덕분이라고 말할 수 있다.
 * 참조 없는 행이 v2로 갱신되는 것까지 확인해, 애초에 변경이 감지 가능한 실험임을 증명한다.
 */

const SESSION_DATE = "2026-03-02";
const SESSION_SCHEDULE_KEY = "A";

type GeneratedRow = {
  id: string;
  snapshot: unknown;
  updatedAt: Date | null;
};

function manualDefinition(marker: string) {
  return {
    kind: "manual",
    sessions: [
      {
        key: SESSION_SCHEDULE_KEY,
        // 이 마커가 snapshot.manualSession에 그대로 실려 스냅샷을 v1/v2로 구분해준다.
        label: `verify-${marker}`,
        items: [
          {
            exerciseName: `Verify Lift ${marker}`,
            sets: [{ reps: 5 }],
          },
        ],
      },
    ],
  };
}

async function generateFor(userId: string, planId: string): Promise<GeneratedRow> {
  const saved = (await generateAndSaveSession({
    userId,
    planId,
    sessionDate: SESSION_DATE,
    timezone: "UTC",
  })) as GeneratedRow;
  assert.ok(saved?.id, "generateAndSaveSession did not return a persisted row");
  return saved;
}

async function readSnapshot(sessionId: string) {
  const rows = await db
    .select({
      snapshot: generatedSession.snapshot,
      updatedAt: generatedSession.updatedAt,
    })
    .from(generatedSession)
    .where(eq(generatedSession.id, sessionId))
    .limit(1);
  assert.ok(rows[0], `generated_session ${sessionId} disappeared`);
  return rows[0];
}

async function main() {
  const marker = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const planIds: string[] = [];
  let templateId: string | null = null;

  try {
    await db.insert(appUser).values({
      id: userId,
      email: `generated-session-immutability-${marker}@example.invalid`,
      passwordHash: "ci-integration-test-only",
      displayName: `Generated session immutability ${marker}`,
    });

    const [template] = await db
      .insert(programTemplate)
      .values({
        slug: `verify-gs-immutability-${marker}`,
        name: `Generated session immutability ${marker}`,
        type: "MANUAL",
        visibility: "PRIVATE",
        ownerUserId: userId,
        description: "Fixture for the referenced-snapshot guard",
        tags: ["ci-verify"],
      })
      .returning();
    assert.ok(template);
    templateId = template.id;

    const [version] = await db
      .insert(programVersion)
      .values({
        templateId: template.id,
        version: 1,
        definition: manualDefinition("v1"),
        defaults: {},
      })
      .returning();
    assert.ok(version);

    const planValues = {
      userId,
      type: "MANUAL" as const,
      rootProgramVersionId: version.id,
      params: { schedule: [SESSION_SCHEDULE_KEY] },
    };
    const [referencedPlan] = await db
      .insert(planTable)
      .values({ ...planValues, name: `Referenced ${marker}` })
      .returning();
    const [freePlan] = await db
      .insert(planTable)
      .values({ ...planValues, name: `Unreferenced ${marker}` })
      .returning();
    assert.ok(referencedPlan && freePlan);
    planIds.push(referencedPlan.id, freePlan.id);

    // ── v1 세션 생성 ────────────────────────────────────────────────────────
    const referencedFirst = await generateFor(userId, referencedPlan.id);
    const freeFirst = await generateFor(userId, freePlan.id);
    const referencedV1 = JSON.stringify(referencedFirst.snapshot);
    const freeV1 = JSON.stringify(freeFirst.snapshot);
    assert.ok(
      referencedV1.includes("verify-v1"),
      "fixture snapshot does not carry the v1 marker — the definition never reached the snapshot",
    );

    // 한쪽 세션만 저장된 기록이 가리키게 한다.
    await db.insert(workoutLog).values({
      userId,
      planId: referencedPlan.id,
      generatedSessionId: referencedFirst.id,
      performedAt: new Date(`${SESSION_DATE}T09:00:00.000Z`),
    });

    // ── 재생성 결과가 달라지도록 프로그램 정의를 갱신 ─────────────────────────
    await db
      .update(programVersion)
      .set({ definition: manualDefinition("v2") })
      .where(eq(programVersion.id, version.id));

    // ── 대조군: 참조 없는 세션은 갱신돼야 한다 ───────────────────────────────
    const freeSecond = await generateFor(userId, freePlan.id);
    assert.equal(
      freeSecond.id,
      freeFirst.id,
      "unreferenced regeneration hit a different row — the scenario no longer exercises an upsert",
    );
    const freeAfter = await readSnapshot(freeFirst.id);
    assert.notEqual(
      JSON.stringify(freeAfter.snapshot),
      freeV1,
      "unreferenced snapshot did not change — the experiment cannot detect a write at all",
    );
    assert.ok(
      JSON.stringify(freeAfter.snapshot).includes("verify-v2"),
      "unreferenced snapshot was not rebuilt from the updated definition",
    );

    // ── 본론: 기록이 가리키는 세션은 그대로여야 한다 ─────────────────────────
    const referencedSecond = await generateFor(userId, referencedPlan.id);
    assert.equal(
      referencedSecond.id,
      referencedFirst.id,
      "referenced regeneration hit a different row — the guard was never reached",
    );
    const referencedAfter = await readSnapshot(referencedFirst.id);
    assert.equal(
      JSON.stringify(referencedAfter.snapshot),
      referencedV1,
      "a saved log's prescription snapshot was overwritten by regeneration",
    );
    assert.equal(
      referencedAfter.updatedAt?.getTime(),
      referencedFirst.updatedAt?.getTime(),
      "a saved log's snapshot row was touched by regeneration",
    );

    console.log("[verify] generated session immutability ok");
  } finally {
    if (planIds.length > 0) {
      await db.delete(workoutLog).where(inArray(workoutLog.planId, planIds));
      await db.delete(generatedSession).where(inArray(generatedSession.planId, planIds));
      await db.delete(planTable).where(inArray(planTable.id, planIds));
    }
    if (templateId) {
      await db.delete(programVersion).where(eq(programVersion.templateId, templateId));
      await db.delete(programTemplate).where(eq(programTemplate.id, templateId));
    }
    await db.delete(appUser).where(eq(appUser.id, userId));

    const leftovers = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId));
    assert.equal(leftovers.length, 0, "cleanup left the fixture user behind");
  }
}

main()
  .catch((error) => {
    console.error("[verify] generated session immutability failed", error);
    process.exitCode = 1;
  })
  .then(async () => {
    if (!global.__dbPool) return;
    await global.__dbPool.end();
  })
  .catch((error) => {
    console.error("[verify] generated session immutability pool shutdown failed", error);
    process.exitCode = 1;
  });
