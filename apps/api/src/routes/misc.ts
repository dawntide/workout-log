import { Hono } from "hono";

import { db } from "@/server/db/client";
import { and, asc, desc, eq, gt, inArray, or } from "@/server/db/ops";
import { programTemplate, programVersion } from "@/server/db/schema";
import { getHomeData } from "@/server/home/home-service";
import { buildUserDataExport, buildWorkoutSetCsv } from "@/server/export/userExport";
import { importUserData, type ImportMode } from "@/server/import/userImport";
import { invalidateStatsCacheForUser } from "@/server/stats/cache";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, normalizeTimezone, resolveLocale } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Misc — the remaining TUI-used routes that don't form a larger group, each a
// sub-app mounted at its own prefix. Ported verbatim from web. All the backing
// services (templates inline, home/export/import services) are Next-free and
// userId-parameterized. Deferred (web-only / TUI-unused): generated-sessions,
// program-versions, templates/[slug] + fork, ux-events, ops/*.
// ─────────────────────────────────────────────────────────────────────────────

// ── templates (GET /api/templates) — program store list ──────────────────────

type TemplateCursor = { name: string; id: string };

function parseCursor(raw: string | null): TemplateCursor | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as TemplateCursor;
    if (typeof decoded?.name !== "string" || typeof decoded?.id !== "string") return null;
    return decoded;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: TemplateCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export const templatesRoutes = new Hono<AppEnv>();
templatesRoutes.use("*", requireAuth);

templatesRoutes.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const cursor = parseCursor(c.req.query("cursor") ?? null);
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
      : 20;

    const visibilityFilter = or(
      eq(programTemplate.visibility, "PUBLIC"),
      and(eq(programTemplate.visibility, "PRIVATE"), eq(programTemplate.ownerUserId, userId)),
    );

    const cursorFilter = cursor
      ? or(
          gt(programTemplate.name, cursor.name),
          and(eq(programTemplate.name, cursor.name), gt(programTemplate.id, cursor.id)),
        )
      : undefined;

    const where = cursorFilter ? and(visibilityFilter, cursorFilter) : visibilityFilter;

    const templates = await db
      .select()
      .from(programTemplate)
      .where(where)
      .orderBy(asc(programTemplate.name), asc(programTemplate.id))
      .limit(limit + 1);

    const hasMore = templates.length > limit;
    const pageTemplates = hasMore ? templates.slice(0, limit) : templates;

    const templateIds = pageTemplates.map((t) => t.id);
    const latestVersionByTemplateId = new Map<string, typeof programVersion.$inferSelect>();

    if (templateIds.length > 0) {
      const versionRows = await db
        .select()
        .from(programVersion)
        .where(inArray(programVersion.templateId, templateIds))
        .orderBy(asc(programVersion.templateId), desc(programVersion.version));

      for (const row of versionRows) {
        if (!latestVersionByTemplateId.has(row.templateId)) {
          latestVersionByTemplateId.set(row.templateId, row);
        }
      }
    }

    const items = pageTemplates.map((t) => ({
      ...t,
      latestVersion: latestVersionByTemplateId.get(t.id) ?? null,
    }));

    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ name: last.name, id: last.id }) : null;

    return c.json({ items, nextCursor, limit });
  } catch (e) {
    return apiError(c, e);
  }
});

// ── home (GET /api/home) — today/home bootstrap ──────────────────────────────

export const homeRoutes = new Hono<AppEnv>();
homeRoutes.use("*", requireAuth);

homeRoutes.get("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const timezone = normalizeTimezone(c.req.query("timezone") ?? null);
    const recentLimit = parseInt(c.req.query("recentLimit") || "3", 10);

    const homeData = await getHomeData({ userId, locale, timezone, recentLimit });

    c.header("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    return c.json(homeData);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// ── export (GET /api/export) — JSON or CSV data download ──────────────────────

export const exportRoutes = new Hono<AppEnv>();
exportRoutes.use("*", requireAuth);

exportRoutes.get("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const format = (c.req.query("format") ?? "json").toLowerCase();
    const type = (c.req.query("type") ?? "").toLowerCase();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      if (type !== "workout_set") {
        return c.json(
          {
            error:
              locale === "ko"
                ? "CSV 내보내기는 type=workout_set 이 필요합니다."
                : "CSV export requires type=workout_set.",
          },
          400,
        );
      }
      const csv = await buildWorkoutSetCsv(userId);
      return c.body(csv, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="workout-log-${userId}-workout_set-${stamp}.csv"`,
        "cache-control": "no-store",
      });
    }

    if (format !== "json") {
      return c.json(
        { error: locale === "ko" ? "format은 json 또는 csv여야 합니다." : "format must be json or csv." },
        400,
      );
    }

    const data = await buildUserDataExport(userId);
    return c.body(JSON.stringify(data, null, 2), 200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="workout-log-${userId}-export-${stamp}.json"`,
      "cache-control": "no-store",
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// ── import (POST /api/me/import) — JSON data import (dryRun / replace) ─────────

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB

type ImportRequestBody = {
  mode?: unknown;
  confirmToken?: unknown;
  data?: unknown;
};

export const importRoutes = new Hono<AppEnv>();
importRoutes.use("*", requireAuth);

importRoutes.post("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");

    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > 0 && contentLength > MAX_BODY_BYTES) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "import 본문이 너무 큽니다 (최대 10MB)."
              : "import body too large (max 10MB).",
        },
        413,
      );
    }

    const body = (await c.req.json().catch(() => null)) as ImportRequestBody | null;
    if (!body || typeof body !== "object") {
      return c.json(
        { error: locale === "ko" ? "잘못된 JSON 본문입니다." : "invalid JSON body." },
        400,
      );
    }

    const mode = body.mode as ImportMode | undefined;
    if (mode !== "dryRun" && mode !== "replace") {
      return c.json(
        {
          error:
            locale === "ko"
              ? "mode는 'dryRun' 또는 'replace' 여야 합니다."
              : "mode must be 'dryRun' or 'replace'.",
        },
        400,
      );
    }

    if (mode === "replace" && body.confirmToken !== "REPLACE_USER_DATA") {
      return c.json(
        {
          error:
            locale === "ko"
              ? "replace 모드는 confirmToken='REPLACE_USER_DATA' 가 필요합니다."
              : "replace mode requires confirmToken='REPLACE_USER_DATA'.",
        },
        400,
      );
    }

    const result = await importUserData(userId, body.data, mode).catch(
      (err: Error & { code?: string }) => {
        if (err.code === "INVALID_IMPORT_BODY") {
          return { __validationError: err.message } as const;
        }
        throw err;
      },
    );

    if ("__validationError" in result) {
      return c.json(
        {
          error:
            locale === "ko"
              ? `import 본문 검증 실패: ${result.__validationError}`
              : `import body validation failed: ${result.__validationError}`,
        },
        400,
      );
    }

    if (result.applied) {
      await invalidateStatsCacheForUser(userId);
    }

    return c.json(result);
  } catch (e) {
    return apiError(c, e, locale);
  }
});
