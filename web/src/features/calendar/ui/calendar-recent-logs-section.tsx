"use client";

import { memo } from "react";
import { V2Chip } from "@/components/v2/primitives";
import {
  dateOnlyInTimezone,
  formatCalendarDay,
  sessionKeyToWDLabel,
} from "@/features/calendar/lib/format";
import type {
  CalendarRecentGeneratedSession,
  CalendarWorkoutLogSummary,
} from "@/features/calendar/model/types";

type CalendarRecentLogsSectionProps = {
  locale: "ko" | "en";
  title: string;
  timezone: string;
  selectedPlanName: string | null;
  generatedById: Map<string, CalendarRecentGeneratedSession>;
  recentPastLogs: CalendarWorkoutLogSummary[];
  onSelectDate: (dateOnly: string) => void;
};

export const CalendarRecentLogsSection = memo(function CalendarRecentLogsSection({
  locale,
  title,
  timezone,
  selectedPlanName,
  generatedById,
  recentPastLogs,
  onSelectDate,
}: CalendarRecentLogsSectionProps) {
  if (recentPastLogs.length === 0) return null;

  return (
    <section style={{ marginBottom: "var(--v2-s-7)" }}>
      <h2 className="v2-h3" style={{ marginBottom: "var(--v2-s-3)" }}>
        {title}
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-2)",
        }}
      >
        {recentPastLogs.map((log) => {
          const logDate = dateOnlyInTimezone(
            new Date(log.performedAt),
            timezone,
          );
          const sessionLabel = log.generatedSessionId
            ? (sessionKeyToWDLabel(
                generatedById.get(log.generatedSessionId)?.sessionKey ?? "",
              ) ?? null)
            : null;

          return (
            <button
              key={log.id}
              type="button"
              onClick={() => onSelectDate(logDate)}
              className="v2-pressable"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--v2-s-4) var(--v2-s-5)",
                background: "var(--v2-paper)",
                border: "none",
                borderRadius: "var(--v2-r-4)",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                boxShadow: "var(--v2-elev-1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--v2-s-3)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background:
                      "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 18,
                      color: "var(--v2-c-success)",
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    check_circle
                  </span>
                </div>
                <div>
                  <div
                    className="v2-body"
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--v2-s-2)",
                    }}
                  >
                    {selectedPlanName ?? (locale === "ko" ? "기록" : "Log")}
                    {sessionLabel ? (
                      <V2Chip tone="neutral">{sessionLabel}</V2Chip>
                    ) : null}
                  </div>
                  <p
                    className="v2-eyebrow"
                    style={{ marginTop: 2, letterSpacing: "0.06em" }}
                  >
                    {formatCalendarDay(logDate, locale)}
                  </p>
                </div>
              </div>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  color: "var(--v2-ink-3)",
                  flexShrink: 0,
                }}
              >
                chevron_right
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
});
