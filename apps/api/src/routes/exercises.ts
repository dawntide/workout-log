import { Hono } from "hono";

import { db } from "@/server/db/client";
import { and, eq, inArray, isNotNull, ne, sql } from "@/server/db/ops";
import { exercise, exerciseAlias } from "@/server/db/schema";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, resolveLocale } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Routes — mounted at /api/exercises. The exercise dictionary is GLOBAL (not
// user-scoped: the `exercise`/`exercise_alias` tables have no userId). The web
// routes don't auth-gate these, but a standalone backend shouldn't expose the
// write endpoints unauthenticated, so requireAuth is applied here (the TUI always
// sends a token — no behavior change for it). Inline CRUD ported verbatim from
// web/src/app/api/exercises/**.
// ─────────────────────────────────────────────────────────────────────────────

export const exercisesRoutes = new Hono<AppEnv>();

exercisesRoutes.use("*", requireAuth);

// GET /api/exercises — search the dictionary (empty query = all, up to 200),
// each item with its aliases.
exercisesRoutes.get("/", async (c) => {
  try {
    const query = (c.req.query("query") ?? "").trim();
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
      : 20;

    let baseRows: Array<{ id: string; name: string; category: string | null }> = [];

    if (query) {
      const nameRows = await db
        .select({ id: exercise.id, name: exercise.name, category: exercise.category })
        .from(exercise)
        .where(
          sql`lower(${exercise.name}) like lower(${`%${query}%`})
            or (${exercise.category} is not null and lower(${exercise.category}) like lower(${`%${query}%`}))`,
        )
        .limit(limit);

      const aliasRows = await db
        .select({ id: exercise.id, name: exercise.name, category: exercise.category })
        .from(exerciseAlias)
        .innerJoin(exercise, eq(exerciseAlias.exerciseId, exercise.id))
        .where(sql`lower(${exerciseAlias.alias}) like lower(${`%${query}%`})`)
        .limit(limit);

      const map = new Map<string, { id: string; name: string; category: string | null }>();
      for (const r of nameRows) map.set(r.id, r);
      for (const r of aliasRows) map.set(r.id, r);
      baseRows = Array.from(map.values()).slice(0, limit);
    } else {
      baseRows = await db
        .select({ id: exercise.id, name: exercise.name, category: exercise.category })
        .from(exercise)
        .orderBy(exercise.name)
        .limit(limit);
    }

    if (baseRows.length === 0) {
      return c.json({ items: [] });
    }

    const ids = baseRows.map((r) => r.id);
    const aliases = await db
      .select({ exerciseId: exerciseAlias.exerciseId, alias: exerciseAlias.alias })
      .from(exerciseAlias)
      .where(inArray(exerciseAlias.exerciseId, ids));

    const aliasMap = new Map<string, string[]>();
    for (const a of aliases) {
      const list = aliasMap.get(a.exerciseId) ?? [];
      list.push(a.alias);
      aliasMap.set(a.exerciseId, list);
    }

    const items = baseRows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      aliases: aliasMap.get(r.id) ?? [],
    }));

    c.header("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
    return c.json({ items });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/exercises — create a canonical exercise (idempotent on name).
exercisesRoutes.post("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const body = await c.req.json();
    const name = String(body.name ?? "").trim();
    const category = body.category ? String(body.category).trim() : null;

    if (!name) {
      return c.json(
        { error: locale === "ko" ? "운동 이름이 필요합니다." : "Exercise name is required." },
        400,
      );
    }

    const inserted = await db
      .insert(exercise)
      .values({ name, category })
      .onConflictDoNothing()
      .returning({ id: exercise.id, name: exercise.name, category: exercise.category });

    if (inserted[0]) {
      return c.json({ exercise: inserted[0], created: true }, 201);
    }

    const existing = await db
      .select({ id: exercise.id, name: exercise.name, category: exercise.category })
      .from(exercise)
      .where(eq(exercise.name, name))
      .limit(1);

    return c.json({ exercise: existing[0] ?? null, created: false });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// GET /api/exercises/categories — distinct non-null categories.
exercisesRoutes.get("/categories", async (c) => {
  try {
    const rows = await db
      .selectDistinct({ category: exercise.category })
      .from(exercise)
      .where(isNotNull(exercise.category))
      .orderBy(exercise.category);

    const categories = rows.map((r) => r.category as string);
    return c.json({ categories });
  } catch (e) {
    return apiError(c, e);
  }
});

// POST /api/exercises/alias — map an alias onto an exercise (409 if mapped
// elsewhere; idempotent if already mapped to the same exercise).
exercisesRoutes.post("/alias", async (c) => {
  const locale = resolveLocale(c);
  try {
    const body = await c.req.json();
    const exerciseId = String(body.exerciseId ?? "").trim();
    const alias = String(body.alias ?? "").trim();

    if (!exerciseId || !alias) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "exerciseId와 alias가 필요합니다."
              : "exerciseId and alias are required.",
        },
        400,
      );
    }

    const exerciseRows = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(eq(exercise.id, exerciseId))
      .limit(1);
    if (!exerciseRows[0]) {
      return c.json(
        { error: locale === "ko" ? "운동을 찾을 수 없습니다." : "Exercise not found." },
        404,
      );
    }

    const existingAlias = await db
      .select({
        id: exerciseAlias.id,
        exerciseId: exerciseAlias.exerciseId,
        alias: exerciseAlias.alias,
      })
      .from(exerciseAlias)
      .where(eq(exerciseAlias.alias, alias))
      .limit(1);

    if (existingAlias[0] && existingAlias[0].exerciseId !== exerciseId) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "이미 다른 운동에 매핑된 별칭입니다."
              : "That alias is already mapped to another exercise.",
        },
        409,
      );
    }
    if (existingAlias[0] && existingAlias[0].exerciseId === exerciseId) {
      return c.json({ alias: existingAlias[0], created: false });
    }

    const inserted = await db
      .insert(exerciseAlias)
      .values({ exerciseId, alias })
      .onConflictDoNothing()
      .returning({
        id: exerciseAlias.id,
        exerciseId: exerciseAlias.exerciseId,
        alias: exerciseAlias.alias,
      });

    if (inserted[0]) {
      return c.json({ alias: inserted[0], created: true }, 201);
    }

    const aliasRows = await db
      .select({
        id: exerciseAlias.id,
        exerciseId: exerciseAlias.exerciseId,
        alias: exerciseAlias.alias,
      })
      .from(exerciseAlias)
      .where(and(eq(exerciseAlias.exerciseId, exerciseId), eq(exerciseAlias.alias, alias)))
      .limit(1);

    return c.json({ alias: aliasRows[0] ?? null, created: false });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// PATCH /api/exercises/:exerciseId — rename / recategorize (409 on name clash).
exercisesRoutes.patch("/:exerciseId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const id = String(c.req.param("exerciseId") ?? "").trim();
    if (!id) {
      return c.json(
        { error: locale === "ko" ? "exerciseId가 필요합니다." : "exerciseId is required." },
        400,
      );
    }

    const body = await c.req.json();
    const nextName =
      body.name === undefined || body.name === null ? null : String(body.name).trim();
    const nextCategory =
      body.category === undefined
        ? undefined
        : body.category === null
          ? null
          : String(body.category).trim() || null;

    const currentRows = await db
      .select({ id: exercise.id, name: exercise.name, category: exercise.category })
      .from(exercise)
      .where(eq(exercise.id, id))
      .limit(1);
    const current = currentRows[0];
    if (!current) {
      return c.json(
        { error: locale === "ko" ? "운동을 찾을 수 없습니다." : "Exercise not found." },
        404,
      );
    }

    if (nextName !== null && !nextName) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "운동 이름은 비워둘 수 없습니다."
              : "Exercise name cannot be empty.",
        },
        400,
      );
    }

    const targetName = nextName ?? current.name;
    if (targetName !== current.name) {
      const duplicate = await db
        .select({ id: exercise.id })
        .from(exercise)
        .where(and(eq(exercise.name, targetName), ne(exercise.id, id)))
        .limit(1);
      if (duplicate[0]) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "이미 같은 이름의 운동이 있습니다."
                : "An exercise with that name already exists.",
          },
          409,
        );
      }
    }

    const [updated] = await db
      .update(exercise)
      .set({
        name: targetName,
        category: nextCategory === undefined ? current.category : nextCategory,
      })
      .where(eq(exercise.id, id))
      .returning({ id: exercise.id, name: exercise.name, category: exercise.category });

    return c.json({ exercise: updated });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// DELETE /api/exercises/:exerciseId — remove a canonical exercise.
exercisesRoutes.delete("/:exerciseId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const id = String(c.req.param("exerciseId") ?? "").trim();
    if (!id) {
      return c.json(
        { error: locale === "ko" ? "exerciseId가 필요합니다." : "exerciseId is required." },
        400,
      );
    }

    const [deleted] = await db
      .delete(exercise)
      .where(eq(exercise.id, id))
      .returning({ id: exercise.id, name: exercise.name });

    if (!deleted) {
      return c.json(
        { error: locale === "ko" ? "운동을 찾을 수 없습니다." : "Exercise not found." },
        404,
      );
    }

    return c.json({ deleted: true, exercise: deleted });
  } catch (e) {
    return apiError(c, e, locale);
  }
});
