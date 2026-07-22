import { useCallback, useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { V2NavRow } from "@/components/v2/primitives";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  DEFAULT_TRAINING_GOAL_PRIMARY,
  normalizeTrainingGoal,
  parseTrainingGoalSecondary,
  serializeTrainingGoalSecondary,
  SETTINGS_KEYS,
  type TrainingGoalKey,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

import { OptionList } from "./option-list";

/** 운동 목적 행 — 주 목적 1개(통계 기준) + 부 목적 다중 선택. 두 설정 키를 한 행에서 함께 다룬다. */
export function TrainingGoalRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const serverPrimary = normalizeTrainingGoal(
    snapshot?.[SETTINGS_KEYS.trainingGoalPrimary],
  );
  const serverSecondaryJson = serializeTrainingGoalSecondary(
    parseTrainingGoalSecondary(
      snapshot?.[SETTINGS_KEYS.trainingGoalSecondaryJson],
      serverPrimary,
    ),
  );

  const primaryMutation = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.trainingGoalPrimary,
    fallbackValue: DEFAULT_TRAINING_GOAL_PRIMARY,
    serverValue: serverPrimary,
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "주 운동 목적을 저장했습니다." : "Saved primary goal.",
    rollbackNotice:
      locale === "ko"
        ? "주 운동 목적 저장에 실패했습니다."
        : "Failed to save primary goal.",
  });

  const secondaryMutation = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.trainingGoalSecondaryJson,
    fallbackValue: "[]",
    serverValue: serverSecondaryJson,
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "부 운동 목적을 저장했습니다." : "Saved secondary goals.",
    rollbackNotice:
      locale === "ko"
        ? "부 운동 목적 저장에 실패했습니다."
        : "Failed to save secondary goals.",
  });

  const selectedPrimary = normalizeTrainingGoal(primaryMutation.value);
  const selectedSecondary = parseTrainingGoalSecondary(
    secondaryMutation.value,
    selectedPrimary,
  );

  const goalOptions = useMemo<Array<{ value: TrainingGoalKey; label: string }>>(
    () => [
      { value: "strength", label: locale === "ko" ? "근력" : "Strength" },
      {
        value: "powerlifting",
        label: locale === "ko" ? "파워리프팅" : "Powerlifting",
      },
      { value: "hypertrophy", label: locale === "ko" ? "근비대" : "Hypertrophy" },
      { value: "endurance", label: locale === "ko" ? "근지구력" : "Endurance" },
      {
        value: "general",
        label: locale === "ko" ? "일반 건강" : "General Health",
      },
    ],
    [locale],
  );

  const currentLabel =
    goalOptions.find((o) => o.value === selectedPrimary)?.label ?? "—";
  const valueLabel =
    selectedSecondary.length > 0
      ? `${currentLabel} +${selectedSecondary.length}`
      : currentLabel;

  const pending = primaryMutation.pending || secondaryMutation.pending;

  const handlePrimary = useCallback(
    (next: TrainingGoalKey) => {
      void primaryMutation.commit(next);
      if (selectedSecondary.includes(next)) {
        const filtered = selectedSecondary.filter((g) => g !== next);
        void secondaryMutation.commit(
          serializeTrainingGoalSecondary(filtered),
        );
      }
    },
    [primaryMutation, secondaryMutation, selectedSecondary],
  );

  const handleToggleSecondary = useCallback(
    (key: TrainingGoalKey) => {
      if (key === selectedPrimary) return;
      const current = new Set(selectedSecondary);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      void secondaryMutation.commit(
        serializeTrainingGoalSecondary(Array.from(current)),
      );
    },
    [secondaryMutation, selectedPrimary, selectedSecondary],
  );

  return (
    <V2NavRow
      icon="track_changes"
      label={locale === "ko" ? "운동 목적" : "Training Goal"}
      value={valueLabel}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={pending}
      expandedContent={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-3)",
          }}
        >
          <div>
            <p
              className="v2-label"
              style={{ padding: "0 0 var(--v2-s-1)" }}
            >
              {locale === "ko" ? "주 목적 (통계 기준)" : "Primary (analytics)"}
            </p>
            <OptionList
              options={goalOptions}
              selected={selectedPrimary}
              onSelect={(value) => handlePrimary(value)}
              disabled={pending}
            />
          </div>
          <div>
            <p
              className="v2-label"
              style={{ padding: "0 0 var(--v2-s-1)" }}
            >
              {locale === "ko" ? "부 목적 (선택)" : "Secondary (optional)"}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--v2-s-1)",
              }}
            >
              {goalOptions
                .filter((o) => o.value !== selectedPrimary)
                .map((o) => {
                  const active = selectedSecondary.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      disabled={pending}
                      onClick={() => handleToggleSecondary(o.value)}
                      className="v2-font-display"
                      style={{
                        padding: "var(--v2-s-2) var(--v2-s-3)",
                        minHeight: "var(--v2-s-8)",
                        borderRadius: "var(--v2-r-pill)",
                        background: active
                          ? "var(--v2-accent-weak)"
                          : "var(--v2-paper-2)",
                        color: active
                          ? "var(--v2-accent-ink)"
                          : "var(--v2-ink)",
                        border: "none",
                        cursor: pending ? "not-allowed" : "pointer",
                        opacity: pending ? 0.6 : 1,
                        fontSize: "var(--v2-t-12)",
                        fontWeight: 600,
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
            </div>
            <p
              className="v2-small"
              style={{
                color: "var(--v2-ink-3)",
                marginTop: "var(--v2-s-2)",
              }}
            >
              {locale === "ko"
                ? "주 목적은 통계 화면을 결정하고, 부 목적은 함께 추적할 보조 관심사입니다."
                : "Primary drives the analytics view; secondary goals are tracked alongside."}
            </p>
          </div>
        </div>
      }
    />
  );
}
