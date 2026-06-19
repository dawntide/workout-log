import {
  computeBodyweightTotalLoadKg,
  isBodyweightExerciseName,
} from "@/lib/bodyweight-load";
import { setThemeSkin } from "./theme-skin-store";

export type SettingValue = string | number | boolean | null;
export type SettingsSnapshot = Record<string, SettingValue>;

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";
export type ThemeSkin = "paper" | "terminal";
export type LocalePreference = "ko" | "en";

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

export type WorkoutPreferences = {
  locale: LocalePreference;
  theme: ThemePreference;
  themeSkin: ThemeSkin;
  minimumPlateDefaultKg: number;
  minimumPlateRules: MinimumPlateRule[];
  bodyweightKg: number | null;
  trainingGoalPrimary: TrainingGoalKey;
  trainingGoalSecondary: TrainingGoalKey[];
};

export type ResolvedMinimumPlateIncrement = {
  incrementKg: number;
  source: "DEFAULT" | "RULE";
};

export const SETTINGS_KEYS = {
  locale: "prefs.locale",
  theme: "prefs.theme.mode",
  themeSkin: "prefs.theme.skin",
  minimumPlateDefaultKg: "prefs.minimumPlate.defaultKg",
  minimumPlateRulesJson: "prefs.minimumPlate.rulesJson",
  bodyweightKg: "prefs.bodyweight.kg",
  trainingGoalPrimary: "prefs.trainingGoal.primary",
  trainingGoalSecondaryJson: "prefs.trainingGoal.secondaryJson",
} as const;

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = "ko";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "SYSTEM";
export const DEFAULT_THEME_SKIN: ThemeSkin = "paper";
export const DEFAULT_MINIMUM_PLATE_KG = 2.5;
export const DEFAULT_BODYWEIGHT_KG: number | null = null;
export const DEFAULT_TRAINING_GOAL_PRIMARY: TrainingGoalKey = "general";
export const DEFAULT_TRAINING_GOAL_SECONDARY: TrainingGoalKey[] = [];

const MIN_INCREMENT_KG = 0.25;
const MAX_INCREMENT_KG = 25;
const LOCAL_STORAGE_SETTING_PREFIX = "workout-log.setting.v1.";

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

export function normalizeThemeSkin(value: unknown): ThemeSkin {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "terminal") return "terminal";
  return "paper";
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

export function readWorkoutPreferences(snapshot: SettingsSnapshot): WorkoutPreferences {
  const locale = normalizeLocalePreference(snapshot[SETTINGS_KEYS.locale]);
  const theme = normalizeThemePreference(snapshot[SETTINGS_KEYS.theme]);
  const themeSkin = normalizeThemeSkin(snapshot[SETTINGS_KEYS.themeSkin]);
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

  return {
    locale,
    theme,
    themeSkin,
    minimumPlateDefaultKg,
    minimumPlateRules,
    bodyweightKg,
    trainingGoalPrimary,
    trainingGoalSecondary,
  };
}

export function toDefaultWorkoutPreferences(): WorkoutPreferences {
  return {
    locale: DEFAULT_LOCALE_PREFERENCE,
    theme: DEFAULT_THEME_PREFERENCE,
    themeSkin: DEFAULT_THEME_SKIN,
    minimumPlateDefaultKg: DEFAULT_MINIMUM_PLATE_KG,
    minimumPlateRules: [],
    bodyweightKg: DEFAULT_BODYWEIGHT_KG,
    trainingGoalPrimary: DEFAULT_TRAINING_GOAL_PRIMARY,
    trainingGoalSecondary: [...DEFAULT_TRAINING_GOAL_SECONDARY],
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

export function snapWeightToIncrementKg(weightKg: number, incrementKg: number): number {
  const safeWeight = Number.isFinite(weightKg) ? Math.max(0, weightKg) : 0;
  const safeIncrement = normalizeIncrementKg(incrementKg, DEFAULT_MINIMUM_PLATE_KG);
  if (safeIncrement <= 0) return toRounded2(safeWeight);
  return toRounded2(Math.round(safeWeight / safeIncrement) * safeIncrement);
}

export const isBodyweightRelatedExerciseName = isBodyweightExerciseName;
export { computeBodyweightTotalLoadKg };

export function applyThemePreferenceToDocument(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme-preference", theme.toLowerCase());
  // No theme-color injection: Safari uses natural frosted-glass,
  // blurring html { background-color: var(--v2-bg) } behind the pill.
  document.querySelectorAll(`meta[name="theme-color"][data-dynamic]`).forEach(m => m.remove());
}

export function applyThemeSkinToDocument(skin: ThemeSkin) {
  if (typeof document === "undefined") return;
  if (skin === "terminal") {
    document.documentElement.setAttribute("data-theme", "terminal");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  setThemeSkin(skin);
}

export function readThemeSkinFromLocalCache(): ThemeSkin {
  if (typeof window === "undefined") return DEFAULT_THEME_SKIN;
  const raw = window.localStorage.getItem(`${LOCAL_STORAGE_SETTING_PREFIX}${SETTINGS_KEYS.themeSkin}`);
  if (!raw) return DEFAULT_THEME_SKIN;
  try {
    const parsed = JSON.parse(raw) as { value?: unknown };
    return normalizeThemeSkin(parsed.value);
  } catch {
    return DEFAULT_THEME_SKIN;
  }
}

export function readThemePreferenceFromLocalCache(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME_PREFERENCE;
  const raw = window.localStorage.getItem(`${LOCAL_STORAGE_SETTING_PREFIX}${SETTINGS_KEYS.theme}`);
  if (!raw) return DEFAULT_THEME_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as { value?: unknown };
    return normalizeThemePreference(parsed.value);
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function readLocalePreferenceFromLocalCache(): LocalePreference {
  if (typeof window === "undefined") return DEFAULT_LOCALE_PREFERENCE;
  const raw = window.localStorage.getItem(`${LOCAL_STORAGE_SETTING_PREFIX}${SETTINGS_KEYS.locale}`);
  if (!raw) return DEFAULT_LOCALE_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as { value?: unknown };
    return normalizeLocalePreference(parsed.value);
  } catch {
    return DEFAULT_LOCALE_PREFERENCE;
  }
}
