"use client";

import { useEffect } from "react";

import { syncWorkoutUxEvents } from "@/lib/workout-ux-sync";

const SYNC_DELAY_MS = 750;

/** Batch local UX and Web Vital events into the authenticated server stream. */
export function WorkoutUxEventSync() {
  useEffect(() => {
    let timer: number | null = null;

    const scheduleSync = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void syncWorkoutUxEvents();
      }, SYNC_DELAY_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        void syncWorkoutUxEvents({ keepalive: true });
        return;
      }
      scheduleSync();
    };

    scheduleSync();
    window.addEventListener("online", scheduleSync);
    window.addEventListener("workoutlog:ux-event", scheduleSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("online", scheduleSync);
      window.removeEventListener("workoutlog:ux-event", scheduleSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
