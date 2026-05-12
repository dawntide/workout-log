import { create } from "zustand";
import { produce } from "immer";
import type { WorkoutSession, WorkoutSet } from "@/lib/workout/session.types";
import { saveSession, debounce } from "@/lib/storage/workoutSession";

// Debounce the saveSession function to avoid excessive writes
const debouncedSave = debounce(
  (session: WorkoutSession) => saveSession(session),
  300
);

interface WorkoutState {
  session: WorkoutSession | null;
  isRestoring: boolean;
  actions: {
    // Session management
    startSession: (session: WorkoutSession) => void;
    restoreSession: (session: WorkoutSession) => void;
    endSession: () => void;
    
    // Set & Exercise updates
    updateSet: (exerciseIndex: number, setIndex: number, setData: Partial<WorkoutSet>) => void;
    toggleSetCompletion: (exerciseIndex: number, setIndex: number) => void;
    goToNextExercise: () => void;

    setRestoring: (isRestoring: boolean) => void;

    // Direct state manipulation for persistence
    _getSessionForSaving: () => WorkoutSession | null;
  };
}

const useWorkoutStore = create<WorkoutState>((set, get) => {
  const setStateAndPersist = (updater: (state: WorkoutState) => void) => {
    set(produce(updater));
    const session = get().session;
    if (session) {
      debouncedSave(session);
    }
  };

  return {
    session: null,
    isRestoring: true, // Start with true, set to false after initial load attempt
    actions: {
      startSession: (session) =>
        setStateAndPersist((state) => {
          state.session = session;
          state.isRestoring = false;
        }),
      restoreSession: (session) =>
        set(produce((state) => {
          state.session = session;
          state.isRestoring = false;
        })),
      endSession: () =>
        setStateAndPersist((state) => {
          state.session = null;
        }),
      updateSet: (exerciseIndex, setIndex, setData) =>
        setStateAndPersist((state) => {
          if (state.session) {
            const set = state.session.exercises[exerciseIndex].sets[setIndex];
            Object.assign(set, setData);
          }
        }),
      toggleSetCompletion: (exerciseIndex, setIndex) =>
        setStateAndPersist((state) => {
          if (state.session) {
            const set = state.session.exercises[exerciseIndex].sets[setIndex];
            set.completed = !set.completed;
            state.session.currentSetIndex = setIndex + 1;
          }
        }),
      goToNextExercise: () =>
        setStateAndPersist((state) => {
            if (state.session) {
                state.session.currentExerciseIndex += 1;
                state.session.currentSetIndex = 0;
            }
        }),
      setRestoring: (isRestoring) =>
        set(produce((state) => {
            state.isRestoring = isRestoring;
        })),
      _getSessionForSaving: () => {
        const session = get().session;
        if (!session) return null;
        // Return a fresh copy with updated timestamp
        return { ...session, updatedAt: Date.now() };
      }
    },
  };
});

export const useWorkoutSession = () => useWorkoutStore((state) => state.session);
export const useIsRestoring = () => useWorkoutStore((state) => state.isRestoring);
export const useWorkoutActions = () => useWorkoutStore((state) => state.actions);

// Atomic Selectors for better performance
export const useCurrentExerciseIndex = () => useWorkoutStore((state) => state.session?.currentExerciseIndex ?? 0);
export const useExercise = (index: number) => useWorkoutStore((state) => state.session?.exercises[index]);
export const useSet = (exerciseIndex: number, setIndex: number) => 
  useWorkoutStore((state) => state.session?.exercises[exerciseIndex]?.sets[setIndex]);

// Exporting the store itself for use in non-React files if needed
export default useWorkoutStore;
