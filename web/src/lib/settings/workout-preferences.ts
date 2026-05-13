import {
  computeBodyweightTotalLoadKg,
  isBodyweightExerciseName,
} from "@/lib/bodyweight-load";

export type SettingValue = string | number | boolean | null;
export type SettingsSnapshot = Record<string, SettingValue>;

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";
export type LocalePreference = "ko" | "en";

export type MinimumPlateRule = {
  exerciseId: string | null;
  exerciseName: string;
  incrementKg: number;
};

export type WorkoutPreferences = {
  locale: LocalePreference;
  theme: ThemePreference;
  minimumPlateDefaultKg: number;
  minimumPlateRules: MinimumPlateRule[];
  bodyweightKg: number | null;
};

export type ResolvedMinimumPlateIncrement = {
  incrementKg: number;
  source: "DEFAULT" | "RULE";
};

export const SETTINGS_KEYS = {
  locale: "prefs.locale",
  theme: "prefs.theme.mode",
  minimumPlateDefaultKg: "prefs.minimumPlate.defaultKg",
  minimumPlateRulesJson: "prefs.minimumPlate.rulesJson",
  bodyweightKg: "prefs.bodyweight.kg",
} as const;

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = "ko";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "SYSTEM";
export const DEFAULT_MINIMUM_PLATE_KG = 2.5;
export const DEFAULT_BODYWEIGHT_KG: number | null = null;

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

export function normalizeLocalePreference(value: unknown): LocalePreference {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("en")) return "en";
  return "ko";
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
  const minimumPlateDefaultKg = normalizeIncrementKg(
    snapshot[SETTINGS_KEYS.minimumPlateDefaultKg],
    DEFAULT_MINIMUM_PLATE_KG,
  );
  const minimumPlateRules = parseMinimumPlateRules(snapshot[SETTINGS_KEYS.minimumPlateRulesJson]);
  const bodyweightRaw = toFiniteNumber(snapshot[SETTINGS_KEYS.bodyweightKg]);
  const bodyweightKg =
    bodyweightRaw === null || bodyweightRaw <= 0 ? DEFAULT_BODYWEIGHT_KG : toRounded2(bodyweightRaw);

  return {
    locale,
    theme,
    minimumPlateDefaultKg,
    minimumPlateRules,
    bodyweightKg,
  };
}

export function toDefaultWorkoutPreferences(): WorkoutPreferences {
  return {
    locale: DEFAULT_LOCALE_PREFERENCE,
    theme: DEFAULT_THEME_PREFERENCE,
    minimumPlateDefaultKg: DEFAULT_MINIMUM_PLATE_KG,
    minimumPlateRules: [],
    bodyweightKg: DEFAULT_BODYWEIGHT_KG,
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
