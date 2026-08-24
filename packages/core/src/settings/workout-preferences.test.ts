import assert from "node:assert/strict";
import test from "node:test";
import {
  DARK_COLOR_THEMES,
  DEFAULT_DARK_COLOR_THEME,
  DEFAULT_LIGHT_COLOR_THEME,
  DEFAULT_PLATE_BAR_WEIGHT_KG,
  DEFAULT_PLATE_PLATES_KG,
  DEFAULT_REST_SECONDS,
  DEFAULT_REST_SOUND_ENABLED,
  DEFAULT_REST_WAKE_LOCK_ENABLED,
  DEFAULT_TRAINING_GOAL_PRIMARY,
  LIGHT_COLOR_THEMES,
  SETTINGS_KEYS,
  TRAINING_GOAL_KEYS,
  normalizeBarWeightKg,
  normalizeDarkColorTheme,
  normalizeRestSeconds,
  parsePlatesKg,
  parseRestPresets,
  resolveRestSeconds,
  resolveRestSecondsForExercise,
  serializePlatesKg,
  serializeRestPresets,
  normalizeLightColorTheme,
  normalizeTrainingGoal,
  parseTrainingGoalSecondary,
  readWorkoutPreferences,
  serializeTrainingGoalSecondary,
  toDefaultWorkoutPreferences,
} from "./workout-preferences";

test("color theme normalizers accept known values and reject unknown values", () => {
  for (const theme of LIGHT_COLOR_THEMES) {
    assert.equal(normalizeLightColorTheme(theme.toLowerCase()), theme);
  }
  for (const theme of DARK_COLOR_THEMES) {
    assert.equal(normalizeDarkColorTheme(theme.toLowerCase()), theme);
  }
  assert.equal(normalizeLightColorTheme("dracula"), DEFAULT_LIGHT_COLOR_THEME);
  assert.equal(normalizeDarkColorTheme("dracula"), DEFAULT_DARK_COLOR_THEME);
});

test("workout preferences keep independent light and dark color themes", () => {
  const prefs = readWorkoutPreferences({
    [SETTINGS_KEYS.lightColorTheme]: "SOLARIZED_LIGHT",
    [SETTINGS_KEYS.darkColorTheme]: "TOKYO_NIGHT",
  });
  assert.equal(prefs.lightColorTheme, "SOLARIZED_LIGHT");
  assert.equal(prefs.darkColorTheme, "TOKYO_NIGHT");

  const defaults = toDefaultWorkoutPreferences();
  assert.equal(defaults.lightColorTheme, DEFAULT_LIGHT_COLOR_THEME);
  assert.equal(defaults.darkColorTheme, DEFAULT_DARK_COLOR_THEME);
});

test("normalizeTrainingGoal accepts all known keys", () => {
  for (const key of TRAINING_GOAL_KEYS) {
    assert.equal(normalizeTrainingGoal(key), key);
  }
});

test("normalizeTrainingGoal lowercases and trims input", () => {
  assert.equal(normalizeTrainingGoal("  STRENGTH  "), "strength");
  assert.equal(normalizeTrainingGoal("Hypertrophy"), "hypertrophy");
});

test("normalizeTrainingGoal falls back to general for unknown / nullish", () => {
  assert.equal(normalizeTrainingGoal("bulking"), DEFAULT_TRAINING_GOAL_PRIMARY);
  assert.equal(normalizeTrainingGoal(""), DEFAULT_TRAINING_GOAL_PRIMARY);
  assert.equal(normalizeTrainingGoal(null), DEFAULT_TRAINING_GOAL_PRIMARY);
  assert.equal(normalizeTrainingGoal(undefined), DEFAULT_TRAINING_GOAL_PRIMARY);
  assert.equal(normalizeTrainingGoal(42), DEFAULT_TRAINING_GOAL_PRIMARY);
});

test("parseTrainingGoalSecondary parses JSON string and excludes primary", () => {
  const result = parseTrainingGoalSecondary(
    JSON.stringify(["hypertrophy", "endurance", "strength"]),
    "strength",
  );
  assert.deepEqual(result, ["hypertrophy", "endurance"]);
});

test("parseTrainingGoalSecondary accepts arrays directly", () => {
  const result = parseTrainingGoalSecondary(["powerlifting", "general"], "strength");
  assert.deepEqual(result, ["powerlifting", "general"]);
});

test("parseTrainingGoalSecondary dedupes and ignores unknown entries", () => {
  const result = parseTrainingGoalSecondary(
    ["hypertrophy", "hypertrophy", "bulking", 7, null, "endurance"],
    "general",
  );
  assert.deepEqual(result, ["hypertrophy", "endurance"]);
});

test("parseTrainingGoalSecondary returns empty array on invalid JSON", () => {
  assert.deepEqual(parseTrainingGoalSecondary("not-json", "general"), []);
  assert.deepEqual(parseTrainingGoalSecondary(null, "general"), []);
  assert.deepEqual(parseTrainingGoalSecondary(undefined, "general"), []);
});

test("serializeTrainingGoalSecondary writes deduped JSON array", () => {
  const json = serializeTrainingGoalSecondary([
    "hypertrophy",
    "hypertrophy",
    "endurance",
  ]);
  assert.deepEqual(JSON.parse(json), ["hypertrophy", "endurance"]);
});

test("readWorkoutPreferences reads trainingGoal fields from snapshot", () => {
  const prefs = readWorkoutPreferences({
    [SETTINGS_KEYS.trainingGoalPrimary]: "hypertrophy",
    [SETTINGS_KEYS.trainingGoalSecondaryJson]: JSON.stringify(["strength", "endurance"]),
  });
  assert.equal(prefs.trainingGoalPrimary, "hypertrophy");
  assert.deepEqual(prefs.trainingGoalSecondary, ["strength", "endurance"]);
});

test("readWorkoutPreferences falls back to general default when key missing", () => {
  const prefs = readWorkoutPreferences({});
  assert.equal(prefs.trainingGoalPrimary, "general");
  assert.deepEqual(prefs.trainingGoalSecondary, []);
});

test("readWorkoutPreferences excludes primary from secondary list", () => {
  const prefs = readWorkoutPreferences({
    [SETTINGS_KEYS.trainingGoalPrimary]: "strength",
    [SETTINGS_KEYS.trainingGoalSecondaryJson]: JSON.stringify([
      "strength",
      "hypertrophy",
    ]),
  });
  assert.equal(prefs.trainingGoalPrimary, "strength");
  assert.deepEqual(prefs.trainingGoalSecondary, ["hypertrophy"]);
});

test("toDefaultWorkoutPreferences uses general primary and empty secondary", () => {
  const prefs = toDefaultWorkoutPreferences();
  assert.equal(prefs.trainingGoalPrimary, "general");
  assert.deepEqual(prefs.trainingGoalSecondary, []);
});

test("layout theme is no longer part of the settings contract", () => {
  assert.equal(
    (Object.values(SETTINGS_KEYS) as string[]).includes("prefs.theme.skin"),
    false,
  );
  const prefs = readWorkoutPreferences({ "prefs.theme.skin": "terminal" });
  assert.equal("themeSkin" in prefs, false);
});

// ── 휴식 타이머 설정 (M1-1 PR1) ─────────────────────────────────────────────
// 해석 우선순위는 resolveMinimumPlateIncrement와 동일한 4단이다:
// exerciseId → 이름(id 없는 규칙 우선) → 이름(아무 규칙) → 전역 기본값.

test("normalizeRestSeconds clamps to the 5..600 range and rounds", () => {
  assert.equal(normalizeRestSeconds(90), 90);
  assert.equal(normalizeRestSeconds(90.4), 90);
  assert.equal(normalizeRestSeconds(0), 5);
  assert.equal(normalizeRestSeconds(-30), 5);
  assert.equal(normalizeRestSeconds(9999), 600);
});

test("normalizeRestSeconds falls back for nullish and non-numeric input", () => {
  assert.equal(normalizeRestSeconds(undefined), DEFAULT_REST_SECONDS);
  assert.equal(normalizeRestSeconds(null), DEFAULT_REST_SECONDS);
  assert.equal(normalizeRestSeconds("abc"), DEFAULT_REST_SECONDS);
  assert.equal(normalizeRestSeconds({}, 45), 45);
});

test("parseRestPresets reads JSON strings and arrays, dropping invalid entries", () => {
  const fromJson = parseRestPresets(
    JSON.stringify([
      { exerciseId: null, exerciseName: "Bench Press", seconds: 180 },
      { exerciseName: "", seconds: 60 },
      { exerciseName: "No Seconds" },
    ]),
  );
  assert.deepEqual(fromJson, [
    { exerciseId: null, exerciseName: "Bench Press", seconds: 180 },
  ]);

  const fromArray = parseRestPresets([
    { exerciseId: "abc", exerciseName: "Squat", seconds: 300 },
  ]);
  assert.deepEqual(fromArray, [
    { exerciseId: "abc", exerciseName: "Squat", seconds: 300 },
  ]);
});

test("parseRestPresets dedupes by id then by lowercased name", () => {
  const presets = parseRestPresets([
    { exerciseId: "id-1", exerciseName: "Squat", seconds: 300 },
    { exerciseId: "id-1", exerciseName: "Squat (dupe)", seconds: 60 },
    { exerciseId: null, exerciseName: "Bench Press", seconds: 180 },
    { exerciseId: null, exerciseName: "bench press", seconds: 90 },
  ]);
  assert.equal(presets.length, 2);
  assert.equal(presets[0]?.seconds, 300);
  assert.equal(presets[1]?.seconds, 180);
});

test("parseRestPresets returns an empty list on malformed JSON", () => {
  assert.deepEqual(parseRestPresets("{oops"), []);
  assert.deepEqual(parseRestPresets(""), []);
  assert.deepEqual(parseRestPresets(undefined), []);
});

test("serializeRestPresets writes a normalized JSON array", () => {
  const json = serializeRestPresets([
    { exerciseId: null, exerciseName: "  Squat  ", seconds: 9999 },
  ]);
  assert.deepEqual(JSON.parse(json), [
    { exerciseId: null, exerciseName: "Squat", seconds: 600 },
  ]);
});

test("resolveRestSeconds falls back to the global default with no presets", () => {
  const resolved = resolveRestSeconds(
    { restDefaultSeconds: 90, restPresets: [] },
    { exerciseName: "Squat" },
  );
  assert.deepEqual(resolved, { seconds: 90, source: "DEFAULT" });
});

test("resolveRestSeconds prefers an exact exerciseId match", () => {
  const resolved = resolveRestSeconds(
    {
      restDefaultSeconds: 90,
      restPresets: [
        { exerciseId: null, exerciseName: "Squat", seconds: 120 },
        { exerciseId: "id-1", exerciseName: "Squat", seconds: 300 },
      ],
    },
    { exerciseId: "id-1", exerciseName: "Squat" },
  );
  assert.deepEqual(resolved, { seconds: 300, source: "RULE" });
});

test("resolveRestSeconds prefers a name-only rule over a db-linked same-name rule", () => {
  const resolved = resolveRestSeconds(
    {
      restDefaultSeconds: 90,
      restPresets: [
        { exerciseId: "other-id", exerciseName: "Squat", seconds: 300 },
        { exerciseId: null, exerciseName: "squat", seconds: 120 },
      ],
    },
    { exerciseName: "Squat" },
  );
  assert.deepEqual(resolved, { seconds: 120, source: "RULE" });
});

test("resolveRestSeconds falls back to any same-name rule when no name-only rule exists", () => {
  const resolved = resolveRestSeconds(
    {
      restDefaultSeconds: 90,
      restPresets: [{ exerciseId: "other-id", exerciseName: "Squat", seconds: 300 }],
    },
    { exerciseName: "  SQUAT  " },
  );
  assert.deepEqual(resolved, { seconds: 300, source: "RULE" });
});

test("resolveRestSecondsForExercise returns just the seconds", () => {
  assert.equal(
    resolveRestSecondsForExercise(
      { restDefaultSeconds: 90, restPresets: [] },
      { exerciseName: "Deadlift" },
    ),
    90,
  );
});

test("readWorkoutPreferences reads rest timer settings from the snapshot", () => {
  const prefs = readWorkoutPreferences({
    [SETTINGS_KEYS.restDefaultSeconds]: 120,
    [SETTINGS_KEYS.restPresetsJson]: JSON.stringify([
      { exerciseId: null, exerciseName: "Squat", seconds: 300 },
    ]),
    [SETTINGS_KEYS.restSoundEnabled]: false,
    [SETTINGS_KEYS.restWakeLockEnabled]: true,
  });
  assert.equal(prefs.restDefaultSeconds, 120);
  assert.deepEqual(prefs.restPresets, [
    { exerciseId: null, exerciseName: "Squat", seconds: 300 },
  ]);
  assert.equal(prefs.restSoundEnabled, false);
  assert.equal(prefs.restWakeLockEnabled, true);
});

test("readWorkoutPreferences uses rest defaults when keys are missing", () => {
  const prefs = readWorkoutPreferences({});
  assert.equal(prefs.restDefaultSeconds, DEFAULT_REST_SECONDS);
  assert.deepEqual(prefs.restPresets, []);
  assert.equal(prefs.restSoundEnabled, DEFAULT_REST_SOUND_ENABLED);
  assert.equal(prefs.restWakeLockEnabled, DEFAULT_REST_WAKE_LOCK_ENABLED);
});

test("toDefaultWorkoutPreferences carries the rest timer defaults", () => {
  const prefs = toDefaultWorkoutPreferences();
  assert.equal(prefs.restDefaultSeconds, DEFAULT_REST_SECONDS);
  assert.deepEqual(prefs.restPresets, []);
  assert.equal(prefs.restSoundEnabled, DEFAULT_REST_SOUND_ENABLED);
  assert.equal(prefs.restWakeLockEnabled, DEFAULT_REST_WAKE_LOCK_ENABLED);
});

// ── 플레이트 인벤토리 설정 (M1-2 PR3) ──────────────────────────────────────

test("normalizeBarWeightKg clamps to 0..60 and treats null as unset", () => {
  assert.equal(normalizeBarWeightKg(20), 20);
  assert.equal(normalizeBarWeightKg(15), 15);
  assert.equal(normalizeBarWeightKg(-5), 0);
  assert.equal(normalizeBarWeightKg(999), 60);
  assert.equal(normalizeBarWeightKg(null), DEFAULT_PLATE_BAR_WEIGHT_KG);
  assert.equal(normalizeBarWeightKg(undefined), DEFAULT_PLATE_BAR_WEIGHT_KG);
  assert.equal(normalizeBarWeightKg("nope"), DEFAULT_PLATE_BAR_WEIGHT_KG);
});

test("parsePlatesKg dedupes, filters out-of-range values, and sorts descending", () => {
  assert.deepEqual(parsePlatesKg([20, 25, 20, 2.5]), [25, 20, 2.5]);
  assert.deepEqual(parsePlatesKg([0, -5, 0.1, 100, 20]), [20]);
  assert.deepEqual(parsePlatesKg(JSON.stringify([10, 5])), [10, 5]);
});

test("parsePlatesKg returns an empty list for malformed input", () => {
  assert.deepEqual(parsePlatesKg("{oops"), []);
  assert.deepEqual(parsePlatesKg(undefined), []);
  assert.deepEqual(parsePlatesKg("[]"), []);
});

test("serializePlatesKg writes a normalized descending JSON array", () => {
  assert.deepEqual(JSON.parse(serializePlatesKg([2.5, 25, 25, 999])), [25, 2.5]);
});

test("readWorkoutPreferences falls back to the default plate set when none is stored", () => {
  const prefs = readWorkoutPreferences({});
  assert.equal(prefs.plateBarWeightKg, DEFAULT_PLATE_BAR_WEIGHT_KG);
  assert.deepEqual(prefs.platePlatesKg, [...DEFAULT_PLATE_PLATES_KG]);
});

test("readWorkoutPreferences reads a stored plate inventory", () => {
  const prefs = readWorkoutPreferences({
    [SETTINGS_KEYS.plateBarWeightKg]: 15,
    [SETTINGS_KEYS.platePlatesJson]: JSON.stringify([20, 10, 5]),
  });
  assert.equal(prefs.plateBarWeightKg, 15);
  assert.deepEqual(prefs.platePlatesKg, [20, 10, 5]);
});

test("an empty stored plate list falls back to the defaults", () => {
  // 원판을 전부 지운 상태를 "가진 게 없다"로 읽으면 계산기가 늘 빈 바만 보여준다.
  const prefs = readWorkoutPreferences({ [SETTINGS_KEYS.platePlatesJson]: "[]" });
  assert.deepEqual(prefs.platePlatesKg, [...DEFAULT_PLATE_PLATES_KG]);
});
