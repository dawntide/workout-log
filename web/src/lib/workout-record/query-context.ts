export type WorkoutLogQueryContext = {
  planId: string | null;
  date: string;
  hasExplicitDate: boolean;
  logId: string | null;
  openAdd: boolean;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function readWorkoutLogQueryContext(): WorkoutLogQueryContext {
  if (typeof window === "undefined") {
    return {
      planId: null,
      date: toDateKey(new Date()),
      hasExplicitDate: false,
      logId: null,
      openAdd: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const planId = params.get("planId");
  const date = params.get("date");
  const logId = params.get("logId");

  return {
    planId: planId && planId.trim() ? planId : null,
    date: date && DATE_ONLY_PATTERN.test(date) ? date : toDateKey(new Date()),
    hasExplicitDate: Boolean(date && DATE_ONLY_PATTERN.test(date)),
    logId: logId && logId.trim() ? logId : null,
    openAdd: params.get("openAdd") === "1",
  };
}

export function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

export function daysBetweenDateKeys(dateKey: string, startDateKey: string) {
  const dateMs = new Date(`${dateKey}T00:00:00Z`).getTime();
  const startMs = new Date(`${startDateKey}T00:00:00Z`).getTime();
  return Math.floor((dateMs - startMs) / 86_400_000);
}

export function normalizeSchedule(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}
