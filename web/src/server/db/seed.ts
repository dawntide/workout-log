import "dotenv/config";
import { pathToFileURL } from "node:url";
import { db } from "./client";
import {
  exercise,
  exerciseAlias,
  plan as planTable,
  planModule,
  programTemplate,
  programVersion,
  statsCache,
  userSetting,
  uxEventLog,
  workoutLog,
} from "./schema";
import { and, eq, inArray } from "drizzle-orm";

export type SeedRunOptions = {
  shouldHardReset?: boolean;
  includeDemoPlans?: boolean;
  devUserId?: string;
};

export async function runSeed(options: SeedRunOptions = {}) {
  const legacyProgramSlugs = ["starter-fullbody-3day", "531", "candito-linear", "wendler-531", "wendler-531-fsl", "wendler-531-bbb"] as const;
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

  async function upsertExercise(input: {
    name: string;
    category: string | null;
    aliases?: string[];
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

  async function removeLegacyProgramSeeds() {
    const templates = await db
      .select({
        id: programTemplate.id,
      })
      .from(programTemplate)
      .where(inArray(programTemplate.slug, [...legacyProgramSlugs]));

    if (templates.length < 1) return;

    const templateIds = templates.map((row) => row.id);
    const versions = await db
      .select({
        id: programVersion.id,
      })
      .from(programVersion)
      .where(inArray(programVersion.templateId, templateIds));
    const versionIds = versions.map((row) => row.id);

    if (versionIds.length > 0) {
      const legacyRootPlans = await db
        .select({
          id: planTable.id,
        })
        .from(planTable)
        .where(inArray(planTable.rootProgramVersionId, versionIds));

      const legacyModulePlans = await db
        .select({
          planId: planModule.planId,
        })
        .from(planModule)
        .where(inArray(planModule.programVersionId, versionIds));

      const legacyPlanIds = Array.from(
        new Set([
          ...legacyRootPlans.map((row) => row.id),
          ...legacyModulePlans.map((row) => row.planId),
        ]),
      );

      if (legacyPlanIds.length > 0) {
        await db.delete(workoutLog).where(inArray(workoutLog.planId, legacyPlanIds));
        await db.delete(planTable).where(inArray(planTable.id, legacyPlanIds));
      }

      // Safety: remove module rows that can still reference legacy versions.
      await db.delete(planModule).where(inArray(planModule.programVersionId, versionIds));
    }

    await db.delete(programTemplate).where(inArray(programTemplate.id, templateIds));
    console.log(`[seed] removed legacy templates: ${legacyProgramSlugs.join(", ")}`);
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
  await removeLegacyProgramSeeds();

  // 1) Tactical Barbell Operator (LOGIC)
  const templateOperator = await upsertTemplate("operator", {
    slug: "operator",
    name: "Tactical Barbell Operator (Base)",
    type: "LOGIC",
    visibility: "PUBLIC",
    description:
      "A submaximal strength program built for tactical athletes and field operators. It uses 90% of true 1RM as the training max, runs squat, bench, and deadlift through a 6-week wave, and prioritizes repeatable heavy practice without grinding failures. After each cycle, the training max is nudged upward to sustain long-term progressive overload.",
    tags: ["strength", "barbell", "operator", "intermediate"],
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
    tags: ["manual", "strength", "tiers", "top-set", "amrap", "novice"],
  });

  const templateGzclpV1 = await upsertVersion(templateGzclp.id, 1, {
    definition: {
      kind: "manual",
      sessions: [
        {
          key: "D1",
          items: [
            {
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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
    tags: ["strength", "barbell", "5/3/1", "wendler", "intermediate"],
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
    tags: ["strength", "barbell", "5/3/1", "wendler", "fsl", "intermediate"],
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
    tags: ["strength", "barbell", "5/3/1", "wendler", "bbb", "hypertrophy", "intermediate"],
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
              exerciseName: "Back Squat",
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
              exerciseName: "Back Squat",
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

  const seededExercises = [
    { name: "Back Squat", category: "Legs", aliases: ["Squat", "스쿼트"] },
    { name: "Bench Press", category: "Chest", aliases: ["Bench", "벤치프레스"] },
    { name: "Deadlift", category: "Back", aliases: ["DL", "데드리프트"] },
    { name: "Overhead Press", category: "Shoulder", aliases: ["OHP", "Press", "밀리터리 프레스"] },
    { name: "Barbell Row", category: "Back", aliases: ["BB Row", "바벨 로우"] },
    { name: "Pull-Up", category: "Back", aliases: ["풀업", "턱걸이"] },
    { name: "Power Clean", category: "Olympic Lift", aliases: ["Clean", "파워 클린", "파워클린"] },
    { name: "Front Squat", category: "Legs", aliases: ["FSQ", "프론트 스쿼트"] },
    { name: "Incline Bench Press", category: "Chest", aliases: ["인클라인 벤치"] },
    { name: "Romanian Deadlift", category: "Legs", aliases: ["RDL", "루마니안 데드리프트"] },
    { name: "Leg Press", category: "Legs", aliases: ["레그 프레스"] },
    { name: "Lat Pulldown", category: "Back", aliases: ["랫풀다운", "Lat Pull"] },
    { name: "Dumbbell Shoulder Press", category: "Shoulder", aliases: ["덤벨 숄더 프레스", "DB Shoulder Press"] },
    { name: "Hip Thrust", category: "Glute", aliases: ["힙 쓰러스트"] },
  ];
  for (const item of seededExercises) {
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
  }

  console.log(
    `Seed done. user=${devUserId} includeDemoPlans=${includeDemoPlans ? "1" : "0"} hardReset=${shouldHardReset ? "1" : "0"}`,
  );

  return {
    devUserId,
    includeDemoPlans,
    shouldHardReset,
    baseTemplateCount: 10,
    baseExerciseCount: seededExercises.length,
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
