/**
 * 서버사이드 설정 스냅샷 로더
 * 클라이언트 API 호출 없이 DB에서 직접 설정을 읽어 SSR에 사용합니다.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { userSetting } from "@/server/db/schema";
import { requireAuthenticatedUserId } from "@/server/auth/user";
import type { SettingValue } from "@/lib/settings/update-setting";

export type SettingsSnapshot = Record<string, SettingValue>;

const DEFAULT_SETTINGS: SettingsSnapshot = {
  "prefs.locale": "ko",
  "prefs.theme.mode": "SYSTEM",
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

/**
 * 명시적 userId로 설정 스냅샷을 읽는다. 요청 스코프(쿠키)에 의존하지 않으므로
 * 토큰 인증 백엔드(apps/api)나 배경 작업에서도 사용할 수 있다.
 */
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

export async function getSettingsSnapshot(): Promise<SettingsSnapshot> {
  const userId = await requireAuthenticatedUserId();
  return getSettingsSnapshotForUser(userId);
}
