"use client";

import { useWorkoutSession, useIsRestoring, useWorkoutActions, useCurrentExerciseIndex } from "@/store/workoutStore";
import { useWorkoutPersistence } from "@/lib/workout/useWorkoutPersistence";
import { ExerciseItem } from "@/components/workout/exercise-item";
import { WorkoutActions } from "@/components/workout/workout-actions";
import { useEffect, memo } from "react";
import type { WorkoutSession } from "@/lib/workout/session.types";

// Dummy data for a new session
const createNewSession = (sessionId: string): WorkoutSession => ({
  sessionId,
  programId: "program-1",
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  exercises: [
    {
      exerciseId: "squat",
      sets: [
        { weight: 60, reps: 10, completed: false },
        { weight: 60, reps: 10, completed: false },
        { weight: 60, reps: 10, completed: false },
      ],
    },
    {
      exerciseId: "bench-press",
      sets: [
        { weight: 40, reps: 12, completed: false },
        { weight: 40, reps: 12, completed: false },
      ],
    },
  ],
  updatedAt: Date.now(),
});

/**
 * Toast Notification Component
 * PERF: Uses Tailwind 4 for styling.
 */
const Toast = memo(function Toast({ message, show, onDismiss }: { message: string; show: boolean; onDismiss: () => void }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => onDismiss(), 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-success text-white px-6 py-3 rounded-2xl shadow-2xl z-[100] font-bold animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xl">check_circle</span>
        {message}
      </div>
    </div>
  );
});

export default function WorkoutPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const { showRestoredToast, setShowRestoredToast } = useWorkoutPersistence(sessionId);

  const session = useWorkoutSession();
  const isRestoring = useIsRestoring();
  const actions = useWorkoutActions();
  const currentExerciseIndex = useCurrentExerciseIndex();

  if (isRestoring) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-text-secondary font-medium animate-pulse">Restoring your workout...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
        <div className="w-20 h-20 bg-surface-2 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-4xl text-text-tertiary">fitness_center</span>
        </div>
        <h1 className="text-2xl font-black mb-2 text-text">Ready for your workout?</h1>
        <p className="text-text-secondary mb-8">Your progress will be automatically saved as you train.</p>
        <button
          onClick={() => actions.startSession(createNewSession(sessionId))}
          className="w-full max-w-xs bg-primary text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-primary/20 active:scale-95 transition-all"
        >
          Start New Workout
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-24">
      <Toast
        message="Your workout session has been restored."
        show={showRestoredToast}
        onDismiss={() => setShowRestoredToast(false)}
      />

      {/* Progress Indicator */}
      <div className="flex gap-1 mb-8">
        {session.exercises.map((_, idx) => (
          <div 
            key={idx}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              idx === currentExerciseIndex 
                ? "bg-primary" 
                : idx < currentExerciseIndex 
                  ? "bg-success" 
                  : "bg-surface-3"
            }`}
          />
        ))}
      </div>

      <ExerciseItem exerciseIndex={currentExerciseIndex} />

      <WorkoutActions />
    </div>
  );
}
