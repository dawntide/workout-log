import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { eq } from "@workout/core/db/ops";
import { userSetting } from "@workout/core/db/schema";
import { invalidateStatsCacheForUser } from "@workout/core/stats/cache";
import { runSeed } from "@workout/core/db/seed";

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

    const result = await runSeed({ shouldHardReset: true, includeDemoPlans: false });

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
