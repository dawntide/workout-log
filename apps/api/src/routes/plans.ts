import { Hono } from "hono";

import { db } from "@/server/db/client";
import { and, desc, eq, inArray, isNotNull, or } from "@/server/db/ops";
import {
  generatedSession,
  plan as planTable,
  planModule,
  planOverride,
  planProgressEvent,
  planRuntimeState,
  programTemplate,
  programVersion,
  workoutLog,
} from "@/server/db/schema";
import {
  generateAndSaveSession,
  previewSessionExercises,
} from "@/server/program-engine/generateSession";
import {
  readIncrementOverride,
  resolveAutoProgressionProgram,
  rulesFor,
  targetsFor,
} from "@/server/progression/reducer";
import {
  readLastTargetEvents,
  type LastTargetEvent,
} from "@/server/progression/last-events";
import { applyManualRuntimeAdjustment } from "@/server/progression/autoProgression";
import { invalidateStatsCacheForUser } from "@/server/stats/cache";
import { buildSessionKey } from "@/lib/session-key";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, resolveLocale } from "../lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Plans — the TUI-critical plan workflow (list/create/rename/delete/generate/
// overrides), ported verbatim from web/src/app/api/plans/**. Logic stays inline
// (or calls the Next-free program-engine for generate). requireAuth supplies the
// user id. Deferred to a later sub-group (TUI-unused): progression-state,
// runtime-targets, cycle-overview.
// ─────────────────────────────────────────────────────────────────────────────

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function withAutoProgressionDefaults(value: unknown) {
  const next = { ...toRecord(value) };
  next.autoProgression = true;
  return next;
}

const PROGRESSION_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function snapTo2p5(n: number): number {
  return Math.max(0, Math.round(n / 2.5) * 2.5);
}

type NormalizedIncrementOverrides = {
  increaseKg?: Record<string, number>;
  decreaseKg?: Record<string, number>;
};

function validateIncrementOverrides(
  value: unknown,
  locale: "ko" | "en",
):
  | { ok: true; value: NormalizedIncrementOverrides | null }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error:
        locale === "ko"
          ? "incrementOverrides는 객체여야 합니다."
          : "incrementOverrides must be an object.",
    };
  }

  const out: NormalizedIncrementOverrides = {};
  for (const side of ["increaseKg", "decreaseKg"] as const) {
    const raw = (value as Record<string, unknown>)[side];
    if (raw === undefined) continue;
    if (raw === null) continue;
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        error:
          locale === "ko"
            ? `incrementOverrides.${side}는 객체여야 합니다.`
            : `incrementOverrides.${side} must be an object.`,
      };
    }
    const normalized: Record<string, number> = {};
    for (const [rawKey, rawValue] of Object.entries(raw)) {
      const key = String(rawKey).trim().toUpperCase();
      if (!PROGRESSION_KEY_PATTERN.test(key)) continue;
      const num = Number(rawValue);
      if (!Number.isFinite(num) || num < 0) {
        return {
          ok: false,
          error:
            locale === "ko"
              ? `${key}의 ${side} 값은 0 이상의 숫자여야 합니다.`
              : `${key} ${side} must be a non-negative number.`,
        };
      }
      normalized[key] = snapTo2p5(num);
    }
    if (Object.keys(normalized).length > 0) {
      out[side] = normalized;
    }
  }

  if (!out.increaseKg && !out.decreaseKg) return { ok: true, value: null };
  return { ok: true, value: out };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export const plansRoutes = new Hono<AppEnv>();

plansRoutes.use("*", requireAuth);

// GET /api/plans — the user's plans, each with baseProgramName + lastPerformedAt.
plansRoutes.get("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const userId = c.get("userId");

    const baseItems = await db
      .select()
      .from(planTable)
      .where(eq(planTable.userId, userId))
      .orderBy(desc(planTable.createdAt));

    if (baseItems.length === 0) {
      return c.json({ items: [] });
    }

    const rootVersionIds = Array.from(
      new Set(
        baseItems
          .map((item) => item.rootProgramVersionId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const planIds = baseItems.map((item) => item.id);
    const [versionRows, logRows] = await Promise.all([
      rootVersionIds.length > 0
        ? db
            .select({ versionId: programVersion.id, templateName: programTemplate.name })
            .from(programVersion)
            .leftJoin(programTemplate, eq(programTemplate.id, programVersion.templateId))
            .where(inArray(programVersion.id, rootVersionIds))
        : Promise.resolve([] as Array<{ versionId: string; templateName: string | null }>),
      db
        .select({ planId: workoutLog.planId, performedAt: workoutLog.performedAt })
        .from(workoutLog)
        .where(
          and(
            eq(workoutLog.userId, userId),
            isNotNull(workoutLog.planId),
            inArray(workoutLog.planId, planIds),
          ),
        )
        .orderBy(desc(workoutLog.performedAt)),
    ]);

    const versionNameById = new Map<string, string>();
    for (const row of versionRows) {
      if (!row.versionId) continue;
      const label = String(row.templateName ?? "").trim();
      if (!label) continue;
      versionNameById.set(row.versionId, label);
    }
    const lastPerformedAtByPlanId = new Map<string, Date>();
    for (const row of logRows) {
      const planId = row.planId;
      if (!planId) continue;
      if (lastPerformedAtByPlanId.has(planId)) continue;
      lastPerformedAtByPlanId.set(planId, row.performedAt);
    }

    const items = baseItems.map((item) => {
      const baseProgramName =
        (item.rootProgramVersionId && versionNameById.get(item.rootProgramVersionId)) ??
        (item.type === "COMPOSITE"
          ? locale === "ko"
            ? "복합 플랜"
            : "Composite Plan"
          : locale === "ko"
            ? "프로그램 정보 없음"
            : "No Program Info");
      return {
        ...item,
        baseProgramName,
        lastPerformedAt: lastPerformedAtByPlanId.get(item.id) ?? null,
      };
    });

    c.header("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return c.json({ items });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/plans — create a SINGLE / MANUAL / COMPOSITE plan.
plansRoutes.post("/", async (c) => {
  const locale = resolveLocale(c);
  try {
    const body = await c.req.json();
    const userId = c.get("userId");
    const name = body.name;
    const type = body.type;

    if (!name || !type) {
      return c.json(
        { error: locale === "ko" ? "name과 type이 필요합니다." : "name and type are required." },
        400,
      );
    }

    if (type === "COMPOSITE") {
      const modules = Array.isArray(body.modules) ? body.modules : [];
      if (modules.length === 0) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "COMPOSITE 플랜에는 modules가 필요합니다."
                : "modules are required for COMPOSITE.",
          },
          400,
        );
      }

      const created = await db.transaction(async (tx) => {
        const [p] = await tx
          .insert(planTable)
          .values({ userId, name, type, params: withAutoProgressionDefaults(body.params) })
          .returning();

        await tx.insert(planModule).values(
          modules.map((m: any) => ({
            planId: p.id,
            target: m.target,
            programVersionId: m.programVersionId,
            priority: m.priority ?? 0,
            params: m.params ?? {},
          })),
        );

        return p;
      });

      return c.json({ plan: created }, 201);
    }

    // SINGLE or MANUAL
    const rootProgramVersionId = body.rootProgramVersionId;
    if (!rootProgramVersionId) {
      return c.json(
        {
          error:
            locale === "ko" ? "rootProgramVersionId가 필요합니다." : "rootProgramVersionId is required.",
        },
        400,
      );
    }

    const [p] = await db
      .insert(planTable)
      .values({
        userId,
        name,
        type,
        rootProgramVersionId,
        params: withAutoProgressionDefaults(body.params),
      })
      .returning();

    return c.json({ plan: p }, 201);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// PATCH /api/plans/:planId — rename / patch params (incl. autoProgression,
// incrementOverrides validation).
plansRoutes.patch("/:planId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const planId = c.req.param("planId");
    const userId = c.get("userId");
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: unknown;
      params?: unknown;
      autoProgression?: unknown;
    };

    const rows = await db.select().from(planTable).where(eq(planTable.id, planId)).limit(1);
    const found = rows[0];
    if (!found)
      return c.json(
        { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
        404,
      );
    if (found.userId !== userId)
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

    const hasNamePatch = typeof body.name === "string";
    const nextName = hasNamePatch ? String(body.name).trim() : "";
    if (hasNamePatch && !nextName) {
      return c.json(
        {
          error:
            locale === "ko" ? "플랜 이름은 비워둘 수 없습니다." : "Plan name must not be empty.",
        },
        400,
      );
    }
    const hasParamsPatch =
      (body.params !== undefined &&
        body.params !== null &&
        typeof body.params === "object" &&
        !Array.isArray(body.params)) ||
      typeof body.autoProgression === "boolean";
    if (!hasNamePatch && !hasParamsPatch) {
      return c.json(
        { error: locale === "ko" ? "수정할 내용이 없습니다." : "No patch payload." },
        400,
      );
    }

    const currentParams = asRecord(found.params);
    const paramPatch = asRecord(body.params);
    const nextParams: Record<string, unknown> = { ...currentParams, ...paramPatch };

    if (Object.prototype.hasOwnProperty.call(paramPatch, "incrementOverrides")) {
      const validation = validateIncrementOverrides(paramPatch.incrementOverrides, locale);
      if (!validation.ok) {
        return c.json({ error: validation.error }, 400);
      }
      if (validation.value === null) {
        delete nextParams.incrementOverrides;
      } else {
        nextParams.incrementOverrides = validation.value;
      }
    }

    if (typeof body.autoProgression === "boolean") {
      nextParams.autoProgression = body.autoProgression;
    }

    const [updated] = await db
      .update(planTable)
      .set({
        name: hasNamePatch ? nextName : undefined,
        params: hasParamsPatch ? nextParams : undefined,
        updatedAt: new Date(),
      })
      .where(eq(planTable.id, planId))
      .returning();

    return c.json({ plan: updated }, 200);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// DELETE /api/plans/:planId — delete a plan and its logs/generated sessions.
plansRoutes.delete("/:planId", async (c) => {
  const locale = resolveLocale(c);
  try {
    const planId = c.req.param("planId");
    const userId = c.get("userId");

    const rows = await db.select().from(planTable).where(eq(planTable.id, planId)).limit(1);
    const found = rows[0];
    if (!found)
      return c.json(
        { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
        404,
      );
    if (found.userId !== userId)
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

    const result = await db.transaction(async (tx) => {
      const sessionRows = await tx
        .select({ id: generatedSession.id })
        .from(generatedSession)
        .where(eq(generatedSession.planId, planId));
      const sessionIds = sessionRows.map((row) => row.id);

      const deletedLogs = await tx
        .delete(workoutLog)
        .where(
          sessionIds.length > 0
            ? or(eq(workoutLog.planId, planId), inArray(workoutLog.generatedSessionId, sessionIds))
            : eq(workoutLog.planId, planId),
        )
        .returning({ id: workoutLog.id });

      await tx.delete(planTable).where(eq(planTable.id, planId));
      await invalidateStatsCacheForUser(userId, tx);

      return {
        deletedLogCount: deletedLogs.length,
        deletedGeneratedSessionCount: sessionIds.length,
      };
    });

    return c.json(
      {
        deleted: true,
        planId,
        deletedLogCount: result.deletedLogCount,
        deletedGeneratedSessionCount: result.deletedGeneratedSessionCount,
      },
      200,
    );
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/plans/:planId/generate — generate (and save) a session for a plan.
plansRoutes.post("/:planId/generate", async (c) => {
  const locale = resolveLocale(c);
  try {
    const planId = c.req.param("planId");
    const body = await c.req.json().catch(() => ({}));
    const userId = c.get("userId");
    const rawWeek = body.week;
    const rawDay = body.day;
    const week =
      rawWeek === undefined || rawWeek === null || rawWeek === "" ? undefined : Number(rawWeek);
    const day =
      rawDay === undefined || rawDay === null || rawDay === "" ? undefined : Number(rawDay);
    const sessionDate =
      typeof body.sessionDate === "string" && body.sessionDate.trim()
        ? body.sessionDate.trim()
        : undefined;
    const timezone =
      typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : undefined;

    if (
      (week !== undefined && !Number.isFinite(week)) ||
      (day !== undefined && !Number.isFinite(day))
    ) {
      return c.json(
        {
          error:
            locale === "ko"
              ? "week/day 값이 주어지면 숫자여야 합니다."
              : "week/day must be numeric when provided",
        },
        400,
      );
    }

    const session = await generateAndSaveSession({
      userId,
      planId,
      week,
      day,
      sessionDate,
      timezone,
    });

    return c.json({ session }, 201);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/plans/:planId/overrides — create a plan override (ADD_ACCESSORY /
// REPLACE_EXERCISE; PLAN or SESSION scope).
plansRoutes.post("/:planId/overrides", async (c) => {
  const locale = resolveLocale(c);
  try {
    const planId = c.req.param("planId");
    const body = await c.req.json();
    const userId = c.get("userId");

    const planRow = await db.select().from(planTable).where(eq(planTable.id, planId)).limit(1);
    const p = planRow[0];
    if (!p)
      return c.json(
        { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
        404,
      );
    if (p.userId !== userId)
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

    const scope = body.scope;
    const patch = body.patch;

    if (!scope || !patch) {
      return c.json(
        { error: locale === "ko" ? "scope와 patch가 필요합니다." : "scope and patch are required." },
        400,
      );
    }

    const [created] = await db
      .insert(planOverride)
      .values({
        planId,
        scope,
        weekNumber: body.weekNumber ?? null,
        sessionKey: body.sessionKey ?? null,
        patch,
        note: body.note ?? null,
      })
      .returning();

    return c.json({ override: created }, 201);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan extras (TUI-unused; ported for a complete backend). All under
// /api/plans/:planId/* so they ride the plansRoutes requireAuth above.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/plans/:planId/progression-state — auto-progression program + runtime
// state + effective increment rules + last events per target.
plansRoutes.get("/:planId/progression-state", async (c) => {
  const locale = resolveLocale(c);
  try {
    const planId = c.req.param("planId");
    const userId = c.get("userId");

    const planRows = await db
      .select({
        id: planTable.id,
        userId: planTable.userId,
        params: planTable.params,
        rootProgramVersionId: planTable.rootProgramVersionId,
      })
      .from(planTable)
      .where(eq(planTable.id, planId))
      .limit(1);
    const plan = planRows[0];
    if (!plan)
      return c.json({ error: locale === "ko" ? "대상을 찾을 수 없습니다." : "Not found." }, 404);
    if (plan.userId !== userId)
      return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

    const params = (plan.params ?? {}) as Record<string, unknown>;
    if (params.autoProgression !== true || !plan.rootProgramVersionId) {
      return c.json({ program: null, state: null });
    }

    const versionRows = await db
      .select({
        id: programVersion.id,
        templateId: programVersion.templateId,
        definition: programVersion.definition,
      })
      .from(programVersion)
      .where(eq(programVersion.id, plan.rootProgramVersionId))
      .limit(1);
    const version = versionRows[0];
    if (!version) return c.json({ program: null, state: null });

    const templateRows = await db
      .select({ id: programTemplate.id, slug: programTemplate.slug })
      .from(programTemplate)
      .where(eq(programTemplate.id, version.templateId))
      .limit(1);
    const template = templateRows[0];
    if (!template) return c.json({ program: null, state: null });

    const program = resolveAutoProgressionProgram(template.slug, version.definition);
    if (!program) return c.json({ program: null, state: null });

    const runtimeRows = await db
      .select({ state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, planId))
      .limit(1);
    const state = runtimeRows[0]?.state ?? null;

    const programTargets = targetsFor(program);
    const stateTargetKeys =
      state && typeof state === "object" && (state as { targets?: Record<string, unknown> }).targets
        ? Object.keys((state as { targets: Record<string, unknown> }).targets)
        : [];
    const ruleKeys = Array.from(new Set<string>([...programTargets, ...stateTargetKeys]));

    type EffectiveRule = {
      progressionTarget: string;
      increaseKg: number;
      decreaseKg: number | null;
      resetFactor: number;
      defaultIncreaseKg: number;
      defaultResetFactor: number;
    };

    const effectiveRules: Record<string, EffectiveRule> = {};
    for (const key of ruleKeys) {
      let progressionTarget: string = key;
      const stateTarget =
        state && typeof state === "object"
          ? (state as { targets?: Record<string, { progressionTarget?: string }> }).targets?.[key]
          : undefined;
      if (stateTarget?.progressionTarget) {
        progressionTarget = String(stateTarget.progressionTarget).toUpperCase();
      } else if (programTargets.includes(key as never)) {
        progressionTarget = key;
      }
      const defaults = rulesFor(program, progressionTarget);
      const effective = rulesFor(
        program,
        progressionTarget,
        readIncrementOverride(params, key, progressionTarget),
      );
      effectiveRules[key] = {
        progressionTarget,
        increaseKg: effective.increaseKg,
        decreaseKg: effective.decreaseKg,
        resetFactor: effective.resetFactor,
        defaultIncreaseKg: defaults.increaseKg,
        defaultResetFactor: defaults.resetFactor,
      };
    }

    const lastByTarget = await readLastTargetEvents(planId);
    const targetsLastEvent: Record<string, LastTargetEvent> = {};
    for (const key of ruleKeys) {
      const pt = String(effectiveRules[key]?.progressionTarget ?? key).toUpperCase();
      targetsLastEvent[key] = lastByTarget.get(pt) ?? { lastDeltaKg: null, lastEventType: null };
    }

    return c.json({ program, state, effectiveRules, targetsLastEvent });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// POST /api/plans/:planId/runtime-targets — user override of the current TM
// (runtime workKg) for an auto-progression plan.
const MAX_WORK_KG = 500;

plansRoutes.post("/:planId/runtime-targets", async (c) => {
  const locale = resolveLocale(c);
  try {
    const planId = c.req.param("planId");
    const userId = c.get("userId");
    const body = (await c.req.json().catch(() => ({}))) as { adjustments?: unknown };

    const rawAdjustments =
      body.adjustments && typeof body.adjustments === "object" && !Array.isArray(body.adjustments)
        ? (body.adjustments as Record<string, unknown>)
        : null;
    if (!rawAdjustments) {
      return c.json(
        { error: locale === "ko" ? "조정할 항목이 없습니다." : "No adjustments provided." },
        400,
      );
    }

    const adjustments: Record<string, { workKg: number }> = {};
    for (const [key, value] of Object.entries(rawAdjustments)) {
      const raw = (value ?? {}) as { workKg?: unknown };
      const workKg = typeof raw.workKg === "number" ? raw.workKg : Number(raw.workKg);
      if (!key.trim() || !Number.isFinite(workKg) || workKg < 0 || workKg > MAX_WORK_KG) {
        return c.json(
          {
            error:
              locale === "ko"
                ? `유효하지 않은 무게 값입니다 (0~${MAX_WORK_KG}kg).`
                : `Invalid weight value (0–${MAX_WORK_KG}kg).`,
          },
          400,
        );
      }
      adjustments[key.trim()] = { workKg };
    }
    if (Object.keys(adjustments).length === 0) {
      return c.json(
        { error: locale === "ko" ? "조정할 항목이 없습니다." : "No adjustments provided." },
        400,
      );
    }

    const result = await db.transaction(async (tx) => {
      const applied = await applyManualRuntimeAdjustment({ tx, userId, planId, adjustments });
      if (applied.applied) {
        await invalidateStatsCacheForUser(userId, tx);
      }
      return applied;
    });

    if (!result.applied) {
      const reason = result.reason;
      if (reason === "skip:forbidden-plan") {
        return c.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);
      }
      if (reason === "skip:no-plan") {
        return c.json(
          { error: locale === "ko" ? "플랜을 찾을 수 없습니다." : "Plan not found." },
          404,
        );
      }
      if (reason === "skip:no-applied-log") {
        return c.json(
          {
            error:
              locale === "ko"
                ? "수행 기록이 없어 현재 TM을 조정할 수 없습니다. 먼저 1회 이상 수행하세요."
                : "No workout has been applied yet — perform at least one session before adjusting.",
          },
          409,
        );
      }
      return c.json(
        {
          error:
            locale === "ko"
              ? "이 플랜은 현재 TM 조정을 지원하지 않습니다."
              : "This plan does not support current-TM adjustment.",
        },
        400,
      );
    }

    const lastByTarget = await readLastTargetEvents(planId);
    const stateTargets =
      result.state && typeof result.state === "object"
        ? ((result.state as { targets?: Record<string, { progressionTarget?: string }> }).targets ??
          {})
        : {};
    const targetsLastEvent: Record<string, LastTargetEvent> = {};
    for (const [key, target] of Object.entries(stateTargets)) {
      const pt = String(target?.progressionTarget ?? key).toUpperCase();
      targetsLastEvent[key] = lastByTarget.get(pt) ?? { lastDeltaKg: null, lastEventType: null };
    }

    return c.json({ ok: true, state: result.state, targetsLastEvent }, 200);
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// GET /api/plans/:planId/cycle-overview — full cycle grid (sessions per week ×
// weeks) with planned exercises, statuses, and progression target chips.
type ProgressionTarget = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

const PROGRESSION_TARGET_SET = new Set<ProgressionTarget>([
  "SQUAT",
  "BENCH",
  "DEADLIFT",
  "OHP",
  "PULL",
]);

const TARGET_LABELS: Record<ProgressionTarget, { ko: string; en: string }> = {
  SQUAT: { ko: "스쿼트", en: "Back Squat" },
  BENCH: { ko: "벤치 프레스", en: "Bench Press" },
  DEADLIFT: { ko: "데드리프트", en: "Deadlift" },
  OHP: { ko: "오버헤드 프레스", en: "Overhead Press" },
  PULL: { ko: "풀업", en: "Pull-Up" },
};

type CycleOverviewTarget = {
  progressionTarget: ProgressionTarget;
  label: string;
  weightKg: number | null;
  lastDeltaKg: number | null;
  lastEventType: "INCREASE" | "HOLD" | "RESET" | null;
};

type CycleOverviewSessionExercise = {
  exerciseName: string;
  role: "MAIN" | "ASSIST";
  progressionTarget: ProgressionTarget | null;
  sets: Array<{
    reps: number | null;
    weightKg: number | null;
    percent: number | null;
    rpe: number | null;
    note: string | null;
  }>;
};

type CycleOverviewSession = {
  week: number;
  day: number;
  sessionKey: string;
  status: "DONE" | "TODAY" | "PLANNED";
  sessionDate: string | null;
  logId: string | null;
  exercises: CycleOverviewSessionExercise[];
};

function totalWeeksFromDefinition(definition: unknown): number | null {
  if (!definition || typeof definition !== "object") return null;
  const def = definition as Record<string, unknown>;
  const schedule = def.schedule as Record<string, unknown> | undefined;
  const weeksFromSchedule = Number(schedule?.weeks);
  if (Number.isFinite(weeksFromSchedule) && weeksFromSchedule > 0) {
    return Math.floor(weeksFromSchedule);
  }
  const kind = String(def.kind ?? "").toLowerCase();
  if (kind === "531") return 4;
  if (kind === "operator") return 6;
  if (kind === "candito-linear") return 6;
  if (kind === "asymptote") return 4;
  const family = String(def.programFamily ?? "").toLowerCase();
  if (family === "operator" || def.operatorStyle === true) return 6;
  if (family === "wendler-531") return 4;
  if (family === "asymptote") return 4;
  return null;
}

function sessionsPerWeekFromParams(params: Record<string, unknown>): number | null {
  const schedule = params.schedule;
  if (Array.isArray(schedule) && schedule.length > 0) return schedule.length;
  const explicit = Number(params.sessionsPerWeek);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  return null;
}

function clampPositiveInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function extractStartDate(params: Record<string, unknown>): string | null {
  const sd = params?.startDate;
  if (typeof sd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sd)) return sd;
  return null;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(startDate: string, days: number): string {
  const d = new Date(`${startDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function roundDelta(value: number) {
  return Math.round(value * 100) / 100;
}

function isProgressionTarget(value: string): value is ProgressionTarget {
  return PROGRESSION_TARGET_SET.has(value as ProgressionTarget);
}

function buildTargetChips(
  runtimeState: Record<string, unknown> | null,
  localeKey: "ko" | "en",
): CycleOverviewTarget[] {
  const out: CycleOverviewTarget[] = [];
  const raw = (runtimeState?.targets ?? {}) as Record<string, unknown>;
  for (const value of Object.values(raw)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const t = String(v.progressionTarget ?? "").toUpperCase();
    if (!isProgressionTarget(t)) continue;
    if (out.some((x) => x.progressionTarget === t)) continue;
    const workKg = Number(v.workKg);
    out.push({
      progressionTarget: t,
      label: TARGET_LABELS[t][localeKey],
      weightKg: Number.isFinite(workKg) && workKg > 0 ? workKg : null,
      lastDeltaKg: null,
      lastEventType: null,
    });
  }
  return out;
}

plansRoutes.get("/:planId/cycle-overview", async (c) => {
  const locale = resolveLocale(c);
  const localeKey = locale === "ko" ? "ko" : "en";
  try {
    const planId = c.req.param("planId");
    const userId = c.get("userId");

    const planRows = await db
      .select({
        id: planTable.id,
        name: planTable.name,
        userId: planTable.userId,
        type: planTable.type,
        params: planTable.params,
        rootProgramVersionId: planTable.rootProgramVersionId,
      })
      .from(planTable)
      .where(eq(planTable.id, planId))
      .limit(1);
    const plan = planRows[0];
    if (!plan)
      return c.json({ error: localeKey === "ko" ? "대상을 찾을 수 없습니다." : "Not found." }, 404);
    if (plan.userId !== userId)
      return c.json({ error: localeKey === "ko" ? "권한이 없습니다." : "Forbidden." }, 403);

    const params = (plan.params ?? {}) as Record<string, unknown>;
    const autoProgression = params.autoProgression === true;

    const [runtimeRows, versionRows, moduleRows] = await Promise.all([
      db
        .select({ state: planRuntimeState.state })
        .from(planRuntimeState)
        .where(eq(planRuntimeState.planId, planId))
        .limit(1),
      plan.rootProgramVersionId
        ? db
            .select({ version: programVersion, template: programTemplate })
            .from(programVersion)
            .innerJoin(programTemplate, eq(programVersion.templateId, programTemplate.id))
            .where(eq(programVersion.id, plan.rootProgramVersionId))
            .limit(1)
        : Promise.resolve(
            [] as Array<{
              version: typeof programVersion.$inferSelect;
              template: typeof programTemplate.$inferSelect;
            }>,
          ),
      plan.type === "COMPOSITE"
        ? db
            .select({ module: planModule, version: programVersion, template: programTemplate })
            .from(planModule)
            .innerJoin(programVersion, eq(planModule.programVersionId, programVersion.id))
            .innerJoin(programTemplate, eq(programVersion.templateId, programTemplate.id))
            .where(eq(planModule.planId, planId))
        : Promise.resolve(
            [] as Array<{
              module: typeof planModule.$inferSelect;
              version: typeof programVersion.$inferSelect;
              template: typeof programTemplate.$inferSelect;
            }>,
          ),
    ]);

    const runtimeState = (runtimeRows[0]?.state ?? null) as Record<string, unknown> | null;
    const programRow = versionRows[0] ?? null;
    const definition = programRow?.version.definition ?? null;
    const programName = programRow?.template.name ?? plan.name;
    const programSlug = programRow?.template.slug ?? null;

    const previewModules = moduleRows
      .slice()
      .sort((a, b) => (a.module.priority ?? 0) - (b.module.priority ?? 0))
      .map((row) => ({
        target: row.module.target,
        params: row.module.params,
        version: { definition: row.version.definition, defaults: row.version.defaults },
        templateSlug: row.template.slug,
      }));
    const previewRootVersion = programRow
      ? { definition: programRow.version.definition, defaults: programRow.version.defaults }
      : null;

    const totalWeeksInCycle = totalWeeksFromDefinition(definition);
    const sessionsPerWeek = sessionsPerWeekFromParams(params);

    const cycleNumber = clampPositiveInt(runtimeState?.cycle, 1);
    const currentWeek = clampPositiveInt(runtimeState?.week, 1);
    const currentDay = clampPositiveInt(runtimeState?.day, 1);
    const sessionKeyMode = String(params?.sessionKeyMode ?? "").toUpperCase();
    const startDate = extractStartDate(params);

    const currentSessionKey = buildSessionKey({
      mode: sessionKeyMode,
      sessionDate: startDate ?? todayKey(),
      cycle: cycleNumber,
      week: currentWeek,
      day: currentDay,
      autoProgression,
    });

    const targets = buildTargetChips(runtimeState, localeKey);

    if (targets.length > 0) {
      const recentEvents = await db
        .select({
          eventType: planProgressEvent.eventType,
          meta: planProgressEvent.meta,
          createdAt: planProgressEvent.createdAt,
        })
        .from(planProgressEvent)
        .where(eq(planProgressEvent.planId, planId))
        .orderBy(desc(planProgressEvent.createdAt))
        .limit(20);

      const seenTargets = new Set<ProgressionTarget>();
      for (const event of recentEvents) {
        const decisions = (event.meta as Record<string, unknown> | null)?.targetDecisions;
        if (!Array.isArray(decisions)) continue;
        for (const decision of decisions) {
          if (!decision || typeof decision !== "object") continue;
          const d = decision as Record<string, unknown>;
          const t = String(d.progressionTarget ?? "").toUpperCase();
          if (!isProgressionTarget(t)) continue;
          if (seenTargets.has(t)) continue;
          const chip = targets.find((x) => x.progressionTarget === t);
          if (!chip) continue;
          const eventType = String(d.eventType ?? "").toUpperCase();
          if (eventType !== "INCREASE" && eventType !== "HOLD" && eventType !== "RESET") continue;
          const before = d.before as Record<string, unknown> | undefined;
          const after = d.after as Record<string, unknown> | undefined;
          const beforeKg = Number(before?.workKg);
          const afterKg = Number(after?.workKg);
          if (Number.isFinite(beforeKg) && Number.isFinite(afterKg)) {
            chip.lastDeltaKg = roundDelta(afterKg - beforeKg);
          }
          chip.lastEventType = eventType;
          seenTargets.add(t);
        }
        if (seenTargets.size >= targets.length) break;
      }
    }

    const sessions: CycleOverviewSession[] = [];
    const candidateKeys: string[] = [];

    if (totalWeeksInCycle && sessionsPerWeek) {
      for (let w = 1; w <= totalWeeksInCycle; w++) {
        for (let d = 1; d <= sessionsPerWeek; d++) {
          const idxInCycle = (w - 1) * sessionsPerWeek + (d - 1);
          const sessionDate =
            cycleNumber === 1 && startDate ? addDaysISO(startDate, idxInCycle) : null;
          const sk = buildSessionKey({
            mode: sessionKeyMode,
            sessionDate: sessionDate ?? todayKey(),
            cycle: cycleNumber,
            week: w,
            day: d,
            autoProgression,
          });
          candidateKeys.push(sk);
          const isToday = w === currentWeek && d === currentDay;
          const isBefore = w < currentWeek || (w === currentWeek && d < currentDay);

          let previewExercises: CycleOverviewSessionExercise[] = [];
          try {
            const planned = previewSessionExercises({
              planType: plan.type as "SINGLE" | "COMPOSITE" | "MANUAL",
              planParams: params,
              runtimeState,
              rootVersion: previewRootVersion,
              rootTemplateSlug: programSlug,
              modules: previewModules,
              week: w,
              day: d,
            });
            previewExercises = planned.map((ex) => ({
              exerciseName: ex.exerciseName,
              role: ex.role,
              progressionTarget: ex.progressionTarget ?? null,
              sets: ex.sets.map((s) => ({
                reps: s.reps ?? null,
                weightKg: s.targetWeightKg ?? null,
                percent: s.percent ?? null,
                rpe: s.rpe ?? null,
                note: s.note ?? null,
              })),
            }));
          } catch {
            previewExercises = [];
          }

          sessions.push({
            week: w,
            day: d,
            sessionKey: sk,
            status: isToday ? "TODAY" : isBefore ? "DONE" : "PLANNED",
            sessionDate,
            logId: null,
            exercises: previewExercises,
          });
        }
      }

      if (candidateKeys.length > 0) {
        const generatedRows = await db
          .select({ id: generatedSession.id, sessionKey: generatedSession.sessionKey })
          .from(generatedSession)
          .where(
            and(
              eq(generatedSession.planId, planId),
              inArray(generatedSession.sessionKey, candidateKeys),
            ),
          );
        const sessionIdByKey = new Map(generatedRows.map((r) => [r.sessionKey, r.id]));
        const sessionIds = generatedRows.map((r) => r.id);
        const logRows =
          sessionIds.length > 0
            ? await db
                .select({ id: workoutLog.id, generatedSessionId: workoutLog.generatedSessionId })
                .from(workoutLog)
                .where(
                  and(
                    eq(workoutLog.userId, userId),
                    eq(workoutLog.planId, planId),
                    inArray(workoutLog.generatedSessionId, sessionIds),
                  ),
                )
            : [];
        const logByGenId = new Map(
          logRows
            .filter((r): r is { id: string; generatedSessionId: string } =>
              Boolean(r.generatedSessionId),
            )
            .map((r) => [r.generatedSessionId, r.id]),
        );
        for (const s of sessions) {
          const genId = sessionIdByKey.get(s.sessionKey);
          if (!genId) continue;
          const logId = logByGenId.get(genId);
          if (logId) {
            s.logId = logId;
            if (s.status !== "TODAY") s.status = "DONE";
          }
        }
      }
    }

    return c.json({
      programName,
      programSlug,
      planType: plan.type,
      autoProgression,
      cycleNumber,
      totalWeeksInCycle,
      sessionsPerWeek,
      current: { week: currentWeek, day: currentDay, sessionKey: currentSessionKey },
      targets,
      sessions,
    });
  } catch (e) {
    return apiError(c, e, locale);
  }
});
