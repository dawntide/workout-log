"use client";

import { useEffect } from "react";
import { fetchSettingsSnapshot } from "@/lib/settings/settings-api";
import {
  applyThemePreferencesToDocument,
  clearLegacyThemeSkinPreference,
  normalizeDarkColorTheme,
  normalizeLightColorTheme,
  normalizeThemePreference,
  readThemePreferencesFromLocalCache,
  readWorkoutPreferences,
  type ColorThemePreferences,
} from "@/lib/settings/workout-preferences";

export function ThemePreferenceSync() {
  useEffect(() => {
    clearLegacyThemeSkinPreference();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let currentPreferences: ColorThemePreferences =
      readThemePreferencesFromLocalCache();
    const applyCurrentPreferences = () => {
      applyThemePreferencesToDocument(
        currentPreferences,
        mediaQuery.matches,
      );
    };
    const applySystemThemeChange = () => {
      const root = document.documentElement;
      currentPreferences = {
        theme: normalizeThemePreference(
          root.getAttribute("data-theme-preference") ??
            currentPreferences.theme,
        ),
        lightColorTheme: normalizeLightColorTheme(
          root.getAttribute("data-light-color-theme") ??
            currentPreferences.lightColorTheme,
        ),
        darkColorTheme: normalizeDarkColorTheme(
          root.getAttribute("data-dark-color-theme") ??
            currentPreferences.darkColorTheme,
        ),
      };
      applyCurrentPreferences();
    };

    applyCurrentPreferences();
    mediaQuery.addEventListener("change", applySystemThemeChange);

    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchSettingsSnapshot();
        if (cancelled) return;
        const preferences = readWorkoutPreferences(snapshot);
        currentPreferences = {
          theme: preferences.theme,
          lightColorTheme: preferences.lightColorTheme,
          darkColorTheme: preferences.darkColorTheme,
        };
        applyCurrentPreferences();
      } catch {
        // Ignore fetch failure and keep local/system theme.
      }
    })();

    return () => {
      cancelled = true;
      mediaQuery.removeEventListener("change", applySystemThemeChange);
    };
  }, []);

  return null;
}
