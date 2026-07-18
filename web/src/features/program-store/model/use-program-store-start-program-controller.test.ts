import assert from "node:assert/strict";
import test from "node:test";
import type { ProgramTemplate } from "@workout/core/program-store/model";
import {
  buildRef5StartPlanParams,
  readRef5StartConfigFromTemplate,
  ref5E1rmValidationMessage,
  ref5StartConfigValidationMessage,
  requestOneRmStatsForProgramStart,
  requestRef5StartRecommendation,
  shouldLoadOneRmRecommendations,
  type Ref5StartRecommendationResponse,
} from "./use-program-store-start-program-controller";
import { buildInitialCreateDraft } from "./use-program-store-sheet-entry-controller";

const ref5Config = {
  initializationVersion: 1,
  schemaVersion: 2,
  protocolVersion: "1.2",
  startingValuesKg: {
    sqH3Kg: 82.5,
    bpFocusKg: 82.5,
    pullFocusTotalKg: 87.5,
    deadliftKg: 72.5,
    ohpKg: 32.5,
  },
  controlRefsKg: {
    sqKg: 104,
    bpKg: 101,
    pullTotalKg: 108,
    deadliftKg: 100,
    ohpKg: 50,
  },
} as const;

const ref5Template: ProgramTemplate = {
  id: "template-ref5",
  slug: "ref5-adaptive-strength",
  name: "REF5 Adaptive Strength (Base)",
  type: "LOGIC",
  visibility: "PUBLIC",
  description: null,
  tags: ["strength", "ref5"],
  latestVersion: {
    id: "version-ref5",
    version: 2,
    definition: {
      kind: "ref5",
      family: "ref5",
      protocolVersion: "1.2",
      modules: ["SQUAT", "PULL", "BENCH", "DEADLIFT", "OHP"],
    },
    defaults: { ref5: ref5Config },
  },
};

const manualTemplate: ProgramTemplate = {
  id: "template-manual",
  slug: "manual",
  name: "Manual Sessions",
  type: "MANUAL",
  visibility: "PUBLIC",
  description: null,
  tags: ["manual"],
  latestVersion: {
    id: "version-manual",
    version: 1,
    definition: { kind: "manual", sessions: [] },
    defaults: {},
  },
};

test("REF5 start config is read from the versioned seed defaults", () => {
  assert.deepEqual(readRef5StartConfigFromTemplate(ref5Template), ref5Config);
  assert.deepEqual(
    readRef5StartConfigFromTemplate({
      ...ref5Template,
      latestVersion: {
        ...ref5Template.latestVersion!,
        defaults: {
          ref5: {
            ...ref5Config,
            controlRefsKg: { ...ref5Config.controlRefsKg, sqKg: 999 },
          },
        },
      },
    }),
    ref5Config,
    "display REFs are re-derived from canonical direct starts",
  );
  assert.equal(
    readRef5StartConfigFromTemplate({
      ...ref5Template,
      latestVersion: {
        ...ref5Template.latestVersion!,
        defaults: { ref5: { ...ref5Config, protocolVersion: "1.0" } },
      },
    }),
    null,
  );
});

test("REF5 bypasses the generic program 1RM recommendation request", async () => {
  assert.equal(shouldLoadOneRmRecommendations(ref5Template), false);
  assert.equal(shouldLoadOneRmRecommendations(manualTemplate), true);

  let apiCalls = 0;
  const request = async () => {
    apiCalls += 1;
    return { items: [] };
  };
  const signal = new AbortController().signal;
  assert.equal(
    await requestOneRmStatsForProgramStart(ref5Template, signal, request),
    null,
  );
  assert.equal(apiCalls, 0, "REF5 must not use the generic program 1RM API");
  assert.deepEqual(
    await requestOneRmStatsForProgramStart(manualTemplate, signal, request),
    { items: [] },
  );
  assert.equal(apiCalls, 1);
});

test("REF5 loads its one-time start calibration from the dedicated boundary", async () => {
  const signal = new AbortController().signal;
  let requestedPath = "";
  const response: Ref5StartRecommendationResponse = {
    calibrationVersion: 1 as const,
    lookbackDays: 56 as const,
    maxReps: 10 as const,
    items: [],
    missingLifts: ["SQ", "BP", "PULL", "DL", "OHP"],
    calibration: null,
  };

  const actual = await requestRef5StartRecommendation(
    signal,
    async (path, options) => {
      requestedPath = path;
      assert.equal(options.signal, signal);
      return response;
    },
  );

  assert.equal(requestedPath, "/api/stats/ref5-start-recommendation");
  assert.deepEqual(actual, response);
});

test("REF5 plan params preserve user-selected direct kg baselines without generic 1RM/TM fields", () => {
  const customConfig = {
    ...ref5Config,
    startingValuesKg: {
      sqH3Kg: 90,
      bpFocusKg: 90,
      pullFocusTotalKg: 100,
      deadliftKg: 80,
      ohpKg: 35,
    },
  };
  const params = buildRef5StartPlanParams({
    timezone: "Asia/Seoul",
    today: "2026-07-13",
    config: customConfig,
  });

  assert.equal(params.programFamily, "ref5");
  assert.equal(params.protocolVersion, "1.2");
  assert.equal(params.ref5.schemaVersion, 2);
  assert.deepEqual(params.ref5.startingValuesKg, customConfig.startingValuesKg);
  assert.notDeepEqual(params.ref5.controlRefsKg, ref5Config.controlRefsKg);

  const raw = params as Record<string, unknown>;
  assert.equal("oneRepMaxKg" in raw, false);
  assert.equal("trainingMaxKg" in raw, false);
  assert.equal("schedule" in raw, false);
  assert.equal("sessionsPerWeek" in raw, false);
  assert.equal("week" in raw, false);
  assert.equal("day" in raw, false);
});

test("REF5 start validation reports the active auxiliary cap", () => {
  assert.equal(
    ref5StartConfigValidationMessage(
      {
        ...ref5Config,
        startingValuesKg: { ...ref5Config.startingValuesKg, ohpKg: 35 },
      },
      "ko",
    ),
    "OHP 시작 중량은 현재 BP 기준 상한 32.5kg 이하여야 합니다.",
  );
});

test("REF5 e1RM calibration requires all five positive inputs", () => {
  assert.equal(
    ref5E1rmValidationMessage(
      { SQ: 104, BP: 101, PULL: 108, DL: 100, OHP: 0 },
      "ko",
    ),
    "다섯 종목의 추정 1RM(e1RM)을 입력하세요. 미입력: OHP",
  );
  assert.equal(
    ref5E1rmValidationMessage(
      { SQ: 104, BP: 101, PULL: 108, DL: 100, OHP: 50 },
      "ko",
    ),
    null,
  );
});

test("REF5 is not offered as a generic official-template fork source", () => {
  const draft = buildInitialCreateDraft([ref5Template, manualTemplate]);
  assert.equal(draft.sourceTemplateSlug, "manual");
});
