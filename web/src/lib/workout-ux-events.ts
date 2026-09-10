import { WORKOUT_UX_EVENT_NAMES } from "@workout/core/observability/workout-ux-event-names";

type WorkoutUxPrimitive = string | number | boolean | null;

type WorkoutUxEvent = {
  id: string;
  name: string;
  recordedAt: string;
  props?: Record<string, WorkoutUxPrimitive>;
};

type WorkoutUxSummary = {
  opens: number;
  generateClicks: number;
  generateSuccesses: number;
  addSheetOpens: number;
  addExerciseAdds: number;
  saveClicks: number;
  saveSuccesses: number;
  saveFailures: number;
};

type WorkoutUxGuidedHint = {
  id: "generate_first" | "add_exercise" | "save_log" | "stability";
  title: string;
  description: string;
  action: "generate_apply" | "add_exercise" | "save_log";
  actionLabel: string;
};

type WorkoutUxLocale = "ko" | "en";

const STORAGE_KEY = "workoutlog:ux-events";
const STORAGE_LIMIT = 300;
const SYNCED_IDS_STORAGE_KEY = "workoutlog:ux-events-synced-ids";
const SYNCED_IDS_LIMIT = 600;

function createClientEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeReadEvents(): WorkoutUxEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const events = parsed
      .filter(
        (event): event is WorkoutUxEvent =>
          Boolean(event) && typeof event === "object" && typeof (event as WorkoutUxEvent).name === "string",
      )
      .map((event, idx) => ({
        id:
          typeof event.id === "string" && event.id.trim()
            ? event.id
            : `legacy_${event.recordedAt ?? "unknown"}_${event.name}_${idx}`,
        name: event.name,
        recordedAt: event.recordedAt,
        props: event.props,
      }));
    return events;
  } catch {
    return [];
  }
}

function safeReadSyncedIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SYNCED_IDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    return [];
  }
}

function safeWriteSyncedIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNCED_IDS_STORAGE_KEY, JSON.stringify(ids.slice(-SYNCED_IDS_LIMIT)));
  } catch {
    // noop
  }
}

export function trackWorkoutUxEvent(name: string, props?: Record<string, WorkoutUxPrimitive>) {
  if (typeof window === "undefined") return;
  const event: WorkoutUxEvent = {
    id: createClientEventId(),
    name,
    recordedAt: new Date().toISOString(),
    props,
  };

  try {
    const events = safeReadEvents();
    const nextEvents = [...events, event].slice(-STORAGE_LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEvents));
  } catch {
    // noop
  }

  try {
    window.dispatchEvent(new CustomEvent("workoutlog:ux-event", { detail: event }));
  } catch {
    // noop
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[workout-ux-event]", event.name, event.props ?? {});
  }
}

export function getStoredWorkoutUxEvents() {
  return safeReadEvents();
}

export function getUnsyncedWorkoutUxEvents(limit = 120) {
  const events = safeReadEvents();
  const syncedIds = new Set(safeReadSyncedIds());
  const unsynced = events.filter((event) => !syncedIds.has(event.id));
  if (limit <= 0) return unsynced;
  return unsynced.slice(-limit);
}

export function markWorkoutUxEventsSynced(ids: string[]) {
  if (ids.length === 0) return;
  const merged = Array.from(new Set([...safeReadSyncedIds(), ...ids]));
  safeWriteSyncedIds(merged);
}

function countByName(events: WorkoutUxEvent[], name: string) {
  return events.filter((event) => event.name === name).length;
}

function summarizeWorkoutUxEvents(events: WorkoutUxEvent[], withinDays = 14): WorkoutUxSummary {
  const minTime = Date.now() - Math.max(1, withinDays) * 86_400_000;
  const scoped = events.filter((event) => {
    const time = new Date(event.recordedAt).getTime();
    return Number.isFinite(time) && time >= minTime;
  });

  return {
    opens: countByName(scoped, WORKOUT_UX_EVENT_NAMES.logOpened),
    generateClicks: countByName(scoped, WORKOUT_UX_EVENT_NAMES.generateApplyClicked),
    generateSuccesses: countByName(scoped, WORKOUT_UX_EVENT_NAMES.generateApplySucceeded),
    addSheetOpens: countByName(scoped, WORKOUT_UX_EVENT_NAMES.addExerciseSheetOpened),
    addExerciseAdds: countByName(scoped, WORKOUT_UX_EVENT_NAMES.addExerciseAdded),
    saveClicks: countByName(scoped, WORKOUT_UX_EVENT_NAMES.saveClicked),
    saveSuccesses: countByName(scoped, WORKOUT_UX_EVENT_NAMES.saveSucceeded),
    saveFailures: countByName(scoped, WORKOUT_UX_EVENT_NAMES.saveFailed),
  };
}

export function summarizeStoredWorkoutUxEvents(input?: { withinDays?: number }): WorkoutUxSummary {
  return summarizeWorkoutUxEvents(getStoredWorkoutUxEvents(), input?.withinDays ?? 14);
}

export function summarizeUnsyncedWorkoutUxEvents(input?: { withinDays?: number }): WorkoutUxSummary {
  return summarizeWorkoutUxEvents(getUnsyncedWorkoutUxEvents(0), input?.withinDays ?? 14);
}

export function pickWorkoutUxGuidedHint(summary: WorkoutUxSummary, locale: WorkoutUxLocale = "ko"): WorkoutUxGuidedHint | null {
  if (summary.opens === 0) return null;

  if (summary.generateClicks === 0) {
    return {
      id: "generate_first",
      title: locale === "ko" ? "1단계부터 시작하세요" : "Start with Step 1",
      description: locale === "ko" ? "먼저 ‘세션 생성/적용’을 눌러 계획 세트를 불러오면 기록이 쉬워집니다." : "Start by generating and applying the session so the planned sets are loaded first.",
      action: "generate_apply",
      actionLabel: locale === "ko" ? "세션 생성/적용" : "Generate / Apply Session",
    };
  }

  if (summary.generateSuccesses > 0 && summary.addExerciseAdds === 0 && summary.saveSuccesses === 0) {
    return {
      id: "add_exercise",
      title: locale === "ko" ? "2단계가 비어 있습니다" : "Step 2 is still empty",
      description: locale === "ko" ? "추가 운동이 필요하면 ‘+ 운동 추가’에서 바로 세트를 넣을 수 있습니다." : "If you need more work, add an exercise and sets directly from + Add Exercise.",
      action: "add_exercise",
      actionLabel: locale === "ko" ? "운동 추가 열기" : "Open Add Exercise",
    };
  }

  if (summary.saveClicks > 0 && summary.saveSuccesses === 0) {
    return {
      id: "stability",
      title: locale === "ko" ? "저장이 완료되지 않았습니다" : "The save did not complete",
      description: locale === "ko" ? "플랜 선택과 세트 입력을 확인한 뒤 다시 저장해 주세요." : "Check the selected plan and set inputs, then save again.",
      action: "save_log",
      actionLabel: locale === "ko" ? "지금 저장" : "Save Now",
    };
  }

  if (summary.generateSuccesses > 0 && summary.saveSuccesses === 0) {
    return {
      id: "save_log",
      title: locale === "ko" ? "마지막 단계만 남았습니다" : "Only the last step remains",
      description: locale === "ko" ? "세트를 확인하고 ‘운동 기록 저장’을 누르면 오늘 기록이 완료됩니다." : "Review the sets and tap Save Workout Log to finish today's workout.",
      action: "save_log",
      actionLabel: locale === "ko" ? "운동 기록 저장" : "Save Workout Log",
    };
  }

  return null;
}

export type { WorkoutUxEvent, WorkoutUxGuidedHint, WorkoutUxSummary };
