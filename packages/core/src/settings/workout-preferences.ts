import {
  computeBodyweightTotalLoadKg,
  isBodyweightExerciseName,
} from "@workout/core/bodyweight-load";

export type SettingValue = string | number | boolean | null;
export type SettingsSnapshot = Record<string, SettingValue>;

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";
export type LightColorTheme =
  | "PAPER"
  | "GITHUB_LIGHT"
  | "SOLARIZED_LIGHT"
  | "CATPPUCCIN_LATTE"
  | "TOKYO_NIGHT_DAY"
  | "GRUVBOX_LIGHT"
  | "KANAGAWA_LOTUS";
export type DarkColorTheme =
  | "OBSIDIAN"
  | "GITHUB_DARK"
  | "SOLARIZED_DARK"
  | "CATPPUCCIN_MOCHA"
  | "TOKYO_NIGHT"
  | "GRUVBOX_DARK"
  | "KANAGAWA_WAVE";
export type LocalePreference = "ko" | "en";

export const LIGHT_COLOR_THEMES: readonly LightColorTheme[] = [
  "PAPER",
  "GITHUB_LIGHT",
  "SOLARIZED_LIGHT",
  "CATPPUCCIN_LATTE",
  "TOKYO_NIGHT_DAY",
  "GRUVBOX_LIGHT",
  "KANAGAWA_LOTUS",
] as const;

export const DARK_COLOR_THEMES: readonly DarkColorTheme[] = [
  "OBSIDIAN",
  "GITHUB_DARK",
  "SOLARIZED_DARK",
  "CATPPUCCIN_MOCHA",
  "TOKYO_NIGHT",
  "GRUVBOX_DARK",
  "KANAGAWA_WAVE",
] as const;

export type TrainingGoalKey =
  | "strength"
  | "hypertrophy"
  | "endurance"
  | "general"
  | "powerlifting";

export const TRAINING_GOAL_KEYS: readonly TrainingGoalKey[] = [
  "strength",
  "hypertrophy",
  "endurance",
  "general",
  "powerlifting",
] as const;

export type MinimumPlateRule = {
  exerciseId: string | null;
  exerciseName: string;
  incrementKg: number;
};

export type RestPresetRule = {
  exerciseId: string | null;
  exerciseName: string;
  seconds: number;
};

export type ResolvedRestSeconds = {
  seconds: number;
  source: "DEFAULT" | "RULE";
};

export type PlateInventoryPreference = {
  barWeightKg: number;
  platesKg: number[];
};

/**
 * 세트 강도를 어느 방향으로 입력·표시할지. **저장값은 항상 RPE 스케일**이고 이건
 * 표시 설정일 뿐이다 — 세트마다 모드를 기록하면 통계·CSV·TUI로 복잡도가 번지는데
 * 이득이 없다(계획서 docs/rir-input-plan.md 결정 4).
 */
export const INTENSITY_INPUTS = ["RPE", "RIR"] as const;
export type IntensityInput = (typeof INTENSITY_INPUTS)[number];

export type WorkoutPreferences = {
  locale: LocalePreference;
  theme: ThemePreference;
  lightColorTheme: LightColorTheme;
  darkColorTheme: DarkColorTheme;
  minimumPlateDefaultKg: number;
  minimumPlateRules: MinimumPlateRule[];
  bodyweightKg: number | null;
  trainingGoalPrimary: TrainingGoalKey;
  trainingGoalSecondary: TrainingGoalKey[];
  restDefaultSeconds: number;
  restPresets: RestPresetRule[];
  restSoundEnabled: boolean;
  restWakeLockEnabled: boolean;
  plateBarWeightKg: number;
  platePlatesKg: number[];
  intensityInput: IntensityInput;
};

export type ResolvedMinimumPlateIncrement = {
  incrementKg: number;
  source: "DEFAULT" | "RULE";
};

export const SETTINGS_KEYS = {
  locale: "prefs.locale",
  theme: "prefs.theme.mode",
  lightColorTheme: "prefs.theme.light",
  darkColorTheme: "prefs.theme.dark",
  minimumPlateDefaultKg: "prefs.minimumPlate.defaultKg",
  minimumPlateRulesJson: "prefs.minimumPlate.rulesJson",
  bodyweightKg: "prefs.bodyweight.kg",
  trainingGoalPrimary: "prefs.trainingGoal.primary",
  trainingGoalSecondaryJson: "prefs.trainingGoal.secondaryJson",
  restDefaultSeconds: "prefs.rest.defaultSeconds",
  restPresetsJson: "prefs.rest.presetsJson",
  restSoundEnabled: "prefs.rest.soundEnabled",
  restWakeLockEnabled: "prefs.rest.wakeLockEnabled",
  plateBarWeightKg: "prefs.plate.barWeightKg",
  platePlatesJson: "prefs.plate.platesJson",
  intensityInput: "prefs.intensityInput",
} as const;

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = "ko";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "SYSTEM";
export const DEFAULT_LIGHT_COLOR_THEME: LightColorTheme = "PAPER";
export const DEFAULT_DARK_COLOR_THEME: DarkColorTheme = "OBSIDIAN";
export const DEFAULT_MINIMUM_PLATE_KG = 2.5;
export const DEFAULT_BODYWEIGHT_KG: number | null = null;
export const DEFAULT_INTENSITY_INPUT: IntensityInput = "RPE";
export const DEFAULT_TRAINING_GOAL_PRIMARY: TrainingGoalKey = "general";
export const DEFAULT_TRAINING_GOAL_SECONDARY: TrainingGoalKey[] = [];
/**
 * 90초 — 로드맵 §M1-1 결정 2. 폐기된 기획(v2-next-pr-plan §B3)은 3분을 전제했으나 그건
 * 파워리프팅 기준이고, 보조 운동이 많은 우리 프로그램 구성에는 90초가 맞다. 처방(restSeconds)이나
 * 운동별 프리셋이 있으면 어차피 덮인다.
 */
export const DEFAULT_REST_SECONDS = 90;
export const DEFAULT_REST_SOUND_ENABLED = true;
/** 배터리 영향이 있어 기본 off — 사용자가 명시적으로 켠다. */
export const DEFAULT_REST_WAKE_LOCK_ENABLED = false;
/** 올림픽 바 20kg — 대부분의 헬스장 기본. 종목별 오버라이드는 1차 범위 밖이다. */
export const DEFAULT_PLATE_BAR_WEIGHT_KG = 20;
export const DEFAULT_PLATE_PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

const MIN_INCREMENT_KG = 0.25;
const MAX_INCREMENT_KG = 25;
const MIN_REST_SECONDS = 5;
const MAX_REST_SECONDS = 600;
const MIN_BAR_WEIGHT_KG = 0;
const MAX_BAR_WEIGHT_KG = 60;
const MIN_PLATE_KG = 0.25;
const MAX_PLATE_KG = 50;
export const LOCAL_STORAGE_SETTING_PREFIX = "workout-log.setting.v1.";

function toRounded2(value: number) {
  return Math.round(value * 100) / 100;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function toExerciseNameKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "LIGHT") return "LIGHT";
  if (normalized === "DARK") return "DARK";
  return "SYSTEM";
}

export function normalizeLightColorTheme(value: unknown): LightColorTheme {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if ((LIGHT_COLOR_THEMES as readonly string[]).includes(normalized)) {
    return normalized as LightColorTheme;
  }
  return DEFAULT_LIGHT_COLOR_THEME;
}

export function normalizeDarkColorTheme(value: unknown): DarkColorTheme {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if ((DARK_COLOR_THEMES as readonly string[]).includes(normalized)) {
    return normalized as DarkColorTheme;
  }
  return DEFAULT_DARK_COLOR_THEME;
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("en")) return "en";
  return "ko";
}

export function normalizeTrainingGoal(value: unknown): TrainingGoalKey {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if ((TRAINING_GOAL_KEYS as readonly string[]).includes(normalized)) {
    return normalized as TrainingGoalKey;
  }
  return DEFAULT_TRAINING_GOAL_PRIMARY;
}

/** 미지 값은 기본(RPE)으로 떨어진다 — 구 클라이언트가 보낸 값이 화면을 깨지 못한다. */
export function normalizeIntensityInput(value: unknown): IntensityInput {
  const normalized = String(value ?? "").trim().toUpperCase();
  if ((INTENSITY_INPUTS as readonly string[]).includes(normalized)) {
    return normalized as IntensityInput;
  }
  return DEFAULT_INTENSITY_INPUT;
}

function isTrainingGoalKey(value: unknown): value is TrainingGoalKey {
  return (
    typeof value === "string" &&
    (TRAINING_GOAL_KEYS as readonly string[]).includes(value.toLowerCase())
  );
}

export function parseTrainingGoalSecondary(
  value: unknown,
  primary: TrainingGoalKey = DEFAULT_TRAINING_GOAL_PRIMARY,
): TrainingGoalKey[] {
  let entries: unknown[] = [];
  if (Array.isArray(value)) entries = value;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {
      entries = [];
    }
  }
  const seen = new Set<TrainingGoalKey>([primary]);
  const result: TrainingGoalKey[] = [];
  for (const entry of entries) {
    if (!isTrainingGoalKey(entry)) continue;
    const key = entry.toLowerCase() as TrainingGoalKey;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

export function serializeTrainingGoalSecondary(goals: TrainingGoalKey[]): string {
  const filtered = goals.filter(isTrainingGoalKey).map((g) => g.toLowerCase() as TrainingGoalKey);
  return JSON.stringify(Array.from(new Set(filtered)));
}

export function normalizeIncrementKg(value: unknown, fallback = DEFAULT_MINIMUM_PLATE_KG): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  return toRounded2(Math.max(MIN_INCREMENT_KG, Math.min(MAX_INCREMENT_KG, parsed)));
}

function normalizeRule(raw: unknown): MinimumPlateRule | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const incrementKg = normalizeIncrementKg(record.incrementKg, Number.NaN);
  if (!Number.isFinite(incrementKg)) return null;

  const exerciseIdRaw = typeof record.exerciseId === "string" ? record.exerciseId.trim() : "";
  const exerciseName = typeof record.exerciseName === "string" ? record.exerciseName.trim() : "";
  if (!exerciseName) return null;

  return {
    exerciseId: exerciseIdRaw || null,
    exerciseName,
    incrementKg,
  };
}

function parseRuleEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseMinimumPlateRules(value: unknown): MinimumPlateRule[] {
  const entries = parseRuleEntries(value);
  if (entries.length === 0) return [];

  const normalized: MinimumPlateRule[] = [];
  const dedupe = new Set<string>();
  for (const entry of entries) {
    const rule = normalizeRule(entry);
    if (!rule) continue;
    const key = rule.exerciseId ? `id:${rule.exerciseId}` : `name:${rule.exerciseName.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    normalized.push(rule);
  }
  return normalized;
}

export function serializeMinimumPlateRules(rules: MinimumPlateRule[]): string {
  const normalized = rules
    .map((rule) => normalizeRule(rule))
    .filter(Boolean) as MinimumPlateRule[];
  return JSON.stringify(normalized);
}

export function normalizeRestSeconds(value: unknown, fallback = DEFAULT_REST_SECONDS): number {
  // null/undefined/빈 문자열은 "미설정"이다. toFiniteNumber는 Number(null) === 0 때문에
  // null을 0으로 읽어 최솟값으로 클램프해버리므로 여기서 먼저 걸러낸다.
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  const clamped = Math.max(MIN_REST_SECONDS, Math.min(MAX_REST_SECONDS, parsed));
  return Math.round(clamped);
}

function normalizeRestPreset(raw: unknown): RestPresetRule | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const seconds = normalizeRestSeconds(record.seconds, Number.NaN);
  if (!Number.isFinite(seconds)) return null;

  const exerciseIdRaw = typeof record.exerciseId === "string" ? record.exerciseId.trim() : "";
  const exerciseName = typeof record.exerciseName === "string" ? record.exerciseName.trim() : "";
  if (!exerciseName) return null;

  return {
    exerciseId: exerciseIdRaw || null,
    exerciseName,
    seconds,
  };
}

export function parseRestPresets(value: unknown): RestPresetRule[] {
  const entries = parseRuleEntries(value);
  if (entries.length === 0) return [];

  const normalized: RestPresetRule[] = [];
  const dedupe = new Set<string>();
  for (const entry of entries) {
    const preset = normalizeRestPreset(entry);
    if (!preset) continue;
    const key = preset.exerciseId
      ? `id:${preset.exerciseId}`
      : `name:${preset.exerciseName.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    normalized.push(preset);
  }
  return normalized;
}

export function serializeRestPresets(presets: RestPresetRule[]): string {
  const normalized = presets
    .map((preset) => normalizeRestPreset(preset))
    .filter(Boolean) as RestPresetRule[];
  return JSON.stringify(normalized);
}

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

export function normalizeBarWeightKg(
  value: unknown,
  fallback = DEFAULT_PLATE_BAR_WEIGHT_KG,
): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  return toRounded2(Math.max(MIN_BAR_WEIGHT_KG, Math.min(MAX_BAR_WEIGHT_KG, parsed)));
}

/** 보유 원판 목록 — 중복·범위 밖 값을 걸러 내림차순으로 정규화한다. */
export function parsePlatesKg(value: unknown): number[] {
  const entries = parseRuleEntries(value);
  const normalized = new Set<number>();
  for (const entry of entries) {
    const parsed = toFiniteNumber(entry);
    if (parsed === null) continue;
    if (parsed < MIN_PLATE_KG || parsed > MAX_PLATE_KG) continue;
    normalized.add(toRounded2(parsed));
  }
  return Array.from(normalized).sort((a, b) => b - a);
}

export function serializePlatesKg(platesKg: readonly number[]): string {
  return JSON.stringify(parsePlatesKg(platesKg));
}

export function readWorkoutPreferences(snapshot: SettingsSnapshot): WorkoutPreferences {
  const locale = normalizeLocalePreference(snapshot[SETTINGS_KEYS.locale]);
  const theme = normalizeThemePreference(snapshot[SETTINGS_KEYS.theme]);
  const lightColorTheme = normalizeLightColorTheme(
    snapshot[SETTINGS_KEYS.lightColorTheme],
  );
  const darkColorTheme = normalizeDarkColorTheme(
    snapshot[SETTINGS_KEYS.darkColorTheme],
  );
  const minimumPlateDefaultKg = normalizeIncrementKg(
    snapshot[SETTINGS_KEYS.minimumPlateDefaultKg],
    DEFAULT_MINIMUM_PLATE_KG,
  );
  const minimumPlateRules = parseMinimumPlateRules(snapshot[SETTINGS_KEYS.minimumPlateRulesJson]);
  const bodyweightRaw = toFiniteNumber(snapshot[SETTINGS_KEYS.bodyweightKg]);
  const bodyweightKg =
    bodyweightRaw === null || bodyweightRaw <= 0 ? DEFAULT_BODYWEIGHT_KG : toRounded2(bodyweightRaw);
  const trainingGoalPrimary = normalizeTrainingGoal(snapshot[SETTINGS_KEYS.trainingGoalPrimary]);
  const trainingGoalSecondary = parseTrainingGoalSecondary(
    snapshot[SETTINGS_KEYS.trainingGoalSecondaryJson],
    trainingGoalPrimary,
  );
  const restDefaultSeconds = normalizeRestSeconds(
    snapshot[SETTINGS_KEYS.restDefaultSeconds],
    DEFAULT_REST_SECONDS,
  );
  const restPresets = parseRestPresets(snapshot[SETTINGS_KEYS.restPresetsJson]);
  const restSoundEnabled = normalizeBooleanPreference(
    snapshot[SETTINGS_KEYS.restSoundEnabled],
    DEFAULT_REST_SOUND_ENABLED,
  );
  const restWakeLockEnabled = normalizeBooleanPreference(
    snapshot[SETTINGS_KEYS.restWakeLockEnabled],
    DEFAULT_REST_WAKE_LOCK_ENABLED,
  );
  const plateBarWeightKg = normalizeBarWeightKg(
    snapshot[SETTINGS_KEYS.plateBarWeightKg],
    DEFAULT_PLATE_BAR_WEIGHT_KG,
  );
  const parsedPlates = parsePlatesKg(snapshot[SETTINGS_KEYS.platePlatesJson]);
  const platePlatesKg = parsedPlates.length > 0 ? parsedPlates : [...DEFAULT_PLATE_PLATES_KG];

  return {
    locale,
    theme,
    lightColorTheme,
    darkColorTheme,
    minimumPlateDefaultKg,
    minimumPlateRules,
    bodyweightKg,
    trainingGoalPrimary,
    trainingGoalSecondary,
    restDefaultSeconds,
    restPresets,
    restSoundEnabled,
    restWakeLockEnabled,
    plateBarWeightKg,
    platePlatesKg,
    intensityInput: normalizeIntensityInput(snapshot[SETTINGS_KEYS.intensityInput]),
  };
}

export function toDefaultWorkoutPreferences(): WorkoutPreferences {
  return {
    locale: DEFAULT_LOCALE_PREFERENCE,
    theme: DEFAULT_THEME_PREFERENCE,
    lightColorTheme: DEFAULT_LIGHT_COLOR_THEME,
    darkColorTheme: DEFAULT_DARK_COLOR_THEME,
    minimumPlateDefaultKg: DEFAULT_MINIMUM_PLATE_KG,
    minimumPlateRules: [],
    bodyweightKg: DEFAULT_BODYWEIGHT_KG,
    trainingGoalPrimary: DEFAULT_TRAINING_GOAL_PRIMARY,
    trainingGoalSecondary: [...DEFAULT_TRAINING_GOAL_SECONDARY],
    restDefaultSeconds: DEFAULT_REST_SECONDS,
    restPresets: [],
    restSoundEnabled: DEFAULT_REST_SOUND_ENABLED,
    restWakeLockEnabled: DEFAULT_REST_WAKE_LOCK_ENABLED,
    plateBarWeightKg: DEFAULT_PLATE_BAR_WEIGHT_KG,
    platePlatesKg: [...DEFAULT_PLATE_PLATES_KG],
    intensityInput: DEFAULT_INTENSITY_INPUT,
  };
}

export function resolveMinimumPlateIncrementKg(
  preferences: Pick<WorkoutPreferences, "minimumPlateDefaultKg" | "minimumPlateRules">,
  input: {
    exerciseId?: string | null;
    exerciseName: string;
  },
): number {
  return resolveMinimumPlateIncrement(preferences, input).incrementKg;
}

export function resolveMinimumPlateIncrement(
  preferences: Pick<WorkoutPreferences, "minimumPlateDefaultKg" | "minimumPlateRules">,
  input: {
    exerciseId?: string | null;
    exerciseName: string;
  },
): ResolvedMinimumPlateIncrement {
  const byId = input.exerciseId
    ? preferences.minimumPlateRules.find((rule) => rule.exerciseId === input.exerciseId)
    : null;
  if (byId) {
    return {
      incrementKg: byId.incrementKg,
      source: "RULE",
    };
  }

  const nameKey = toExerciseNameKey(input.exerciseName);
  if (nameKey) {
    // Prefer explicit name-only rules first, then fallback to any same-name rule (including DB-linked).
    const byNameOnlyRule = preferences.minimumPlateRules.find(
      (rule) => !rule.exerciseId && toExerciseNameKey(rule.exerciseName) === nameKey,
    );
    if (byNameOnlyRule) {
      return {
        incrementKg: byNameOnlyRule.incrementKg,
        source: "RULE",
      };
    }

    const byAnyNameRule = preferences.minimumPlateRules.find(
      (rule) => toExerciseNameKey(rule.exerciseName) === nameKey,
    );
    if (byAnyNameRule) {
      return {
        incrementKg: byAnyNameRule.incrementKg,
        source: "RULE",
      };
    }
  }

  return {
    incrementKg: preferences.minimumPlateDefaultKg,
    source: "DEFAULT",
  };
}

/**
 * 휴식 목표 시간 해석. 우선순위는 `resolveMinimumPlateIncrement`와 동일한 4단이다:
 * exerciseId 정확 일치 → 이름(exerciseId 없는 규칙 우선) → 이름(아무 규칙) → 전역 기본값.
 *
 * 세션/세트 처방(`restSeconds`)은 이 함수보다 **위**에 있다 — 처방이 있으면 호출자가
 * 이 함수를 부르지 않는다(로드맵 §M1-1의 ① 처방 → ② 프리셋 → ③ 기본값).
 */
export function resolveRestSeconds(
  preferences: Pick<WorkoutPreferences, "restDefaultSeconds" | "restPresets">,
  input: {
    exerciseId?: string | null;
    exerciseName: string;
  },
): ResolvedRestSeconds {
  const byId = input.exerciseId
    ? preferences.restPresets.find((preset) => preset.exerciseId === input.exerciseId)
    : null;
  if (byId) {
    return { seconds: byId.seconds, source: "RULE" };
  }

  const nameKey = toExerciseNameKey(input.exerciseName);
  if (nameKey) {
    const byNameOnly = preferences.restPresets.find(
      (preset) => !preset.exerciseId && toExerciseNameKey(preset.exerciseName) === nameKey,
    );
    if (byNameOnly) {
      return { seconds: byNameOnly.seconds, source: "RULE" };
    }

    const byAnyName = preferences.restPresets.find(
      (preset) => toExerciseNameKey(preset.exerciseName) === nameKey,
    );
    if (byAnyName) {
      return { seconds: byAnyName.seconds, source: "RULE" };
    }
  }

  return { seconds: preferences.restDefaultSeconds, source: "DEFAULT" };
}

export function resolveRestSecondsForExercise(
  preferences: Pick<WorkoutPreferences, "restDefaultSeconds" | "restPresets">,
  input: {
    exerciseId?: string | null;
    exerciseName: string;
  },
): number {
  return resolveRestSeconds(preferences, input).seconds;
}

export function snapWeightToIncrementKg(weightKg: number, incrementKg: number): number {
  const safeWeight = Number.isFinite(weightKg) ? Math.max(0, weightKg) : 0;
  const safeIncrement = normalizeIncrementKg(incrementKg, DEFAULT_MINIMUM_PLATE_KG);
  if (safeIncrement <= 0) return toRounded2(safeWeight);
  return toRounded2(Math.round(safeWeight / safeIncrement) * safeIncrement);
}

export const isBodyweightRelatedExerciseName = isBodyweightExerciseName;
export { computeBodyweightTotalLoadKg };
