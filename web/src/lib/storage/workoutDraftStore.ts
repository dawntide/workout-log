"use client";

import { openDB, DBSchema } from "idb";
import type { WorkoutRecordDraft } from "@/lib/workout-record/model";
import type { WorkoutProgramExerciseEntryStateMap } from "@/lib/workout-record/entry-state";

const DB_NAME = "workout-draft-db";
const STORE_NAME = "workout-drafts";
const DB_VERSION = 1;

export type WorkoutDraftData = {
  key: string; // planId + date
  draft: WorkoutRecordDraft;
  programEntryState: WorkoutProgramExerciseEntryStateMap;
  updatedAt: number;
};

interface WorkoutDraftDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: WorkoutDraftData;
  };
}

const isIndexedDBSupported = () => typeof window !== "undefined" && "indexedDB" in window;

const dbPromise = isIndexedDBSupported()
  ? openDB<WorkoutDraftDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      },
    })
  : null;

const getLocalStorageKey = (key: string) => `workout-draft-${key}`;
const clearedKeys = new Set<string>();
const writeVersions = new Map<string, number>();

/**
 * Helper to get DB with timeout
 */
async function getDBWithTimeout(timeoutMs = 150): Promise<Awaited<NonNullable<typeof dbPromise>> | null> {
  if (!dbPromise) return null;
  
  return Promise.race([
    dbPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("IndexedDB timeout")), timeoutMs),
    ),
  ]).catch(() => null);
}

/**
 * Synchronously saves a workout record draft to localStorage.
 * Critical for pagehide/visibilitychange events on iOS Safari.
 */
export function saveWorkoutDraftSync(
  key: string,
  draft: WorkoutRecordDraft,
  programEntryState: WorkoutProgramExerciseEntryStateMap
): void {
  clearedKeys.delete(key);
  writeVersions.set(key, (writeVersions.get(key) ?? 0) + 1);
  const data: WorkoutDraftData = {
    key,
    draft,
    programEntryState,
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(getLocalStorageKey(key), JSON.stringify(data));
  } catch (error) {
    console.warn("[Storage] localStorage sync save failed", error);
  }
}

/**
 * Saves a workout record draft.
 * Dual-writes to both IndexedDB and localStorage for Safari compatibility.
 */
export async function saveWorkoutDraft(
  key: string,
  draft: WorkoutRecordDraft,
  programEntryState: WorkoutProgramExerciseEntryStateMap
): Promise<void> {
  // Always do sync write first
  saveWorkoutDraftSync(key, draft, programEntryState);
  const version = writeVersions.get(key);
  const updatedAt = Date.now();

  // Then try IndexedDB asynchronously
  const db = await getDBWithTimeout(200);
  if (db && version === writeVersions.get(key)) {
    try {
      const data: WorkoutDraftData = {
        key,
        draft,
        programEntryState,
        updatedAt,
      };
      await db.put(STORE_NAME, data);
    } catch (error) {
      console.error("[Storage] IndexedDB draft save failed", error);
    }
  }
}

/**
 * Loads a workout record draft.
 * Priorities: 
 * 1. Read from localStorage immediately (Fast path).
 * 2. If not found, try IndexedDB with timeout.
 */
export async function loadWorkoutDraft(key: string): Promise<WorkoutDraftData | null> {
  if (clearedKeys.has(key)) return null;
  // 1. Fast path: localStorage
  try {
    const dataJSON = localStorage.getItem(getLocalStorageKey(key));
    if (dataJSON) {
      console.log("[Storage] Draft found in localStorage");
      return JSON.parse(dataJSON) as WorkoutDraftData;
    }
  } catch (error) {
    console.warn("[Storage] localStorage draft load failed", error);
  }

  // 2. Slow path: IndexedDB (only if local is empty)
  const db = await getDBWithTimeout(300);
  if (db) {
    try {
      const idbData = await db.get(STORE_NAME, key);
      if (idbData && !clearedKeys.has(key)) {
        console.log("[Storage] Draft found in IndexedDB");
        return idbData;
      }
    } catch (error) {
      console.warn("[Storage] IndexedDB draft load failed", error);
    }
  }

  return null;
}

/**
 * Clears a workout record draft.
 */
export async function clearWorkoutDraft(key: string): Promise<void> {
  clearedKeys.add(key);
  writeVersions.set(key, (writeVersions.get(key) ?? 0) + 1);
  // Remove the synchronous fallback before awaiting IndexedDB or navigating.
  try {
    localStorage.removeItem(getLocalStorageKey(key));
  } catch (error) {
    console.error("localStorage draft delete failed.", error);
  }
  const db = await getDBWithTimeout(200);
  if (db) {
    try {
      await db.delete(STORE_NAME, key);
    } catch (error) {
      console.error("IndexedDB draft delete failed.", error);
    }
  }
}

/** Discover recoverable work even when today's start link uses a different date. */
export async function listWorkoutDrafts(): Promise<WorkoutDraftData[]> {
  const drafts = new Map<string, WorkoutDraftData>();
  const add = (data: WorkoutDraftData) => {
    if (data?.key && data.draft?.session && !clearedKeys.has(data.key)) drafts.set(data.key, data);
  };
  const db = await getDBWithTimeout(200);
  if (db) {
    try { (await db.getAll(STORE_NAME)).forEach(add); } catch { /* Use local fallback. */ }
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("workout-draft-")) continue;
      try { add(JSON.parse(localStorage.getItem(key) ?? "null")); } catch { /* Ignore a corrupt entry. */ }
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  return [...drafts.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
