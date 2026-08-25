import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { exercise, exerciseAlias } from "@workout/core/db/schema";
import { canonicalExerciseNameForInputAll as canonicalExerciseNameForInput } from "@workout/core/exercise/all-exercises";

export type ResolvedExercise = {
  id: string;
  name: string;
};

type ExerciseResolverDb = Pick<typeof db, "select">;

export async function resolveExercisesByNames(
  rawNames: readonly string[],
  dbi: ExerciseResolverDb = db,
): Promise<Map<string, ResolvedExercise>> {
  const names = Array.from(
    new Set(rawNames.map((raw) => raw.trim()).filter((name) => name.length > 0)),
  );
  if (names.length === 0) return new Map();

  // Query both the submitted label and its catalog identity. During a code-first
  // rollout the legacy direct row may still exist, so the canonical row must win.
  const canonicalByInput = new Map(
    names.map((name) => [name.toLowerCase(), canonicalExerciseNameForInput(name)]),
  );
  const lookupNames = Array.from(
    new Set([
      ...names,
      ...Array.from(canonicalByInput.values()).filter(
        (name): name is string => typeof name === "string",
      ),
    ]),
  );
  const lowerNames = Array.from(new Set(lookupNames.map((name) => name.toLowerCase())));
  const directRows = await dbi
    .select({ id: exercise.id, name: exercise.name })
    .from(exercise)
    .where(inArray(sql<string>`lower(${exercise.name})`, lowerNames));
  const aliasRows = await dbi
    .select({ id: exercise.id, name: exercise.name, alias: exerciseAlias.alias })
    .from(exerciseAlias)
    .innerJoin(exercise, eq(exerciseAlias.exerciseId, exercise.id))
    .where(inArray(sql<string>`lower(${exerciseAlias.alias})`, lowerNames));

  const candidates = new Map<string, ResolvedExercise>();
  for (const row of directRows) {
    candidates.set(row.name.trim().toLowerCase(), { id: row.id, name: row.name });
  }
  for (const row of aliasRows) {
    const key = row.alias.trim().toLowerCase();
    if (!candidates.has(key)) candidates.set(key, { id: row.id, name: row.name });
  }

  const resolved = new Map(candidates);
  for (const name of names) {
    const key = name.toLowerCase();
    const canonicalName = canonicalByInput.get(key);
    const match =
      (canonicalName ? candidates.get(canonicalName.toLowerCase()) : null) ??
      candidates.get(key);
    if (match) resolved.set(key, match);
  }
  return resolved;
}

export function selectResolvedExerciseId(input: {
  submittedExerciseId: string | null;
  exerciseName: string;
  resolvedById: ReadonlyMap<string, string | null>;
  resolvedByName: ReadonlyMap<string, string | null>;
}): string | null {
  const bySubmittedId = input.submittedExerciseId
    ? input.resolvedById.get(input.submittedExerciseId)
    : null;
  return bySubmittedId ?? input.resolvedByName.get(input.exerciseName.toLowerCase()) ?? null;
}

export async function resolveExerciseByName(
  raw: string,
  dbi: ExerciseResolverDb = db,
): Promise<ResolvedExercise | null> {
  const name = raw.trim();
  if (!name) return null;
  const resolved = await resolveExercisesByNames([name], dbi);
  return resolved.get(name.toLowerCase()) ?? null;
}

export async function getExerciseById(
  id: string,
  dbi: ExerciseResolverDb = db,
): Promise<ResolvedExercise | null> {
  const rows = await dbi
    .select({ id: exercise.id, name: exercise.name })
    .from(exercise)
    .where(eq(exercise.id, id))
    .limit(1);
  return rows[0] ?? null;
}
