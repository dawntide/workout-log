type WorkoutUxPrimitive = string | number | boolean | null;

type WorkoutUxEvent = {
  id: string;
  name: string;
  recordedAt: string;
  props?: Record<string, WorkoutUxPrimitive>;
};

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

export type { WorkoutUxEvent };
