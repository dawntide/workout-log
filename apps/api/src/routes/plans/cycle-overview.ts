import { Hono } from "hono";

import { db } from "@workout/core/db/client";
import { and, count, desc, eq, inArray, isNotNull, max, or } from "@workout/core/db/ops";
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
} from "@workout/core/db/schema";
import {
  generateAndSaveSession,
  generateSessionSnapshot,
  previewSessionExercises,
} from "@workout/core/program-engine/generateSession";
import { buildSessionKey } from "@workout/core/session-key";
import {
  extractRef5DomainSnapshot,
  findRef5ResumableSession,
  isRef5PlanParams,
  readRef5PlanProtocolVersion,
} from "@workout/core/program-engine/ref5-integration";
import { buildRef5Status } from "@workout/core/program-engine/ref5-status";
import {
  REF5_IDENTIFIERS,
  REF5_PROTOCOL_VERSION,
  Ref5StaleVersionError,
  Ref5ValidationError,
  readRef5PlanStartConfig,
} from "@workout/core/program-engine/ref5";
import { EXERCISE_NAMES } from "@workout/core/exercise/catalog";
import { apiError, normalizeTimezone, resolveLocale } from "../../lib/http";
import { type AppEnv } from "../../auth";

/**
 * 사이클 개요 그리드 — 주차 × 세션 격자와 진행 타깃 칩.
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */
export function registerCycleOverviewRoute(plansRoutes: Hono<AppEnv>) {
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
    SQUAT: { ko: "하이바 백 스쿼트", en: EXERCISE_NAMES.highBarBackSquat },
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

      if (isRef5PlanParams(params)) {
        const runtimeRows = await db
          .select({ state: planRuntimeState.state })
          .from(planRuntimeState)
          .where(eq(planRuntimeState.planId, planId))
          .limit(1);
        return c.json({
          program: "ref5",
          finiteCycle: false,
          totalWeeks: null,
          sessionsPerWeek: null,
          cycleNumber: null,
          currentWeek: null,
          currentDay: null,
          sessions: [],
          targets: [],
          ref5Status: buildRef5Status(
            runtimeRows[0]?.state ?? null,
            readRef5PlanStartConfig(params),
          ),
        });
      }

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

}
