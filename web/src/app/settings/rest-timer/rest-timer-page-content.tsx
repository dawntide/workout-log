"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { EmptyStateRows, NoticeStateRows } from "@/components/ui/settings-state";
import {
  V2NavRow,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Stack,
  V2Switch,
} from "@/components/v2/primitives";
import {
  ExercisePickerField,
  type ExercisePickerOption,
} from "@/components/v2/settings/exercise-picker-field";
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
  DEFAULT_REST_SECONDS,
  DEFAULT_REST_SOUND_ENABLED,
  DEFAULT_REST_WAKE_LOCK_ENABLED,
  normalizeRestSeconds,
  parseRestPresets,
  serializeRestPresets,
  SETTINGS_KEYS,
  type RestPresetRule,
} from "@/lib/settings/workout-preferences";
import { formatRestClock } from "@/lib/workout-record/rest-timer";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

type PresetDraft = {
  exerciseId: string | null;
  exerciseName: string;
  seconds: number;
};

function comparePresets(a: RestPresetRule, b: RestPresetRule) {
  return a.exerciseName.localeCompare(b.exerciseName, "ko");
}

function toPresetKey(preset: RestPresetRule) {
  return preset.exerciseId ? `id:${preset.exerciseId}` : `name:${preset.exerciseName.toLowerCase()}`;
}

function dedupePresets(presets: RestPresetRule[]) {
  const map = new Map<string, RestPresetRule>();
  for (const preset of presets) {
    map.set(toPresetKey(preset), preset);
  }
  return Array.from(map.values()).sort(comparePresets);
}

/** label(eyebrow)을 위, iOS 키패드 입력을 아래로 쌓는 래퍼 — 최소 원판 화면과 동일 패턴. */
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

type RestTimerPageContentProps = {
  initialSnapshot: SettingsSnapshot;
  initialExercises: ExercisePickerOption[];
};

export function RestTimerPageContent({
  initialSnapshot,
  initialExercises,
}: RestTimerPageContentProps) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  const initialDefaultSeconds = normalizeRestSeconds(
    initialSnapshot[SETTINGS_KEYS.restDefaultSeconds],
    DEFAULT_REST_SECONDS,
  );
  const initialPresetsJson = serializeRestPresets(
    parseRestPresets(initialSnapshot[SETTINGS_KEYS.restPresetsJson]),
  );

  const [settingsLoadKey] = useState("rest-timer:init");
  const [exercises] = useState<ExercisePickerOption[]>(initialExercises);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [defaultDraftSeconds, setDefaultDraftSeconds] = useState(initialDefaultSeconds);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPresetKey, setEditingPresetKey] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<PresetDraft>({
    exerciseId: null,
    exerciseName: "",
    seconds: DEFAULT_REST_SECONDS,
  });
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [serverDefaultSeconds, setServerDefaultSeconds] = useState(initialDefaultSeconds);
  const [serverPresetsJson, setServerPresetsJson] = useState(initialPresetsJson);

  const defaultSeconds = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.restDefaultSeconds,
    fallbackValue: DEFAULT_REST_SECONDS,
    serverValue: serverDefaultSeconds,
    persistServer: createPersistServerSetting<number>(),
    successMessage: ko ? "기본 휴식 시간을 저장했습니다." : "Saved the default rest time.",
    rollbackNotice: ko
      ? "기본 휴식 시간 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the default rest time, so the previous value was restored.",
  });

  const presetsSetting = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.restPresetsJson,
    fallbackValue: "[]",
    serverValue: serverPresetsJson,
    persistServer: createPersistServerSetting<string>(),
    successMessage: ko ? "운동별 휴식 시간을 저장했습니다." : "Saved the per-exercise rest times.",
    rollbackNotice: ko
      ? "휴식 시간 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the rest time, so the previous value was restored.",
  });

  const soundEnabled = useSettingRowMutation<boolean>({
    key: SETTINGS_KEYS.restSoundEnabled,
    fallbackValue: DEFAULT_REST_SOUND_ENABLED,
    persistServer: createPersistServerSetting<boolean>(),
    successMessage: ko ? "휴식 종료음 설정을 저장했습니다." : "Saved the rest chime setting.",
    rollbackNotice: ko
      ? "종료음 설정 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the chime setting, so the previous value was restored.",
  });

  const wakeLockEnabled = useSettingRowMutation<boolean>({
    key: SETTINGS_KEYS.restWakeLockEnabled,
    fallbackValue: DEFAULT_REST_WAKE_LOCK_ENABLED,
    persistServer: createPersistServerSetting<boolean>(),
    successMessage: ko ? "화면 꺼짐 방지 설정을 저장했습니다." : "Saved the screen wake lock setting.",
    rollbackNotice: ko
      ? "화면 꺼짐 방지 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the wake lock setting, so the previous value was restored.",
  });

  const presets = useMemo(() => parseRestPresets(presetsSetting.value), [presetsSetting.value]);

  const selectedExerciseOption = useMemo(
    () =>
      presetDraft.exerciseId
        ? exercises.find((exercise) => exercise.id === presetDraft.exerciseId) ?? null
        : null,
    [presetDraft.exerciseId, exercises],
  );

  const isSettingsSettled = useQuerySettled(settingsLoadKey, false);

  const latestNotice =
    defaultSeconds.notice ??
    presetsSetting.notice ??
    soundEnabled.notice ??
    wakeLockEnabled.notice ??
    null;
  const hasSaveError = Boolean(
    defaultSeconds.error || presetsSetting.error || soundEnabled.error || wakeLockEnabled.error,
  );
  const normalizedDefaultDraft = normalizeRestSeconds(defaultDraftSeconds, DEFAULT_REST_SECONDS);
  const canSaveDefault =
    !defaultSeconds.pending &&
    normalizedDefaultDraft !== normalizeRestSeconds(defaultSeconds.value, DEFAULT_REST_SECONDS);
  const canSavePreset = !presetsSetting.pending && Boolean(presetDraft.exerciseId);

  useEffect(() => {
    if (defaultSeconds.pending) return;
    setDefaultDraftSeconds(normalizeRestSeconds(defaultSeconds.value, DEFAULT_REST_SECONDS));
  }, [defaultSeconds.pending, defaultSeconds.value]);

  const saveDefaultSeconds = useCallback(async () => {
    const result = await defaultSeconds.commit(normalizedDefaultDraft);
    if (!result.ignored && result.ok) {
      setServerDefaultSeconds(result.value);
    }
  }, [defaultSeconds, normalizedDefaultDraft]);

  const openCreateSheet = () => {
    setEditingPresetKey(null);
    setPresetDraft({
      exerciseId: null,
      exerciseName: "",
      seconds: normalizeRestSeconds(defaultSeconds.value, DEFAULT_REST_SECONDS),
    });
    setExerciseQuery("");
    setSheetError(null);
    setSheetOpen(true);
  };

  const openEditSheet = (preset: RestPresetRule) => {
    const matched =
      exercises.find(
        (exercise) =>
          exercise.name.trim().toLowerCase() === preset.exerciseName.trim().toLowerCase(),
      ) ?? null;
    setEditingPresetKey(toPresetKey(preset));
    setPresetDraft({
      exerciseId: matched?.id ?? preset.exerciseId,
      exerciseName: matched?.name ?? preset.exerciseName,
      seconds: normalizeRestSeconds(preset.seconds, DEFAULT_REST_SECONDS),
    });
    setExerciseQuery("");
    setSheetError(null);
    setSheetOpen(true);
  };

  const selectExerciseOption = useCallback((option: ExercisePickerOption | null) => {
    setPresetDraft((prev) => ({
      ...prev,
      exerciseId: option?.id ?? null,
      exerciseName: option?.name ?? "",
    }));
    setExerciseQuery("");
    setSheetError(null);
  }, []);

  const commitPresets = useCallback(
    async (nextPresets: RestPresetRule[]) => {
      const prevJson = serverPresetsJson;
      const nextJson = serializeRestPresets(nextPresets);
      setServerPresetsJson(nextJson);
      setSheetOpen(false);

      const result = await presetsSetting.commit(nextJson);
      if (!result.ignored && result.ok) {
        setServerPresetsJson(result.value);
      } else {
        setServerPresetsJson(prevJson);
      }
    },
    [presetsSetting, serverPresetsJson],
  );

  const savePreset = async () => {
    if (!presetDraft.exerciseId) {
      setSheetError(
        ko ? "드롭다운에서 운동종목을 선택하세요." : "Select an exercise from the dropdown.",
      );
      return;
    }
    const selected = exercises.find((exercise) => exercise.id === presetDraft.exerciseId) ?? null;
    const exerciseName = (selected?.name ?? presetDraft.exerciseName).trim();
    if (!exerciseName) {
      setSheetError(
        ko ? "선택한 운동종목 정보를 확인하세요." : "Check the selected exercise information.",
      );
      return;
    }

    const nextPreset: RestPresetRule = {
      exerciseId: presetDraft.exerciseId,
      exerciseName,
      seconds: normalizeRestSeconds(presetDraft.seconds, DEFAULT_REST_SECONDS),
    };
    const filtered = editingPresetKey
      ? presets.filter((preset) => toPresetKey(preset) !== editingPresetKey)
      : presets;
    await commitPresets(dedupePresets([...filtered, nextPreset]));
  };

  const deletePreset = async () => {
    if (!editingPresetKey) return;
    await commitPresets(presets.filter((preset) => toPresetKey(preset) !== editingPresetKey));
  };

  return (
    <div>
      <NoticeStateRows
        message={latestNotice}
        tone={hasSaveError ? "warning" : "success"}
        label={ko ? "휴식 타이머 안내" : "Rest Timer Notice"}
      />

      <section>
        <V2SettingsSection
          title={ko ? "기본 휴식 시간" : "Default Rest Time"}
          description={
            ko
              ? "운동별 설정이 없을 때 쓰는 값입니다. 프로그램이 휴식을 처방하면 그 값이 우선합니다."
              : "Used when an exercise has no specific rest time. A program's prescribed rest takes precedence."
          }
        />
        <V2SettingsGroup ariaLabel={ko ? "기본 휴식 시간 설정" : "Default rest time setting"}>
          <V2NavRow
            as="div"
            label={ko ? "기본 휴식" : "Default Rest"}
            description={ko ? "운동별 설정이 없을 때 사용" : "Used when no per-exercise rest time exists"}
            value={formatRestClock(normalizeRestSeconds(defaultSeconds.value, DEFAULT_REST_SECONDS))}
            trailing="none"
          />
        </V2SettingsGroup>
      </section>

      <section>
        <V2SettingsSection
          title={ko ? "기본값 조절" : "Adjust Default"}
          description={ko ? "초 단위로 조절한 뒤 저장합니다." : "Adjust in seconds, then save."}
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
          <LabeledKeypadField label={ko ? "기본 휴식 시간 (초)" : "Default Rest Time (seconds)"}>
            <NumberKeypadField
              ariaLabel={ko ? "기본 휴식 시간 (초)" : "Default Rest Time (seconds)"}
              value={defaultDraftSeconds}
              min={5}
              max={600}
              step={15}
              onChange={(next) =>
                setDefaultDraftSeconds(normalizeRestSeconds(next, DEFAULT_REST_SECONDS))
              }
            />
          </LabeledKeypadField>
          <V2PrimaryBtn
            full
            onClick={() => {
              void saveDefaultSeconds();
            }}
            disabled={!canSaveDefault}
          >
            {defaultSeconds.pending
              ? ko ? "저장 중..." : "Saving..."
              : ko ? "기본값 저장" : "Save Default"}
          </V2PrimaryBtn>
        </div>
      </section>

      <section>
        <V2SettingsSection
          title={ko ? "운동별 휴식 시간" : "Per-Exercise Rest Times"}
          description={ko ? "예: 스쿼트 3분, 컬 60초" : "Example: Squat 3 min, Curl 60 s"}
        />
        <V2SettingsGroup ariaLabel={ko ? "운동별 휴식 시간" : "Per exercise rest times"}>
          {presets.map((preset) => (
            <V2NavRow
              key={toPresetKey(preset)}
              label={preset.exerciseName}
              description={mergeRowSubtitle(
                preset.exerciseId
                  ? ko ? "DB 종목 연결" : "Linked to DB exercise"
                  : ko ? "이름 기반 규칙" : "Name-based rule",
                ko ? "탭해서 시간 수정/삭제" : "Tap to edit or delete",
              )}
              value={formatRestClock(preset.seconds)}
              onClick={() => openEditSheet(preset)}
            />
          ))}
          <V2NavRow
            label={ko ? "운동별 휴식 추가" : "Add Exercise Rest Time"}
            description={mergeRowSubtitle(
              "Add Rest Time",
              ko
                ? "운동종목을 선택하고 휴식 시간을 지정합니다."
                : "Select an exercise and set its rest time.",
            )}
            onClick={openCreateSheet}
            value={ko ? "추가" : "Add"}
          />
        </V2SettingsGroup>
        <EmptyStateRows
          when={isSettingsSettled && presets.length === 0}
          label={ko ? "운동별 설정이 없습니다" : "No per-exercise rest times"}
          description={
            ko
              ? "기본값만 사용 중입니다. 필요하면 운동별로 추가하세요."
              : "Only the default is in use. Add one per exercise if needed."
          }
          ariaLabel={ko ? "휴식 시간 빈 상태" : "Rest time empty state"}
        />
      </section>

      <section>
        <V2SettingsSection
          title={ko ? "알림" : "Alerts"}
          description={
            ko
              ? "휴식이 끝날 때의 동작입니다. 기기 푸시 알림은 보내지 않습니다."
              : "What happens when rest ends. No device push notifications are sent."
          }
        />
        <V2SettingsGroup ariaLabel={ko ? "휴식 알림 설정" : "Rest alert settings"}>
          <V2NavRow
            as="div"
            label={ko ? "종료음" : "Chime"}
            description={
              soundEnabled.pending
                ? ko ? "저장 중..." : "Saving..."
                : soundEnabled.error
                  ? `${soundEnabled.error} ${ko ? "이전 값으로 복구됨." : "Previous value restored."}`
                  : ko
                    ? "휴식이 끝나면 짧은 소리를 냅니다."
                    : "Plays a short sound when rest ends."
            }
            trailing={
              <V2Switch
                checked={Boolean(soundEnabled.value)}
                onCheckedChange={(next) => {
                  void soundEnabled.commit(next);
                }}
                disabled={soundEnabled.pending}
                aria-label={ko ? "휴식 종료음" : "Rest chime"}
              />
            }
          />
          <V2NavRow
            as="div"
            label={ko ? "기록 중 화면 꺼짐 방지" : "Keep Screen Awake While Logging"}
            description={
              wakeLockEnabled.pending
                ? ko ? "저장 중..." : "Saving..."
                : wakeLockEnabled.error
                  ? `${wakeLockEnabled.error} ${ko ? "이전 값으로 복구됨." : "Previous value restored."}`
                  : ko
                    ? "휴식이 도는 동안만 화면을 켜 둡니다. 배터리를 더 씁니다."
                    : "Keeps the screen on only while rest is running. Uses more battery."
            }
            trailing={
              <V2Switch
                checked={Boolean(wakeLockEnabled.value)}
                onCheckedChange={(next) => {
                  void wakeLockEnabled.commit(next);
                }}
                disabled={wakeLockEnabled.pending}
                aria-label={ko ? "기록 중 화면 꺼짐 방지" : "Keep screen awake while logging"}
              />
            }
          />
        </V2SettingsGroup>
        <V2SettingsFootnote>
          {ko
            ? "휴식 타이머는 세트를 완료하면 자동으로 시작하고, 기록 화면 하단에 남은 시간이 표시됩니다."
            : "The rest timer starts automatically when you complete a set, and the remaining time appears at the bottom of the logging screen."}
        </V2SettingsFootnote>
      </section>

      <BottomSheet
        open={sheetOpen}
        title={
          editingPresetKey
            ? ko ? "운동별 휴식 시간 편집" : "Edit Exercise Rest Time"
            : ko ? "운동별 휴식 시간 추가" : "Add Exercise Rest Time"
        }
        description={
          ko
            ? "운동종목을 선택하고 휴식 시간을 설정하세요."
            : "Select an exercise and set its rest time."
        }
        onClose={() => setSheetOpen(false)}
        closeLabel={ko ? "닫기" : "Close"}
        primaryAction={{
          ariaLabel: presetsSetting.pending
            ? ko ? "휴식 시간 저장 중" : "Saving rest time"
            : ko ? "휴식 시간 저장" : "Save Rest Time",
          onPress: () => {
            void savePreset();
          },
          disabled: !canSavePreset,
        }}
        footer={
          editingPresetKey ? (
            <div>
              <V2SecondaryBtn
                full
                tone="danger"
                onClick={() => void deletePreset()}
                disabled={presetsSetting.pending}
              >
                {ko ? "휴식 시간 삭제" : "Delete Rest Time"}
              </V2SecondaryBtn>
            </div>
          ) : null
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
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
            <ExercisePickerField
              label={ko ? "운동종목 드롭다운 검색/선택" : "Search and select an exercise"}
              placeholder={ko ? "예: Squat" : "e.g. Squat"}
              exercises={exercises}
              query={exerciseQuery}
              onQueryChange={(nextQuery) => {
                setExerciseQuery(nextQuery);
                setSheetError(null);
                setPresetDraft((prev) => {
                  if (!prev.exerciseId) return prev;
                  if (nextQuery.trim().toLowerCase() === prev.exerciseName.trim().toLowerCase()) {
                    return prev;
                  }
                  return { ...prev, exerciseId: null, exerciseName: "" };
                });
              }}
              selected={selectedExerciseOption}
              onSelect={selectExerciseOption}
            />
          </div>

          <div
            style={{
              background: "var(--v2-paper)",
              borderRadius: "var(--v2-r-4)",
              padding: "var(--v2-s-4)",
            }}
          >
            <LabeledKeypadField label={ko ? "휴식 시간 (초)" : "Rest Time (seconds)"}>
              <NumberKeypadField
                ariaLabel={ko ? "휴식 시간 (초)" : "Rest Time (seconds)"}
                value={presetDraft.seconds}
                min={5}
                max={600}
                step={15}
                onChange={(next) =>
                  setPresetDraft((prev) => ({
                    ...prev,
                    seconds: normalizeRestSeconds(next, DEFAULT_REST_SECONDS),
                  }))
                }
              />
            </LabeledKeypadField>
          </div>

          {sheetError ? (
            <p
              className="v2-font-text"
              style={{ margin: 0, color: "var(--v2-c-danger)", fontSize: "var(--v2-t-small)" }}
            >
              {sheetError}
            </p>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}
