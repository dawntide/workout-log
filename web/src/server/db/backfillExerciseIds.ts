import { and, eq, isNull } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { exercise, workoutSet } from "@workout/core/db/schema";
import { resolveExercisesByNames } from "@workout/core/exercise/resolve";

/**
 * Backfill workout_set.exercise_id through canonical names and aliases.
 * Unknown custom names become new canonical exercises only after alias lookup.
 * Safe to run multiple times.
 */
async function main() {
  const rows = await db
    .selectDistinct({ exerciseName: workoutSet.exerciseName })
    .from(workoutSet)
    .where(isNull(workoutSet.exerciseId));
  const names = rows.map((row) => row.exerciseName.trim()).filter(Boolean);
  const initiallyResolved = await resolveExercisesByNames(names);
  const unresolved = names.filter(
    (name) => !initiallyResolved.has(name.toLowerCase()),
  );

  if (unresolved.length > 0) {
    await db
      .insert(exercise)
      .values(unresolved.map((name) => ({ name })))
      .onConflictDoNothing({ target: exercise.name });
  }

  const resolved = await resolveExercisesByNames(names);
  let updatedNames = 0;
  for (const name of names) {
    const match = resolved.get(name.toLowerCase());
    if (!match) continue;
    await db
      .update(workoutSet)
      .set({ exerciseId: match.id })
      .where(and(isNull(workoutSet.exerciseId), eq(workoutSet.exerciseName, name)));
    updatedNames += 1;
  }

  console.log("exercise backfill complete");
  console.log({ insertedExercises: unresolved.length, updatedNames });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
