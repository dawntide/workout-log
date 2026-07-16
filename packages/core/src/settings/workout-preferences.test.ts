import assert from "node:assert/strict";
import test from "node:test";
import {
  DARK_COLOR_THEMES,
  DEFAULT_DARK_COLOR_THEME,
  DEFAULT_LIGHT_COLOR_THEME,
  DEFAULT_TRAINING_GOAL_PRIMARY,
  LIGHT_COLOR_THEMES,
  SETTINGS_KEYS,
  TRAINING_GOAL_KEYS,
  normalizeDarkColorTheme,
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
