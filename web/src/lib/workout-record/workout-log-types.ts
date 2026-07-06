import type {
  ExistingWorkoutLogLike,
  GeneratedSessionLike,
} from "@/lib/workout-record/model";

export type WorkoutLogPlanItem = {
  id: string;
  name: string;
  params?: Record<string, unknown> | null;
  isArchived?: boolean;
};

export type WorkoutLogRecentLogItem = {
  id: string;
  performedAt: string;
  generatedSession?: {
    id: string;
    sessionKey: string;
  } | null;
  sets: Array<{
    exerciseName: string;
    reps: number | null;
    weightKg: number | null;
    meta?: unknown;
  }>;
};

export type WorkoutLogDetailedLogItem = ExistingWorkoutLogLike & {
  generatedSession: (ExistingWorkoutLogLike["generatedSession"] & { sessionKey: string; snapshot: any }) | null;
};

export type WorkoutLogExerciseOption = {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
};

export type WorkoutLogGeneratedSessionResponse = {
  session: GeneratedSessionLike;
};

export type WorkoutLogPlansResponse = {
  items: WorkoutLogPlanItem[];
};

export type WorkoutLogLogsResponse = {
  items: WorkoutLogRecentLogItem[];
};

export type WorkoutLogDetailResponse = {
  item: WorkoutLogDetailedLogItem;
};

export type WorkoutLogExerciseResponse = {
  items: WorkoutLogExerciseOption[];
};

export type AddExerciseDraft = {
  exerciseId: string | null;
  exerciseName: string;
};

export function createDefaultAddExerciseDraft(): AddExerciseDraft {
  return {
    exerciseId: null,
    exerciseName: "",
  };
}

export type WorkoutLogLastSessionExerciseSummary = {
  name: string;
  sets: number;
  bestSet: string;
};

export type WorkoutLogLastSessionSummary = {
  dateLabel: string | null;
  weekLabel: string;
  sessionLabel: string;
  bodyweightKg: number | null;
  totalSets: number;
  totalVolume: number;
  exercises: WorkoutLogLastSessionExerciseSummary[];
};
