import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { eq } from "@workout/core/db/ops";
import { userSetting, uxEventLog } from "@workout/core/db/schema";
import { invalidateStatsCacheForUser } from "@workout/core/stats/cache";
import { runSeed } from "@workout/core/db/seed";
import { deleteUserDomainData } from "@workout/core/data/deleteUserData";
import { seedDemoHistoryForUser } from "@workout/core/db/seed-demo-history";
import { seedDemoProgramReplay } from "@workout/core/db/seed-demo-program-replay";
import { findUserRole } from "@workout/core/auth/session";
import {
  DEFAULT_DARK_COLOR_THEME,
  DEFAULT_LIGHT_COLOR_THEME,
  SETTINGS_KEYS,
  DEFAULT_REST_SECONDS,
  DEFAULT_REST_SOUND_ENABLED,
  DEFAULT_PLATE_BAR_WEIGHT_KG,
  DEFAULT_FRESHNESS_RECOVERY_HOURS,
  DEFAULT_INTENSITY_INPUT,
  DEFAULT_PLATE_PLATES_KG,
  DEFAULT_REST_WAKE_LOCK_ENABLED,
} from "@workout/core/settings/workout-preferences";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, resolveLocale } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Settings — user-scoped key/value prefs. Ported verbatim from
// web/src/app/api/settings/**. This route owns its settings read (with a
// table-missing fallback), so it's already userId-parameterized internally — no
// getSettingsSnapshotForUser needed. requireAuth supplies the user id.
// ─────────────────────────────────────────────────────────────────────────────

type SettingValue = string | number | boolean | null;
type SettingsSnapshot = Record<string, SettingValue>;

type PatchRequestBody = {
  key?: unknown;
  value?: unknown;
  simulateFailure?: unknown;
};

// core의 같은 이름 상수와 반드시 일치해야 한다 — settings-defaults.test.ts가 강제한다.
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
  [SETTINGS_KEYS.restDefaultSeconds]: DEFAULT_REST_SECONDS,
  [SETTINGS_KEYS.restPresetsJson]: "[]",
  [SETTINGS_KEYS.restSoundEnabled]: DEFAULT_REST_SOUND_ENABLED,
  [SETTINGS_KEYS.restWakeLockEnabled]: DEFAULT_REST_WAKE_LOCK_ENABLED,
  [SETTINGS_KEYS.plateBarWeightKg]: DEFAULT_PLATE_BAR_WEIGHT_KG,
  [SETTINGS_KEYS.platePlatesJson]: JSON.stringify(DEFAULT_PLATE_PLATES_KG),
  [SETTINGS_KEYS.intensityInput]: DEFAULT_INTENSITY_INPUT,
  [SETTINGS_KEYS.freshnessRecoveryHours]: DEFAULT_FRESHNESS_RECOVERY_HOURS,
};

// Per-user in-memory fallback, used only if the user_setting table is missing
// (42P01). Persists for the process lifetime (the web equivalent uses globalThis
// to survive serverless hot-reload; a module Map is equivalent here).
const fallbackByUser = new Map<string, SettingsSnapshot>();

function getFallbackStoreForUser(userId: string): SettingsSnapshot {
  let store = fallbackByUser.get(userId);
  if (!store) {
    store = { ...DEFAULT_SETTINGS };
    fallbackByUser.set(userId, store);
  }
  return store;
}

function isSettingValue(value: unknown): value is SettingValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return false;
}

function toSafeSettingValue(value: unknown): SettingValue | undefined {
  if (isSettingValue(value)) return value;
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function mergeWithDefaults(snapshot: SettingsSnapshot): SettingsSnapshot {
  return { ...DEFAULT_SETTINGS, ...snapshot };
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const asRecord = error as Record<string, unknown>;
  if (asRecord.code === "42P01") return true;
  const cause = asRecord.cause;
  if (!cause || typeof cause !== "object") return false;
  return (cause as Record<string, unknown>).code === "42P01";
}

async function readSettingsFromDb(userId: string): Promise<SettingsSnapshot> {
  const rows = await db
    .select({ key: userSetting.key, value: userSetting.value })
    .from(userSetting)
    .where(eq(userSetting.userId, userId));

  const snapshot: SettingsSnapshot = {};
  for (const row of rows) {
    const value = toSafeSettingValue(row.value);
    if (value === undefined) continue;
    snapshot[row.key] = value;
  }
  return snapshot;
}

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use("*", requireAuth);

// GET /api/settings — the user's settings, merged with defaults.
settingsRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  try {
    const settings = mergeWithDefaults(await readSettingsFromDb(userId));
    return c.json({ settings });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ settings: { ...getFallbackStoreForUser(userId) } });
    }
    return apiError(c, error);
  }
});

// PATCH /api/settings — upsert one setting; returns the full merged snapshot.
settingsRoutes.patch("/", async (c) => {
  const userId = c.get("userId");
  const locale = resolveLocale(c);
  try {
    const body = (await c.req.json().catch(() => ({}))) as PatchRequestBody;
    const key = typeof body.key === "string" ? body.key.trim() : "";

    if (!key) {
      return c.json(
        { error: locale === "ko" ? "설정 키가 비어 있습니다." : "The settings key is empty." },
        400,
      );
    }

    if (!Object.hasOwn(body, "value") || !isSettingValue(body.value)) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "설정 값 형식이 잘못되었습니다."
              : "The settings value format is invalid.",
        },
        400,
      );
    }

    if (body.simulateFailure === true) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "테스트용 저장 실패가 강제되었습니다."
              : "A simulated save failure was forced for testing.",
        },
        503,
      );
    }

    const nextValue = body.value;

    try {
      await db
        .insert(userSetting)
        .values({ userId, key, value: nextValue, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [userSetting.userId, userSetting.key],
          set: { value: nextValue, updatedAt: new Date() },
        });

      // Home/stats payloads include goal and bodyweight preferences. Settings
      // writes are rare, so invalidate once here and keep warm reads query-free.
      await invalidateStatsCacheForUser(userId);

      const settings = mergeWithDefaults(await readSettingsFromDb(userId));
      return c.json({ ok: true, setting: { key, value: settings[key] }, settings });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      const snapshot = getFallbackStoreForUser(userId);
      snapshot[key] = nextValue;
      await invalidateStatsCacheForUser(userId).catch(() => {});
      return c.json({
        ok: true,
        setting: { key, value: snapshot[key] },
        settings: { ...snapshot },
      });
    }
  } catch (error) {
    return apiError(c, error, locale);
  }
});

// POST /api/settings/clear-cache — invalidate the user's stats cache.
settingsRoutes.post("/clear-cache", async (c) => {
  try {
    await invalidateStatsCacheForUser(c.get("userId"));
    return c.json({ ok: true });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/settings/app-reset — DESTRUCTIVE hard reset + reseed. Guarded by the
// confirmToken; never exercised by the smoke test. Ported for web parity.
settingsRoutes.post("/app-reset", async (c) => {
  const userId = c.get("userId");
  const locale = resolveLocale(c);
  try {
    const body = (await c.req.json().catch(() => ({}))) as { confirmToken?: unknown };

    if (body.confirmToken !== "RESET_APP_DATA") {
      return c.json(
        { error: locale === "ko" ? "잘못된 초기화 요청입니다." : "Invalid reset request." },
        400,
      );
    }

    // **호출자 본인 데이터만** 지운다.
    //
    // 종전에는 runSeed({shouldHardReset:true})를 불렀는데, 그 안의 hardResetSeedData는
    // where 없이 workout_log·plan·user_setting·stats_cache·ux_event_log를 통째로 비운다.
    // 단일 사용자 시절 코드가 멀티유저 격리 때 갱신되지 않고 남은 것으로, 한 사람의
    // "앱 데이터 초기화"가 **전 사용자의 기록**을 지웠다. 공용 카탈로그(exercise·
    // programTemplate)까지 지우고 다시 심느라 그 사이 모두의 조회가 흔들리기도 했다.
    //
    // 정리 범위는 계정 삭제와 같은 정책을 쓴다(deleteUserData.coverage.test.ts의
    // CLEANUP_POLICY) — 인증 자산만 빼고. 계정은 남고 데이터만 비우는 동작이라
    // auth_session 등은 건드리지 않는다.
    await db.transaction(async (tx) => {
      await deleteUserDomainData(tx, userId);
      await tx.delete(userSetting).where(eq(userSetting.userId, userId));
      await tx.delete(uxEventLog).where(eq(uxEventLog.userId, userId));
    });
    await invalidateStatsCacheForUser(userId).catch(() => {});

    // 공용 카탈로그는 지우지 않고, 비어 있을 때를 대비한 멱등 upsert만 돌린다.
    const result = await runSeed({ shouldHardReset: false, includeDemoPlans: false });

    return c.json({
      ok: true,
      summary: {
        triggeredBy: userId,
        baseTemplateCount: result.baseTemplateCount,
        baseExerciseCount: result.baseExerciseCount,
        includeDemoPlans: result.includeDemoPlans,
      },
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/settings/seed-demo-data — 테스트 계정에 데모 플랜 + 예시 기록을 채운다.
//
// **테스트 계정 전용이다.** 실계정에 데모 데이터를 쏟아붓는 사고를 값으로 막는다 —
// 관리자가 전환(role='test')한 동안에만 닿는 표면이고, 그 판정은 UI가 아니라 여기서 한다.
settingsRoutes.post("/seed-demo-data", async (c) => {
  const userId = c.get("userId");
  const locale = resolveLocale(c);
  try {
    const role = await findUserRole(userId);
    if (role !== "test") {
      return c.json(
        {
          error:
            locale === "ko"
              ? "테스트 계정에서만 사용할 수 있습니다."
              : "Available only on a test account.",
        },
        403,
      );
    }

    // 기존 플랜을 지우지 않는다 — 이름 기준 upsert라 반복 실행이 중복을 만들지 않고,
    // 사용자가 테스트 계정에서 만든 것도 그대로 남는다.
    const result = await runSeed({
      devUserId: userId,
      includeDemoPlans: true,
      shouldHardReset: false,
    });

    // 플랜만으로는 앱의 절반이 빈 화면이다 — 통계·캘린더·PR·부위 신선도·체중 추이는
    // 전부 기록에서 나온다. 데모 태그가 붙은 이전 기록만 갈아 끼운다.
    const history = await seedDemoHistoryForUser({ userId });

    // 평평한 기록만으로는 캘린더가 비고(캘린더는 planId로만 조회한다) 세션 전환·자동 진행을
    // 검증할 수 없다. 그래서 한 플랜은 **진짜 엔진으로 재생**해 생성 세션·진행 이벤트까지
    // 실제로 쌓는다. 순서가 중요하다 — 위 seedDemoHistoryForUser가 demo-seed 태그 기록을
    // 먼저 비우므로 재생은 그 뒤에 와야 결과가 남는다.
    const replay = await seedDemoProgramReplay({
      userId,
      planName: "Program Tactical Barbell Operator",
    });

    // 기록이 통째로 바뀌었으니 집계 캐시를 버린다 — 안 버리면 빈 통계가 굳어 보인다.
    await invalidateStatsCacheForUser(userId).catch(() => {});

    return c.json({
      ok: true,
      summary: {
        userId,
        baseTemplateCount: result.baseTemplateCount,
        baseExerciseCount: result.baseExerciseCount,
        logCount: history.logCount,
        setCount: history.setCount,
        bodyweightCount: history.bodyweightCount,
        replayPlanId: replay.planId,
        replaySessionCount: replay.loggedCount,
      },
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});
