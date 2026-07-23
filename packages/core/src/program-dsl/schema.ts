import { z } from "zod";

/**
 * Program-definition DSL schema (docs/program-dsl-typing-plan.md, Phase 1).
 *
 * The single source of truth for the shape of `program_version.definition` (jsonb):
 * the zod schema IS the type (`z.infer`) AND the runtime parser, so they can't drift.
 *
 * Design: "parse, don't validate over free-form JSON." Objects use `.passthrough()`
 * so unknown/future keys survive instead of being rejected (the engine reads defensively
 * and must keep tolerating forms we haven't enumerated). Field presence mirrors the
 * dev+prod DB inventory (§2), including fork-only fields (`operatorStyle`, `setNumber`)
 * and the engine's read synonyms (`weightKg` for `targetWeightKg`, `name` for `exerciseName`).
 *
 * Shapes are lenient (most fields optional) on purpose — this pins the *known* fields
 * without asserting a strictness the real data doesn't have. Unknown `kind`s parse to a
 * fallback (see parseProgramDefinition), matching the engine's "Unsupported kind" path.
 */

const num = z.number();
const str = z.string();

export const manualSetSchema = z
  .object({
    reps: num.optional(),
    targetWeightKg: num.optional(),
    weightKg: num.optional(), // engine synonym: targetWeightKg ?? weightKg
    percent: num.optional(),
    rpe: num.optional(),
    note: str.optional(),
    amrap: z.boolean().optional(),
    setNumber: num.optional(), // fork-only (prod inventory)
  })
  .passthrough();

// Slotted programs (531/gzclp/texas/nsuns forks) attach a `slot` describing how the
// engine derives weight for the row. Lenient — every field optional, passthrough on.
export const manualSlotSchema = z
  .object({
    role: z.unknown().optional(), // {ko,en} label object on forks
    sessionKey: str.optional(),
    assistance: str.optional(),
    tier: z.union([str, num]).optional(),
    texasRole: str.optional(),
    driver: z.unknown().optional(), // seed uses a boolean flag; keep tolerant
    progressionKey: str.optional(),
    startWeightKg: num.optional(),
    coef: num.optional(),
    amrap: z.boolean().optional(),
  })
  .passthrough();

export const manualItemSchema = z
  .object({
    exerciseName: str.optional(),
    name: str.optional(), // engine synonym: exerciseName ?? name
    exerciseId: str.optional(),
    role: str.optional(),
    rowType: str.optional(),
    slotRole: str.optional(),
    progressionTarget: str.optional(),
    order: num.optional(),
    note: str.optional(),
    meta: z.record(z.unknown()).optional(),
    slot: manualSlotSchema.optional(),
    // Absent `sets` = the item itself is a single set (engine: item.sets ?? [item]).
    sets: z.array(manualSetSchema).optional(),
  })
  .passthrough();

export const manualSessionSchema = z
  .object({
    // Real definitions always carry `key`; keep it optional so callers/tests that
    // build a session from items alone still satisfy the type (the engine reads items).
    key: str.optional(),
    items: z.array(manualItemSchema).default([]),
  })
  .passthrough();

export const manualDefinitionSchema = z
  .object({
    kind: z.literal("manual"),
    sessions: z.array(manualSessionSchema).default([]),
    programFamily: str.optional(),
    operatorStyle: z.boolean().optional(), // fork-only (prod inventory)
  })
  .passthrough();

// ── LOGIC kinds — rules the engine turns into sets. Shared skeleton + per-kind extras. ──
const scheduleSchema = z
  .object({ weeks: num.optional(), sessionsPerWeek: num.optional() })
  .passthrough();
const logicBase = {
  dslVersion: num.optional(),
  modules: z.array(str).optional(),
  progression: z.record(z.unknown()).optional(),
  schedule: scheduleSchema.optional(),
};

export const operatorDefinitionSchema = z
  .object({ kind: z.literal("operator"), variant: str.optional(), ...logicBase })
  .passthrough();

export const wendler531DefinitionSchema = z
  .object({ kind: z.literal("531"), assistance: z.unknown().optional(), ...logicBase })
  .passthrough();

export const asymptoteDefinitionSchema = z
  .object({ kind: z.literal("asymptote"), ...logicBase })
  .passthrough();

export const ref5DefinitionSchema = z
  .object({
    kind: z.literal("ref5"),
    family: str.optional(),
    id: str.optional(),
    // Real data is a string ("1.1"); accept number too for safety.
    protocolVersion: z.union([str, num]).optional(),
    ...logicBase,
  })
  .passthrough();

export const programDefinitionSchema = z.discriminatedUnion("kind", [
  manualDefinitionSchema,
  operatorDefinitionSchema,
  wendler531DefinitionSchema,
  asymptoteDefinitionSchema,
  ref5DefinitionSchema,
]);

export type ManualSet = z.infer<typeof manualSetSchema>;
export type ManualItem = z.infer<typeof manualItemSchema>;
export type ManualSession = z.infer<typeof manualSessionSchema>;
export type ManualDefinition = z.infer<typeof manualDefinitionSchema>;
export type OperatorDefinition = z.infer<typeof operatorDefinitionSchema>;
export type Wendler531Definition = z.infer<typeof wendler531DefinitionSchema>;
export type AsymptoteDefinition = z.infer<typeof asymptoteDefinitionSchema>;
export type Ref5Definition = z.infer<typeof ref5DefinitionSchema>;
export type ProgramDefinition = z.infer<typeof programDefinitionSchema>;
export type ProgramDefinitionKind = ProgramDefinition["kind"];

export type ParsedProgramDefinition =
  | { ok: true; kind: ProgramDefinitionKind; definition: ProgramDefinition }
  | { ok: false; kind: string | null; raw: unknown };

/**
 * Parse a stored definition. Known kinds → typed; anything else (unknown/legacy kind,
 * malformed) → `{ ok: false }` with the raw value, so callers fall back exactly like the
 * engine's current "Unsupported logic kind" branch instead of throwing.
 */
export function parseProgramDefinition(raw: unknown): ParsedProgramDefinition {
  const result = programDefinitionSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, kind: result.data.kind, definition: result.data };
  }
  const kind =
    raw && typeof raw === "object" && "kind" in raw
      ? String((raw as { kind: unknown }).kind)
      : null;
  return { ok: false, kind, raw };
}
