"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { NoticeStateRows } from "@/components/ui/settings-state";
import { V2NavRow, V2PrimaryBtn, V2Stack } from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
} from "@/components/v2/settings/section";
import { useLocale } from "@/components/locale-provider";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  DEFAULT_PLATE_BAR_WEIGHT_KG,
  DEFAULT_PLATE_PLATES_KG,
  normalizeBarWeightKg,
  parsePlatesKg,
  serializePlatesKg,
  SETTINGS_KEYS,
} from "@/lib/settings/workout-preferences";
import { breakdownPlates, formatPerSide } from "@workout/core/plate-breakdown";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

/** 토글로 고를 수 있는 원판 후보. 국내 헬스장에서 흔한 구성 + 마이크로 원판. */
const PLATE_CHOICES: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

function LabeledKeypadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <V2Stack gap={1}>
      <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
        {label}
      </span>
      {children}
    </V2Stack>
  );
}

function formatPlate(plate: number): string {
  return Number.isInteger(plate) ? String(plate) : String(plate);
}

export function PlateInventoryPageContent({
  initialSnapshot,
}: {
  initialSnapshot: SettingsSnapshot;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  const initialBarWeight = normalizeBarWeightKg(
    initialSnapshot[SETTINGS_KEYS.plateBarWeightKg],
    DEFAULT_PLATE_BAR_WEIGHT_KG,
  );
  const storedPlates = parsePlatesKg(initialSnapshot[SETTINGS_KEYS.platePlatesJson]);
  const initialPlatesJson = serializePlatesKg(
    storedPlates.length > 0 ? storedPlates : [...DEFAULT_PLATE_PLATES_KG],
  );

  const [barDraft, setBarDraft] = useState(initialBarWeight);
  const [serverBarWeight, setServerBarWeight] = useState(initialBarWeight);
  const [serverPlatesJson, setServerPlatesJson] = useState(initialPlatesJson);

  const barWeight = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.plateBarWeightKg,
    fallbackValue: DEFAULT_PLATE_BAR_WEIGHT_KG,
    serverValue: serverBarWeight,
    persistServer: createPersistServerSetting<number>(),
    successMessage: ko ? "바 무게를 저장했습니다." : "Saved the bar weight.",
    rollbackNotice: ko
      ? "바 무게 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the bar weight, so the previous value was restored.",
  });

  const platesSetting = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.platePlatesJson,
    fallbackValue: JSON.stringify(DEFAULT_PLATE_PLATES_KG),
    serverValue: serverPlatesJson,
    persistServer: createPersistServerSetting<string>(),
    successMessage: ko ? "보유 원판을 저장했습니다." : "Saved your plate inventory.",
    rollbackNotice: ko
      ? "보유 원판 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the plate inventory, so the previous value was restored.",
  });

  const plates = useMemo(() => {
    const parsed = parsePlatesKg(platesSetting.value);
    return parsed.length > 0 ? parsed : [...DEFAULT_PLATE_PLATES_KG];
  }, [platesSetting.value]);

  const normalizedBarDraft = normalizeBarWeightKg(barDraft, DEFAULT_PLATE_BAR_WEIGHT_KG);
  const canSaveBar =
    !barWeight.pending &&
    normalizedBarDraft !== normalizeBarWeightKg(barWeight.value, DEFAULT_PLATE_BAR_WEIGHT_KG);

  const latestNotice = barWeight.notice ?? platesSetting.notice ?? null;
  const hasSaveError = Boolean(barWeight.error || platesSetting.error);

  useEffect(() => {
    if (barWeight.pending) return;
    setBarDraft(normalizeBarWeightKg(barWeight.value, DEFAULT_PLATE_BAR_WEIGHT_KG));
  }, [barWeight.pending, barWeight.value]);

  const saveBarWeight = useCallback(async () => {
    const result = await barWeight.commit(normalizedBarDraft);
    if (!result.ignored && result.ok) setServerBarWeight(result.value);
  }, [barWeight, normalizedBarDraft]);

  const togglePlate = useCallback(
    async (plate: number) => {
      const next = plates.includes(plate)
        ? plates.filter((candidate) => candidate !== plate)
        : [...plates, plate];
      // 전부 지우면 계산기가 빈 바만 보여주므로 최소 한 종류는 남긴다.
      if (next.length === 0) return;

      const prevJson = serverPlatesJson;
      const nextJson = serializePlatesKg(next);
      setServerPlatesJson(nextJson);
      const result = await platesSetting.commit(nextJson);
      if (!result.ignored && result.ok) {
        setServerPlatesJson(result.value);
      } else {
        setServerPlatesJson(prevJson);
      }
    },
    [plates, platesSetting, serverPlatesJson],
  );

  // 설정이 실제로 어떻게 보이는지 즉시 확인할 수 있게 미리보기를 둔다.
  const previewTargets = [60, 100, 142.5];

  return (
    <div>
      <NoticeStateRows
        message={latestNotice}
        tone={hasSaveError ? "warning" : "success"}
        label={ko ? "원판 설정 안내" : "Plate Settings Notice"}
      />

      <section>
        <V2SettingsSection
          title={ko ? "바 무게" : "Bar Weight"}
          description={
            ko
              ? "원판 분해를 계산할 때 빼는 무게입니다."
              : "Subtracted from the target weight before splitting into plates."
          }
        />
        <div
          style={{
            background: "var(--v2-paper)",
            borderRadius: "var(--v2-r-4)",
            padding: "var(--v2-s-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
          }}
        >
          <LabeledKeypadField label={ko ? "바 무게 (kg)" : "Bar Weight (kg)"}>
            <NumberKeypadField
              ariaLabel={ko ? "바 무게 (kg)" : "Bar Weight (kg)"}
              value={barDraft}
              min={0}
              max={60}
              step={2.5}
              allowDecimal
              onChange={(next) =>
                setBarDraft(normalizeBarWeightKg(next, DEFAULT_PLATE_BAR_WEIGHT_KG))
              }
            />
          </LabeledKeypadField>
          <V2PrimaryBtn
            full
            onClick={() => {
              void saveBarWeight();
            }}
            disabled={!canSaveBar}
          >
            {barWeight.pending
              ? ko ? "저장 중..." : "Saving..."
              : ko ? "바 무게 저장" : "Save Bar Weight"}
          </V2PrimaryBtn>
        </div>
      </section>

      <section>
        <V2SettingsSection
          title={ko ? "보유 원판" : "Available Plates"}
          description={
            ko
              ? "가진 원판 종류를 켜 두면 그 조합으로만 분해합니다."
              : "Only the plate sizes you turn on are used in the breakdown."
          }
        />
        <div
          style={{
            background: "var(--v2-paper)",
            borderRadius: "var(--v2-r-4)",
            padding: "var(--v2-s-4)",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--v2-s-2)",
          }}
          role="group"
          aria-label={ko ? "보유 원판 선택" : "Select available plates"}
        >
          {PLATE_CHOICES.map((plate) => {
            const active = plates.includes(plate);
            return (
              <button
                key={plate}
                type="button"
                aria-pressed={active}
                aria-label={`${formatPlate(plate)}kg`}
                disabled={platesSetting.pending}
                onClick={() => {
                  void togglePlate(plate);
                }}
                className="v2-mono-label v2-tap-44"
                style={{
                  position: "relative",
                  minWidth: "var(--v2-s-8)",
                  padding: "var(--v2-s-2) var(--v2-s-3)",
                  borderRadius: "var(--v2-r-pill)",
                  border: "none",
                  appearance: "none",
                  cursor: platesSetting.pending ? "not-allowed" : "pointer",
                  background: active ? "var(--v2-accent)" : "var(--v2-paper-2)",
                  color: active ? "var(--v2-ink-on-accent)" : "var(--v2-ink-3)",
                }}
              >
                {formatPlate(plate)}
              </button>
            );
          })}
        </div>
        <V2SettingsFootnote>
          {ko
            ? "원판은 한 종류당 충분히 있다고 가정합니다. 개수 제한은 아직 다루지 않습니다."
            : "Each selected size is assumed to be available in sufficient quantity. Per-plate counts are not modeled yet."}
        </V2SettingsFootnote>
      </section>

      <section>
        <V2SettingsSection
          title={ko ? "미리보기" : "Preview"}
          description={
            ko ? "현재 설정으로 분해한 결과입니다." : "How the current settings split a few weights."
          }
        />
        <V2SettingsGroup ariaLabel={ko ? "원판 분해 미리보기" : "Plate breakdown preview"}>
          {previewTargets.map((target) => {
            const result = breakdownPlates(target, {
              barWeightKg: normalizeBarWeightKg(barWeight.value, DEFAULT_PLATE_BAR_WEIGHT_KG),
              platesKg: plates,
            });
            const summary =
              result.kind === "below-bar"
                ? ko ? "빈 바보다 가벼움" : "Lighter than the empty bar"
                : formatPerSide(result.perSide) || (ko ? "바만" : "Bar only");
            return (
              <V2NavRow
                key={target}
                as="div"
                label={`${target} kg`}
                description={
                  result.kind === "nearest"
                    ? ko
                      ? `정확히 만들 수 없어 ${result.totalKg}kg로 맞춤`
                      : `Not assemblable — nearest is ${result.totalKg} kg`
                    : ko
                      ? "한쪽에 끼울 원판"
                      : "Plates per side"
                }
                value={summary}
                trailing="none"
              />
            );
          })}
        </V2SettingsGroup>
      </section>
    </div>
  );
}
