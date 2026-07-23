import { z } from "zod";

/**
 * plan.params / program_version.defaults schema (docs/program-dsl-typing-plan.md, Phase 2d).
 *
 * A separate stored-JSON shape from the program *definition*: `plan.params` holds the
 * per-plan runtime knobs (timezone, schedule, training maxes, ref5 config, …) the engine
 * reads alongside the definition. Same "parse, don't validate" approach — lenient,
 * `.passthrough()`, every field optional; unknown input falls back to `{}` rather than
 * throwing. Field presence + types mirror the dev inventory (§2d).
 */
const num = z.number();
const str = z.string();
// Training-max / 1RM maps are keyed by lift; values are numbers (tolerate numeric strings).
const liftNumberMap = z.record(z.union([num, str]));

export const planParamsSchema = z
  .object({
    timezone: str.optional(),
    startDate: str.optional(),
    autoProgression: z.boolean().optional(),
    sessionKeyMode: str.optional(),
    sessionsPerWeek: num.optional(),
    schedule: z.array(str).optional(),
    trainingMaxKg: liftNumberMap.optional(),
    oneRepMaxKg: liftNumberMap.optional(),
    programFamily: str.optional(),
    protocolVersion: z.union([str, num]).optional(), // string ("1.1") in real data
    progressionModel: str.optional(),
    lightBlockMode: z.boolean().optional(),
    ref5: z.record(z.unknown()).optional(), // ref5 runtime config — opaque here
  })
  .passthrough();

export const programDefaultsSchema = z
  .object({
    tmPercent: num.optional(),
    ref5: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type PlanParams = z.infer<typeof planParamsSchema>;
export type ProgramDefaults = z.infer<typeof programDefaultsSchema>;

/** Parse plan.params, falling back to {} on malformed input (never throws). */
export function parsePlanParams(raw: unknown): PlanParams {
  const result = planParamsSchema.safeParse(raw);
  return result.success ? result.data : {};
}

/** Parse program_version.defaults, falling back to {} on malformed input. */
export function parseProgramDefaults(raw: unknown): ProgramDefaults {
  const result = programDefaultsSchema.safeParse(raw);
  return result.success ? result.data : {};
}
