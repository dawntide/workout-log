/**
 * 명시적 userId로 설정 스냅샷을 읽는다. 요청 스코프(쿠키)에 의존하지 않으므로
 * 토큰 인증 백엔드(apps/api)나 배경 작업에서도 사용할 수 있다.
 * (쿠키 세션에서 userId를 해석하는 웹 래퍼는 web/src/server/services/settings/get-settings-snapshot.ts)
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { userSetting } from "../../db/schema";
import {
  DEFAULT_DARK_COLOR_THEME,
  DEFAULT_LIGHT_COLOR_THEME,
  SETTINGS_KEYS,
  type SettingValue,
} from "../../settings/workout-preferences";

export type SettingsSnapshot = Record<string, SettingValue>;

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  "prefs.locale": "ko",
  "prefs.theme.mode": "SYSTEM",
  [SETTINGS_KEYS.lightColorTheme]: DEFAULT_LIGHT_COLOR_THEME,
  [SETTINGS_KEYS.darkColorTheme]: DEFAULT_DARK_COLOR_THEME,
  "prefs.minimumPlate.defaultKg": 2.5,
  "prefs.minimumPlate.rulesJson": "[]",
  "prefs.bodyweight.kg": 70,
  "prefs.autoSync": true,
  "prefs.timezone": "UTC",
  "prefs.metricPresetDays": 90,
  "prefs.uxThreshold.saveFromGenerate": 0.65,
  "prefs.uxThreshold.saveSuccessFromClicks7d": 0.6,
  "prefs.uxThreshold.addAfterSheetOpen14d": 0.35,
};

export async function getSettingsSnapshotForUser(
  userId: string,
): Promise<SettingsSnapshot> {
  const rows = await db
    .select({ key: userSetting.key, value: userSetting.value })
    .from(userSetting)
    .where(eq(userSetting.userId, userId));

  const snapshot: SettingsSnapshot = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const value = row.value;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number"
    ) {
      snapshot[row.key] = value;
    }
  }
  return snapshot;
}
