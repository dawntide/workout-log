import { useCallback, useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { V2NavRow } from "@/components/v2/primitives";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  normalizeLocalePreference,
  SETTINGS_KEYS,
  type LocalePreference,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

import { OptionList } from "./option-list";

/** 언어 행. 저장 실패 시 화면 로케일까지 이전 값으로 되돌린다. */
export function LanguageRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale, setLocale } = useLocale();
  const serverLocale = normalizeLocalePreference(
    snapshot?.[SETTINGS_KEYS.locale],
  );
  const language = useSettingRowMutation<LocalePreference>({
    key: SETTINGS_KEYS.locale,
    fallbackValue: locale,
    serverValue: serverLocale,
    persistServer: createPersistServerSetting<LocalePreference>(),
    successMessage:
      locale === "ko" ? "언어 설정을 저장했습니다." : "Saved the language.",
    rollbackNotice:
      locale === "ko"
        ? "언어 저장에 실패했습니다."
        : "Failed to save the language.",
  });

  const selected = normalizeLocalePreference(language.value);
  const options: Array<{ value: LocalePreference; label: string }> = useMemo(
    () => [
      { value: "ko", label: "한국어" },
      { value: "en", label: "English" },
    ],
    [],
  );

  const selectLanguage = useCallback(
    async (next: LocalePreference) => {
      const previous = selected;
      setLocale(next);
      const result = await language.commit(next);
      if (result.ignored) return;
      if (result.ok) {
        setLocale(result.value);
        return;
      }
      setLocale(previous);
    },
    [language, selected, setLocale],
  );

  const currentLabel =
    options.find((o) => o.value === selected)?.label ?? "—";

  return (
    <V2NavRow
      icon="language"
      label={locale === "ko" ? "언어" : "Language"}
      value={currentLabel}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={language.pending}
      expandedContent={
        <OptionList
          options={options}
          selected={selected}
          onSelect={(value) => {
            void selectLanguage(value);
          }}
          disabled={language.pending}
        />
      }
    />
  );
}
