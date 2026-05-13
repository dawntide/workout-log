"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  BaseGroupedList,
  InfoRow,
  SectionFootnote,
  SectionHeader,
  ValueRow,
} from "@/components/ui/settings-list";
import { NoticeStateRows } from "@/components/ui/settings-state";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import { AppSelect } from "@/components/ui/form-controls";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

const DEFAULT_TARGETS = {
  saveFromGenerate: 0.65,
  saveSuccessFromClicks7d: 0.6,
  addAfterSheetOpen14d: 0.35,
};

type ThresholdField = keyof typeof DEFAULT_TARGETS;

type Plan = {
  id: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
};

const SAVE_FROM_GENERATE_OPTIONS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8] as const;
const SAVE_SUCCESS_FROM_CLICKS_7D_OPTIONS = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75] as const;
const ADD_AFTER_SHEET_OPEN_14D_OPTIONS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5] as const;

function formatPercentRatio(value: number) {
  return `${Math.round(value * 100)}%`;
}

function nextOption(current: number, options: readonly number[], fallback: number) {
  const currentIndex = options.findIndex((option) => Math.abs(option - current) < 1e-9);
  if (currentIndex < 0) return fallback;
  return options[(currentIndex + 1) % options.length];
}

function clampRatio(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.05, Math.min(0.99, value));
}

function parseNumberSetting(value: unknown, fallback: number) {
  if (typeof value === "number") return clampRatio(value, fallback);
  return fallback;
}

function planThresholdKey(planId: string, field: ThresholdField) {
  return `prefs.uxThreshold.plan.${planId}.${field}`;
}

type UxThresholdsSectionProps = {
  initialSnapshot: SettingsSnapshot;
  initialPlans: Plan[];
};

export function UxThresholdsSection({
  initialSnapshot,
  initialPlans,
}: UxThresholdsSectionProps) {
  const { locale } = useLocale();
  const persistNumberSetting = useMemo(() => createPersistServerSetting<number>(), []);
  const persistNullableNumberSetting = useMemo(() => createPersistServerSetting<number | null>(), []);

  const saveFromGenerate = useSettingRowMutation<number>({
    key: "prefs.uxThreshold.saveFromGenerate",
    fallbackValue: DEFAULT_TARGETS.saveFromGenerate,
    serverValue: parseNumberSetting(initialSnapshot["prefs.uxThreshold.saveFromGenerate"], DEFAULT_TARGETS.saveFromGenerate),
    persistServer: persistNumberSetting,
    successMessage: locale === "ko" ? "생성→저장 기준치를 저장했습니다." : "Saved the generate-to-save threshold.",
    rollbackNotice: locale === "ko" ? "생성→저장 기준치 저장에 실패해 이전 값으로 복구했습니다." : "Failed to save the generate-to-save threshold, so the previous value was restored.",
  });

  const saveSuccessFromClicks7d = useSettingRowMutation<number>({
    key: "prefs.uxThreshold.saveSuccessFromClicks7d",
    fallbackValue: DEFAULT_TARGETS.saveSuccessFromClicks7d,
    serverValue: parseNumberSetting(initialSnapshot["prefs.uxThreshold.saveSuccessFromClicks7d"], DEFAULT_TARGETS.saveSuccessFromClicks7d),
    persistServer: persistNumberSetting,
    successMessage: locale === "ko" ? "7일 저장 성공률 기준치를 저장했습니다." : "Saved the 7-day save success threshold.",
    rollbackNotice: locale === "ko" ? "7일 저장 성공률 기준치 저장에 실패해 이전 값으로 복구했습니다." : "Failed to save the 7-day save success threshold, so the previous value was restored.",
  });

  const addAfterSheetOpen14d = useSettingRowMutation<number>({
    key: "prefs.uxThreshold.addAfterSheetOpen14d",
    fallbackValue: DEFAULT_TARGETS.addAfterSheetOpen14d,
    serverValue: parseNumberSetting(initialSnapshot["prefs.uxThreshold.addAfterSheetOpen14d"], DEFAULT_TARGETS.addAfterSheetOpen14d),
    persistServer: persistNumberSetting,
    successMessage: locale === "ko" ? "14일 운동 추가 전환 기준치를 저장했습니다." : "Saved the 14-day add-exercise conversion threshold.",
    rollbackNotice: locale === "ko" ? "14일 운동 추가 전환 기준치 저장에 실패해 이전 값으로 복구했습니다." : "Failed to save the 14-day add-exercise conversion threshold, so the previous value was restored.",
  });

  const globalTargets = useMemo(
    () => ({
      saveFromGenerate: clampRatio(Number(saveFromGenerate.value), DEFAULT_TARGETS.saveFromGenerate),
      saveSuccessFromClicks7d: clampRatio(Number(saveSuccessFromClicks7d.value), DEFAULT_TARGETS.saveSuccessFromClicks7d),
      addAfterSheetOpen14d: clampRatio(Number(addAfterSheetOpen14d.value), DEFAULT_TARGETS.addAfterSheetOpen14d),
    }),
    [addAfterSheetOpen14d.value, saveFromGenerate.value, saveSuccessFromClicks7d.value],
  );

  const [plans] = useState<Plan[]>(initialPlans);
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlans[0]?.id ?? "");
  const [planTargets, setPlanTargets] = useState(globalTargets);
  const [planPendingField, setPlanPendingField] = useState<ThresholdField | "clear" | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const hasGlobalError = Boolean(
    saveFromGenerate.error || saveSuccessFromClicks7d.error || addAfterSheetOpen14d.error,
  );
  const latestNotice =
    saveFromGenerate.notice ?? saveSuccessFromClicks7d.notice ?? addAfterSheetOpen14d.notice ?? planNotice;
  const hasError = hasGlobalError || Boolean(planError);
  const isAnyGlobalPending =
    saveFromGenerate.pending || saveSuccessFromClicks7d.pending || addAfterSheetOpen14d.pending;

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  // Read plan-specific thresholds from initialSnapshot when plan changes
  const reloadPlanTargets = useCallback((planId: string, fallback = globalTargets) => {
    if (!planId) {
      setPlanTargets(fallback);
      return;
    }
    // Read from snapshot first (no extra API call needed on initial load)
    const nextTargets = {
      saveFromGenerate: parseNumberSetting(
        initialSnapshot[planThresholdKey(planId, "saveFromGenerate")],
        fallback.saveFromGenerate,
      ),
      saveSuccessFromClicks7d: parseNumberSetting(
        initialSnapshot[planThresholdKey(planId, "saveSuccessFromClicks7d")],
        fallback.saveSuccessFromClicks7d,
      ),
      addAfterSheetOpen14d: parseNumberSetting(
        initialSnapshot[planThresholdKey(planId, "addAfterSheetOpen14d")],
        fallback.addAfterSheetOpen14d,
      ),
    };
    setPlanTargets(nextTargets);
    setPlanError(null);
  }, [globalTargets, initialSnapshot]);

  useEffect(() => {
    reloadPlanTargets(selectedPlanId, globalTargets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  async function resetDefaults() {
    await Promise.all([
      saveFromGenerate.commit(DEFAULT_TARGETS.saveFromGenerate),
      saveSuccessFromClicks7d.commit(DEFAULT_TARGETS.saveSuccessFromClicks7d),
      addAfterSheetOpen14d.commit(DEFAULT_TARGETS.addAfterSheetOpen14d),
    ]);
  }

  async function commitPlanTarget(field: ThresholdField, nextValue: number) {
    if (!selectedPlanId || planPendingField) return;
    setPlanPendingField(field);
    setPlanNotice(null);
    setPlanError(null);

    try {
      await persistNullableNumberSetting({
        key: planThresholdKey(selectedPlanId, field),
        value: nextValue,
        previousValue: planTargets[field],
      });
      setPlanTargets((prev) => ({ ...prev, [field]: nextValue }));
      setPlanNotice(locale === "ko" ? "플랜별 기준치를 저장했습니다." : "Saved the plan-specific thresholds.");
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : (locale === "ko" ? "플랜별 기준치 저장에 실패했습니다." : "Failed to save the plan-specific thresholds."));
      reloadPlanTargets(selectedPlanId, globalTargets);
    } finally {
      setPlanPendingField(null);
    }
  }

  async function clearPlanOverrides() {
    if (!selectedPlanId || planPendingField) return;
    setPlanPendingField("clear");
    setPlanNotice(null);
    setPlanError(null);

    try {
      await Promise.all([
        persistNullableNumberSetting({ key: planThresholdKey(selectedPlanId, "saveFromGenerate"), value: null, previousValue: planTargets.saveFromGenerate }),
        persistNullableNumberSetting({ key: planThresholdKey(selectedPlanId, "saveSuccessFromClicks7d"), value: null, previousValue: planTargets.saveSuccessFromClicks7d }),
        persistNullableNumberSetting({ key: planThresholdKey(selectedPlanId, "addAfterSheetOpen14d"), value: null, previousValue: planTargets.addAfterSheetOpen14d }),
      ]);
      setPlanTargets(globalTargets);
      setPlanNotice(locale === "ko" ? "플랜별 기준치를 해제했습니다. 글로벌 기준치를 사용합니다." : "Cleared the plan-specific thresholds. Global thresholds are now in use.");
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : (locale === "ko" ? "플랜별 기준치 해제에 실패했습니다." : "Failed to clear the plan-specific thresholds."));
      reloadPlanTargets(selectedPlanId, globalTargets);
    } finally {
      setPlanPendingField(null);
    }
  }

  return (
    <div>
      <section>
        <SectionHeader title={locale === "ko" ? "글로벌 기준치" : "Global Thresholds"} />
        <BaseGroupedList ariaLabel={locale === "ko" ? "UX 기준치 설정" : "UX threshold settings"}>
          <ValueRow
            rowId="row-target-save-from-generate"
            label={locale === "ko" ? "세션 생성→저장 전환율 목표" : "Session Generate→Save Target"}
            subtitle={locale === "ko" ? "탭해서 순환" : "Tap to cycle"}
            description={
              saveFromGenerate.pending ? (locale === "ko" ? "저장 중..." : "Saving...")
                : saveFromGenerate.error ? `${saveFromGenerate.error} ${locale === "ko" ? "이전 값으로 복구됨." : "Restored to the previous value."}`
                : (locale === "ko" ? "생성 후 저장 전환 최소 기준치" : "Minimum threshold for generate-to-save conversion")
            }
            value={formatPercentRatio(Number(saveFromGenerate.value))}
            onPress={() => void saveFromGenerate.commit(nextOption(Number(saveFromGenerate.value), SAVE_FROM_GENERATE_OPTIONS, DEFAULT_TARGETS.saveFromGenerate))}
            disabled={saveFromGenerate.pending}
          />
          <ValueRow
            rowId="row-target-save-success-clicks-7d"
            label={locale === "ko" ? "7일 저장 클릭→성공율 목표" : "7-Day Save Click→Success Target"}
            subtitle={locale === "ko" ? "탭해서 순환" : "Tap to cycle"}
            description={
              saveSuccessFromClicks7d.pending ? (locale === "ko" ? "저장 중..." : "Saving...")
                : saveSuccessFromClicks7d.error ? `${saveSuccessFromClicks7d.error} ${locale === "ko" ? "이전 값으로 복구됨." : "Restored to the previous value."}`
                : (locale === "ko" ? "7일 저장 성공 안정성 기준치" : "Reliability threshold for save success over 7 days")
            }
            value={formatPercentRatio(Number(saveSuccessFromClicks7d.value))}
            onPress={() => void saveSuccessFromClicks7d.commit(nextOption(Number(saveSuccessFromClicks7d.value), SAVE_SUCCESS_FROM_CLICKS_7D_OPTIONS, DEFAULT_TARGETS.saveSuccessFromClicks7d))}
            disabled={saveSuccessFromClicks7d.pending}
          />
          <ValueRow
            rowId="row-target-add-after-sheet-open-14d"
            label={locale === "ko" ? "14일 시트 오픈→운동 추가율 목표" : "14-Day Sheet Open→Add Exercise Target"}
            subtitle={locale === "ko" ? "탭해서 순환" : "Tap to cycle"}
            description={
              addAfterSheetOpen14d.pending ? (locale === "ko" ? "저장 중..." : "Saving...")
                : addAfterSheetOpen14d.error ? `${addAfterSheetOpen14d.error} ${locale === "ko" ? "이전 값으로 복구됨." : "Restored to the previous value."}`
                : (locale === "ko" ? "운동 추가 플로우 전환 기준치" : "Conversion threshold for the add-exercise flow")
            }
            value={formatPercentRatio(Number(addAfterSheetOpen14d.value))}
            onPress={() => void addAfterSheetOpen14d.commit(nextOption(Number(addAfterSheetOpen14d.value), ADD_AFTER_SHEET_OPEN_14D_OPTIONS, DEFAULT_TARGETS.addAfterSheetOpen14d))}
            disabled={addAfterSheetOpen14d.pending}
          />
          <ValueRow
            rowId="row-target-reset-default"
            label={locale === "ko" ? "기본값 복원" : "Restore Defaults"}
            description={locale === "ko" ? "권장 기본 기준치(65%, 60%, 35%)로 되돌립니다." : "Restore the recommended default thresholds (65%, 60%, 35%)."}
            value={isAnyGlobalPending ? (locale === "ko" ? "저장 중..." : "Saving...") : (locale === "ko" ? "복원" : "Restore")}
            onPress={() => void resetDefaults()}
            disabled={isAnyGlobalPending}
          />
        </BaseGroupedList>
        <SectionFootnote>{locale === "ko" ? "글로벌 기준치는 모든 플랜에 기본으로 적용됩니다." : "Global thresholds are used by default for every plan."}</SectionFootnote>
      </section>

      <section>
        <SectionHeader title={locale === "ko" ? "플랜별 기준치 프로필(선택)" : "Plan-Specific Threshold Profile (Optional)"} />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          <div style={{ background: "var(--v2-paper)", borderRadius: 20, padding: "var(--v2-s-4)", boxShadow: "0 1px 3px var(--shadow-color-soft)" }}>
            <AppSelect
              label={locale === "ko" ? "플랜 선택" : "Select Plan"}
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
            >
              {plans.length === 0 && <option value="">{locale === "ko" ? "(플랜 없음)" : "(No plans)"}</option>}
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} [{plan.type}]
                </option>
              ))}
            </AppSelect>
          </div>

          <BaseGroupedList ariaLabel={locale === "ko" ? "플랜별 기준치 설정" : "Plan threshold settings"}>
            <ValueRow
              rowId="row-plan-target-save-from-generate"
              label={locale === "ko" ? "생성→저장 전환율" : "Generate→Save Conversion"}
              description={locale === "ko" ? "선택된 플랜에만 적용되는 목표" : "A target applied only to the selected plan"}
              value={formatPercentRatio(planTargets.saveFromGenerate)}
              onPress={() => void commitPlanTarget("saveFromGenerate", nextOption(planTargets.saveFromGenerate, SAVE_FROM_GENERATE_OPTIONS, globalTargets.saveFromGenerate))}
              disabled={!selectedPlanId || Boolean(planPendingField)}
            />
            <ValueRow
              rowId="row-plan-target-save-success-clicks-7d"
              label={locale === "ko" ? "7일 저장 클릭→성공율" : "7-Day Save Click→Success Rate"}
              description={locale === "ko" ? "선택된 플랜에만 적용되는 목표" : "A target applied only to the selected plan"}
              value={formatPercentRatio(planTargets.saveSuccessFromClicks7d)}
              onPress={() => void commitPlanTarget("saveSuccessFromClicks7d", nextOption(planTargets.saveSuccessFromClicks7d, SAVE_SUCCESS_FROM_CLICKS_7D_OPTIONS, globalTargets.saveSuccessFromClicks7d))}
              disabled={!selectedPlanId || Boolean(planPendingField)}
            />
            <ValueRow
              rowId="row-plan-target-add-after-sheet-open-14d"
              label={locale === "ko" ? "14일 시트→운동 추가율" : "14-Day Sheet→Add Exercise Rate"}
              description={locale === "ko" ? "선택된 플랜에만 적용되는 목표" : "A target applied only to the selected plan"}
              value={formatPercentRatio(planTargets.addAfterSheetOpen14d)}
              onPress={() => void commitPlanTarget("addAfterSheetOpen14d", nextOption(planTargets.addAfterSheetOpen14d, ADD_AFTER_SHEET_OPEN_14D_OPTIONS, globalTargets.addAfterSheetOpen14d))}
              disabled={!selectedPlanId || Boolean(planPendingField)}
            />
            <ValueRow
              rowId="row-plan-target-clear"
              label={locale === "ko" ? "플랜 오버라이드 해제" : "Clear Plan Override"}
              description={locale === "ko" ? "선택된 플랜을 글로벌 기준치로 되돌립니다." : "Return the selected plan to the global thresholds."}
              value={planPendingField === "clear" ? (locale === "ko" ? "해제 중..." : "Clearing...") : (locale === "ko" ? "해제" : "Clear")}
              onPress={() => void clearPlanOverrides()}
              disabled={!selectedPlanId || Boolean(planPendingField)}
            />
          </BaseGroupedList>

          {selectedPlan && (
            <div style={{ padding: "10px 6px 2px", fontFamily: "var(--v2-f-display)", fontSize: 11, color: "var(--v2-ink-3)" }}>
              {locale === "ko" ? "현재 플랜" : "Current Plan"}: {selectedPlan.name} [{selectedPlan.type}]
            </div>
          )}
        </div>
        <SectionFootnote>
          {locale === "ko" ? "플랜별 값을 저장하면 해당 플랜으로 통계 조회할 때만 임계치가 덮어써집니다." : "When you save a plan-specific value, it overrides the threshold only when viewing stats for that plan."}
        </SectionFootnote>
      </section>

      <section>
        <SectionHeader title={locale === "ko" ? "적용 안내" : "Usage Notes"} />
        <NoticeStateRows
          message={latestNotice}
          tone={hasError ? "warning" : "success"}
          label={hasError ? (locale === "ko" ? "저장 실패" : "Save Failed") : (locale === "ko" ? "저장 완료" : "Saved")}
        />
        <BaseGroupedList ariaLabel={locale === "ko" ? "UX 기준치 안내" : "UX threshold notes"}>
          <InfoRow
            rowId="row-threshold-note"
            label={locale === "ko" ? "대상 화면" : "Target Screen"}
            description={locale === "ko" ? "통계 대시보드 > UX 행동 요약" : "Stats Dashboard > UX Behavior Summary"}
            value={locale === "ko" ? "연동됨" : "Connected"}
            tone="neutral"
          />
        </BaseGroupedList>
      </section>
    </div>
  );
}
