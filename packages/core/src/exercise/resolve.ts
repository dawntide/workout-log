import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { exercise, exerciseAlias } from "@workout/core/db/schema";

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

  const lowerNames = Array.from(new Set(names.map((name) => name.toLowerCase())));
  const directRows = await dbi
    .select({ id: exercise.id, name: exercise.name })
    .from(exercise)
    .where(inArray(sql<string>`lower(${exercise.name})`, lowerNames));
  const aliasRows = await dbi
    .select({ id: exercise.id, name: exercise.name, alias: exerciseAlias.alias })
    .from(exerciseAlias)
    .innerJoin(exercise, eq(exerciseAlias.exerciseId, exercise.id))
    .where(inArray(sql<string>`lower(${exerciseAlias.alias})`, lowerNames));

  const resolved = new Map<string, ResolvedExercise>();
  for (const row of directRows) {
    resolved.set(row.name.trim().toLowerCase(), { id: row.id, name: row.name });
  }
  for (const row of aliasRows) {
    const key = row.alias.trim().toLowerCase();
    if (!resolved.has(key)) resolved.set(key, { id: row.id, name: row.name });
  }
  return resolved;
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
