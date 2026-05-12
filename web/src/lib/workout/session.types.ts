export type WorkoutSet = {
  weight: number;
  reps: number;
  completed: boolean;
};

export type WorkoutExercise = {
  exerciseId: string;
  sets: WorkoutSet[];
};

export type WorkoutSession = {
  sessionId: string;
  programId: string;

  currentExerciseIndex: number;
  currentSetIndex: number;

  exercises: WorkoutExercise[];

  updatedAt: number;
};
