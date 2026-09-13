"use client";

import { useEffect, useState } from "react";
import { V2Card, V2NavRow } from "@/components/v2/primitives";
import { useLocale } from "@/components/locale-provider";
import { listWorkoutDrafts, type WorkoutDraftData } from "@/lib/storage/workoutDraftStore";
import { hasWorkoutEdits } from "@/lib/workout-record/model";
import { hasProgramEntryStateEdits } from "@/lib/workout-record/entry-state";

export function PendingWorkoutDrafts() {
  const { locale } = useLocale();
  const [drafts, setDrafts] = useState<WorkoutDraftData[]>([]);
  useEffect(() => {
    let active = true;
    void listWorkoutDrafts().then((items) => {
      if (active) setDrafts(items.filter(({ draft, programEntryState }) => {
        try {
          return hasWorkoutEdits(draft) || hasProgramEntryStateEdits(programEntryState ?? {});
        } catch {
          // A malformed local entry must not prevent the home page from opening.
          return false;
        }
      }));
    });
    return () => { active = false; };
  }, []);
  if (drafts.length === 0) return null;
  return (
    <V2Card>
      <h2 className="v2-heading">{locale === "ko" ? "미저장 운동" : "Unsaved workouts"}</h2>
      {drafts.map(({ key, draft }) => {
        const session = draft.session;
        const params = new URLSearchParams({ date: session.sessionDate });
        if (session.planId) params.set("planId", session.planId);
        if (session.generatedSessionId && key.endsWith(`:${session.generatedSessionId}`)) {
          params.set("sessionId", session.generatedSessionId);
        }
        if (session.logId) params.set("logId", session.logId);
        return <V2NavRow key={key} label={session.planName || (locale === "ko" ? "자유 운동" : "Workout")}
          description={session.sessionDate} as="a" href={`/workout/log?${params}`} />;
      })}
    </V2Card>
  );
}
