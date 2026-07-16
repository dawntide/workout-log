// 순수 로직(타입·키·normalize·플레이트 규칙)은 @workout/core로 추출됨 — 전부 재export해
// 기존 25개 importer의 경로를 보존한다. 이 파일에는 DOM/localStorage를 만지는
// 브라우저 어댑터만 남는다(core는 DOM 무지 원칙).
export * from "@workout/core/settings/workout-preferences";

import {
  DARK_COLOR_THEMES,
  DEFAULT_DARK_COLOR_THEME,
  DEFAULT_LOCALE_PREFERENCE,
  DEFAULT_LIGHT_COLOR_THEME,
  DEFAULT_THEME_PREFERENCE,
  LIGHT_COLOR_THEMES,
  LOCAL_STORAGE_SETTING_PREFIX,
  SETTINGS_KEYS,
  normalizeDarkColorTheme,
  normalizeLightColorTheme,
  normalizeLocalePreference,
  normalizeThemePreference,
  type DarkColorTheme,
  type LightColorTheme,
  type LocalePreference,
  type ThemePreference,
} from "@workout/core/settings/workout-preferences";

export type ColorThemePreferences = {
  theme: ThemePreference;
  lightColorTheme: LightColorTheme;
  darkColorTheme: DarkColorTheme;
};

type ResolvedColorTheme = {
  tone: "light" | "dark";
  colorTheme: LightColorTheme | DarkColorTheme;
};

const COLOR_THEME_BACKGROUND_COLORS: Record<
  LightColorTheme | DarkColorTheme,
  string
> = {
  PAPER: "#f6f1e8",
  GITHUB_LIGHT: "#f6f8fa",
  SOLARIZED_LIGHT: "#eee8d5",
  CATPPUCCIN_LATTE: "#e6e9ef",
  TOKYO_NIGHT_DAY: "#d0d5e3",
  OBSIDIAN: "#0e0d12",
  GITHUB_DARK: "#0d1117",
  SOLARIZED_DARK: "#002b36",
  CATPPUCCIN_MOCHA: "#11111b",
  TOKYO_NIGHT: "#16161e",
};

const COLOR_THEME_DATA_VALUES = Object.fromEntries(
  [...LIGHT_COLOR_THEMES, ...DARK_COLOR_THEMES].map((theme) => [
    theme,
    theme.toLowerCase().replaceAll("_", "-"),
  ]),
) as Record<LightColorTheme | DarkColorTheme, string>;

export function resolveColorTheme(
  preferences: ColorThemePreferences,
  prefersDark: boolean,
): ResolvedColorTheme {
  const useDark =
    preferences.theme === "DARK" ||
    (preferences.theme === "SYSTEM" && prefersDark);
  return useDark
    ? { tone: "dark", colorTheme: preferences.darkColorTheme }
    : { tone: "light", colorTheme: preferences.lightColorTheme };
}

export function applyThemePreferencesToDocument(
  preferences: ColorThemePreferences,
  prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches,
) {
  if (typeof document === "undefined") return;
  const resolved = resolveColorTheme(preferences, prefersDark);
  const root = document.documentElement;
  const backgroundColor = COLOR_THEME_BACKGROUND_COLORS[resolved.colorTheme];

  root.setAttribute("data-theme-preference", preferences.theme.toLowerCase());
  root.setAttribute("data-light-color-theme", preferences.lightColorTheme);
  root.setAttribute("data-dark-color-theme", preferences.darkColorTheme);
  root.setAttribute("data-theme-tone", resolved.tone);
  root.setAttribute(
    "data-color-theme",
    COLOR_THEME_DATA_VALUES[resolved.colorTheme],
  );
  root.style.colorScheme = resolved.tone;
  root.style.backgroundColor = backgroundColor;
  if (document.body) document.body.style.backgroundColor = backgroundColor;
  // No theme-color injection: Safari uses natural frosted-glass,
  // blurring html { background-color: var(--v2-bg) } behind the pill.
  document.querySelectorAll(`meta[name="theme-color"][data-dynamic]`).forEach(m => m.remove());
}

/** 제거된 레이아웃 테마의 브라우저 캐시를 한 번 정리한다. */
export function clearLegacyThemeSkinPreference() {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-theme");
  document.cookie = "wl_skin=; path=/; max-age=0; samesite=lax";
  try {
    window.localStorage.removeItem(
      `${LOCAL_STORAGE_SETTING_PREFIX}prefs.theme.skin`,
    );
  } catch {
    // Storage가 차단된 환경에서도 paper 레이아웃은 그대로 유지한다.
  }
}

function readLocalSettingValue(key: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(
      `${LOCAL_STORAGE_SETTING_PREFIX}${key}`,
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { value?: unknown };
    return parsed.value;
  } catch {
    return undefined;
  }
}

export function readThemePreferencesFromLocalCache(): ColorThemePreferences {
  return {
    theme: normalizeThemePreference(
      readLocalSettingValue(SETTINGS_KEYS.theme) ?? DEFAULT_THEME_PREFERENCE,
    ),
    lightColorTheme: normalizeLightColorTheme(
      readLocalSettingValue(SETTINGS_KEYS.lightColorTheme) ??
        DEFAULT_LIGHT_COLOR_THEME,
    ),
    darkColorTheme: normalizeDarkColorTheme(
      readLocalSettingValue(SETTINGS_KEYS.darkColorTheme) ??
        DEFAULT_DARK_COLOR_THEME,
    ),
  };
}

export function createEarlyThemeBootstrapScript() {
  const config = JSON.stringify({
    prefix: LOCAL_STORAGE_SETTING_PREFIX,
    keys: {
      theme: SETTINGS_KEYS.theme,
      light: SETTINGS_KEYS.lightColorTheme,
      dark: SETTINGS_KEYS.darkColorTheme,
    },
    defaults: {
      theme: DEFAULT_THEME_PREFERENCE,
      light: DEFAULT_LIGHT_COLOR_THEME,
      dark: DEFAULT_DARK_COLOR_THEME,
    },
    allowed: {
      theme: ["SYSTEM", "LIGHT", "DARK"],
      light: LIGHT_COLOR_THEMES,
      dark: DARK_COLOR_THEMES,
    },
    dataValues: COLOR_THEME_DATA_VALUES,
    backgrounds: COLOR_THEME_BACKGROUND_COLORS,
  });

  return `
(() => {
  try {
    const config = ${config};
    const read = (key, fallback, allowed) => {
      try {
        const raw = window.localStorage.getItem(config.prefix + key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        const normalized = String(parsed?.value ?? "").trim().toUpperCase();
        return allowed.includes(normalized) ? normalized : fallback;
      } catch {
        return fallback;
      }
    };

    const mode = read(config.keys.theme, config.defaults.theme, config.allowed.theme);
    const lightTheme = read(config.keys.light, config.defaults.light, config.allowed.light);
    const darkTheme = read(config.keys.dark, config.defaults.dark, config.allowed.dark);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = mode === "DARK" || (mode === "SYSTEM" && prefersDark);
    const tone = useDark ? "dark" : "light";
    const colorTheme = useDark ? darkTheme : lightTheme;
    const backgroundColor = config.backgrounds[colorTheme];

    document.documentElement.setAttribute("data-theme-preference", mode.toLowerCase());
    document.documentElement.setAttribute("data-light-color-theme", lightTheme);
    document.documentElement.setAttribute("data-dark-color-theme", darkTheme);
    document.documentElement.setAttribute("data-theme-tone", tone);
    document.documentElement.setAttribute("data-color-theme", config.dataValues[colorTheme]);
    document.documentElement.style.colorScheme = tone;
    document.documentElement.style.backgroundColor = backgroundColor;
    document.documentElement.removeAttribute("data-theme");
    if (document.body) document.body.style.backgroundColor = backgroundColor;
  } catch {}
})();
`;
}

export function readThemePreferenceFromLocalCache(): ThemePreference {
  const value = readLocalSettingValue(SETTINGS_KEYS.theme);
  if (value === undefined) return DEFAULT_THEME_PREFERENCE;
  return normalizeThemePreference(value);
}

export function readLocalePreferenceFromLocalCache(): LocalePreference {
  const value = readLocalSettingValue(SETTINGS_KEYS.locale);
  if (value === undefined) return DEFAULT_LOCALE_PREFERENCE;
  return normalizeLocalePreference(value);
}
