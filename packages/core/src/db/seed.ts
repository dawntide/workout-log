import { pathToFileURL } from "node:url";
import { db } from "./client";
import {
  exercise,
  exerciseAlias,
  plan as planTable,
  programTemplate,
  programVersion,
  statsCache,
  userSetting,
  uxEventLog,
  workoutLog,
} from "./schema";
import { and, eq } from "drizzle-orm";
import {
  REF5_IDENTIFIERS,
  REF5_INITIAL_DIRECT_STANDARDS_KG,
  REF5_LEGACY_PROTOCOL_VERSION,
  REF5_LEGACY_RUNTIME_SCHEMA_VERSION,
  REF5_RUNTIME_SCHEMA_VERSION,
  REF5_START_CONFIG_VERSION,
  deriveRef5ControlRefs,
} from "../program-engine/ref5";
import { EXERCISE_CATALOG, EXERCISE_NAMES } from "../exercise/catalog";
import { roundToNearest2p5 } from "../program-engine/round";
import { exerciseSlotKey } from "../program-store/program-registry";
import {
  madcowIntensitySets,
  madcowLightSets,
  madcowVolumeSets,
  madcowWednesdayTopSets,
  type MadcowSetRow,
} from "../program-store/madcow-blueprint";
import {
  nsunsBenchVolumeSets,
  nsunsT1Sets,
  nsunsT2Sets,
  type NsunsSetRow,
} from "../program-store/nsuns-blueprint";

export type SeedRunOptions = {
  shouldHardReset?: boolean;
  includeDemoPlans?: boolean;
  devUserId?: string;
};

export async function runSeed(options: SeedRunOptions = {}) {
  const shouldHardReset = options.shouldHardReset === true;
  const includeDemoPlans = options.includeDemoPlans === true;

  async function upsertTemplate(slug: string, values: any) {
    const rows = await db
      .insert(programTemplate)
      .values(values)
      .onConflictDoUpdate({
        target: programTemplate.slug,
        set: {
          name: values.name,
          description: values.description ?? null,
          tags: values.tags ?? null,
          type: values.type,
          visibility: values.visibility,
        },
      })
      .returning();
    return rows[0];
  }

  async function upsertVersion(templateId: string, version: number, values: any) {
    const inserted = await db
      .insert(programVersion)
      .values({
        templateId,
        version,
        ...values,
      })
      .onConflictDoUpdate({
        target: [programVersion.templateId, programVersion.version],
        set: {
          changelog: values.changelog ?? null,
          definition: values.definition,
          defaults: values.defaults ?? null,
          isDeprecated: values.isDeprecated ?? false,
        },
      })
      .returning();

    if (inserted[0]) return inserted[0];
    const rows = await db
      .select()
      .from(programVersion)
      .where(and(eq(programVersion.templateId, templateId), eq(programVersion.version, version)))
      .limit(1);
    return rows[0];
  }

  async function ensureVersion(templateId: string, version: number, values: any) {
    const inserted = await db
      .insert(programVersion)
      .values({ templateId, version, ...values })
      .onConflictDoNothing({
        target: [programVersion.templateId, programVersion.version],
      })
      .returning();
    if (inserted[0]) return inserted[0];
    return (
      await db
        .select()
        .from(programVersion)
        .where(and(eq(programVersion.templateId, templateId), eq(programVersion.version, version)))
        .limit(1)
    )[0];
  }

  async function upsertExercise(input: {
    name: string;
    category: string | null;
    aliases?: readonly string[];
  }) {
    const inserted = await db
      .insert(exercise)
      .values({
        name: input.name,
        category: input.category,
      })
      .onConflictDoNothing()
      .returning();

    const item =
      inserted[0] ??
      (
        await db
          .select()
          .from(exercise)
          .where(eq(exercise.name, input.name))
          .limit(1)
      )[0];

    if (!item) return null;

    for (const alias of input.aliases ?? []) {
      const normalizedAlias = alias.trim();
      if (!normalizedAlias) continue;
      await db
        .insert(exerciseAlias)
        .values({
          exerciseId: item.id,
          alias: normalizedAlias,
        })
        .onConflictDoNothing();
    }

    return item;
  }

  async function upsertPlanForUser(userId: string, name: string, values: any) {
    const existing = await db
      .select()
      .from(planTable)
      .where(and(eq(planTable.userId, userId), eq(planTable.name, name)))
      .limit(1);
    if (existing[0]) {
      const [updated] = await db
        .update(planTable)
        .set({
          type: values.type ?? existing[0].type,
          rootProgramVersionId: values.rootProgramVersionId ?? existing[0].rootProgramVersionId,
          params: values.params ?? existing[0].params,
          isArchived: false,
          updatedAt: new Date(),
        })
        .where(eq(planTable.id, existing[0].id))
        .returning();
      return updated ?? existing[0];
    }

    const inserted = await db
      .insert(planTable)
      .values({
        userId,
        name,
        ...values,
      })
      .returning();
    return inserted[0];
  }

  async function ensurePlanForUser(userId: string, name: string, values: any) {
    const existing = await db
      .select()
      .from(planTable)
      .where(and(eq(planTable.userId, userId), eq(planTable.name, name)))
      .limit(1);
    if (existing[0]) return existing[0];

    const inserted = await db
      .insert(planTable)
      .values({
        userId,
        name,
        ...values,
      })
      .returning();
    return inserted[0];
  }

  async function hardResetSeedData() {
    await db.delete(workoutLog);
    await db.delete(planTable);
    await db.delete(programTemplate);
    await db.delete(exercise);
    await db.delete(statsCache);
    await db.delete(userSetting);
    await db.delete(uxEventLog);
    console.log("[seed] hard reset done (workout/program/exercise/stats/settings/ux)");
  }

  function repeatSets(
    count: number,
    set: { reps?: number; targetWeightKg?: number; percent?: number; note?: string; rpe?: number },
  ) {
    return Array.from({ length: Math.max(1, count) }, () => ({ ...set }));
  }

  function repeatSetsWithLastNote(
    count: number,
    set: { reps?: number; targetWeightKg?: number; percent?: number; note?: string; rpe?: number },
    lastNote: string,
  ) {
    const rows = repeatSets(count, set);
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      note: lastNote,
    };
    return rows;
  }

  if (shouldHardReset) {
    await hardResetSeedData();
  }

  // 1) Tactical Barbell Operator (LOGIC)
  const templateOperator = await upsertTemplate("operator", {
    slug: "operator",
    name: "Tactical Barbell Operator (Base)",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "A submaximal strength program built for tactical athletes and field operators. It uses 90% of true 1RM as the training max, runs squat, bench, and deadlift through a 6-week wave, and prioritizes repeatable heavy practice without grinding failures. After each cycle, the training max is nudged upward to sustain long-term progressive overload.",
    // block-periodization: 6주 웨이브를 돌고 사이클 끝에 TM을 올린다(설명의 "6-week wave").
    tags: ["strength", "barbell", "operator", "intermediate", "block-periodization"],
  });

  const templateOperatorV1 = await upsertVersion(templateOperator.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "operator",
      schedule: { weeks: 6, sessionsPerWeek: 3 },
      modules: ["SQUAT", "BENCH", "DEADLIFT"],
      progression: {
        profile: "operator-base",
        mainSets: 3,
        deadliftSets: 3,
      },
    },
    defaults: {
      tmPercent: 0.9,
    },
  });

  // 1b) Tactical Barbell Fighter / Zulu — Operator와 같은 엔진(kind: "operator").
  // 6주 파형과 블록 증량 규칙은 공유하고 주당 세션 수·세션 구성만 다르다(variant).
  // schedule.sessionsPerWeek는 시작 시 planParams로 흘러가 reducer의 블록 완주 판정 기준이 된다.
  const templateFighter = await upsertTemplate("tb-fighter", {
    slug: "tb-fighter",
    name: "Tactical Barbell Fighter",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "The two-day Tactical Barbell template for people whose schedule cannot absorb three or four lifting sessions. Every session covers all four main lifts at 70 to 95 percent of a 90 percent training max, running the same six-week wave as Operator. It is the option that keeps strength moving when conditioning, shift work, or life takes most of the week.",
    tags: ["strength", "barbell", "tactical-barbell", "fighter", "low-frequency", "block-periodization"],
  });

  const templateFighterV1 = await upsertVersion(templateFighter.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "operator",
      variant: "fighter",
      schedule: { weeks: 6, sessionsPerWeek: 2 },
      modules: ["SQUAT", "BENCH", "OHP", "DEADLIFT"],
      progression: { profile: "fighter", mainSets: 3, deadliftSets: 3 },
    },
    defaults: { tmPercent: 0.9 },
    changelog: "Canonical 2-day Fighter cluster on the shared 6-week wave",
  });

  const templateZulu = await upsertTemplate("tb-zulu", {
    slug: "tb-zulu",
    name: "Tactical Barbell Zulu",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "The four-day Tactical Barbell template built on two alternating sessions. Every main lift is trained twice a week, which means less squatting and benching than Operator but considerably more deadlifting and overhead pressing. It suits lifters who can train four days and want the work spread across more lifts without raising the intensity.",
    tags: ["strength", "barbell", "tactical-barbell", "zulu", "intermediate", "block-periodization"],
  });

  const templateZuluV1 = await upsertVersion(templateZulu.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "operator",
      variant: "zulu",
      schedule: { weeks: 6, sessionsPerWeek: 4 },
      modules: ["SQUAT", "BENCH", "PULL", "DEADLIFT", "OHP"],
      progression: { profile: "zulu", mainSets: 3, deadliftSets: 3 },
    },
    defaults: { tmPercent: 0.9 },
    changelog: "Canonical 4-day A/B Zulu cluster on the shared 6-week wave",
  });

  // 2) Manual template (MANUAL)
  const templateManual = await upsertTemplate("manual", {
    slug: "manual",
    name: "Manual Sessions",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "A fully open manual template for lifters who want to design every exercise, set, and rep themselves. There is no automatic progression engine, so each session can be logged exactly as written. It works well when you want full control instead of adapting to a prebuilt system.",
    tags: ["manual", "custom"],
  });

  await upsertVersion(templateManual.id, 1, {
    definition: { kind: "manual", sessions: [] },
    defaults: {},
  });

  await upsertVersion(templateManual.id, 2, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "A",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: [
                { reps: 5, targetWeightKg: 80 },
                { reps: 5, targetWeightKg: 80 },
                { reps: 5, targetWeightKg: 80 },
              ],
            },
            {
              exerciseName: "Bench Press",
              sets: [
                { reps: 5, targetWeightKg: 60 },
                { reps: 5, targetWeightKg: 60 },
                { reps: 5, targetWeightKg: 60 },
              ],
            },
          ],
        },
        {
          key: "B",
          items: [
            {
              exerciseName: "Deadlift",
              sets: [
                { reps: 5, targetWeightKg: 100 },
                { reps: 5, targetWeightKg: 100 },
              ],
            },
            {
              exerciseName: "Overhead Press",
              sets: [
                { reps: 6, targetWeightKg: 40 },
                { reps: 6, targetWeightKg: 40 },
                { reps: 6, targetWeightKg: 40 },
              ],
            },
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Local demo manual sessions",
  });

  const templateStartingStrength = await upsertTemplate("starting-strength-lp", {
    slug: "starting-strength-lp",
    name: "Starting Strength LP (Base)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "Mark Rippetoe's classic novice linear progression. Train an A/B full-body split three days per week with squats, presses, deadlifts, and power cleans, adding 2.5 to 5 kg whenever the work sets are completed. The program strips away distractions and leans hard into compound barbell lifts to maximize the novice effect.",
    tags: ["manual", "strength", "linear", "novice"],
  });

  const templateStartingStrengthV1 = await upsertVersion(templateStartingStrength.id, 1, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "A",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(3, { reps: 5, targetWeightKg: 80, note: "work set" }),
            },
            {
              exerciseName: "Bench Press",
              sets: repeatSets(3, { reps: 5, targetWeightKg: 60, note: "work set" }),
            },
            {
              exerciseName: "Deadlift",
              sets: [{ reps: 5, targetWeightKg: 100, note: "top set" }],
            },
          ],
        },
        {
          key: "B",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(3, { reps: 5, targetWeightKg: 82.5, note: "work set" }),
            },
            {
              exerciseName: "Overhead Press",
              sets: repeatSets(3, { reps: 5, targetWeightKg: 42.5, note: "work set" }),
            },
            {
              exerciseName: "Power Clean",
              sets: repeatSets(5, { reps: 3, targetWeightKg: 60, note: "work set" }),
            },
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Canonical base A/B split",
  });

  const templateStronglifts = await upsertTemplate("stronglifts-5x5", {
    slug: "stronglifts-5x5",
    name: "StrongLifts 5x5 (Base)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "A novice linear progression popularized by Mehdi. It resembles Starting Strength, but most main lifts are performed for 5x5 while deadlift stays lower in volume. Weight increases happen in small, predictable jumps, and the reset rules are simple enough that new lifters can run it with very little friction.",
    tags: ["manual", "strength", "linear", "novice", "5x5"],
  });

  const templateStrongliftsV1 = await upsertVersion(templateStronglifts.id, 1, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "A",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(5, { reps: 5, targetWeightKg: 80, note: "5x5 work set" }),
            },
            {
              exerciseName: "Bench Press",
              sets: repeatSets(5, { reps: 5, targetWeightKg: 57.5, note: "5x5 work set" }),
            },
            {
              exerciseName: "Barbell Row",
              sets: repeatSets(5, { reps: 5, targetWeightKg: 55, note: "5x5 work set" }),
            },
          ],
        },
        {
          key: "B",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(5, { reps: 5, targetWeightKg: 82.5, note: "5x5 work set" }),
            },
            {
              exerciseName: "Overhead Press",
              sets: repeatSets(5, { reps: 5, targetWeightKg: 40, note: "5x5 work set" }),
            },
            {
              exerciseName: "Deadlift",
              sets: [{ reps: 5, targetWeightKg: 105, note: "1x5 top set" }],
            },
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Canonical A/B 5x5 with deadlift 1x5 day",
  });

  const templateTexasMethod = await upsertTemplate("texas-method", {
    slug: "texas-method",
    name: "Texas Method (Base)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "A weekly undulating progression for intermediate lifters who have outgrown session-to-session linear gains. The standard flow is volume day, recovery day, and intensity day within the same week, letting stress, recovery, and peak output cycle together. It is a strong bridge for athletes who still want predictable progression without novice-level recovery speed.",
    tags: ["manual", "strength", "intermediate", "weekly-undulation"],
  });

  const templateTexasMethodV1 = await upsertVersion(templateTexasMethod.id, 1, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "V",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(5, { reps: 5, targetWeightKg: 120, note: "volume day" }),
            },
            {
              exerciseName: "Bench Press",
              sets: repeatSets(5, { reps: 5, targetWeightKg: 85, note: "volume day" }),
            },
            {
              exerciseName: "Barbell Row",
              sets: repeatSets(5, { reps: 5, targetWeightKg: 75, note: "volume day" }),
            },
          ],
        },
        {
          key: "R",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(2, { reps: 5, targetWeightKg: 95, note: "recovery day" }),
            },
            {
              exerciseName: "Overhead Press",
              sets: repeatSets(3, { reps: 5, targetWeightKg: 55, note: "recovery day" }),
            },
            {
              exerciseName: "Pull-Up",
              sets: repeatSets(3, { reps: 8, note: "recovery day" }),
            },
          ],
        },
        {
          key: "I",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: [{ reps: 5, targetWeightKg: 130, note: "intensity top set" }],
            },
            {
              exerciseName: "Bench Press",
              sets: [{ reps: 5, targetWeightKg: 92.5, note: "intensity top set" }],
            },
            {
              exerciseName: "Deadlift",
              sets: [{ reps: 5, targetWeightKg: 150, note: "intensity top set" }],
            },
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Canonical V/R/I base microcycle",
  });

  const templateGzclp = await upsertTemplate("gzclp", {
    slug: "gzclp",
    name: "GZCLP (Base T1/T2/T3)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "Cody LeFever's tiered linear progression built around T1, T2, and T3 work. T1 lifts emphasize heavy strength practice, T2 movements drive additional volume, and T3 slots add high-rep work capacity and hypertrophy. It is a good fit for beginners and early intermediates who want more exercise variety than classic novice LPs.",
    // linear: 설명이 직접 "tiered linear progression"이라 명시한다.
    tags: ["manual", "strength", "tiers", "top-set", "amrap", "novice", "linear"],
  });

  const templateGzclpV1 = await upsertVersion(templateGzclp.id, 1, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "D1",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(5, { reps: 3, targetWeightKg: 100, percent: 0.85, note: "T1 main" }),
            },
            {
              exerciseName: "Bench Press",
              sets: repeatSets(3, { reps: 10, targetWeightKg: 60, percent: 0.7, note: "T2 volume" }),
            },
            {
              exerciseName: "Lat Pulldown",
              sets: repeatSetsWithLastNote(3, { reps: 15, targetWeightKg: 45, note: "T3" }, "T3 AMRAP"),
            },
          ],
        },
        {
          key: "D2",
          items: [
            {
              exerciseName: "Overhead Press",
              sets: repeatSets(5, { reps: 3, targetWeightKg: 52.5, percent: 0.85, note: "T1 main" }),
            },
            {
              exerciseName: "Deadlift",
              sets: repeatSets(3, { reps: 8, targetWeightKg: 110, percent: 0.75, note: "T2 volume" }),
            },
            {
              exerciseName: "Barbell Row",
              sets: repeatSetsWithLastNote(3, { reps: 15, targetWeightKg: 50, note: "T3" }, "T3 AMRAP"),
            },
          ],
        },
        {
          key: "D3",
          items: [
            {
              exerciseName: "Bench Press",
              sets: repeatSets(5, { reps: 3, targetWeightKg: 75, percent: 0.85, note: "T1 main" }),
            },
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSets(3, { reps: 10, targetWeightKg: 90, percent: 0.72, note: "T2 volume" }),
            },
            {
              exerciseName: "Pull-Up",
              sets: repeatSetsWithLastNote(3, { reps: 10, note: "T3" }, "T3 AMRAP"),
            },
          ],
        },
        {
          key: "D4",
          items: [
            {
              exerciseName: "Deadlift",
              sets: repeatSets(5, { reps: 3, targetWeightKg: 140, percent: 0.85, note: "T1 main" }),
            },
            {
              exerciseName: "Overhead Press",
              sets: repeatSets(3, { reps: 10, targetWeightKg: 42.5, percent: 0.72, note: "T2 volume" }),
            },
            {
              exerciseName: "Leg Press",
              sets: repeatSetsWithLastNote(3, { reps: 15, targetWeightKg: 140, note: "T3" }, "T3 AMRAP"),
            },
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Canonical base tier split with T3 AMRAP",
  });

  // 3) Wendler 5/3/1 — 3가지 변형 (보조 없음 / FSL / BBB)
  const template531 = await upsertTemplate("wendler-531", {
    slug: "wendler-531",
    name: "Jim Wendler 5/3/1 (No Assistance)",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "Jim Wendler's 5/3/1 base template with no additional assistance work. It runs a 4-week cycle using a 90% training max, builds around submaximal top sets, and finishes each main week with an AMRAP set to drive long-term progress. This version is clean and minimal: just the main work and the progression engine.",
    // block-periodization: 4주 사이클(5s/3s/5-3-1/deload) 후 TM 증가 — 주 단위로 강도가
    // 오르내리지만 texas-method의 weekly-undulation(한 주 안에서 변동)과는 다른 구조다.
    tags: ["strength", "barbell", "5/3/1", "wendler", "intermediate", "block-periodization"],
  });

  const template531V1 = await upsertVersion(template531.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "531",
      assistance: "NONE",
      schedule: { weeks: 4, sessionsPerWeek: 4 },
      modules: ["SQUAT", "BENCH", "DEADLIFT", "OHP"],
    },
    defaults: { tmPercent: 0.9 },
    changelog: "Base 5/3/1 without assistance",
  });

  const template531FSL = await upsertTemplate("wendler-531-fsl", {
    slug: "wendler-531-fsl",
    name: "Jim Wendler 5/3/1 + FSL",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "A 5/3/1 variant that adds First Set Last work after the main sets. The first working-set load is repeated for 5x5, giving you extra technical practice and useful volume without losing the character of the original program. It is one of the most practical ways to make 5/3/1 feel more productive week to week.",
    tags: ["strength", "barbell", "5/3/1", "wendler", "fsl", "intermediate", "block-periodization"],
  });

  const template531FSLV1 = await upsertVersion(template531FSL.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "531",
      assistance: "FSL",
      schedule: { weeks: 4, sessionsPerWeek: 4 },
      modules: ["SQUAT", "BENCH", "DEADLIFT", "OHP"],
    },
    defaults: { tmPercent: 0.9 },
    changelog: "5/3/1 with First Set Last 5x5",
  });

  const template531BBB = await upsertTemplate("wendler-531-bbb", {
    slug: "wendler-531-bbb",
    name: "Jim Wendler 5/3/1 + BBB",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "A 5/3/1 variant that adds Boring But Big assistance after the main work. The follow-up 5x10 sets create a much larger hypertrophy and work-capacity stimulus while the core progression still comes from the 5/3/1 top sets. It is the volume-heavy option for lifters who want more size alongside strength.",
    tags: [
      "strength",
      "barbell",
      "5/3/1",
      "wendler",
      "bbb",
      "hypertrophy",
      "intermediate",
      "block-periodization",
    ],
  });

  const template531BBBV1 = await upsertVersion(template531BBB.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "531",
      assistance: "BBB",
      schedule: { weeks: 4, sessionsPerWeek: 4 },
      modules: ["SQUAT", "BENCH", "DEADLIFT", "OHP"],
    },
    defaults: { tmPercent: 0.9 },
    changelog: "5/3/1 with Boring But Big 5x10",
  });

  // 4) Asymptote Protocol — 3-세션 로테이션(A/B/C) × 4 사이클 블록, 사이클 3 AMRAP 게이팅
  const templateAsymptote = await upsertTemplate("asymptote-protocol", {
    slug: "asymptote-protocol",
    name: "Asymptote Protocol (Base)",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "점근선 프로토콜 — 회복이 불안정한 중급 리프터를 위한 성과 기반 스트렝스 프로그램. 3-세션 로테이션(A/B/C) × 4 사이클(적응/빌드/검증/디로드) 블록 구조에서 TM은 자동으로 오르지 않고 사이클 3 AMRAP 검증으로만 갱신된다. 스쿼트/벤치/중량풀업/데드리프트/오버헤드프레스 5개 종목, 세션 기반 로테이션이라 캘린더에 묶이지 않는다.",
    tags: ["strength", "barbell", "asymptote", "intermediate", "block-periodization", "amrap"],
  });

  const templateAsymptoteV1 = await upsertVersion(templateAsymptote.id, 1, {
    definition: {
      dslVersion: 1,
      kind: "asymptote",
      schedule: { weeks: 4, sessionsPerWeek: 3 },
      modules: ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"],
      progression: { profile: "asymptote-v1" },
    },
    defaults: { tmPercent: 0.83 },
    changelog: "v1.0 — 3-session A/B/C rotation, 4-cycle blocks, cycle-3 AMRAP gating",
  });

  // REF5 Adaptive Strength — 독립 세션 기반 LOGIC 엔진. 시작 도우미가
  // e1RM을 일회성 추천에 써도 계획은 확정된 kg 직접 기준만 정본으로 보존한다.
  // v1.1은 immutable legacy version으로 남긴다.
  const ref5StartConfig = {
    initializationVersion: REF5_START_CONFIG_VERSION,
    schemaVersion: REF5_RUNTIME_SCHEMA_VERSION,
    protocolVersion: REF5_IDENTIFIERS.protocolVersion,
    startingValuesKg: { ...REF5_INITIAL_DIRECT_STANDARDS_KG },
    controlRefsKg: deriveRef5ControlRefs({ ...REF5_INITIAL_DIRECT_STANDARDS_KG }),
  } as const;

  const templateRef5 = await upsertTemplate(REF5_IDENTIFIERS.slug, {
    slug: REF5_IDENTIFIERS.slug,
    name: REF5_IDENTIFIERS.baseTemplateName,
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "A session-based adaptive strength program for irregular 2–4 day schedules. High-bar squat remains the priority across Squat, Weighted Pull-Up, Bench Press, Deadlift, and Overhead Press. Recent records or e1RM can suggest the first prescription; the plan then progresses five direct kg baselines from PASS/HOLD/FAIL/INVALID outcomes without 1RM tests, AMRAP, RIR, or finite training blocks.",
    tags: ["strength", "barbell", "ref5", "intermediate", "session-based", "adaptive"],
  });

  await ensureVersion(templateRef5.id, 1, {
    definition: {
      id: REF5_IDENTIFIERS.slug,
      dslVersion: 1,
      kind: REF5_IDENTIFIERS.kind,
      family: REF5_IDENTIFIERS.family,
      protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
      modules: ["SQUAT", "PULL", "BENCH", "DEADLIFT", "OHP"],
      progression: { profile: "ref5-v1.1" },
    },
    defaults: {
      ref5: {
        ...ref5StartConfig,
        schemaVersion: REF5_LEGACY_RUNTIME_SCHEMA_VERSION,
        protocolVersion: REF5_LEGACY_PROTOCOL_VERSION,
      },
    },
    changelog:
      "Protocol v1.1 — fixed direct kg baselines, independent adaptive session state machine",
  });

  const templateRef5V2 = await upsertVersion(templateRef5.id, 2, {
    definition: {
      id: REF5_IDENTIFIERS.slug,
      dslVersion: 1,
      kind: REF5_IDENTIFIERS.kind,
      family: REF5_IDENTIFIERS.family,
      protocolVersion: REF5_IDENTIFIERS.protocolVersion,
      modules: ["SQUAT", "PULL", "BENCH", "DEADLIFT", "OHP"],
      progression: { profile: "ref5-v1.2" },
    },
    defaults: { ref5: ref5StartConfig },
    changelog:
      "Protocol v1.2 — removes external-activity inputs and fixes all standard/micro prescriptions",
  });

  const templateGreyskull = await upsertTemplate("greyskull-lp", {
    slug: "greyskull-lp",
    name: "Greyskull LP (Base)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "A novice LP built on classic barbell basics with an AMRAP final set. After the first two work sets, the last set pushes for extra reps, letting volume auto-regulate based on how the athlete feels that day. It keeps progression simple while giving beginners more flexibility and a clearer path to adding optional assistance work.",
    tags: ["manual", "strength", "linear", "amrap", "novice"],
  });

  const templateGreyskullV1 = await upsertVersion(templateGreyskull.id, 1, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "A",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSetsWithLastNote(3, { reps: 5, targetWeightKg: 90, note: "work set" }, "AMRAP 5+"),
            },
            {
              exerciseName: "Bench Press",
              sets: repeatSetsWithLastNote(3, { reps: 5, targetWeightKg: 62.5, note: "work set" }, "AMRAP 5+"),
            },
            {
              exerciseName: "Barbell Row",
              sets: repeatSetsWithLastNote(3, { reps: 5, targetWeightKg: 57.5, note: "work set" }, "AMRAP 5+"),
            },
          ],
        },
        {
          key: "B",
          items: [
            {
              exerciseName: EXERCISE_NAMES.highBarBackSquat,
              sets: repeatSetsWithLastNote(3, { reps: 5, targetWeightKg: 92.5, note: "work set" }, "AMRAP 5+"),
            },
            {
              exerciseName: "Overhead Press",
              sets: repeatSetsWithLastNote(3, { reps: 5, targetWeightKg: 42.5, note: "work set" }, "AMRAP 5+"),
            },
            {
              exerciseName: "Deadlift",
              sets: [{ reps: 5, targetWeightKg: 110, note: "AMRAP 5+" }],
            },
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Canonical base A/B 2x5 + 1x5+ structure",
  });

  // 6) Madcow 5x5 / nSuns LP — 운동별 슬롯(퍼센트 파생) 계열.
  //
  // 두 프로그램은 "한 운동의 기준 무게(주간 탑세트 / TM) 하나"를 여러 요일이 공유하고, 각 세트는
  // 그 기준의 퍼센트로 파생된다. 그래서 seed가 슬롯 메타를 **명시**한다 —
  //  · progressionKey: 운동별 공유 키(exerciseSlotKey) → 월/수/금이 같은 workKg를 읽는다.
  //  · driver: 진행 판정을 맡는 슬롯 하나만 true → 나머지 요일이 중복 증량시키지 못한다.
  //  · startWeightKg: 기준 무게(램프 첫 세트가 아니라 탑세트/TM)의 시작값.
  // (슬롯이 없으면 처방이 요일별 독립 키로 폴백해 무게 공유가 깨지므로 생략 불가.)
  function percentSlotItem(input: {
    exerciseName: string;
    sessionKey: string;
    baseWeightKg: number;
    driver: boolean;
    roleKo: string;
    roleEn: string;
    rows: readonly (MadcowSetRow | NsunsSetRow)[];
  }) {
    return {
      exerciseName: input.exerciseName,
      slot: {
        role: { ko: input.roleKo, en: input.roleEn },
        sessionKey: input.sessionKey,
        progressionKey: exerciseSlotKey(input.exerciseName),
        startWeightKg: input.baseWeightKg,
        driver: input.driver,
      },
      sets: input.rows.map((row) => ({
        reps: row.reps,
        percent: row.percent,
        targetWeightKg: roundToNearest2p5(input.baseWeightKg * row.percent),
        note: row.note,
        ...((row as NsunsSetRow).amrap === true ? { amrap: true } : {}),
      })),
    };
  }

  // 데모 기준 무게 — Madcow는 "그 주의 탑세트(5회)", nSuns는 TM(=1RM×90%).
  const MADCOW_TOP_SET_KG = { squat: 100, bench: 75, row: 70, ohp: 45, deadlift: 130 } as const;
  const NSUNS_TM_KG = {
    squat: 120,
    bench: 90,
    ohp: 60,
    deadlift: 150,
    sumo: 140,
    frontSquat: 90,
    incline: 70,
    closeGrip: 72.5,
  } as const;

  const templateMadcow = await upsertTemplate("madcow-5x5", {
    slug: "madcow-5x5",
    name: "Madcow 5x5 (Intermediate)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "The classic intermediate successor to novice 5x5 programs. Each lift ramps in 12.5% steps to a single top set of five, and the whole week is anchored to that one number: Monday builds volume, Wednesday stays light, and Friday pushes past Monday's top set for a new weekly triple. Progression moves once per week instead of every session, which is exactly what makes it survivable once session-to-session linear gains are gone.",
    tags: ["manual", "strength", "intermediate", "5x5", "ramping", "weekly-progression"],
  });

  const templateMadcowV1 = await upsertVersion(templateMadcow.id, 1, {
    definition: {
      kind: "manual",
      programFamily: "madcow-5x5",
      sessions: [
        {
          key: "M",
          items: [
            percentSlotItem({ exerciseName: EXERCISE_NAMES.highBarBackSquat, sessionKey: "M", baseWeightKg: MADCOW_TOP_SET_KG.squat, driver: false, roleKo: "볼륨일", roleEn: "volume", rows: madcowVolumeSets() }),
            percentSlotItem({ exerciseName: "Bench Press", sessionKey: "M", baseWeightKg: MADCOW_TOP_SET_KG.bench, driver: false, roleKo: "볼륨일", roleEn: "volume", rows: madcowVolumeSets() }),
            percentSlotItem({ exerciseName: "Barbell Row", sessionKey: "M", baseWeightKg: MADCOW_TOP_SET_KG.row, driver: false, roleKo: "볼륨일", roleEn: "volume", rows: madcowVolumeSets() }),
          ],
        },
        {
          key: "W",
          items: [
            percentSlotItem({ exerciseName: EXERCISE_NAMES.highBarBackSquat, sessionKey: "W", baseWeightKg: MADCOW_TOP_SET_KG.squat, driver: false, roleKo: "라이트일", roleEn: "light", rows: madcowLightSets() }),
            percentSlotItem({ exerciseName: "Overhead Press", sessionKey: "W", baseWeightKg: MADCOW_TOP_SET_KG.ohp, driver: true, roleKo: "탑세트", roleEn: "top set", rows: madcowWednesdayTopSets() }),
            percentSlotItem({ exerciseName: "Deadlift", sessionKey: "W", baseWeightKg: MADCOW_TOP_SET_KG.deadlift, driver: true, roleKo: "탑세트", roleEn: "top set", rows: madcowWednesdayTopSets() }),
          ],
        },
        {
          key: "F",
          items: [
            percentSlotItem({ exerciseName: EXERCISE_NAMES.highBarBackSquat, sessionKey: "F", baseWeightKg: MADCOW_TOP_SET_KG.squat, driver: true, roleKo: "강도일", roleEn: "intensity", rows: madcowIntensitySets() }),
            percentSlotItem({ exerciseName: "Bench Press", sessionKey: "F", baseWeightKg: MADCOW_TOP_SET_KG.bench, driver: true, roleKo: "강도일", roleEn: "intensity", rows: madcowIntensitySets() }),
            percentSlotItem({ exerciseName: "Barbell Row", sessionKey: "F", baseWeightKg: MADCOW_TOP_SET_KG.row, driver: true, roleKo: "강도일", roleEn: "intensity", rows: madcowIntensitySets() }),
          ],
        },
      ],
    },
    // 시작 기준 무게 = 1RM × 0.8. Madcow의 기준은 TM이 아니라 "그 주의 5회 탑세트"이고,
    // 원전은 현재 5RM에 4주차에 도달하도록 역산해서 시작하라고 한다(주 2.5%씩 3주 아래).
    // 5RM ≈ 1RM×0.87, 거기서 3주 러너웨이(×0.925) → 1RM×0.8.
    defaults: { tmPercent: 0.8 },
    changelog: "Canonical M/W/F ramp with Friday PR triple",
  });

  const templateNsuns = await upsertTemplate("nsuns-lp-5day", {
    slug: "nsuns-lp-5day",
    name: "nSuns LP (5-Day)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "A high-volume linear progression born on r/Fitness that rebuilt 5/3/1 around far more work per session. Every main lift runs nine sets off a 90% training max, and the 95% AMRAP set decides how much the training max moves next week: more reps, bigger jump. Each day pairs that main lift with a second lift for another eight sets, so sessions are long but progress is fast for late novices and early intermediates.",
    tags: ["manual", "strength", "barbell", "5/3/1", "nsuns", "high-volume", "intermediate"],
  });

  const templateNsunsV1 = await upsertVersion(templateNsuns.id, 1, {
    definition: {
      kind: "manual",
      programFamily: "nsuns-lp",
      sessions: [
        {
          // D1 벤치는 볼륨 피라미드라 판정하지 않는다 — 벤치 TM은 D5(5/3/1 데이)가 굴린다.
          // D1 OHP(T2)도 D3 T1과 TM을 공유하므로 비-driver.
          key: "D1",
          items: [
            percentSlotItem({ exerciseName: "Bench Press", sessionKey: "D1", baseWeightKg: NSUNS_TM_KG.bench, driver: false, roleKo: "T1 · 볼륨", roleEn: "T1 volume", rows: nsunsBenchVolumeSets() }),
            percentSlotItem({ exerciseName: "Overhead Press", sessionKey: "D1", baseWeightKg: NSUNS_TM_KG.ohp, driver: false, roleKo: "T2 · 보조", roleEn: "T2", rows: nsunsT2Sets() }),
          ],
        },
        {
          key: "D2",
          items: [
            percentSlotItem({ exerciseName: EXERCISE_NAMES.highBarBackSquat, sessionKey: "D2", baseWeightKg: NSUNS_TM_KG.squat, driver: true, roleKo: "T1 · 메인", roleEn: "T1", rows: nsunsT1Sets("standard") }),
            percentSlotItem({ exerciseName: EXERCISE_NAMES.sumoDeadlift, sessionKey: "D2", baseWeightKg: NSUNS_TM_KG.sumo, driver: true, roleKo: "T2 · 보조", roleEn: "T2", rows: nsunsT2Sets() }),
          ],
        },
        {
          key: "D3",
          items: [
            percentSlotItem({ exerciseName: "Overhead Press", sessionKey: "D3", baseWeightKg: NSUNS_TM_KG.ohp, driver: true, roleKo: "T1 · 메인", roleEn: "T1", rows: nsunsT1Sets("standard") }),
            percentSlotItem({ exerciseName: EXERCISE_NAMES.inclineBenchPress, sessionKey: "D3", baseWeightKg: NSUNS_TM_KG.incline, driver: true, roleKo: "T2 · 보조", roleEn: "T2", rows: nsunsT2Sets() }),
          ],
        },
        {
          key: "D4",
          items: [
            percentSlotItem({ exerciseName: "Deadlift", sessionKey: "D4", baseWeightKg: NSUNS_TM_KG.deadlift, driver: true, roleKo: "T1 · 메인", roleEn: "T1", rows: nsunsT1Sets("deadlift") }),
            percentSlotItem({ exerciseName: EXERCISE_NAMES.frontSquat, sessionKey: "D4", baseWeightKg: NSUNS_TM_KG.frontSquat, driver: true, roleKo: "T2 · 보조", roleEn: "T2", rows: nsunsT2Sets() }),
          ],
        },
        {
          key: "D5",
          items: [
            percentSlotItem({ exerciseName: "Bench Press", sessionKey: "D5", baseWeightKg: NSUNS_TM_KG.bench, driver: true, roleKo: "T1 · 메인", roleEn: "T1", rows: nsunsT1Sets("bench") }),
            percentSlotItem({ exerciseName: EXERCISE_NAMES.closeGripBenchPress, sessionKey: "D5", baseWeightKg: NSUNS_TM_KG.closeGrip, driver: true, roleKo: "T2 · 보조", roleEn: "T2", rows: nsunsT2Sets() }),
          ],
        },
      ],
    },
    defaults: { tmPercent: 0.9 },
    changelog: "Canonical 5-day T1/T2 pairing with 95% AMRAP driver",
  });

  // 7) Reddit PPL / PHUL — 근비대 편향 스플릿.
  //
  // 메인 리프트만 family LP로 굴리고 보조는 전부 `role: "ASSIST"`로 둔다. 처방 플래너가 ASSIST에
  // skipProgression을 붙여, reducer가 운동명으로 family를 되짚어 Seated Row를 바벨로우 판정에
  // 섞거나 Romanian Deadlift에 데드리프트 작업중량을 덮어쓰는 일을 막는다.
  // 보조의 double progression(반복 먼저 → 중량)은 엔진이 중량만 추적하므로 자동화하지 않는다.
  function mainItem(exerciseName: string, target: string, sets: number, weightKg: number) {
    return {
      exerciseName,
      role: "MAIN" as const,
      rowType: "AUTO" as const,
      progressionTarget: target,
      sets: repeatSetsWithLastNote(
        sets,
        { reps: 5, targetWeightKg: weightKg, note: "work set" },
        "AMRAP 5+",
      ),
    };
  }

  function assistItem(exerciseName: string, sets: number, reps: number, weightKg?: number) {
    return {
      exerciseName,
      role: "ASSIST" as const,
      sets: repeatSets(sets, {
        reps,
        ...(weightKg !== undefined ? { targetWeightKg: weightKg } : {}),
        note: "accessory",
      }),
    };
  }

  const pplPullAccessories = () => [
    assistItem(EXERCISE_NAMES.latPulldown, 3, 8, 45),
    assistItem(EXERCISE_NAMES.seatedRow, 3, 8, 45),
    assistItem(EXERCISE_NAMES.facePull, 5, 15, 20),
    assistItem(EXERCISE_NAMES.hammerCurl, 4, 8, 12),
    assistItem(EXERCISE_NAMES.bicepCurl, 4, 8, 20),
  ];
  const pplPushAccessories = (secondaryPress: string, secondaryKg: number) => [
    assistItem(secondaryPress, 3, 8, secondaryKg),
    assistItem(EXERCISE_NAMES.inclineDumbbellBenchPress, 3, 8, 20),
    assistItem(EXERCISE_NAMES.tricepsPushdown, 3, 8, 25),
    assistItem(EXERCISE_NAMES.tricepsExtension, 3, 8, 20),
    assistItem(EXERCISE_NAMES.lateralRaise, 6, 15, 7.5),
  ];
  const pplLegSession = (key: string) => ({
    key,
    items: [
      mainItem(EXERCISE_NAMES.highBarBackSquat, "SQUAT", 3, 80),
      assistItem(EXERCISE_NAMES.romanianDeadlift, 3, 8, 60),
      assistItem(EXERCISE_NAMES.legPress, 3, 8, 120),
      assistItem(EXERCISE_NAMES.legCurl, 3, 8, 35),
      assistItem(EXERCISE_NAMES.calfRaise, 5, 8, 60),
    ],
  });

  const templatePpl = await upsertTemplate("reddit-ppl-6day", {
    slug: "reddit-ppl-6day",
    name: "Reddit PPL (6-Day)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "The r/Fitness push/pull/legs routine by u/Metallicadpa, run twice through in a six-day week. One barbell lift anchors each session and moves on plain linear progression, while the rest of the day is bodybuilding accessory work in the 8 to 15 rep range. It is the standard recommendation for lifters who want novice-style strength progress with far more volume for size.",
    tags: ["manual", "hypertrophy", "ppl", "linear", "novice", "high-frequency"],
  });

  const templatePplV1 = await upsertVersion(templatePpl.id, 1, {
    definition: {
      kind: "manual",
      programFamily: "reddit-ppl",
      sessions: [
        {
          key: "D1",
          items: [mainItem("Deadlift", "DEADLIFT", 1, 100), ...pplPullAccessories()],
        },
        {
          key: "D2",
          items: [
            mainItem("Bench Press", "BENCH", 5, 60),
            ...pplPushAccessories("Overhead Press", 30),
          ],
        },
        pplLegSession("D3"),
        {
          key: "D4",
          items: [mainItem("Barbell Row", "PULL", 5, 50), ...pplPullAccessories()],
        },
        {
          key: "D5",
          items: [
            mainItem("Overhead Press", "OHP", 5, 40),
            ...pplPushAccessories("Bench Press", 45),
          ],
        },
        pplLegSession("D6"),
      ],
    },
    defaults: {},
    changelog: "Canonical 6-day PPL with compound LP and accessory work",
  });

  const templatePhul = await upsertTemplate("phul", {
    slug: "phul",
    name: "PHUL (Power Hypertrophy Upper Lower)",
    type: "MANUAL",
    visibility: "PUBLIC",
    description:
      "A four-day upper/lower split that separates heavy work from volume work. Two power days drive the main barbell lifts in the 3 to 5 rep range, and two hypertrophy days chase size with moderate loads in the 8 to 12 range. Strength built on the power days raises what you can handle on the hypertrophy days, which is why it stays popular with intermediates who want both at once.",
    tags: ["manual", "hypertrophy", "strength", "upper-lower", "intermediate", "phul"],
  });

  const templatePhulV1 = await upsertVersion(templatePhul.id, 1, {
    definition: {
      kind: "manual",
      programFamily: "phul",
      sessions: [
        {
          // 파워데이 메인은 3~5회 레인지의 **상단(5회)** 로 처방한다. PHUL의 증량 규칙이
          // "레인지 상단을 전 세트 달성하면 +중량"이라, 상단을 처방해야 엔진의 LP가 그 규칙과 같아진다.
          key: "UP",
          items: [
            mainItem("Bench Press", "BENCH", 3, 70),
            mainItem("Barbell Row", "PULL", 3, 60),
            mainItem("Overhead Press", "OHP", 3, 42.5),
            assistItem(EXERCISE_NAMES.inclineDumbbellBenchPress, 3, 6, 22.5),
            assistItem(EXERCISE_NAMES.latPulldown, 3, 6, 50),
            assistItem(EXERCISE_NAMES.bicepCurl, 2, 6, 25),
            assistItem(EXERCISE_NAMES.skullcrusher, 2, 6, 20),
          ],
        },
        {
          key: "LP",
          items: [
            mainItem(EXERCISE_NAMES.highBarBackSquat, "SQUAT", 3, 90),
            mainItem("Deadlift", "DEADLIFT", 3, 110),
            assistItem(EXERCISE_NAMES.legPress, 4, 10, 130),
            assistItem(EXERCISE_NAMES.legCurl, 3, 6, 35),
            assistItem(EXERCISE_NAMES.calfRaise, 4, 6, 60),
          ],
        },
        {
          // 근비대일은 전부 ASSIST — Incline Bench(BENCH)·Front Squat(SQUAT)이 파워데이와 같은
          // family로 잡혀 한 주에 두 번 증량시키는 것을 막는다.
          key: "UH",
          items: [
            assistItem(EXERCISE_NAMES.inclineBenchPress, 3, 8, 45),
            assistItem(EXERCISE_NAMES.chestFly, 3, 8, 15),
            assistItem(EXERCISE_NAMES.seatedRow, 3, 8, 45),
            assistItem(EXERCISE_NAMES.dumbbellRow, 3, 8, 22.5),
            assistItem(EXERCISE_NAMES.lateralRaise, 3, 8, 10),
            assistItem(EXERCISE_NAMES.bicepCurl, 3, 8, 20),
            assistItem(EXERCISE_NAMES.tricepsExtension, 3, 8, 20),
          ],
        },
        {
          key: "LH",
          items: [
            assistItem(EXERCISE_NAMES.frontSquat, 3, 8, 50),
            assistItem(EXERCISE_NAMES.lunge, 3, 8, 30),
            assistItem(EXERCISE_NAMES.legExtension, 3, 10, 40),
            assistItem(EXERCISE_NAMES.legCurl, 3, 10, 30),
            assistItem(EXERCISE_NAMES.calfRaise, 3, 8, 50),
          ],
        },
      ],
    },
    defaults: {},
    changelog: "Canonical 4-day power/hypertrophy split",
  });

  for (const item of EXERCISE_CATALOG) {
    await upsertExercise(item);
  }

  const devUserId =
    options.devUserId?.trim() ||
    (process.env.WORKOUT_AUTH_USER_ID ?? "dev").trim() ||
    "dev";

  if (includeDemoPlans) {
    if (templateOperatorV1?.id) {
      await upsertPlanForUser(devUserId, "Program Tactical Barbell Operator", {
        type: "SINGLE",
        rootProgramVersionId: templateOperatorV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["D1", "D2", "D3"],
          sessionKeyMode: "DATE",
          autoProgression: true,
          trainingMaxKg: {
            SQUAT: 150,
            BENCH: 110,
            DEADLIFT: 190,
            PULL: 57.5,
          },
        },
      });
    }

    if (templateStartingStrengthV1?.id) {
      await upsertPlanForUser(devUserId, "Program Starting Strength LP", {
        type: "MANUAL",
        rootProgramVersionId: templateStartingStrengthV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["A", "B"],
          sessionKeyMode: "DATE",
        },
      });
    }

    if (templateStrongliftsV1?.id) {
      await upsertPlanForUser(devUserId, "Program StrongLifts 5x5", {
        type: "MANUAL",
        rootProgramVersionId: templateStrongliftsV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["A", "B"],
          sessionKeyMode: "DATE",
        },
      });
    }

    if (templateTexasMethodV1?.id) {
      await upsertPlanForUser(devUserId, "Program Texas Method", {
        type: "MANUAL",
        rootProgramVersionId: templateTexasMethodV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["V", "R", "I"],
          sessionKeyMode: "DATE",
          autoProgression: true,
        },
      });
    }

    if (templateGzclpV1?.id) {
      await upsertPlanForUser(devUserId, "Program GZCLP", {
        type: "MANUAL",
        rootProgramVersionId: templateGzclpV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["D1", "D2", "D3", "D4"],
          sessionKeyMode: "DATE",
          autoProgression: true,
        },
      });
    }

    if (templateGreyskullV1?.id) {
      await upsertPlanForUser(devUserId, "Program Greyskull LP", {
        type: "MANUAL",
        rootProgramVersionId: templateGreyskullV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["A", "B"],
          sessionKeyMode: "DATE",
          autoProgression: true,
          trainingMaxKg: {
            SQUAT: 90,
            BENCH: 62.5,
            OHP: 42.5,
            DEADLIFT: 110,
            PULL: 57.5,
          },
        },
      });
    }

    // 퍼센트 파생 계열은 기준 무게(탑세트/TM)를 params.trainingMaxKg에 운동별 슬롯 키로 넣는다.
    // 없으면 reducer가 첫 세션의 "평균 세트 무게"로 workKg를 잡는데, 램프 구조에서는 그 평균이
    // 탑세트보다 한참 낮아 진행이 어긋난다(슬롯 startWeightKg는 처방 폴백일 뿐 reducer는 안 읽음).
    if (templateMadcowV1?.id) {
      await upsertPlanForUser(devUserId, "Program Madcow 5x5", {
        type: "MANUAL",
        rootProgramVersionId: templateMadcowV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["M", "W", "F"],
          sessionKeyMode: "DATE",
          autoProgression: true,
          trainingMaxKg: {
            [exerciseSlotKey(EXERCISE_NAMES.highBarBackSquat)]: MADCOW_TOP_SET_KG.squat,
            [exerciseSlotKey("Bench Press")]: MADCOW_TOP_SET_KG.bench,
            [exerciseSlotKey("Barbell Row")]: MADCOW_TOP_SET_KG.row,
            [exerciseSlotKey("Overhead Press")]: MADCOW_TOP_SET_KG.ohp,
            [exerciseSlotKey("Deadlift")]: MADCOW_TOP_SET_KG.deadlift,
          },
        },
      });
    }

    if (templateNsunsV1?.id) {
      await upsertPlanForUser(devUserId, "Program nSuns LP (5-Day)", {
        type: "MANUAL",
        rootProgramVersionId: templateNsunsV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["D1", "D2", "D3", "D4", "D5"],
          sessionKeyMode: "DATE",
          autoProgression: true,
          trainingMaxKg: {
            [exerciseSlotKey(EXERCISE_NAMES.highBarBackSquat)]: NSUNS_TM_KG.squat,
            [exerciseSlotKey("Bench Press")]: NSUNS_TM_KG.bench,
            [exerciseSlotKey("Overhead Press")]: NSUNS_TM_KG.ohp,
            [exerciseSlotKey("Deadlift")]: NSUNS_TM_KG.deadlift,
            [exerciseSlotKey(EXERCISE_NAMES.sumoDeadlift)]: NSUNS_TM_KG.sumo,
            [exerciseSlotKey(EXERCISE_NAMES.frontSquat)]: NSUNS_TM_KG.frontSquat,
            [exerciseSlotKey(EXERCISE_NAMES.inclineBenchPress)]: NSUNS_TM_KG.incline,
            [exerciseSlotKey(EXERCISE_NAMES.closeGripBenchPress)]: NSUNS_TM_KG.closeGrip,
          },
        },
      });
    }

    if (templateFighterV1?.id) {
      await upsertPlanForUser(devUserId, "Program Tactical Barbell Fighter", {
        type: "SINGLE",
        rootProgramVersionId: templateFighterV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["D1", "D2"],
          sessionsPerWeek: 2,
          sessionKeyMode: "DATE",
          autoProgression: true,
          trainingMaxKg: { SQUAT: 150, BENCH: 110, DEADLIFT: 190, OHP: 65 },
        },
      });
    }

    if (templateZuluV1?.id) {
      await upsertPlanForUser(devUserId, "Program Tactical Barbell Zulu", {
        type: "SINGLE",
        rootProgramVersionId: templateZuluV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["D1", "D2", "D3", "D4"],
          sessionsPerWeek: 4,
          sessionKeyMode: "DATE",
          autoProgression: true,
          trainingMaxKg: { SQUAT: 150, BENCH: 110, DEADLIFT: 190, OHP: 65, PULL: 57.5 },
        },
      });
    }

    if (templatePplV1?.id) {
      await upsertPlanForUser(devUserId, "Program Reddit PPL", {
        type: "MANUAL",
        rootProgramVersionId: templatePplV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["D1", "D2", "D3", "D4", "D5", "D6"],
          sessionKeyMode: "DATE",
          autoProgression: true,
          progressionModel: "v2",
          trainingMaxKg: { SQUAT: 80, BENCH: 60, DEADLIFT: 100, OHP: 40, PULL: 50 },
        },
      });
    }

    if (templatePhulV1?.id) {
      await upsertPlanForUser(devUserId, "Program PHUL", {
        type: "MANUAL",
        rootProgramVersionId: templatePhulV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          schedule: ["UP", "LP", "UH", "LH"],
          sessionKeyMode: "DATE",
          autoProgression: true,
          progressionModel: "v2",
          trainingMaxKg: { SQUAT: 90, BENCH: 70, DEADLIFT: 110, OHP: 42.5, PULL: 60 },
        },
      });
    }

    if (template531V1?.id) {
      await upsertPlanForUser(devUserId, "Program 5/3/1 (No Assistance)", {
        type: "SINGLE",
        rootProgramVersionId: template531V1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          sessionKeyMode: "PROGRESSION",
          autoProgression: true,
          trainingMaxKg: { SQUAT: 120, BENCH: 85, OHP: 55, DEADLIFT: 150 },
        },
      });
    }

    if (template531FSLV1?.id) {
      await upsertPlanForUser(devUserId, "Program 5/3/1 + FSL", {
        type: "SINGLE",
        rootProgramVersionId: template531FSLV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          sessionKeyMode: "PROGRESSION",
          autoProgression: true,
          trainingMaxKg: { SQUAT: 120, BENCH: 85, OHP: 55, DEADLIFT: 150 },
        },
      });
    }

    if (template531BBBV1?.id) {
      await upsertPlanForUser(devUserId, "Program 5/3/1 + BBB", {
        type: "SINGLE",
        rootProgramVersionId: template531BBBV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          sessionKeyMode: "PROGRESSION",
          autoProgression: true,
          trainingMaxKg: { SQUAT: 120, BENCH: 85, OHP: 55, DEADLIFT: 150 },
        },
      });
    }

    if (templateAsymptoteV1?.id) {
      await upsertPlanForUser(devUserId, "Program Asymptote Protocol", {
        type: "SINGLE",
        rootProgramVersionId: templateAsymptoteV1.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          sessionKeyMode: "PROGRESSION",
          autoProgression: true,
          trainingMaxKg: { SQUAT: 95, BENCH: 75, PULL: 97.5, DEADLIFT: 95, OHP: 35 },
        },
      });
    }

    if (templateRef5V2?.id) {
      // A demo seed must never overwrite a plan the user has already started or
      // customized. REF5 is inserted once and subsequent seed runs are no-ops.
      await ensurePlanForUser(devUserId, "Program REF5 Adaptive Strength", {
        type: "SINGLE",
        rootProgramVersionId: templateRef5V2.id,
        params: {
          timezone: "Asia/Seoul",
          startDate: "2026-01-05",
          autoProgression: true,
          programFamily: REF5_IDENTIFIERS.family,
          protocolVersion: REF5_IDENTIFIERS.protocolVersion,
          ref5: ref5StartConfig,
        },
      });
    }
  }

  console.log(
    `Seed done. user=${devUserId} includeDemoPlans=${includeDemoPlans ? "1" : "0"} hardReset=${shouldHardReset ? "1" : "0"}`,
  );

  return {
    devUserId,
    includeDemoPlans,
    shouldHardReset,
    baseTemplateCount: 11,
    baseExerciseCount: EXERCISE_CATALOG.length,
  };
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  runSeed({
    shouldHardReset: process.env.WORKOUT_SEED_RESET_ALL === "1",
    includeDemoPlans: process.env.WORKOUT_SEED_INCLUDE_DEMO_PLANS === "1",
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
