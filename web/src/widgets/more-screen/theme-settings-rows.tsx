import { useEffect, useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { V2NavRow } from "@/components/v2/primitives";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  applyThemePreferencesToDocument,
  DEFAULT_DARK_COLOR_THEME,
  DEFAULT_LIGHT_COLOR_THEME,
  DEFAULT_THEME_PREFERENCE,
  normalizeDarkColorTheme,
  normalizeLightColorTheme,
  normalizeThemePreference,
  SETTINGS_KEYS,
  type DarkColorTheme,
  type LightColorTheme,
  type ThemePreference,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

import { OptionList } from "./option-list";

/** 화면 모드 · 라이트 테마 · 다크 테마 세 행. 셋이 한 문서 적용 이펙트를 공유해 한 컴포넌트에 둔다. */
export function ThemeSettingsRows({
  snapshot,
  expandedRow,
  onExpandedRowChange,
}: {
  snapshot: SettingsSnapshot | null;
  expandedRow: string | null;
  onExpandedRowChange: (next: string | null) => void;
}) {
  const { locale } = useLocale();
  const serverTheme = normalizeThemePreference(
    snapshot?.[SETTINGS_KEYS.theme],
  );
  const serverLightColorTheme = normalizeLightColorTheme(
    snapshot?.[SETTINGS_KEYS.lightColorTheme],
  );
  const serverDarkColorTheme = normalizeDarkColorTheme(
    snapshot?.[SETTINGS_KEYS.darkColorTheme],
  );

  const themeMode = useSettingRowMutation<ThemePreference>({
    key: SETTINGS_KEYS.theme,
    fallbackValue: DEFAULT_THEME_PREFERENCE,
    serverValue: serverTheme,
    persistServer: createPersistServerSetting<ThemePreference>(),
    successMessage:
      locale === "ko" ? "화면 모드를 저장했습니다." : "Saved the appearance.",
    rollbackNotice:
      locale === "ko"
        ? "화면 모드 저장에 실패했습니다."
        : "Failed to save the appearance.",
  });
  const lightColorTheme = useSettingRowMutation<LightColorTheme>({
    key: SETTINGS_KEYS.lightColorTheme,
    fallbackValue: DEFAULT_LIGHT_COLOR_THEME,
    serverValue: serverLightColorTheme,
    persistServer: createPersistServerSetting<LightColorTheme>(),
    successMessage:
      locale === "ko"
        ? "라이트 테마를 저장했습니다."
        : "Saved the light theme.",
    rollbackNotice:
      locale === "ko"
        ? "라이트 테마 저장에 실패했습니다."
        : "Failed to save the light theme.",
  });
  const darkColorTheme = useSettingRowMutation<DarkColorTheme>({
    key: SETTINGS_KEYS.darkColorTheme,
    fallbackValue: DEFAULT_DARK_COLOR_THEME,
    serverValue: serverDarkColorTheme,
    persistServer: createPersistServerSetting<DarkColorTheme>(),
    successMessage:
      locale === "ko"
        ? "다크 테마를 저장했습니다."
        : "Saved the dark theme.",
    rollbackNotice:
      locale === "ko"
        ? "다크 테마 저장에 실패했습니다."
        : "Failed to save the dark theme.",
  });

  const selectedMode = normalizeThemePreference(themeMode.value);
  const selectedLightColorTheme = normalizeLightColorTheme(
    lightColorTheme.value,
  );
  const selectedDarkColorTheme = normalizeDarkColorTheme(darkColorTheme.value);

  useEffect(() => {
    applyThemePreferencesToDocument({
      theme: selectedMode,
      lightColorTheme: selectedLightColorTheme,
      darkColorTheme: selectedDarkColorTheme,
    });
  }, [selectedDarkColorTheme, selectedLightColorTheme, selectedMode]);

  const modeOptions: Array<{ value: ThemePreference; label: string }> = useMemo(
    () => [
      { value: "SYSTEM", label: locale === "ko" ? "시스템 설정" : "System" },
      { value: "LIGHT", label: locale === "ko" ? "라이트" : "Light" },
      { value: "DARK", label: locale === "ko" ? "다크" : "Dark" },
    ],
    [locale],
  );
  const lightThemeOptions: Array<{
    value: LightColorTheme;
    label: string;
  }> = useMemo(
    () => [
      { value: "PAPER", label: "Paper" },
      { value: "GITHUB_LIGHT", label: "GitHub Light" },
      { value: "SOLARIZED_LIGHT", label: "Solarized Light" },
      { value: "CATPPUCCIN_LATTE", label: "Catppuccin Latte" },
      { value: "TOKYO_NIGHT_DAY", label: "Tokyo Night Day" },
      { value: "GRUVBOX_LIGHT", label: "Gruvbox Light" },
      { value: "KANAGAWA_LOTUS", label: "Kanagawa Lotus" },
    ],
    [],
  );
  const darkThemeOptions: Array<{
    value: DarkColorTheme;
    label: string;
  }> = useMemo(
    () => [
      { value: "OBSIDIAN", label: "Obsidian" },
      { value: "GITHUB_DARK", label: "GitHub Dark" },
      { value: "SOLARIZED_DARK", label: "Solarized Dark" },
      { value: "CATPPUCCIN_MOCHA", label: "Catppuccin Mocha" },
      { value: "TOKYO_NIGHT", label: "Tokyo Night" },
      { value: "GRUVBOX_DARK", label: "Gruvbox Dark" },
      { value: "KANAGAWA_WAVE", label: "Kanagawa Wave" },
    ],
    [],
  );

  const modeLabel =
    modeOptions.find((option) => option.value === selectedMode)?.label ?? "—";
  const lightThemeLabel =
    lightThemeOptions.find(
      (option) => option.value === selectedLightColorTheme,
    )?.label ?? "—";
  const darkThemeLabel =
    darkThemeOptions.find(
      (option) => option.value === selectedDarkColorTheme,
    )?.label ?? "—";

  return (
    <>
      <V2NavRow
        icon="contrast"
        label={locale === "ko" ? "화면 모드" : "Appearance"}
        value={modeLabel}
        expandable
        expanded={expandedRow === "theme-mode"}
        onExpandedChange={(next) =>
          onExpandedRowChange(next ? "theme-mode" : null)
        }
        disabled={themeMode.pending}
        expandedContent={
          <OptionList
            options={modeOptions}
            selected={selectedMode}
            onSelect={(value) => {
              void themeMode.commit(value);
            }}
            disabled={themeMode.pending}
          />
        }
      />
      <V2NavRow
        icon="light_mode"
        label={locale === "ko" ? "라이트 테마" : "Light Theme"}
        value={lightThemeLabel}
        expandable
        expanded={expandedRow === "theme-light"}
        onExpandedChange={(next) =>
          onExpandedRowChange(next ? "theme-light" : null)
        }
        disabled={lightColorTheme.pending}
        expandedContent={
          <OptionList
            options={lightThemeOptions}
            selected={selectedLightColorTheme}
            onSelect={(value) => {
              void lightColorTheme.commit(value);
            }}
            disabled={lightColorTheme.pending}
          />
        }
      />
      <V2NavRow
        icon="dark_mode"
        label={locale === "ko" ? "다크 테마" : "Dark Theme"}
        value={darkThemeLabel}
        expandable
        expanded={expandedRow === "theme-dark"}
        onExpandedChange={(next) =>
          onExpandedRowChange(next ? "theme-dark" : null)
        }
        disabled={darkColorTheme.pending}
        expandedContent={
          <OptionList
            options={darkThemeOptions}
            selected={selectedDarkColorTheme}
            onSelect={(value) => {
              void darkColorTheme.commit(value);
            }}
            disabled={darkColorTheme.pending}
          />
        }
      />
    </>
  );
}
