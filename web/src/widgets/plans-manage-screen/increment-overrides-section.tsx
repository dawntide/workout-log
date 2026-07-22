import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import {
  V2SecondaryBtn,
  V2Stack,
} from "@/components/v2/primitives";
import {
  formatKg,
  targetLabelFromKey,
  type IncrementDraft,
} from "@/features/plans-manage/model/plan-view";

import { StrengthEditField, StrengthEditRow, StrengthFieldGrid } from "./detail-rows";
import type { LocaleKey, PlansManageController, PlansManageCopy } from "./view-types";

/** 타깃별 증량/감량 오버라이드 섹션. 기본값과 다른 값만 저장 시 params에 실린다. */
export function IncrementOverridesSection({
  incrementDraft,
  setIncrementDraft,
  showIncrementSettings,
  setShowIncrementSettings,
  copy,
  locale,
}: {
  incrementDraft: IncrementDraft;
  setIncrementDraft: PlansManageController["setIncrementDraft"];
  showIncrementSettings: boolean;
  setShowIncrementSettings: PlansManageController["setShowIncrementSettings"];
  copy: PlansManageCopy;
  locale: LocaleKey;
}) {
  return (
    <V2Stack gap={2}>
      <span
        className="v2-eyebrow"
        style={{ color: "var(--v2-ink-3)" }}
      >
        {copy.plansManage.incrementSettingsLabel}
      </span>
      <V2SecondaryBtn
        full
        icon={showIncrementSettings ? "expand_less" : "expand_more"}
        onClick={() => setShowIncrementSettings((prev) => !prev)}
      >
        {showIncrementSettings
          ? copy.plansManage.hideIncrementSettings
          : copy.plansManage.showIncrementSettings}
      </V2SecondaryBtn>
      {showIncrementSettings ? (
        <V2Stack gap={2}>
          <p
            className="v2-small"
            style={{ margin: 0, color: "var(--v2-ink-2)" }}
          >
            {copy.plansManage.incrementSettingsHint}
          </p>
          {Object.entries(incrementDraft).map(([key, row]) => {
            const label = targetLabelFromKey(key);
            return (
              <StrengthEditRow key={key} label={label}>
                <StrengthFieldGrid>
                  <StrengthEditField
                    label={
                      locale === "ko"
                        ? `증량 (기본 ${formatKg(row.defaultIncreaseKg)}kg)`
                        : `Increase (default ${formatKg(row.defaultIncreaseKg)}kg)`
                    }
                  >
                    <NumberKeypadField
                      ariaLabel={`${label} ${locale === "ko" ? "증량" : "Increase"}`}
                      value={row.increaseKg}
                      min={0}
                      max={20}
                      allowDecimal
                      step={2.5}
                      onChange={(value) => {
                        setIncrementDraft((prev) => ({
                          ...prev,
                          [key]: { ...prev[key]!, increaseKg: value },
                        }));
                      }}
                    />
                  </StrengthEditField>
                  <StrengthEditField
                    label={
                      locale === "ko"
                        ? `감량 (기본 ${Math.round((1 - row.defaultResetFactor) * 100)}%)`
                        : `Decrease (default ${Math.round((1 - row.defaultResetFactor) * 100)}%)`
                    }
                  >
                    <NumberKeypadField
                      ariaLabel={`${label} ${locale === "ko" ? "감량" : "Decrease"}`}
                      value={row.decreaseKg}
                      min={0}
                      max={20}
                      allowDecimal
                      step={2.5}
                      onChange={(value) => {
                        setIncrementDraft((prev) => ({
                          ...prev,
                          [key]: { ...prev[key]!, decreaseKg: value },
                        }));
                      }}
                    />
                  </StrengthEditField>
                </StrengthFieldGrid>
              </StrengthEditRow>
            );
          })}
        </V2Stack>
      ) : null}
    </V2Stack>
  );
}
