"use client";

import { memo } from "react";
import { useWorkoutSession, useWorkoutActions, useCurrentExerciseIndex } from "@/store/workoutStore";

/**
 * WorkoutActions Component
 * PERF: Renders the end-session and next-exercise buttons.
 * Memoized to prevent re-renders when other session data changes.
 */
export const WorkoutActions = memo(function WorkoutActions() {
  const session = useWorkoutSession();
  const currentExerciseIndex = useCurrentExerciseIndex();
  const actions = useWorkoutActions();

  if (!session) return null;

  const hasNextExercise = currentExerciseIndex < session.exercises.length - 1;

  return (
    <div className="flex gap-4 mt-8 pb-12">
      {hasNextExercise ? (
        <button
          onClick={actions.goToNextExercise}
          className="flex-1 bg-secondary text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all"
        >
          Next Exercise
        </button>
      ) : (
        <button
          onClick={actions.endSession}
          className="flex-1 bg-success text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all"
        >
          Finish Workout
        </button>
      )}
      
      <button
        onClick={actions.endSession}
        className="px-6 bg-surface-2 text-text-tertiary py-4 rounded-2xl font-bold active:scale-95 transition-all border border-border"
      >
        Quit
      </button>
    </div>
  );
});
