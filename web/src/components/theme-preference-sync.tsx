"use client";

import { useEffect } from "react";
import { fetchSettingsSnapshot } from "@/lib/settings/settings-api";
import {
  applyThemePreferenceToDocument,
  applyThemeSkinToDocument,
  readThemePreferenceFromLocalCache,
  readThemeSkinFromLocalCache,
  readWorkoutPreferences,
} from "@/lib/settings/workout-preferences";

export function ThemePreferenceSync() {
  useEffect(() => {
    applyThemePreferenceToDocument(readThemePreferenceFromLocalCache());
    applyThemeSkinToDocument(readThemeSkinFromLocalCache());

    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchSettingsSnapshot();
        if (cancelled) return;
        const preferences = readWorkoutPreferences(snapshot);
        applyThemePreferenceToDocument(preferences.theme);
        applyThemeSkinToDocument(preferences.themeSkin);
      } catch {
        // Ignore fetch failure and keep local/system theme.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
