import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { V2NavRow } from "@/components/v2/primitives";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  normalizeIntensityInput,
  SETTINGS_KEYS,
  type IntensityInput,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

import { OptionList } from "./option-list";

/**
 * 세트 강도 입력 방식(RPE / RIR).
 *
 * **저장값은 어느 쪽을 골라도 RPE 스케일**이라, 이 설정은 순수하게 입력·표시
 * 방향만 바꾼다. 지난 기록도 같이 번역돼 보이므로 통계·export는 무관하다.
 *
 * 옵션이 둘뿐이라 별도 화면 없이 인라인 확장 행으로 둔다(LanguageRow와 같은 형태).
 */
export function IntensityInputRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  const intensity = useSettingRowMutation<IntensityInput>({
    key: SETTINGS_KEYS.intensityInput,
    fallbackValue: "RPE",
    serverValue: normalizeIntensityInput(snapshot?.[SETTINGS_KEYS.intensityInput]),
    persistServer: createPersistServerSetting<IntensityInput>(),
    successMessage: ko ? "강도 입력 방식을 저장했습니다." : "Saved the intensity input.",
    rollbackNotice: ko
      ? "강도 입력 방식 저장에 실패했습니다."
      : "Failed to save the intensity input.",
  });

  const selected = normalizeIntensityInput(intensity.value);
  const options: Array<{ value: IntensityInput; label: string }> = useMemo(
    () => [
      { value: "RPE", label: ko ? "RPE (운동 자각도 1~10)" : "RPE (1–10 exertion)" },
      { value: "RIR", label: ko ? "RIR (남은 반복 수)" : "RIR (reps in reserve)" },
    ],
    [ko],
  );

  return (
    <V2NavRow
      icon="speed"
      label={ko ? "강도 입력" : "Intensity Input"}
      value={selected}
      description={
        ko
          ? "기록은 같은 값으로 저장되고 표시 방향만 바뀝니다"
          : "Stored the same either way — only the direction changes"
      }
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={intensity.pending}
      expandedContent={
        <OptionList
          options={options}
          selected={selected}
          onSelect={(value) => {
            void intensity.commit(value);
          }}
          disabled={intensity.pending}
        />
      }
    />
  );
}
