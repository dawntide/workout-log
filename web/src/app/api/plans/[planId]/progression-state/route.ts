import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import {
  plan as planTable,
  planRuntimeState,
  programTemplate,
  programVersion,
} from "@/server/db/schema";
import { getAuthenticatedUserId } from "@/server/auth/user";
import {
  readIncrementOverride,
  resolveAutoProgressionProgram,
  rulesFor,
  targetsFor,
} from "@/server/progression/reducer";
import { readLastTargetEvents, type LastTargetEvent } from "@/server/progression/last-events";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

type Ctx = { params: Promise<{ planId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const locale = await resolveRequestLocale();
    const { planId } = await ctx.params;
    const userId = getAuthenticatedUserId();

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
    if (!plan) return NextResponse.json({ error: locale === "ko" ? "대상을 찾을 수 없습니다." : "Not found." }, { status: 404 });
    if (plan.userId !== userId) return NextResponse.json({ error: locale === "ko" ? "권한이 없습니다." : "Forbidden." }, { status: 403 });

    const params = (plan.params ?? {}) as Record<string, unknown>;
    if (params.autoProgression !== true || !plan.rootProgramVersionId) {
      return NextResponse.json({ program: null, state: null });
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
    if (!version) return NextResponse.json({ program: null, state: null });

    const templateRows = await db
      .select({ id: programTemplate.id, slug: programTemplate.slug })
      .from(programTemplate)
      .where(eq(programTemplate.id, version.templateId))
      .limit(1);
    const template = templateRows[0];
    if (!template) return NextResponse.json({ program: null, state: null });

    const program = resolveAutoProgressionProgram(template.slug, version.definition);
    if (!program) return NextResponse.json({ program: null, state: null });

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
          ? ((state as { targets?: Record<string, { progressionTarget?: string }> }).targets?.[key])
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

    return NextResponse.json({ program, state, effectiveRules, targetsLastEvent });
  } catch (e) {
    console.error("[progression-state] error", e);
    return apiErrorResponse(e);
  }
}
