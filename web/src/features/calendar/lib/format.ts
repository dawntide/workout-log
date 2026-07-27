import { dateOnlyToUtcDate, dayOfMonth, getDayOfWeek } from "@/lib/date-utils";
import { extractSessionDate, parseSessionKey } from "@workout/core/session-key";

export const WEEKDAY_SHORT_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const WEEKDAY_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function dateOnlyInTimezone(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((part) => part.type === "year")?.value ?? "1970";
  const m = parts.find((part) => part.type === "month")?.value ?? "01";
  const d = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function formatCalendarDay(dateOnly: string, locale: "ko" | "en") {
  const day = dayOfMonth(dateOnly);
  const weekday = getDayOfWeek(dateOnly);
  return locale === "ko" ? `${day}일 ${WEEKDAY_SHORT_KO[weekday]}요일` : `${WEEKDAY_SHORT_EN[weekday]}, ${day}`;
}

export function formatCalendarDateAria(dateOnly: string, locale: "ko" | "en") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(dateOnlyToUtcDate(dateOnly));
}

export function formatVolume(kg: number) {
  if (kg >= 1000) {
    const tons = kg / 1000;
    return Number.isInteger(tons) ? `${tons}t` : `${tons.toFixed(1)}t`;
  }
  return `${kg}kg`;
}

export function sessionKeyToWDLabel(sessionKey: string): string | null {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed || parsed.week === null || parsed.day === null) return null;
  if (parsed.cycle != null) {
    return `C${parsed.cycle}W${parsed.week}D${parsed.day}`;
  }
  return `W${parsed.week}D${parsed.day}`;
}

// REF5 has no week/day coordinate (§18) — its session identity is the decision
// (session mode · squat prescription · focus) stored in the generated snapshot.
// Same composition as the start-panel chips and the TUI resume label.
export function ref5SessionLabelFromSnapshot(snapshot: unknown): string | null {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const root = snapshot as Record<string, unknown>;
  const ref5 =
    root.ref5 !== null && typeof root.ref5 === "object" && !Array.isArray(root.ref5)
      ? (root.ref5 as Record<string, unknown>)
      : null;
  const decisionRaw = ref5?.decision ?? root.decision;
  const decision =
    decisionRaw !== null && typeof decisionRaw === "object" && !Array.isArray(decisionRaw)
      ? (decisionRaw as Record<string, unknown>)
      : null;

  const readString = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const mode = readString(root.sessionType) ?? readString(decision?.sessionType);
  const squat = readString(decision?.squatPrescription);
  const focus = readString(decision?.focus);

  const parts = [mode, squat ? `SQ ${squat}` : null, focus].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

// REF5 session keys are `REF5:<actualStartAt ISO>:<startEventId>`. They carry no
// week/day position (REF5 has none — §18), so the generic parser rejects them;
// their calendar day is the plan-timezone date of the actual start instant.
const REF5_SESSION_KEY_PATTERN = /^REF5:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):/;

/** Calendar day for a session key, including REF5's instant-anchored keys. */
export function extractSessionDateInTimezone(
  sessionKey: string,
  timezone: string,
): string | null {
  const ref5 = REF5_SESSION_KEY_PATTERN.exec(String(sessionKey ?? "").trim());
  if (ref5) {
    const startedAt = new Date(ref5[1]!);
    return Number.isNaN(startedAt.getTime()) ? null : dateOnlyInTimezone(startedAt, timezone);
  }
  return extractSessionDate(sessionKey);
}
