import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { and, asc, desc, eq, gt, inArray, or } from "@workout/core/db/ops";
import {
  generatedSession,
  plan,
  planModule,
  programTemplate,
  programVersion,
  uxEventLog,
} from "@workout/core/db/schema";
import { getHomeData } from "@workout/core/home/home-service";
import { buildUserDataExport, buildWorkoutSetCsv } from "@workout/core/export/userExport";
import { importUserData, type ImportMode } from "@workout/core/import/userImport";
import { invalidateStatsCacheForUser } from "@workout/core/stats/cache";
import { rateLimit } from "@workout/core/auth/rate-limit";
import { REF5_IDENTIFIERS } from "@workout/core/program-engine/ref5";
import {
  ANONYMOUS_WEB_VITAL_USER_ID,
  normalizePublicWebVitalEvent,
  type PublicWebVitalEvent,
} from "@workout/core/observability/web-vital-event";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, normalizeTimezone, resolveLocale } from "../lib/http";
import { getClientIp } from "../lib/rate-limit";

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

// DELETE /api/templates/:slug — delete a PRIVATE template you own (+ your plans
// built on its versions). Web-only.
templatesRoutes.delete("/:slug", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const normalizedSlug = String(c.req.param("slug") ?? "").trim();
    if (!normalizedSlug) {
      return c.json({ error: locale === "ko" ? "slug가 필요합니다." : "slug is required." }, 400);
    }

    const templateRows = await db
      .select({
        id: programTemplate.id,
        slug: programTemplate.slug,
        name: programTemplate.name,
        visibility: programTemplate.visibility,
        ownerUserId: programTemplate.ownerUserId,
      })
      .from(programTemplate)
      .where(eq(programTemplate.slug, normalizedSlug))
      .limit(1);
    const template = templateRows[0];
    if (!template) {
      return c.json(
        { error: locale === "ko" ? "템플릿을 찾을 수 없습니다." : "Template not found." },
        404,
      );
    }
    if (template.visibility !== "PRIVATE") {
      return c.json(
        {
          error:
            locale === "ko" ? "공개 템플릿은 삭제할 수 없습니다." : "Public templates cannot be deleted.",
        },
        403,
      );
    }
    if (template.ownerUserId !== userId) {
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);
    }

    const versions = await db
      .select({ id: programVersion.id })
      .from(programVersion)
      .where(eq(programVersion.templateId, template.id));
    const versionIds = versions.map((entry) => entry.id);

    let deletedPlanCount = 0;
    try {
      await db.transaction(async (tx) => {
        const affectedPlanIds = new Set<string>();
        if (versionIds.length > 0) {
          const rootPlans = await tx
            .select({ id: plan.id })
            .from(plan)
            .where(and(eq(plan.userId, userId), inArray(plan.rootProgramVersionId, versionIds)));
          rootPlans.forEach((entry) => affectedPlanIds.add(entry.id));

          const modulePlans = await tx
            .select({ id: plan.id })
            .from(planModule)
            .innerJoin(plan, eq(planModule.planId, plan.id))
            .where(and(eq(plan.userId, userId), inArray(planModule.programVersionId, versionIds)));
          modulePlans.forEach((entry) => affectedPlanIds.add(entry.id));
        }

        const planIds = Array.from(affectedPlanIds);
        if (planIds.length > 0) {
          const deletedPlans = await tx
            .delete(plan)
            .where(and(eq(plan.userId, userId), inArray(plan.id, planIds)))
            .returning({ id: plan.id });
          deletedPlanCount = deletedPlans.length;
        }

        const deletedTemplates = await tx
          .delete(programTemplate)
          .where(
            and(
              eq(programTemplate.id, template.id),
              eq(programTemplate.visibility, "PRIVATE"),
              eq(programTemplate.ownerUserId, userId),
            ),
          )
          .returning({ id: programTemplate.id });
        if (!deletedTemplates[0]) throw new Error("template delete failed");
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "23503") {
        return c.json(
          {
            error:
              locale === "ko"
                ? "이 템플릿은 아직 플랜 모듈에서 참조 중입니다."
                : "This template is still referenced by plan modules.",
          },
          409,
        );
      }
      throw e;
    }

    return c.json({
      deleted: true,
      template: { id: template.id, slug: template.slug, name: template.name },
      deletedPlanCount,
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/templates/:slug/fork — copy a template's latest version into a new
// PRIVATE template you own. Web-only.
templatesRoutes.post("/:slug/fork", async (c) => {
  const locale = resolveLocale(c);
  try {
    const slug = c.req.param("slug");
    const body = await c.req.json();
    const userId = c.get("userId");
    const newSlug = body.newSlug as string | undefined;
    const newName = body.newName as string | undefined;

    const srcT = await db
      .select()
      .from(programTemplate)
      .where(eq(programTemplate.slug, slug))
      .limit(1);
    const sourceTemplate = srcT[0];
    if (!sourceTemplate)
      return c.json(
        { error: locale === "ko" ? "원본 템플릿을 찾을 수 없습니다." : "Source template not found." },
        404,
      );
    if (sourceTemplate.visibility === "PRIVATE" && sourceTemplate.ownerUserId !== userId) {
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);
    }

    const srcV = await db
      .select()
      .from(programVersion)
      .where(eq(programVersion.templateId, sourceTemplate.id))
      .orderBy(desc(programVersion.version))
      .limit(1);
    const sourceVersion = srcV[0];
    if (!sourceVersion)
      return c.json(
        { error: locale === "ko" ? "원본 버전을 찾을 수 없습니다." : "Source version not found." },
        404,
      );

    const sourceDefinition =
      sourceVersion.definition &&
      typeof sourceVersion.definition === "object" &&
      !Array.isArray(sourceVersion.definition)
        ? (sourceVersion.definition as Record<string, unknown>)
        : {};
    const isRef5Source =
      sourceTemplate.slug === REF5_IDENTIFIERS.slug ||
      String(sourceDefinition.kind ?? "").toLowerCase() === REF5_IDENTIFIERS.kind ||
      String(sourceDefinition.family ?? "").toLowerCase() === REF5_IDENTIFIERS.family;
    if (isRef5Source) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "REF5 전용 편집기가 제공되기 전에는 복제할 수 없습니다."
              : "REF5 cannot be forked until a dedicated editor is available.",
        },
        400,
      );
    }

    const forkSlug = newSlug ?? `${slug}-${userId}-${Date.now()}`;
    const forkName = newName ?? `${sourceTemplate.name} (Fork)`;

    const created = await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(programTemplate)
        .values({
          slug: forkSlug,
          name: forkName,
          type: sourceTemplate.type,
          visibility: "PRIVATE",
          ownerUserId: userId,
          parentTemplateId: sourceTemplate.id,
          description: sourceTemplate.description,
          tags: sourceTemplate.tags,
        })
        .returning();

      const [v] = await tx
        .insert(programVersion)
        .values({
          templateId: t.id,
          version: 1,
          parentVersionId: sourceVersion.id,
          definition: sourceVersion.definition,
          defaults: sourceVersion.defaults,
          changelog: `Forked from ${sourceTemplate.slug}@v${sourceVersion.version}`,
        })
        .returning();

      return { template: t, version: v, source: { template: sourceTemplate, version: sourceVersion } };
    });

    return c.json(created, 201);
  } catch (e) {
    return apiError(c, e, locale);
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

// ── program-versions (PUT /api/program-versions/:id) — edit a version you own ──

export const programVersionsRoutes = new Hono<AppEnv>();
programVersionsRoutes.use("*", requireAuth);

programVersionsRoutes.put("/:id", async (c) => {
  const locale = resolveLocale(c);
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const userId = c.get("userId");

    const definition = body.definition;
    if (!definition) {
      return c.json(
        { error: locale === "ko" ? "definition이 필요합니다." : "definition is required." },
        400,
      );
    }

    const versionRows = await db
      .select({
        id: programVersion.id,
        templateId: programVersion.templateId,
        templateOwnerUserId: programTemplate.ownerUserId,
      })
      .from(programVersion)
      .innerJoin(programTemplate, eq(programTemplate.id, programVersion.templateId))
      .where(eq(programVersion.id, id))
      .limit(1);
    const version = versionRows[0];
    if (!version)
      return c.json({ error: locale === "ko" ? "대상을 찾을 수 없습니다." : "Not found." }, 404);
    if (!version.templateOwnerUserId || version.templateOwnerUserId !== userId) {
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);
    }

    const [updated] = await db
      .update(programVersion)
      .set({ definition })
      .where(eq(programVersion.id, id))
      .returning();
    return c.json({ programVersion: updated });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// ── generated-sessions (GET /api/generated-sessions) — saved session list ─────

export const generatedSessionsRoutes = new Hono<AppEnv>();
generatedSessionsRoutes.use("*", requireAuth);

generatedSessionsRoutes.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const planId = c.req.query("planId")?.trim() ?? "";
    const sessionId = c.req.query("id")?.trim() ?? "";
    const includeSnapshot =
      c.req.query("includeSnapshot") === "1" ||
      c.req.query("includeSnapshot")?.toLowerCase() === "true";
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
      : 20;

    const filters = [eq(generatedSession.userId, userId)];
    if (planId) filters.push(eq(generatedSession.planId, planId));
    if (sessionId) filters.push(eq(generatedSession.id, sessionId));
    const where = and(...filters);

    const items = includeSnapshot
      ? await db
          .select({
            id: generatedSession.id,
            sessionKey: generatedSession.sessionKey,
            updatedAt: generatedSession.updatedAt,
            snapshot: generatedSession.snapshot,
          })
          .from(generatedSession)
          .where(where)
          .orderBy(desc(generatedSession.updatedAt))
          .limit(limit)
      : await db
          .select({
            id: generatedSession.id,
            sessionKey: generatedSession.sessionKey,
            updatedAt: generatedSession.updatedAt,
          })
          .from(generatedSession)
          .where(where)
          .orderBy(desc(generatedSession.updatedAt))
          .limit(limit);

    return c.json({ items });
  } catch (e) {
    return apiError(c, e);
  }
});

// ── ux-events (POST /api/ux-events) — client UX telemetry ingest ─────────────

type IncomingUxEvent = {
  id: string;
  name: string;
  recordedAt: string;
  props?: Record<string, string | number | boolean | null>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeEvent(raw: unknown): IncomingUxEvent | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const recordedAt = typeof raw.recordedAt === "string" ? raw.recordedAt.trim() : "";
  const props = isPlainObject(raw.props) ? (raw.props as Record<string, unknown>) : {};

  if (!id || id.length > 128) return null;
  if (!name || name.length > 128) return null;
  if (!recordedAt) return null;
  const parsedDate = new Date(recordedAt);
  if (!Number.isFinite(parsedDate.getTime())) return null;

  const safeProps: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof key !== "string" || !key.trim() || key.length > 100) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safeProps[key] = value;
    }
  }

  return { id, name, recordedAt, props: safeProps };
}

export const uxEventsRoutes = new Hono<AppEnv>();

// The public endpoint accepts only privacy-minimized Core Web Vitals. Every
// other UX event remains behind normal session authentication.
uxEventsRoutes.use("*", async (c, next) => {
  if (new URL(c.req.url).pathname === "/api/ux-events/public") {
    await next();
    return;
  }
  return requireAuth(c, next);
});

async function persistUxEvents(
  userId: string,
  events: Array<IncomingUxEvent | PublicWebVitalEvent>,
) {
  await db
    .insert(uxEventLog)
    .values(
      events.map((event) => ({
        userId,
        clientEventId: event.id,
        name: event.name,
        recordedAt: new Date(event.recordedAt),
        props: event.props ?? {},
      })),
    )
    .onConflictDoNothing();
}

uxEventsRoutes.post("/public", async (c) => {
  const limit = await rateLimit({
    key: `public-web-vitals:${getClientIp(c.req.raw)}`,
    max: 120,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return c.json({ error: "Too many telemetry requests." }, 429, {
      "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
    });
  }

  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return c.json({ error: "Telemetry payload is too large." }, 413);
  }

  const rawBody = await c.req.text();
  if (Buffer.byteLength(rawBody, "utf8") > 16_384) {
    return c.json({ error: "Telemetry payload is too large." }, 413);
  }

  let body: unknown = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid telemetry payload." }, 400);
  }

  const rawEvents: unknown[] =
    isPlainObject(body) && Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length > 20) {
    return c.json({ error: "events must be <= 20." }, 400);
  }

  const acceptedById = new Map<string, PublicWebVitalEvent>();
  for (const rawEvent of rawEvents) {
    const event = normalizePublicWebVitalEvent(rawEvent);
    if (event) acceptedById.set(event.id, event);
  }
  const accepted = Array.from(acceptedById.values());
  if (accepted.length > 0) {
    await persistUxEvents(ANONYMOUS_WEB_VITAL_USER_ID, accepted);
  }

  c.header("Cache-Control", "no-store");
  return c.json({
    acceptedIds: accepted.map((event) => event.id),
    acceptedCount: accepted.length,
    droppedCount: rawEvents.length - accepted.length,
  });
});

uxEventsRoutes.post("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");
    const body: unknown = await c.req.json().catch(() => ({}));
    const rawEvents: unknown[] =
      isPlainObject(body) && Array.isArray(body.events) ? body.events : [];
    if (rawEvents.length === 0) {
      return c.json({ acceptedIds: [], acceptedCount: 0, droppedCount: 0 });
    }
    if (rawEvents.length > 200) {
      return c.json(
        { error: locale === "ko" ? "events는 200개 이하여야 합니다." : "events must be <= 200." },
        400,
      );
    }

    const normalized = rawEvents
      .map(toSafeEvent)
      .filter((event): event is IncomingUxEvent => Boolean(event));
    if (normalized.length === 0) {
      return c.json({ acceptedIds: [], acceptedCount: 0, droppedCount: rawEvents.length });
    }

    const dedupedById = new Map<string, IncomingUxEvent>();
    for (const event of normalized) dedupedById.set(event.id, event);
    const accepted = Array.from(dedupedById.values());

    await persistUxEvents(userId, accepted);

    return c.json({
      acceptedIds: accepted.map((event) => event.id),
      acceptedCount: accepted.length,
      droppedCount: rawEvents.length - accepted.length,
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});
