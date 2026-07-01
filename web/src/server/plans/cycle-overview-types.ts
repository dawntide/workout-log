// cycle-overview API 응답 타입.
// 프록시 cutover로 web route(api/plans/[planId]/cycle-overview)는 apps/api로 이관됐고,
// 이 타입은 web 클라이언트(workout-log-summary-sheet)가 계속 사용하므로 여기로 분리한다.
// (apps/api는 routes/plans.ts에 동등한 타입을 자체 정의 — 이 파일에 의존하지 않음.)

export type ProgressionTarget = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

export type CycleOverviewSessionStatus = "DONE" | "TODAY" | "PLANNED";

export type CycleOverviewTarget = {
  progressionTarget: ProgressionTarget;
  label: string;
  weightKg: number | null;
  lastDeltaKg: number | null;
  lastEventType: "INCREASE" | "HOLD" | "RESET" | null;
};

export type CycleOverviewSessionSet = {
  reps: number | null;
  weightKg: number | null;
  percent: number | null;
  rpe: number | null;
  note: string | null;
};

export type CycleOverviewSessionExercise = {
  exerciseName: string;
  role: "MAIN" | "ASSIST";
  progressionTarget: ProgressionTarget | null;
  sets: CycleOverviewSessionSet[];
};

export type CycleOverviewSession = {
  week: number;
  day: number;
  sessionKey: string;
  status: CycleOverviewSessionStatus;
  sessionDate: string | null;
  logId: string | null;
  exercises: CycleOverviewSessionExercise[];
};

export type CycleOverviewResponse = {
  programName: string;
  programSlug: string | null;
  planType: "SINGLE" | "COMPOSITE" | "MANUAL";
  autoProgression: boolean;
  cycleNumber: number;
  totalWeeksInCycle: number | null;
  sessionsPerWeek: number | null;
  current: { week: number; day: number; sessionKey: string };
  targets: CycleOverviewTarget[];
  sessions: CycleOverviewSession[];
};
