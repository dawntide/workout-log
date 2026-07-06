"use client";
import { errorMessage } from "@/lib/error-message";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPersistServerSetting, fetchSettingsSnapshot } from "./settings-api";
import { useSettingRowMutation } from "./use-setting-row-mutation";
import {
  DEFAULT_MINIMUM_PLATE_KG,
  normalizeIncrementKg,
  parseMinimumPlateRules,
  serializeMinimumPlateRules,
  SETTINGS_KEYS,
  type MinimumPlateRule,
} from "./workout-preferences";

export { DEFAULT_MINIMUM_PLATE_KG, normalizeIncrementKg };

type RulesValue = Record<string, number>;
type NameMap = Record<string, string>;

type UseMinimumPlateRulesSettingReturn = {
  value: RulesValue;
  nameMap: NameMap;
  loading: boolean;
  error: string | null;
  pending: boolean;
  update: (nextValue: RulesValue, nextNameMap?: NameMap) => Promise<void>;
};

export function useMinimumPlateRulesSetting(): UseMinimumPlateRulesSettingReturn {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<NameMap>({});

  const mutation = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.minimumPlateRulesJson,
    fallbackValue: "[]",
    persistServer: createPersistServerSetting<string>(),
    successMessage: "규칙을 저장했습니다.",
    rollbackNotice: "규칙 저장 실패로 이전 값으로 되돌렸습니다.",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const snapshot = await fetchSettingsSnapshot();
        if (cancelled) return;
        const raw = snapshot[SETTINGS_KEYS.minimumPlateRulesJson];
        const rules = parseMinimumPlateRules(raw);
        const map: NameMap = {};
        for (const rule of rules) {
          if (rule.exerciseId) {
            map[rule.exerciseId] = rule.exerciseName;
          }
        }
        setNameMap(map);
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e) ?? "규칙을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<RulesValue>(() => {
    const rules = parseMinimumPlateRules(mutation.value);
    const result: RulesValue = {};
    for (const rule of rules) {
      const key = rule.exerciseId ?? rule.exerciseName;
      result[key] = rule.incrementKg;
    }
    return result;
  }, [mutation.value]);

  const update = useCallback(
    async (nextValue: RulesValue, nextNameMap?: NameMap) => {
      const mergedNameMap = nextNameMap ? { ...nameMap, ...nextNameMap } : nameMap;
      const rules: MinimumPlateRule[] = Object.entries(nextValue).map(
        ([id, incrementKg]) => ({
          exerciseId: id,
          exerciseName: mergedNameMap[id] ?? id,
          incrementKg,
        }),
      );
      const serialized = serializeMinimumPlateRules(rules);
      await mutation.commit(serialized);
      if (nextNameMap) {
        setNameMap((prev) => ({ ...prev, ...nextNameMap }));
      }
    },
    [mutation, nameMap],
  );

  return {
    value,
    nameMap,
    loading,
    error: loadError ?? mutation.error,
    pending: mutation.pending,
    update,
  };
}
