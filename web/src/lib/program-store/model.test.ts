import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyExerciseDraft,
  extractOneRmTargetsFromTemplate,
  getProgramDetailInfo,
  inferSessionDraftsFromTemplate,
  isOperatorTemplate,
  resolveOperatorExerciseDefaults,
  toManualDefinition,
  type ProgramTemplate,
} from "./model";

const operatorTemplate: ProgramTemplate = {
  id: "template-operator",
  slug: "operator",
  name: "Tactical Barbell Operator (Base)",
  type: "LOGIC",
  visibility: "PUBLIC",
  description: null,
  tags: ["operator"],
  latestVersion: {
    id: "version-operator",
    version: 1,
    definition: {
      kind: "operator",
      schedule: { weeks: 6, sessionsPerWeek: 3 },
      modules: ["SQUAT", "BENCH", "DEADLIFT"],
    },
    defaults: {},
  },
};

test("isOperatorTemplate detects operator logic templates", () => {
  assert.equal(isOperatorTemplate(operatorTemplate), true);
});

test("inferSessionDraftsFromTemplate returns operator day structure", () => {
  const sessions = inferSessionDraftsFromTemplate(operatorTemplate);
  assert.deepEqual(
    sessions.map((session) => ({
      key: session.key,
      exercises: session.exercises.map((exercise) => exercise.exerciseName),
    })),
    [
      { key: "D1", exercises: ["Back Squat", "Bench Press", "Pull-Up"] },
      { key: "D2", exercises: ["Back Squat", "Bench Press", "Pull-Up"] },
      { key: "D3", exercises: ["Back Squat", "Bench Press", "Deadlift"] },
    ],
  );
});

test("toManualDefinition preserves operator markers and auto/custom row metadata", () => {
  const sessions = inferSessionDraftsFromTemplate(operatorTemplate);
  const definition = toManualDefinition(sessions, {
    operatorStyle: true,
    programFamily: "operator",
  });

  assert.equal(definition.operatorStyle, true);
  assert.equal(definition.programFamily, "operator");
  assert.equal(definition.sessions[0]?.items[0]?.rowType, "AUTO");
  assert.equal(definition.sessions[0]?.items[0]?.progressionTarget, "SQUAT");
  assert.equal(definition.sessions[0]?.items[2]?.rowType, "AUTO");
  assert.equal(definition.sessions[0]?.items[2]?.progressionTarget, "PULL");
});

test("inferSessionDraftsFromTemplate prefers saved manual operator sessions over default slots", () => {
  const savedTemplate: ProgramTemplate = {
    ...operatorTemplate,
    slug: "operator-custom",
    visibility: "PRIVATE",
    latestVersion: {
      ...operatorTemplate.latestVersion!,
      definition: {
        kind: "manual",
        operatorStyle: true,
        programFamily: "operator",
        sessions: [
          {
            key: "D1",
            items: [
              {
                exerciseName: "Back Squat",
                rowType: "AUTO",
                progressionTarget: "SQUAT",
                sets: [{ reps: 5, targetWeightKg: 0 }],
              },
              {
                exerciseName: "Bench Press",
                rowType: "AUTO",
                progressionTarget: "BENCH",
                sets: [{ reps: 5, targetWeightKg: 0 }],
              },
            ],
          },
          {
            key: "D2",
            items: [],
          },
          {
            key: "D3",
            items: [
              {
                exerciseName: "Romanian Deadlift",
                rowType: "AUTO",
                progressionTarget: "DEADLIFT",
                sets: [{ reps: 5, targetWeightKg: 0 }],
              },
            ],
          },
        ],
      },
    },
  };

  const sessions = inferSessionDraftsFromTemplate(savedTemplate);
  assert.deepEqual(
    sessions.map((session) => ({
      key: session.key,
      exercises: session.exercises.map((exercise) => exercise.exerciseName),
    })),
    [
      { key: "D1", exercises: ["Back Squat", "Bench Press"] },
      { key: "D2", exercises: [] },
      { key: "D3", exercises: ["Romanian Deadlift"] },
    ],
  );
});

test("extractOneRmTargetsFromTemplate keeps operator manual auto slots per exercise", () => {
  const savedTemplate: ProgramTemplate = {
    ...operatorTemplate,
    slug: "operator-custom-targets",
    visibility: "PRIVATE",
    latestVersion: {
      ...operatorTemplate.latestVersion!,
      definition: {
        kind: "manual",
        operatorStyle: true,
        programFamily: "operator",
        sessions: [
          {
            key: "D1",
            items: [
              { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", sets: [{ reps: 5, targetWeightKg: 0 }] },
              { exerciseName: "Bench Press", rowType: "AUTO", progressionTarget: "BENCH", sets: [{ reps: 5, targetWeightKg: 0 }] },
              { exerciseName: "Pull-Up", rowType: "AUTO", progressionTarget: "PULL", sets: [{ reps: 5, targetWeightKg: 0 }] },
            ],
          },
          {
            key: "D2",
            items: [
              { exerciseName: "Barbell Row", rowType: "AUTO", progressionTarget: "PULL", sets: [{ reps: 5, targetWeightKg: 0 }] },
              { exerciseName: "Face Pull", rowType: "CUSTOM", sets: [{ reps: 15, targetWeightKg: 0 }] },
            ],
          },
          {
            key: "D3",
            items: [
              { exerciseName: "Romanian Deadlift", rowType: "AUTO", progressionTarget: "DEADLIFT", sets: [{ reps: 5, targetWeightKg: 0 }] },
            ],
          },
        ],
      },
    },
  };

  assert.deepEqual(
    extractOneRmTargetsFromTemplate(savedTemplate).map((target) => ({
      key: target.key,
      label: target.label,
      fallbackKey: target.fallbackKey ?? null,
    })),
    [
      { key: "EX_BACK_SQUAT", label: "Back Squat", fallbackKey: "SQUAT" },
      { key: "EX_BENCH_PRESS", label: "Bench Press", fallbackKey: "BENCH" },
      { key: "EX_PULL_UP", label: "Pull-Up", fallbackKey: "PULL" },
      { key: "EX_BARBELL_ROW", label: "Barbell Row", fallbackKey: "PULL" },
      { key: "EX_ROMANIAN_DEADLIFT", label: "Romanian Deadlift", fallbackKey: "DEADLIFT" },
    ],
  );
});

test("resolveOperatorExerciseDefaults returns operator main defaults", () => {
  assert.deepEqual(resolveOperatorExerciseDefaults("Pull-Up", "AUTO"), { sets: 3, reps: 5 });
  assert.deepEqual(resolveOperatorExerciseDefaults("Bench Press", "AUTO"), { sets: 3, reps: 5 });
  assert.deepEqual(resolveOperatorExerciseDefaults("Face Pull", "CUSTOM"), { sets: 3, reps: 8 });
});

test("createEmptyExerciseDraft uses operator defaults when auto row type is provided", () => {
  const operatorDraft = createEmptyExerciseDraft(null, "AUTO");
  const customOperatorDraft = createEmptyExerciseDraft(null, "CUSTOM");
  const genericDraft = createEmptyExerciseDraft();

  assert.equal(operatorDraft.sets, 3);
  assert.equal(operatorDraft.reps, 5);
  assert.equal(customOperatorDraft.sets, 3);
  assert.equal(customOperatorDraft.reps, 8);
  assert.equal(genericDraft.sets, 3);
  assert.equal(genericDraft.reps, 8);
});

const asymptoteTemplate: ProgramTemplate = {
  id: "template-asymptote",
  slug: "asymptote-protocol",
  name: "Asymptote Protocol (Base)",
  type: "LOGIC",
  visibility: "PUBLIC",
  description: null,
  tags: ["strength", "barbell", "asymptote", "intermediate", "block-periodization", "amrap"],
  latestVersion: {
    id: "version-asymptote",
    version: 1,
    definition: {
      kind: "asymptote",
      schedule: { weeks: 4, sessionsPerWeek: 3 },
      modules: ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"],
      progression: { profile: "asymptote-v1" },
    },
    defaults: { tmPercent: 0.83 },
  },
};

test("getProgramDetailInfo returns full asymptote stats, sessions, modules, and progression", () => {
  const info = getProgramDetailInfo(asymptoteTemplate, "ko");

  const cycleStat = info.stats.find((stat) => stat.key === "cycle");
  const frequencyStat = info.stats.find((stat) => stat.key === "frequency");
  const difficultyStat = info.stats.find((stat) => stat.key === "difficulty");
  const typeStat = info.stats.find((stat) => stat.key === "type");

  assert.equal(cycleStat?.value, "4사이클/블록");
  assert.equal(frequencyStat?.value, "주 3회");
  assert.equal(difficultyStat?.value, "중급");
  assert.equal(typeStat?.value, "자동 진행");

  assert.deepEqual(info.modules, ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"]);

  assert.equal(info.sessions?.length, 3);
  assert.deepEqual(
    info.sessions?.map((s) => ({ key: s.key, count: s.exercises.length })),
    [
      { key: "A", count: 3 },
      { key: "B", count: 3 },
      { key: "C", count: 3 },
    ],
  );

  const sessionA = info.sessions?.find((s) => s.key === "A");
  assert.deepEqual(
    sessionA?.exercises.map((ex) => ex.name),
    ["Back Squat", "Bench Press", "Weighted Pull-Up"],
  );
  const benchInC = info.sessions
    ?.find((s) => s.key === "C")
    ?.exercises.find((ex) => ex.name === "Bench Press");
  assert.equal(benchInC?.setsReps, "4×3+");
  assert.equal(benchInC?.hasAmrap, true);

  assert.ok(info.progressionNote);
  assert.ok(info.progressionNote?.includes("TM 83%"));
  assert.ok(info.progressionNote?.includes("AMRAP"));
});

test("getProgramDetailInfo asymptote stats in English use cycle block label", () => {
  const info = getProgramDetailInfo(asymptoteTemplate, "en");
  const cycleStat = info.stats.find((stat) => stat.key === "cycle");
  const frequencyStat = info.stats.find((stat) => stat.key === "frequency");
  assert.equal(cycleStat?.value, "4-cycle block");
  assert.equal(frequencyStat?.value, "3 days/wk");
});

test("inferSessionDraftsFromTemplate returns canonical asymptote A/B/C drafts", () => {
  const sessions = inferSessionDraftsFromTemplate(asymptoteTemplate);
  assert.deepEqual(
    sessions.map((session) => ({
      key: session.key,
      exercises: session.exercises.map((exercise) => ({
        name: exercise.exerciseName,
        sets: exercise.sets,
        reps: exercise.reps,
        progressionTarget: exercise.progressionTarget,
      })),
    })),
    [
      {
        key: "A",
        exercises: [
          { name: "Back Squat", sets: 4, reps: 3, progressionTarget: "SQUAT" },
          { name: "Bench Press", sets: 4, reps: 5, progressionTarget: "BENCH" },
          { name: "Weighted Pull-Up", sets: 4, reps: 3, progressionTarget: "PULL" },
        ],
      },
      {
        key: "B",
        exercises: [
          { name: "Back Squat", sets: 5, reps: 5, progressionTarget: "SQUAT" },
          { name: "Deadlift", sets: 3, reps: 3, progressionTarget: "DEADLIFT" },
          { name: "Weighted Pull-Up", sets: 3, reps: 8, progressionTarget: "PULL" },
        ],
      },
      {
        key: "C",
        exercises: [
          { name: "Back Squat", sets: 6, reps: 3, progressionTarget: "SQUAT" },
          { name: "Bench Press", sets: 4, reps: 3, progressionTarget: "BENCH" },
          { name: "Overhead Press", sets: 4, reps: 5, progressionTarget: "OHP" },
        ],
      },
    ],
  );
});

test("getProgramDetailInfo operator returns canonical D1/D2/D3 session breakdown", () => {
  const info = getProgramDetailInfo(operatorTemplate, "ko");
  assert.equal(info.sessions?.length, 3);
  assert.deepEqual(
    info.sessions?.map((s) => ({
      key: s.key,
      names: s.exercises.map((ex) => ex.name),
    })),
    [
      { key: "D1", names: ["Back Squat", "Bench Press", "Pull-Up"] },
      { key: "D2", names: ["Back Squat", "Bench Press", "Pull-Up"] },
      { key: "D3", names: ["Back Squat", "Bench Press", "Deadlift"] },
    ],
  );
});

test("inferSessionDraftsFromTemplate reads legacy slot roles as auto rows", () => {
  const savedTemplate: ProgramTemplate = {
    ...operatorTemplate,
    slug: "operator-legacy",
    visibility: "PRIVATE",
    latestVersion: {
      ...operatorTemplate.latestVersion!,
      definition: {
        kind: "manual",
        operatorStyle: true,
        programFamily: "operator",
        sessions: [
          {
            key: "D1",
            items: [
              { exerciseName: "Back Squat", slotRole: "ANCHOR", sets: [{ reps: 5, targetWeightKg: 0 }] },
              { exerciseName: "Pull-Up", slotRole: "FLEX", sets: [{ reps: 5, targetWeightKg: 0 }] },
              { exerciseName: "Reverse Fly", slotRole: "CUSTOM", sets: [{ reps: 15, targetWeightKg: 0 }] },
            ],
          },
        ],
      },
    },
  };

  const [session] = inferSessionDraftsFromTemplate(savedTemplate);

  assert.equal(session?.exercises[0]?.rowType, "AUTO");
  assert.equal(session?.exercises[0]?.progressionTarget, "SQUAT");
  assert.equal(session?.exercises[1]?.rowType, "AUTO");
  assert.equal(session?.exercises[1]?.progressionTarget, "PULL");
  assert.equal(session?.exercises[2]?.rowType, "CUSTOM");
});
