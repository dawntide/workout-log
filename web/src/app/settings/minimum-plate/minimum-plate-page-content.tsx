"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { ExercisePickerField } from "@/components/v2/settings/exercise-picker-field";
import { EmptyStateRows, NoticeStateRows } from "@/components/ui/settings-state";
import {
  V2NavRow,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Stack,
} from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
  mergeRowSubtitle,
} from "@/components/v2/settings/section";
import { useLocale } from "@/components/locale-provider";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import {
  DEFAULT_MINIMUM_PLATE_KG,
  normalizeIncrementKg,
  parseMinimumPlateRules,
  serializeMinimumPlateRules,
  SETTINGS_KEYS,
  type MinimumPlateRule,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

type ExerciseOption = {
  id: string;
  name: string;
  category: string | null;
};

type RuleDraft = {
  exerciseId: string | null;
  exerciseName: string;
  incrementKg: number;
};

function compareRules(a: MinimumPlateRule, b: MinimumPlateRule) {
  return a.exerciseName.localeCompare(b.exerciseName, "ko");
}

function toRuleKey(rule: MinimumPlateRule) {
  return rule.exerciseId ? `id:${rule.exerciseId}` : `name:${rule.exerciseName.toLowerCase()}`;
}

function dedupeRules(rules: MinimumPlateRule[]) {
  const map = new Map<string, MinimumPlateRule>();
  for (const rule of rules) {
    map.set(toRuleKey(rule), rule);
  }
  return Array.from(map.values()).sort(compareRules);
}

/** label(eyebrow)을 위, iOS 키패드 입력을 아래로 쌓는 래퍼. 운동 기록/플랜 관리 화면과 동일한 패턴. */
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

type MinimumPlatePageContentProps = {
  initialSnapshot: SettingsSnapshot;
  initialExercises: ExerciseOption[];
};

export function MinimumPlatePageContent({ initialSnapshot, initialExercises }: MinimumPlatePageContentProps) {
  const { locale } = useLocale();

  const initialDefaultKg = normalizeIncrementKg(
    initialSnapshot[SETTINGS_KEYS.minimumPlateDefaultKg],
    DEFAULT_MINIMUM_PLATE_KG,
  );
  const initialRulesJson = serializeMinimumPlateRules(
    parseMinimumPlateRules(initialSnapshot[SETTINGS_KEYS.minimumPlateRulesJson]),
  );

  const [settingsLoadKey] = useState("minimum-plate:init");
  const [exercises] = useState<ExerciseOption[]>(initialExercises);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [defaultDraftKg, setDefaultDraftKg] = useState(initialDefaultKg);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>({
    exerciseId: null,
    exerciseName: "",
    incrementKg: DEFAULT_MINIMUM_PLATE_KG,
  });
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [serverDefaultKg, setServerDefaultKg] = useState(initialDefaultKg);
  const [serverRulesJson, setServerRulesJson] = useState(initialRulesJson);

  const defaultIncrement = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.minimumPlateDefaultKg,
    fallbackValue: DEFAULT_MINIMUM_PLATE_KG,
    serverValue: serverDefaultKg,
    persistServer: createPersistServerSetting<number>(),
    successMessage: locale === "ko" ? "기본 최소 원판 무게를 저장했습니다." : "Saved the default minimum plate increment.",
    rollbackNotice: locale === "ko" ? "기본 최소 원판 저장 실패로 이전 값으로 되돌렸습니다." : "Failed to save the default minimum plate increment, so the previous value was restored.",
  });

  const rulesSetting = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.minimumPlateRulesJson,
    fallbackValue: "[]",
    serverValue: serverRulesJson,
    persistServer: createPersistServerSetting<string>(),
    successMessage: locale === "ko" ? "종목별 최소 원판 규칙을 저장했습니다." : "Saved the per-exercise minimum plate rules.",
    rollbackNotice: locale === "ko" ? "규칙 저장 실패로 이전 값으로 되돌렸습니다." : "Failed to save the rule, so the previous value was restored.",
  });

  const rules = useMemo(() => parseMinimumPlateRules(rulesSetting.value), [rulesSetting.value]);


  const selectedExerciseOption = useMemo(
    () => (ruleDraft.exerciseId ? exercises.find((exercise) => exercise.id === ruleDraft.exerciseId) ?? null : null),
    [ruleDraft.exerciseId, exercises],
  );

  // loading=false since data is pre-loaded from SSR
  const isSettingsSettled = useQuerySettled(settingsLoadKey, false);

  const latestNotice = defaultIncrement.notice ?? rulesSetting.notice ?? null;
  const hasSaveError = Boolean(defaultIncrement.error || rulesSetting.error);
  const normalizedDefaultDraftKg = normalizeIncrementKg(defaultDraftKg, DEFAULT_MINIMUM_PLATE_KG);
  const canSaveDefault = !defaultIncrement.pending && normalizedDefaultDraftKg !== normalizeIncrementKg(defaultIncrement.value, DEFAULT_MINIMUM_PLATE_KG);
  const canSaveRule = !rulesSetting.pending && Boolean(ruleDraft.exerciseId);

  useEffect(() => {
    if (defaultIncrement.pending) return;
    setDefaultDraftKg(normalizeIncrementKg(defaultIncrement.value, DEFAULT_MINIMUM_PLATE_KG));
  }, [defaultIncrement.pending, defaultIncrement.value]);

  const saveDefaultIncrement = useCallback(async () => {
    const result = await defaultIncrement.commit(normalizedDefaultDraftKg);
    if (!result.ignored && result.ok) {
      setServerDefaultKg(result.value);
    }
  }, [defaultIncrement, normalizedDefaultDraftKg]);

  const openCreateSheet = () => {
    setEditingRuleKey(null);
    setRuleDraft({
      exerciseId: null,
      exerciseName: "",
      incrementKg: normalizeIncrementKg(defaultIncrement.value, DEFAULT_MINIMUM_PLATE_KG),
    });
    setExerciseQuery("");
    setSheetError(null);
    setSheetOpen(true);
  };

  const openEditSheet = (rule: MinimumPlateRule) => {
    const matchedExercise =
      exercises.find((exercise) => exercise.name.trim().toLowerCase() === rule.exerciseName.trim().toLowerCase()) ??
      null;
    setEditingRuleKey(toRuleKey(rule));
    setRuleDraft({
      exerciseId: matchedExercise?.id ?? rule.exerciseId,
      exerciseName: matchedExercise?.name ?? rule.exerciseName,
      incrementKg: normalizeIncrementKg(rule.incrementKg, DEFAULT_MINIMUM_PLATE_KG),
    });
    setExerciseQuery("");
    setSheetError(null);
    setSheetOpen(true);
  };

  const selectExerciseOption = useCallback((option: ExerciseOption | null) => {
    setRuleDraft((prev) => ({
      ...prev,
      exerciseId: option?.id ?? null,
      exerciseName: option?.name ?? "",
    }));
    setExerciseQuery("");
    setSheetError(null);
  }, []);

  const saveRule = async () => {
    if (!ruleDraft.exerciseId) {
      setSheetError(locale === "ko" ? "드롭다운에서 운동종목을 선택하세요." : "Select an exercise from the dropdown.");
      return;
    }
    const selectedExercise = exercises.find((exercise) => exercise.id === ruleDraft.exerciseId) ?? null;
    const exerciseName = (selectedExercise?.name ?? ruleDraft.exerciseName).trim();
    if (!exerciseName) {
      setSheetError(locale === "ko" ? "선택한 운동종목 정보를 확인하세요." : "Check the selected exercise information.");
      return;
    }

    const nextRule: MinimumPlateRule = {
      exerciseId: ruleDraft.exerciseId,
      exerciseName,
      incrementKg: normalizeIncrementKg(ruleDraft.incrementKg, DEFAULT_MINIMUM_PLATE_KG),
    };

    const filtered = editingRuleKey ? rules.filter((rule) => toRuleKey(rule) !== editingRuleKey) : rules;
    const nextRules = dedupeRules([...filtered, nextRule]);

    const prevRulesJson = serverRulesJson;
    setServerRulesJson(serializeMinimumPlateRules(nextRules));
    setSheetOpen(false);

    const result = await rulesSetting.commit(serializeMinimumPlateRules(nextRules));
    if (!result.ignored && result.ok) {
      setServerRulesJson(result.value);
    } else {
      setServerRulesJson(prevRulesJson);
    }
  };

  const deleteRule = async () => {
    if (!editingRuleKey) return;
    const nextRules = rules.filter((rule) => toRuleKey(rule) !== editingRuleKey);

    const prevRulesJson = serverRulesJson;
    setServerRulesJson(serializeMinimumPlateRules(nextRules));
    setSheetOpen(false);

    const result = await rulesSetting.commit(serializeMinimumPlateRules(nextRules));
    if (!result.ignored && result.ok) {
      setServerRulesJson(result.value);
    } else {
      setServerRulesJson(prevRulesJson);
    }
  };

  return (
    <div>
      <NoticeStateRows message={latestNotice} tone={hasSaveError ? "warning" : "success"} label={locale === "ko" ? "최소 원판 안내" : "Minimum Plate Notice"} />

      <section>
        <V2SettingsSection title={locale === "ko" ? "기본 최소 원판 무게" : "Default Minimum Plate Increment"} description={locale === "ko" ? "기본값은 규칙이 없는 모든 종목에 적용됩니다." : "The default applies to any exercise without a specific rule."} />
        <V2SettingsGroup ariaLabel={locale === "ko" ? "기본 최소 원판 설정" : "Default minimum plate setting"}>
          <V2NavRow
            as="div"
            label={locale === "ko" ? "기본 Increment" : "Default Increment"}
            description={locale === "ko" ? "운동종목별 규칙이 없을 때 사용" : "Used when no exercise-specific rule exists"}
            value={`${normalizeIncrementKg(defaultIncrement.value).toFixed(2)} kg`}
            trailing="none"
          />
        </V2SettingsGroup>
      </section>

      <section>
        <V2SettingsSection title={locale === "ko" ? "기본값 조절" : "Adjust Default"} description={locale === "ko" ? "스테퍼로 조절한 뒤 저장 버튼으로 반영합니다." : "Adjust it with the stepper, then save the change."} />
        <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-4)", padding: "var(--v2-s-4)", display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          <LabeledKeypadField label={locale === "ko" ? "기본 최소 원판 (kg)" : "Default Minimum Plate (kg)"}>
            <NumberKeypadField
              ariaLabel={locale === "ko" ? "기본 최소 원판 (kg)" : "Default Minimum Plate (kg)"}
              value={defaultDraftKg}
              min={0.25}
              max={25}
              allowDecimal
              step={0.25}
              onChange={(next) => setDefaultDraftKg(normalizeIncrementKg(next, DEFAULT_MINIMUM_PLATE_KG))}
            />
          </LabeledKeypadField>
          <V2PrimaryBtn
            full
            onClick={() => {
              void saveDefaultIncrement();
            }}
            disabled={!canSaveDefault}
          >
            {defaultIncrement.pending ? (locale === "ko" ? "저장 중..." : "Saving...") : (locale === "ko" ? "기본값 저장" : "Save Default")}
          </V2PrimaryBtn>
        </div>
      </section>

      <section>
        <V2SettingsSection title={locale === "ko" ? "종목별 최소 원판 규칙" : "Per-Exercise Minimum Plate Rules"} description={locale === "ko" ? "예: Pull-up 1.25kg, 나머지 2.5kg" : "Example: Pull-Up 1.25 kg, everything else 2.5 kg"} />
        <V2SettingsGroup ariaLabel={locale === "ko" ? "운동별 최소 원판 규칙" : "Per exercise minimum plate rules"}>
          {rules.map((rule) => (
            <V2NavRow
              key={toRuleKey(rule)}
              label={rule.exerciseName}
              description={mergeRowSubtitle(
                rule.exerciseId ? (locale === "ko" ? "DB 종목 연결" : "Linked to DB exercise") : (locale === "ko" ? "이름 기반 규칙" : "Name-based rule"),
                locale === "ko" ? "탭해서 increment 수정/삭제" : "Tap to edit or delete the increment",
              )}
              value={`${rule.incrementKg.toFixed(2)}kg`}
              onClick={() => openEditSheet(rule)}
            />
          ))}
          <V2NavRow
            label={locale === "ko" ? "종목별 규칙 추가" : "Add Exercise Rule"}
            description={mergeRowSubtitle(
              "Add Rule",
              locale === "ko" ? "운동종목을 선택하고 최소 원판 무게를 지정합니다." : "Select an exercise and set its minimum plate increment.",
            )}
            onClick={openCreateSheet}
            value={locale === "ko" ? "추가" : "Add"}
          />
        </V2SettingsGroup>
        <EmptyStateRows
          when={isSettingsSettled && rules.length === 0}
          label={locale === "ko" ? "종목별 규칙이 없습니다" : "No exercise-specific rules"}
          description={locale === "ko" ? "기본값만 사용 중입니다. 필요하면 규칙을 추가하세요." : "Only the default increment is in use. Add a rule if needed."}
          ariaLabel={locale === "ko" ? "최소 원판 규칙 빈 상태" : "Minimum plate rule empty state"}
        />
        <V2SettingsFootnote>
          {locale === "ko" ? "저장된 규칙은 기록 화면의 무게 입력 시 자동으로 스냅되어 적용됩니다." : "Saved rules are applied automatically when weight inputs snap on the logging screen."}
        </V2SettingsFootnote>
      </section>

      <BottomSheet
        open={sheetOpen}
        title={editingRuleKey ? (locale === "ko" ? "종목별 최소 원판 규칙 편집" : "Edit Exercise Rule") : (locale === "ko" ? "종목별 최소 원판 규칙 추가" : "Add Exercise Rule")}
        description={locale === "ko" ? "운동종목을 선택하고 증가 단위를 설정하세요." : "Select an exercise and set the increment."}
        onClose={() => setSheetOpen(false)}
        closeLabel={locale === "ko" ? "닫기" : "Close"}
        primaryAction={{
          ariaLabel: rulesSetting.pending ? (locale === "ko" ? "규칙 저장 중" : "Saving rule") : (locale === "ko" ? "규칙 저장" : "Save Rule"),
          onPress: () => {
            void saveRule();
          },
          disabled: !canSaveRule,
        }}
        footer={
          editingRuleKey ? (
            <div>
              <V2SecondaryBtn
                full
                tone="danger"
                onClick={() => void deleteRule()}
                disabled={rulesSetting.pending}
              >
                {locale === "ko" ? "규칙 삭제" : "Delete Rule"}
              </V2SecondaryBtn>
            </div>
          ) : null
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
          <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-4)", padding: "var(--v2-s-4)", display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
            <ExercisePickerField
              label={locale === "ko" ? "운동종목 드롭다운 검색/선택" : "Search and select an exercise"}
              placeholder={locale === "ko" ? "예: Pull-up" : "e.g. Pull-Up"}
              exercises={exercises}
              query={exerciseQuery}
              onQueryChange={(nextQuery) => {
                setExerciseQuery(nextQuery);
                setSheetError(null);
                setRuleDraft((prev) => {
                  if (!prev.exerciseId) return prev;
                  if (nextQuery.trim().toLowerCase() === prev.exerciseName.trim().toLowerCase()) return prev;
                  return { ...prev, exerciseId: null, exerciseName: "" };
                });
              }}
              selected={selectedExerciseOption}
              onSelect={selectExerciseOption}
            />
          </div>

          <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-4)", padding: "var(--v2-s-4)" }}>
            <LabeledKeypadField label={locale === "ko" ? "최소 원판 Increment (kg)" : "Minimum Plate Increment (kg)"}>
              <NumberKeypadField
                ariaLabel={locale === "ko" ? "최소 원판 Increment (kg)" : "Minimum Plate Increment (kg)"}
                value={ruleDraft.incrementKg}
                min={0.25}
                max={25}
                allowDecimal
                step={0.25}
                onChange={(next) =>
                  setRuleDraft((prev) => ({
                    ...prev,
                    incrementKg: normalizeIncrementKg(next, DEFAULT_MINIMUM_PLATE_KG),
                  }))
                }
              />
            </LabeledKeypadField>
          </div>

          {sheetError ? <p className="v2-font-text" style={{ margin: 0, color: "var(--v2-c-danger)", fontSize: "var(--v2-t-small)" }}>{sheetError}</p> : null}
        </div>
      </BottomSheet>
    </div>
  );
}
