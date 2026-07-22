import { test } from "node:test";
import assert from "node:assert/strict";
import { inferSessionDraftsFromTemplate, toManualDefinition } from "./model";
import { exerciseSlotKey } from "./program-registry";
import { plannedExercisesFromSlottedLpManualSession } from "../program-engine/generateSession";

// 커스터마이즈(fork)는 정의 → draft → 정의로 왕복한다. draft가 운동당 (세트 수, reps) 두 숫자만
// 들고 있어서, 세트마다 퍼센트가 다른 프로그램은 이 왕복에서 램프가 균일 세트로 뭉개졌다.

const SQUAT_KEY = exerciseSlotKey("High-Bar Back Squat");

const madcowFriday = {
  key: "F",
  items: [
    {
      exerciseName: "High-Bar Back Squat",
      slot: {
        role: { ko: "강도일", en: "intensity" },
        sessionKey: "F",
        progressionKey: SQUAT_KEY,
        startWeightKg: 100,
        driver: true,
      },
      sets: [
        { reps: 5, percent: 0.5, targetWeightKg: 50, note: "ramp" },
        { reps: 5, percent: 0.625, targetWeightKg: 62.5, note: "ramp" },
        { reps: 5, percent: 0.75, targetWeightKg: 75, note: "ramp" },
        { reps: 5, percent: 0.875, targetWeightKg: 87.5, note: "ramp" },
        { reps: 3, percent: 1.025, targetWeightKg: 102.5, note: "PR triple" },
        { reps: 8, percent: 0.75, targetWeightKg: 75, note: "back-off" },
      ],
    },
  ],
};

function templateOf(slug: string, family: string, sessions: unknown[]) {
  return {
    slug,
    latestVersion: { definition: { kind: "manual", programFamily: family, sessions } },
  };
}

function forkDefinition(slug: string, family: string, sessions: unknown[]) {
  const drafts = inferSessionDraftsFromTemplate(templateOf(slug, family, sessions) as never);
  return toManualDefinition(drafts, { programFamily: family });
}

function prescribe(session: unknown, family: string) {
  return plannedExercisesFromSlottedLpManualSession(
    session,
    { trainingMaxKg: { [SQUAT_KEY]: 120 } },
    {},
    family,
  );
}

test("fork 후에도 Madcow 램프 퍼센트가 그대로 처방된다", () => {
  const forked = forkDefinition("madcow-5x5", "madcow-5x5", [madcowFriday]);
  const original = prescribe(madcowFriday, "madcow-5x5");
  const afterFork = prescribe(forked.sessions[0], "madcow-5x5");

  assert.deepEqual(
    afterFork[0]!.sets.map((s) => s.targetWeightKg),
    original[0]!.sets.map((s) => s.targetWeightKg),
  );
  // 120 기준: 60 / 75 / 90 / 105 / 123(1.025→122.5 반올림) / 90
  assert.deepEqual(
    afterFork[0]!.sets.map((s) => s.targetWeightKg),
    [60, 75, 90, 105, 122.5, 90],
  );
  assert.deepEqual(
    afterFork[0]!.sets.map((s) => s.reps),
    [5, 5, 5, 5, 3, 8],
  );
});

test("fork가 슬롯 메타(진행키·driver·기준무게)를 유지한다", () => {
  const forked = forkDefinition("madcow-5x5", "madcow-5x5", [madcowFriday]);
  const item = (forked.sessions[0] as { items: Array<{ slot?: Record<string, unknown> }> }).items[0]!;

  assert.equal(item.slot?.progressionKey, SQUAT_KEY);
  assert.equal(item.slot?.driver, true);
  assert.equal(item.slot?.startWeightKg, 100);
  assert.equal(prescribe(forked.sessions[0], "madcow-5x5")[0]!.progressionKey, SQUAT_KEY);
});

test("fork 후에도 nSuns의 95% AMRAP 판정 세트가 하나만 남는다", () => {
  const nsunsDay = {
    key: "D2",
    items: [
      {
        exerciseName: "High-Bar Back Squat",
        slot: {
          role: { ko: "T1", en: "T1" },
          sessionKey: "D2",
          progressionKey: SQUAT_KEY,
          startWeightKg: 120,
          driver: true,
        },
        sets: [
          { reps: 5, percent: 0.75, note: "T1" },
          { reps: 3, percent: 0.85, note: "T1" },
          { reps: 1, percent: 0.95, note: "T1 · 1+ AMRAP", amrap: true },
          { reps: 5, percent: 0.65, note: "T1 · 5+" },
        ],
      },
    ],
  };

  const forked = forkDefinition("nsuns-lp-5day", "nsuns-lp", [nsunsDay]);
  const afterFork = prescribe(forked.sessions[0], "nsuns-lp");

  assert.deepEqual(
    afterFork[0]!.sets.map((s) => s.amrap === true),
    [false, false, true, false],
  );
  assert.deepEqual(
    afterFork[0]!.sets.map((s) => s.targetWeightKg),
    [90, 102.5, 115, 77.5],
  );
});

test("편집기에서 세트 수를 바꾸면 균일 처방으로 되돌아간다(편집이 무시되지 않도록)", () => {
  const drafts = inferSessionDraftsFromTemplate(
    templateOf("madcow-5x5", "madcow-5x5", [madcowFriday]) as never,
  );
  drafts[0]!.exercises[0]!.sets = 3; // 사용자가 6세트 → 3세트로 변경

  const forked = toManualDefinition(drafts, { programFamily: "madcow-5x5" });
  const sets = (forked.sessions[0] as { items: Array<{ sets: unknown[] }> }).items[0]!.sets;

  assert.equal(sets.length, 3);
  assert.ok(sets.every((s) => (s as { percent?: number }).percent === undefined));
});

test("편집기에서 reps를 바꿔도 균일 처방으로 되돌아간다", () => {
  const drafts = inferSessionDraftsFromTemplate(
    templateOf("madcow-5x5", "madcow-5x5", [madcowFriday]) as never,
  );
  drafts[0]!.exercises[0]!.reps = 8; // 첫 행은 5회였다

  const forked = toManualDefinition(drafts, { programFamily: "madcow-5x5" });
  const sets = (forked.sessions[0] as { items: Array<{ sets: Array<{ reps: number }> }> }).items[0]!.sets;

  assert.deepEqual(sets.map((s) => s.reps), [8, 8, 8, 8, 8, 8]);
});

test("회귀: gzclp는 세트가 균일해 세트 행을 들고 다니지 않는다", () => {
  const gzclpDay = {
    key: "D1",
    items: [
      {
        exerciseName: "High-Bar Back Squat",
        slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D1", tier: "T1", progressionKey: "EX_SQUAT_T1" },
        sets: [
          { reps: 3, percent: 0.85, targetWeightKg: 100, note: "T1 main" },
          { reps: 3, percent: 0.85, targetWeightKg: 100, note: "T1 main" },
        ],
      },
    ],
  };

  const drafts = inferSessionDraftsFromTemplate(templateOf("gzclp", "gzclp", [gzclpDay]) as never);
  assert.equal(drafts[0]!.exercises[0]!.setRows, null);

  const forked = toManualDefinition(drafts, { programFamily: "gzclp" });
  const sets = (forked.sessions[0] as { items: Array<{ sets: unknown[] }> }).items[0]!.sets;
  assert.ok(sets.every((s) => (s as { percent?: number }).percent === undefined));

  // percent(0.85)를 곱하지 않고 슬롯 workKg를 전 세트에 그대로 적용하는 기존 동작 유지.
  const planned = plannedExercisesFromSlottedLpManualSession(
    forked.sessions[0],
    { trainingMaxKg: { EX_SQUAT_T1: 110 } },
    {},
    "gzclp",
  );
  assert.deepEqual(
    planned[0]!.sets.map((s) => s.targetWeightKg),
    [110, 110],
  );
});
