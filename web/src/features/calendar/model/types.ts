export type CalendarPlan = {
  id: string;
  userId: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
  params: Record<string, unknown> | null;
  createdAt: string;
};

export type CalendarRecentGeneratedSession = {
  id: string;
  sessionKey: string;
  updatedAt: string;
};

export type CalendarSnapshotSet = {
  reps?: number;
  targetWeightKg?: number;
};

export type CalendarSnapshotExercise = {
  exerciseName?: string;
  role?: "MAIN" | "ASSIST" | string;
  sets?: CalendarSnapshotSet[];
};

export type CalendarGeneratedSessionDetail = CalendarRecentGeneratedSession & {
  snapshot: {
    exercises?: CalendarSnapshotExercise[];
  } | null;
};

export type CalendarWorkoutLogSummary = {
  id: string;
  performedAt: string;
  generatedSessionId: string | null;
};

export type CalendarWorkoutLogForDate = {
  id: string;
  performedAt: string;
  generatedSessionId: string | null;
  sets: Array<{
    exerciseName: string;
    reps: number | null;
    weightKg: number | null;
    meta?: Record<string, unknown> | null;
  }>;
};

export type CalendarExercisePreviewItem = {
  name: string;
  role: "MAIN" | "ASSIST" | string;
  summary: string;
};

export type CalendarClientProps = {
  initialPlans?: CalendarPlan[];
  initialSessions?: CalendarRecentGeneratedSession[];
  initialLogs?: CalendarWorkoutLogSummary[];
  initialTimezone?: string;
  initialToday?: string;
};
