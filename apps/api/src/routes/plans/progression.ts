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
  readIncrementOverride,
  resolveAutoProgressionProgram,
  rulesFor,
  targetsFor,
} from "@workout/core/progression/reducer";
import {
  readLastTargetEvents,
  type LastTargetEvent,
} from "@workout/core/progression/last-events";
import { applyManualRuntimeAdjustment } from "@workout/core/progression/autoProgression";
import { buildProgressionFeedbackFromEvent } from "@workout/core/progression/feedback-catalog";
import { readJudgmentHistory } from "@workout/core/progression/event-history";
import { invalidateStatsCacheForUser } from "@workout/core/stats/cache";
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
import { type AppEnv } from "../../auth";
import { apiError, normalizeTimezone, resolveLocale } from "../../lib/http";

/**
 * 자동 진행 상태 조회 + 런타임 타깃(TM) 수동 조정.
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */
export function registerProgressionRoutes(plansRoutes: Hono<AppEnv>) {
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

      // version→template→runtime 은 서로 독립(모두 plan 에서 파생) — 직렬 3홉을 1홉으로.
      const [versionRows, runtimeRows] = await Promise.all([
        db
          .select({
            id: programVersion.id,
            templateId: programVersion.templateId,
            definition: programVersion.definition,
            templateSlug: programTemplate.slug,
          })
          .from(programVersion)
          .innerJoin(programTemplate, eq(programTemplate.id, programVersion.templateId))
          .where(eq(programVersion.id, plan.rootProgramVersionId))
          .limit(1),
        db
          .select({ state: planRuntimeState.state })
          .from(planRuntimeState)
          .where(eq(planRuntimeState.planId, planId))
          .limit(1),
      ]);
      const version = versionRows[0];
      if (!version) return c.json({ program: null, state: null });
      const template = { id: version.templateId, slug: version.templateSlug };

      if (isRef5PlanParams(params) || template.slug === "ref5-adaptive-strength") {
        const state = runtimeRows[0]?.state ?? null;
        const startConfig = readRef5PlanStartConfig(params);
        // REF5 창 판정 카드 — 완료 리듀서가 meta.changes에 기록한 판정을 서버 조립으로
        // 내려준다. 최신 이벤트가 REF5_START(다음 세션 시작)면 카드가 자연 소멸하는
        // 것까지 일반 분기의 lastEvent 의미와 동일.
        const lastEventRows = await db
          .select({
            id: planProgressEvent.id,
            eventType: planProgressEvent.eventType,
            reason: planProgressEvent.reason,
            meta: planProgressEvent.meta,
            createdAt: planProgressEvent.createdAt,
          })
          .from(planProgressEvent)
          .where(eq(planProgressEvent.planId, planId))
          .orderBy(desc(planProgressEvent.createdAt))
          .limit(1);
        const lastEventRow = lastEventRows[0] ?? null;
        // 누적 판정 이력 — 카드는 다음 세션에서 소멸하므로 지나간 판정을 되짚을
        // 자리가 필요하다. 문구는 카드와 같은 조립기를 경유한다(복제 금지).
        const judgmentHistory = await readJudgmentHistory({ planId, locale });
        return c.json({
          program: "ref5",
          judgmentHistory,
          state,
          ref5Status: buildRef5Status(state, startConfig),
          effectiveRules: null,
          targetsLastEvent: {},
          lastEvent: null,
          feedback: buildProgressionFeedbackFromEvent(
            {
              eventRow: lastEventRow
                ? { ...lastEventRow, programSlug: REF5_IDENTIFIERS.slug }
                : null,
            },
            locale === "ko" ? "ko" : "en",
          ),
        });
      }

      const program = resolveAutoProgressionProgram(template.slug, version.definition);
      if (!program) return c.json({ program: null, state: null });

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

      // v0.5.1: 최신 진행 이벤트 1건 — F1 조기 디로드 배너(reason)·F2 블록 판정 카드
      // (meta.targetDecisions)의 데이터원. additive 필드라 기존 소비자 무영향.
      // readLastTargetEvents 와는 독립이라 병렬 조회.
      const [lastByTarget, lastEventRows] = await Promise.all([
        readLastTargetEvents(planId),
        db
          .select({
            id: planProgressEvent.id,
            eventType: planProgressEvent.eventType,
            reason: planProgressEvent.reason,
            meta: planProgressEvent.meta,
            createdAt: planProgressEvent.createdAt,
          })
          .from(planProgressEvent)
          .where(eq(planProgressEvent.planId, planId))
          .orderBy(desc(planProgressEvent.createdAt))
          .limit(1),
      ]);
      const targetsLastEvent: Record<string, LastTargetEvent> = {};
      for (const key of ruleKeys) {
        const pt = String(effectiveRules[key]?.progressionTarget ?? key).toUpperCase();
        targetsLastEvent[key] = lastByTarget.get(pt) ?? { lastDeltaKg: null, lastEventType: null };
      }
      const lastEventRow = lastEventRows[0] ?? null;
      const lastEvent = lastEventRow
        ? {
            id: lastEventRow.id,
            eventType: lastEventRow.eventType,
            reason: lastEventRow.reason ?? null,
            createdAt: lastEventRow.createdAt.toISOString(),
            targetDecisions: Array.isArray(
              (lastEventRow.meta as Record<string, unknown> | null)?.targetDecisions,
            )
              ? ((lastEventRow.meta as Record<string, unknown>).targetDecisions as unknown[])
              : [],
          }
        : null;

      // 서버 조립 피드백(판정 카드·조기 디로드 배너) — 로케일 문구까지 여기서 만든다.
      // web·TUI가 같은 문구를 그대로 출력(클라이언트 카탈로그 복제 금지).
      // programSlug 대신 이미 해석된 program을 쓰고, state로 F1 노출(week4 진행 중)을 판정한다.
      const feedback = buildProgressionFeedbackFromEvent(
        {
          eventRow: lastEventRow ? { ...lastEventRow, programSlug: template.slug } : null,
          state: (state ?? null) as { week?: unknown } | null,
          definition: version.definition,
        },
        locale === "ko" ? "ko" : "en",
      );

      const judgmentHistory = await readJudgmentHistory({
        planId,
        locale,
        definition: version.definition,
      });
      return c.json({
        program,
        state,
        effectiveRules,
        targetsLastEvent,
        lastEvent,
        feedback,
        judgmentHistory,
      });
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
}
