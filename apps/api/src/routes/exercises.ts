import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { and, eq, inArray, isNotNull, ne, sql } from "@workout/core/db/ops";
import { exercise, exerciseAlias, workoutLog, workoutSet } from "@workout/core/db/schema";
import {
  EXERCISE_EQUIPMENTS,
  type ExerciseEquipment,
} from "@workout/core/exercise/catalog";
import { EXERCISE_CATALOG } from "@workout/core/exercise/all-exercises";

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

/**
 * 정렬을 위해 훑는 상한. 사전이 755종이라 "squat" 한 번에 57건, "press"는 101건이
 * 나온다 — SQL에서 limit으로 먼저 자르면 정렬이 첫 20건 안에서만 일어난다.
 */
const SEARCH_SCAN_LIMIT = 200;

function normalizeEquipmentFilter(raw: string | undefined): ExerciseEquipment | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  return (EXERCISE_EQUIPMENTS as readonly string[]).includes(value)
    ? (value as ExerciseEquipment)
    : null;
}

/**
 * 그 장비를 쓰는 종목의 **소문자 이름 집합**.
 *
 * 장비는 DB 컬럼이 아니라 코드 카탈로그에 있다(사용자 생성 운동은 unknown). 컬럼을
 * 추가하는 대신 이름으로 좁히는 이유: 카탈로그가 진실원이라 DB에 복제하면 두 곳이
 * 어긋날 수 있고, 재생성 때마다 마이그레이션이 필요해진다.
 */
const equipmentNameCache = new Map<ExerciseEquipment, string[]>();

function namesForEquipment(equipment: ExerciseEquipment): string[] {
  const cached = equipmentNameCache.get(equipment);
  if (cached) return cached;
  const names = EXERCISE_CATALOG.filter((item) => item.equipment === equipment).map((item) =>
    item.name.toLowerCase(),
  );
  equipmentNameCache.set(equipment, names);
  return names;
}

/**
 * "내가 기록한 적 있는 종목 먼저" 정렬을 **SQL에** 넣는다.
 *
 * JS에서만 정렬하면 이미 잘린 200건 안에서만 순서가 바뀐다 — 사전이 755종이라
 * 이름순 앞 200건 밖에 있는 내 종목(예: `Zercher Squat`)은 영원히 못 올라온다.
 * 정렬 키가 SQL에 있어야 훑는 창 자체가 내 종목을 먼저 담는다.
 */
function usedFirstOrder(usedNames: Set<string>) {
  if (usedNames.size === 0) return undefined;
  return sql`case when lower(${exercise.name}) in ${[...usedNames]} then 0 else 1 end`;
}

/** 이 사용자가 기록한 적 있는 종목 이름(소문자). 검색 결과를 앞으로 올리는 데 쓴다. */
async function loadLoggedExerciseNames(userId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ name: workoutSet.exerciseName })
    .from(workoutSet)
    .innerJoin(workoutLog, eq(workoutLog.id, workoutSet.logId))
    .where(eq(workoutLog.userId, userId));
  return new Set(rows.map((row) => String(row.name ?? "").trim().toLowerCase()).filter(Boolean));
}

export const exercisesRoutes = new Hono<AppEnv>();

exercisesRoutes.use("*", requireAuth);

// GET /api/exercises — search the dictionary (empty query = all, up to 200),
// each item with its aliases.
exercisesRoutes.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const query = (c.req.query("query") ?? "").trim();
    const limitRaw = Number(c.req.query("limit") ?? "20");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
      : 20;
    const categoryFilter = (c.req.query("category") ?? "").trim();
    const equipmentFilter = normalizeEquipmentFilter(c.req.query("equipment"));

    // 사전이 755종이 되면서 "squat" 한 번에 57건이 나온다. 정렬을 위해 상한까지 훑고
    // 마지막에 limit으로 자른다 — SQL에서 먼저 자르면 내가 기록한 적 있는 종목이
    // 첫 페이지 밖으로 밀려나 검색이 오히려 느려진다.
    const scanLimit = Math.max(limit, SEARCH_SCAN_LIMIT);

    // 정렬 키를 SQL에 넣어야 하므로 조회보다 **먼저** 읽는다.
    const usedNames = await loadLoggedExerciseNames(userId);
    const usedFirst = usedFirstOrder(usedNames);
    const orderBy = usedFirst ? [usedFirst, exercise.name] : [exercise.name];

    // 장비는 DB 컬럼이 아니라 코드 카탈로그에 있다 — 해당 장비의 이름 집합으로 좁힌다.
    const equipmentNames = equipmentFilter ? namesForEquipment(equipmentFilter) : null;
    const constraints = [
      categoryFilter ? sql`lower(${exercise.category}) = lower(${categoryFilter})` : undefined,
      equipmentNames
        ? equipmentNames.length > 0
          ? sql`lower(${exercise.name}) in ${equipmentNames}`
          : sql`false`
        : undefined,
    ].filter(Boolean);
    const narrow = (condition: ReturnType<typeof sql>) =>
      constraints.length > 0 ? and(condition, ...constraints)! : condition;

    let baseRows: Array<{ id: string; name: string; category: string | null }> = [];

    if (query) {
      const nameRows = await db
        .select({ id: exercise.id, name: exercise.name, category: exercise.category })
        .from(exercise)
        .where(
          narrow(
            sql`(lower(${exercise.name}) like lower(${`%${query}%`})
              or (${exercise.category} is not null and lower(${exercise.category}) like lower(${`%${query}%`})))`,
          ),
        )
        .orderBy(...orderBy)
        .limit(scanLimit);

      const aliasRows = await db
        .select({ id: exercise.id, name: exercise.name, category: exercise.category })
        .from(exerciseAlias)
        .innerJoin(exercise, eq(exerciseAlias.exerciseId, exercise.id))
        .where(narrow(sql`lower(${exerciseAlias.alias}) like lower(${`%${query}%`})`))
        .orderBy(...orderBy)
        .limit(scanLimit);

      const map = new Map<string, { id: string; name: string; category: string | null }>();
      for (const r of nameRows) map.set(r.id, r);
      for (const r of aliasRows) map.set(r.id, r);
      baseRows = Array.from(map.values());
    } else {
      baseRows =
        constraints.length > 0
          ? await db
              .select({ id: exercise.id, name: exercise.name, category: exercise.category })
              .from(exercise)
              .where(and(...constraints))
              .orderBy(...orderBy)
              .limit(scanLimit)
          : await db
              .select({ id: exercise.id, name: exercise.name, category: exercise.category })
              .from(exercise)
              .orderBy(...orderBy)
              .limit(scanLimit);
    }

    // 이름·별칭 두 결과를 합친 뒤라 순서가 섞여 있다 — SQL과 **같은 키로** 다시 세운다.
    baseRows.sort((a, b) => {
      const aUsed = usedNames.has(a.name.toLowerCase()) ? 0 : 1;
      const bUsed = usedNames.has(b.name.toLowerCase()) ? 0 : 1;
      return aUsed !== bUsed ? aUsed - bUsed : a.name.localeCompare(b.name);
    });
    baseRows = baseRows.slice(0, limit);

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

    // 사전 자체는 거의 안 바뀌지만 **순서는 사용자 기록에 따라 바뀐다**(사용 이력
    // 우선). 세션을 저장한 직후가 같은 종목을 다시 찾는 순간이라, 캐시가 걸려 있으면
    // 정확히 그때 낡은 순서를 본다 — stale-while-revalidate도 첫 페인트는 낡은 값이다.
    //
    // 대신 캐시를 끈다. 검색은 디바운스돼 있고 같은 검색어 반복은 클라이언트
    // in-memory 캐시가 이미 막으므로(add-exercise 컨트롤러), HTTP 캐시가 더 벌어
    // 주는 것이 거의 없다.
    c.header("Cache-Control", "private, no-store");
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
