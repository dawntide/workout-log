import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tacticalBarbellCluster,
  tacticalBarbellSessionKeys,
  tacticalBarbellSessionsPerWeek,
} from "./tactical-barbell-blueprint";
import { inferSessionDraftsFromTemplate } from "./model";
import { reduceProgressionState } from "../progression/reducer";

// Operator/Fighter/Zulu는 6주 파형과 블록 증량 규칙을 공유하고 세션 구성만 다르다.

test("Operator 클러스터는 기존과 같다(주 3일, 3일차만 데드리프트)", () => {
  assert.deepEqual(tacticalBarbellCluster("operator"), [
    ["SQUAT", "BENCH", "PULL"],
    ["SQUAT", "BENCH", "PULL"],
    ["SQUAT", "BENCH", "DEADLIFT"],
  ]);
  // variant 미지정 정의(기존 Operator 시드)도 같은 클러스터로 떨어진다.
  assert.deepEqual(tacticalBarbellCluster(undefined), tacticalBarbellCluster("operator"));
  assert.equal(tacticalBarbellSessionsPerWeek(undefined), 3);
});

test("Fighter는 주 2일이고 매 세션 4대 리프트를 전부 한다", () => {
  const cluster = tacticalBarbellCluster("fighter");
  assert.equal(cluster.length, 2);
  assert.equal(tacticalBarbellSessionsPerWeek("fighter"), 2);
  for (const day of cluster) {
    assert.deepEqual(day, ["SQUAT", "BENCH", "OHP", "DEADLIFT"]);
  }
});

test("Zulu는 주 4일 A/B 교대이고 전 종목이 정확히 주 2회다", () => {
  const cluster = tacticalBarbellCluster("zulu");
  assert.equal(cluster.length, 4);

  const counts = new Map<string, number>();
  for (const day of cluster) {
    for (const target of day) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  assert.deepEqual(
    Object.fromEntries([...counts.entries()].sort()),
    { BENCH: 2, DEADLIFT: 2, OHP: 2, PULL: 2, SQUAT: 2 },
  );
  // A/B 교대: 1·3일차와 2·4일차가 같은 구성.
  assert.deepEqual(cluster[0], cluster[2]);
  assert.deepEqual(cluster[1], cluster[3]);
});

test("세션 키는 중복 없이 D1..Dn이다(fork 시 세션 조회가 깨지지 않도록)", () => {
  for (const variant of ["operator", "fighter", "zulu"]) {
    const keys = tacticalBarbellSessionKeys(variant);
    assert.equal(new Set(keys).size, keys.length, variant);
  }
  assert.deepEqual(tacticalBarbellSessionKeys("zulu"), ["D1", "D2", "D3", "D4"]);
});

test("커스터마이즈 draft가 variant 세션 구성을 따라간다", () => {
  const template = (variant: string) => ({
    slug: `tb-${variant}`,
    latestVersion: { definition: { kind: "operator", variant } },
  });

  const fighter = inferSessionDraftsFromTemplate(template("fighter") as never);
  assert.equal(fighter.length, 2);
  assert.deepEqual(
    fighter[0]!.exercises.map((e) => e.progressionTarget),
    ["SQUAT", "BENCH", "OHP", "DEADLIFT"],
  );

  const zulu = inferSessionDraftsFromTemplate(template("zulu") as never);
  assert.equal(zulu.length, 4);
  assert.deepEqual(zulu[1]!.exercises.map((e) => e.progressionTarget), ["DEADLIFT", "OHP"]);

  // 기존 Operator(variant 없음)는 그대로 주 3일.
  const operator = inferSessionDraftsFromTemplate({
    slug: "operator",
    latestVersion: { definition: { kind: "operator" } },
  } as never);
  assert.equal(operator.length, 3);
});

// ── reducer: 주당 세션 수에 따른 블록 진행 ────────────────────────────────────

function logSquat(previousState: unknown, planParams: unknown) {
  return reduceProgressionState({
    program: "operator",
    previousState,
    planParams,
    sets: [
      {
        exerciseName: "High-Bar Back Squat",
        reps: 5,
        weightKg: 100,
        meta: { plannedRef: { progressionKey: "SQUAT", progressionTarget: "SQUAT", reps: 5 } },
      },
    ],
    logId: "log-1",
  });
}

function baseState(week: number, day: number) {
  return {
    cycle: 1,
    week,
    day,
    targets: { SQUAT: { progressionTarget: "SQUAT", workKg: 100, successStreak: 0, failureStreak: 0 } },
    lastAppliedLogId: null,
  };
}

test("Fighter(주 2일)는 2세션마다 주차가 넘어간다", () => {
  const afterD1 = logSquat(baseState(1, 1), { sessionsPerWeek: 2 });
  assert.equal(afterD1.nextState.week, 1);
  assert.equal(afterD1.nextState.day, 2);

  const afterD2 = logSquat(afterD1.nextState, { sessionsPerWeek: 2 });
  assert.equal(afterD2.nextState.week, 2);
  assert.equal(afterD2.nextState.day, 1);
});

test("Fighter는 6주 2일차 완주에 TM이 오른다(블록 기준이 3일차가 아니다)", () => {
  const result = logSquat(baseState(6, 2), { sessionsPerWeek: 2 });
  // 하체 +5kg, 블록 종료로 사이클 롤오버.
  assert.equal(result.nextState.targets.SQUAT!.workKg, 105);
  assert.equal(result.nextState.cycle, 2);
  assert.equal(result.nextState.week, 1);
});

test("Zulu(주 4일)는 4세션마다 주차가 넘어가고 6주 4일차가 블록 완주다", () => {
  const midWeek = logSquat(baseState(1, 3), { sessionsPerWeek: 4 });
  assert.equal(midWeek.nextState.week, 1);
  assert.equal(midWeek.nextState.day, 4);

  const blockEnd = logSquat(baseState(6, 4), { sessionsPerWeek: 4 });
  assert.equal(blockEnd.nextState.targets.SQUAT!.workKg, 105);
  assert.equal(blockEnd.nextState.cycle, 2);
});

test("회귀: sessionsPerWeek가 없는 기존 Operator 플랜은 3일 기준 그대로다", () => {
  const afterD2 = logSquat(baseState(1, 2), {});
  assert.equal(afterD2.nextState.day, 3);
  assert.equal(afterD2.nextState.week, 1);

  const afterD3 = logSquat(baseState(1, 3), {});
  assert.equal(afterD3.nextState.day, 1);
  assert.equal(afterD3.nextState.week, 2);

  // 6주 3일차가 블록 완주 → 증량.
  const blockEnd = logSquat(baseState(6, 3), {});
  assert.equal(blockEnd.nextState.targets.SQUAT!.workKg, 105);
  assert.equal(blockEnd.nextState.cycle, 2);

  // 6주 2일차는 아직 블록 완주가 아니다.
  const notYet = logSquat(baseState(6, 2), {});
  assert.equal(notYet.nextState.targets.SQUAT!.workKg, 100);
});
