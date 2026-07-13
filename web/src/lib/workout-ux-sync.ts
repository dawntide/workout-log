import {
  getUnsyncedWorkoutUxEvents,
  markWorkoutUxEventsSynced,
  type WorkoutUxEvent,
} from "@/lib/workout-ux-events";

type SyncOptions = {
  keepalive?: boolean;
  limit?: number;
};

let activeSync: Promise<void> | null = null;

function acceptedEventIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const acceptedIds = (value as { acceptedIds?: unknown }).acceptedIds;
  if (!Array.isArray(acceptedIds)) return [];
  return acceptedIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

async function syncBatch(
  endpoint: string,
  events: WorkoutUxEvent[],
  keepalive: boolean,
): Promise<string[]> {
  if (events.length === 0) return [];

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      cache: "no-store",
      credentials: "same-origin",
      keepalive,
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json().catch(() => null);
    return acceptedEventIds(payload);
  } catch {
    return [];
  }
}

/** Persist locally buffered UX/Web Vital events without blocking navigation. */
export function syncWorkoutUxEvents(options: SyncOptions = {}): Promise<void> {
  if (activeSync) return activeSync;

  activeSync = (async () => {
    // Drain a bounded offline backlog. Web Vitals always use the anonymous,
    // field-whitelisted endpoint; account UX events retain authenticated scope.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const events = getUnsyncedWorkoutUxEvents(options.limit ?? 120);
      if (events.length === 0) return;

      const publicVitals = events
        .filter((event) => event.name === "web_vital")
        .slice(0, 20);
      const authenticatedEvents = events.filter(
        (event) => event.name !== "web_vital",
      );
      const acceptedIds = (
        await Promise.all([
          syncBatch(
            "/api/ux-events/public",
            publicVitals,
            options.keepalive ?? false,
          ),
          syncBatch(
            "/api/ux-events",
            authenticatedEvents,
            options.keepalive ?? false,
          ),
        ])
      ).flat();

      if (acceptedIds.length === 0) return;
      markWorkoutUxEventsSynced(acceptedIds);
    }
  })().finally(() => {
    activeSync = null;
  });

  return activeSync;
}
