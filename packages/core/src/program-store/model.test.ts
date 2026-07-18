import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyExerciseDraft,
  decodeExerciseKey,
  extractOneRmTargetsFromTemplate,
  familyFallbackKeyForBaselineKey,
  getProgramDescription,
  getProgramDetailInfo,
  getProgramScheduleLabel,
  inferSessionDraftsFromTemplate,
  isAsymptoteTemplate,
  isOperatorTemplate,
  isRef5Template,
  ASYMPTOTE_HYBRID_TM_PERCENT,
  resolveOperatorExerciseDefaults,
  resolveProgramFamily,
  selectDisplayStrengthBaselineKeys,
  toManualDefinition,
  type ProgramTemplate,
} from "./model";

const ref5Template: ProgramTemplate = {
  id: "template-ref5",
  slug: "ref5-adaptive-strength",
  name: "REF5 Adaptive Strength (Base)",
  type: "LOGIC",
  visibility: "PUBLIC",
  description: "REF5 English seed description",
  tags: ["strength", "barbell", "ref5", "intermediate", "session-based"],
  latestVersion: {
    id: "version-ref5",
    version: 2,
    definition: {
      dslVersion: 1,
      kind: "ref5",
      family: "ref5",
      protocolVersion: "1.2",
      modules: ["SQUAT", "PULL", "BENCH", "DEADLIFT", "OHP"],
    },
    defaults: {
      schemaVersion: 2,
      protocolVersion: "1.2",
    },
  },
};

test("isRef5Template uses the independent REF5 public identifiers", () => {
  assert.equal(isRef5Template(ref5Template), true);
  assert.equal(isRef5Template({ ...ref5Template, slug: "renamed-ref5" }), true);
  assert.equal(
    isRef5Template({
      ...ref5Template,
      slug: "family-only",
      latestVersion: {
        ...ref5Template.latestVersion!,
        definition: { family: "ref5" },
      },
    }),
    true,
  );
  assert.equal(isRef5Template(operatorTemplate), false);
  assert.equal(isRef5Template(null), false);
});

test("REF5 store copy is bilingual and describes an open-ended session schedule", () => {
  const ko = getProgramDescription(ref5Template, "ko");
  const en = getProgramDescription(ref5Template, "en");
  assert.ok(ko && /[가-힣]/.test(ko));
  assert.ok(en?.startsWith("A session-based strength program"));
  assert.notEqual(ko, en);

  const koInfo = getProgramDetailInfo(ref5Template, "ko");
  const enInfo = getProgramDetailInfo(ref5Template, "en");
  assert.equal(koInfo.scheduleLabel, "주 2–4회 · 세션 기반 · 블록 없음");
  assert.equal(enInfo.scheduleLabel, "2–4 days/wk · Session-based · No blocks");
  assert.equal(
    getProgramScheduleLabel(ref5Template, "ko"),
    "주 2–4회 · 세션 기반 · 블록 없음",
  );
  assert.equal(koInfo.stats.find((stat) => stat.key === "cycle")?.value, "블록 없음");
  assert.equal(enInfo.stats.find((stat) => stat.key === "cycle")?.value, "No blocks");
  assert.deepEqual(koInfo.modules, ["SQUAT", "PULL", "BENCH", "DEADLIFT", "OHP"]);
  assert.equal(koInfo.sessions, null, "REF5 must not expose a finite week/day grid");
  assert.match(koInfo.progressionNote ?? "", /최근 기록\/e1RM 첫 처방/);
  assert.match(koInfo.progressionNote ?? "", /PASS\/HOLD\/FAIL\/INVALID/);
});

test("REF5 exposes no 1RM targets to the generic program start flow", () => {
  assert.deepEqual(extractOneRmTargetsFromTemplate(ref5Template), []);
  assert.equal(
    resolveProgramFamily(ref5Template),
    null,
    "REF5 must not inherit the generic fork/family registry semantics",
  );
});

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
  assert.deepEqual(resolveOperatorExerciseDefaults("AUTO"), { sets: 3, reps: 5 });
  assert.deepEqual(resolveOperatorExerciseDefaults("CUSTOM"), { sets: 3, reps: 8 });
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

test("isAsymptoteTemplate detects asymptote templates, rejects operator", () => {
  assert.equal(isAsymptoteTemplate(asymptoteTemplate), true);
  assert.equal(isAsymptoteTemplate(operatorTemplate), false);
  assert.equal(isAsymptoteTemplate(null), false);
});

test("ASYMPTOTE_HYBRID_TM_PERCENT은 0.87 (저장된 0.83보다 덜 보수적인 하이브리드 시작 배수)", () => {
  assert.equal(ASYMPTOTE_HYBRID_TM_PERCENT, 0.87);
  // 시작 시 적용되는 배수는 저장 defaults(0.83)가 아니라 하이브리드 0.87이어야 한다.
  assert.notEqual(ASYMPTOTE_HYBRID_TM_PERCENT, asymptoteTemplate.latestVersion?.defaults?.tmPercent);
});

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

const greyskullTemplate: ProgramTemplate = {
  id: "template-greyskull",
  slug: "greyskull-lp",
  name: "Greyskull LP (Base)",
  type: "MANUAL",
  visibility: "PUBLIC",
  // DB(seed)에 영어로 들어간 값. 마켓 템플릿은 코드 사전이 우선하므로 ko에서 이 값이 노출되면 안 된다(회귀).
  description:
    "A novice LP built on classic barbell basics with an AMRAP final set. After the first two work sets, the last set pushes for extra reps, letting volume auto-regulate based on how the athlete feels that day. It keeps progression simple while giving beginners more flexibility and a clearer path to adding optional assistance work.",
  tags: ["manual", "strength", "linear", "amrap", "novice"],
  latestVersion: null,
};

test("getProgramDescription localizes market copy and never falls back to the English DB value in ko", () => {
  const ko = getProgramDescription(greyskullTemplate, "ko");
  assert.ok(ko && /[가-힣]/.test(ko), "ko 소개글은 한국어여야 한다");
  assert.ok(
    !ko.startsWith("A novice LP"),
    "ko에서 DB의 영어 description으로 폴백되면 안 된다",
  );

  const en = getProgramDescription(greyskullTemplate, "en");
  assert.ok(en?.startsWith("A novice LP"), "en 소개글은 영어 마켓 카피여야 한다");

  assert.notEqual(ko, en);
});

test("getProgramDescription falls back to the DB description for custom (non-market) programs", () => {
  const customTemplate: ProgramTemplate = {
    ...greyskullTemplate,
    slug: "greyskull-lp-fork-abc123",
    visibility: "PRIVATE",
    description: "내가 직접 만든 커스텀 프로그램 설명입니다.",
  };

  // 코드 사전에 없는 slug → DB description으로 폴백(언어 무관).
  assert.equal(getProgramDescription(customTemplate, "ko"), "내가 직접 만든 커스텀 프로그램 설명입니다.");
  assert.equal(getProgramDescription(customTemplate, "en"), "내가 직접 만든 커스텀 프로그램 설명입니다.");
});

// ── plans-manage 1RM/TM 중복 표시 수정 ──
// start-program이 펼친 per-exercise(EX_) ↔ family canonical 키 쌍을, plans-manage 표시에서
// 동일 매퍼로 되접기 위한 역연산 헬퍼. extractOneRmTargetsFromTemplate가 만든 키 구조의 정역(正逆) 정합을 보장한다.

test("decodeExerciseKey reverses manualExerciseKey into a family-mappable name", () => {
  assert.equal(decodeExerciseKey("EX_BENCH_PRESS"), "BENCH PRESS");
  assert.equal(decodeExerciseKey("EX_BACK_SQUAT"), "BACK SQUAT");
  assert.equal(decodeExerciseKey("EX_PULL_UP"), "PULL UP");
  // 비-EX_ 키(canonical 등)는 그대로 반환
  assert.equal(decodeExerciseKey("BENCH"), "BENCH");
});

test("familyFallbackKeyForBaselineKey maps EX_ keys to canonical family via the shared mapper", () => {
  assert.equal(familyFallbackKeyForBaselineKey("EX_BACK_SQUAT"), "SQUAT");
  assert.equal(familyFallbackKeyForBaselineKey("EX_BENCH_PRESS"), "BENCH");
  assert.equal(familyFallbackKeyForBaselineKey("EX_PULL_UP"), "PULL");
  assert.equal(familyFallbackKeyForBaselineKey("EX_BARBELL_ROW"), "PULL");
  assert.equal(familyFallbackKeyForBaselineKey("EX_ROMANIAN_DEADLIFT"), "DEADLIFT");
  // canonical 키(EX_ 아님)는 family가 없다 → null
  assert.equal(familyFallbackKeyForBaselineKey("BENCH"), null);
  // family로 매핑되지 않는 EX_ 키도 null (start-program도 이 경우 fallbackKey를 만들지 않는다)
  assert.equal(familyFallbackKeyForBaselineKey("EX_FACE_PULL"), null);
  assert.equal(familyFallbackKeyForBaselineKey("EX_BICEP_CURL"), null);
});

test("selectDisplayStrengthBaselineKeys folds the family canonical shadow of each EX_ key", () => {
  // operator 시작 시 저장되는 평면 맵: 각 EX_ 운동 + 그 family canonical 키가 공존 → EX_만 표시.
  assert.deepEqual(
    selectDisplayStrengthBaselineKeys([
      "EX_BACK_SQUAT", "SQUAT",
      "EX_BENCH_PRESS", "BENCH",
      "EX_PULL_UP", "PULL",
    ]),
    ["EX_BACK_SQUAT", "EX_BENCH_PRESS", "EX_PULL_UP"],
  );
});

test("selectDisplayStrengthBaselineKeys keeps canonical-only keys (LOGIC programs without EX_ keys)", () => {
  assert.deepEqual(
    selectDisplayStrengthBaselineKeys(["SQUAT", "BENCH", "DEADLIFT"]),
    ["SQUAT", "BENCH", "DEADLIFT"],
  );
});

test("selectDisplayStrengthBaselineKeys keeps unmapped EX_ keys and orphan canonical keys", () => {
  // EX_FACE_PULL은 family 미매핑 → 그림자 없음. SQUAT은 짝 EX_가 없으므로 그대로 표시. 입력 순서 보존.
  assert.deepEqual(
    selectDisplayStrengthBaselineKeys(["EX_BENCH_PRESS", "BENCH", "SQUAT", "EX_FACE_PULL"]),
    ["EX_BENCH_PRESS", "SQUAT", "EX_FACE_PULL"],
  );
});

test("selectDisplayStrengthBaselineKeys keeps multiple EX_ keys sharing one family but folds the shared canonical", () => {
  // Pull-Up과 Barbell Row는 둘 다 PULL family지만 서로 다른 운동 → 둘 다 표시, PULL 그림자만 제거.
  assert.deepEqual(
    selectDisplayStrengthBaselineKeys(["EX_PULL_UP", "EX_BARBELL_ROW", "PULL"]),
    ["EX_PULL_UP", "EX_BARBELL_ROW"],
  );
});
