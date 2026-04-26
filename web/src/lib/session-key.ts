export type ParsedSessionKey =
  | {
      raw: string;
      kind: "date";
      sessionDate: string;
      cycle: null;
      week: null;
      day: null;
    }
  | {
      raw: string;
      kind: "date-progression";
      sessionDate: string;
      cycle: number;
      week: number;
      day: number;
    }
  | {
      raw: string;
      kind: "wave";
      sessionDate: null;
      cycle: null;
      week: number;
      day: number;
    }
  | {
      raw: string;
      kind: "cycle-wave";
      sessionDate: null;
      cycle: number;
      week: number;
      day: number;
    };

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WAVE_PATTERN = /^W(\d+)D(\d+)$/;
const DATE_PROGRESSION_PATTERN = /^(\d{4}-\d{2}-\d{2})@C(\d+)W(\d+)D(\d+)$/;
const CYCLE_WAVE_PATTERN = /^C(\d+)W(\d+)D(\d+)$/;

function clampPositiveInt(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export function parseSessionKey(sessionKey: string): ParsedSessionKey | null {
  const raw = String(sessionKey ?? "").trim();
  if (!raw) return null;

  if (DATE_ONLY_PATTERN.test(raw)) {
    return {
      raw,
      kind: "date",
      sessionDate: raw,
      cycle: null,
      week: null,
      day: null,
    };
  }

  const datedMatch = DATE_PROGRESSION_PATTERN.exec(raw);
  if (datedMatch) {
    return {
      raw,
      kind: "date-progression",
      sessionDate: datedMatch[1]!,
      cycle: Number(datedMatch[2]),
      week: Number(datedMatch[3]),
      day: Number(datedMatch[4]),
    };
  }

  const waveMatch = WAVE_PATTERN.exec(raw);
  if (waveMatch) {
    return {
      raw,
      kind: "wave",
      sessionDate: null,
      cycle: null,
      week: Number(waveMatch[1]),
      day: Number(waveMatch[2]),
    };
  }

  const cycleWaveMatch = CYCLE_WAVE_PATTERN.exec(raw);
  if (cycleWaveMatch) {
    return {
      raw,
      kind: "cycle-wave",
      sessionDate: null,
      cycle: Number(cycleWaveMatch[1]),
      week: Number(cycleWaveMatch[2]),
      day: Number(cycleWaveMatch[3]),
    };
  }

  return null;
}

export function extractSessionDate(sessionKey: string) {
  const parsed = parseSessionKey(sessionKey);
  return parsed?.sessionDate ?? null;
}

export function formatSessionKeyLabel(sessionKey: string) {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed) return sessionKey;
  if (parsed.kind === "date") return parsed.sessionDate;
  if (parsed.kind === "wave") return `W${parsed.week}D${parsed.day}`;
  if (parsed.kind === "cycle-wave") return `C${parsed.cycle} W${parsed.week}D${parsed.day}`;
  return `${parsed.sessionDate} · C${parsed.cycle} W${parsed.week}D${parsed.day}`;
}

export function buildSessionKey(input: {
  mode: string | null | undefined;
  sessionDate: string;
  week: number;
  day: number;
  cycle?: number | null;
  autoProgression?: boolean;
}) {
  const mode = String(input.mode ?? "").trim().toUpperCase();
  const week = clampPositiveInt(input.week, 1);
  const day = clampPositiveInt(input.day, 1);
  const cycle = clampPositiveInt(input.cycle ?? 1, 1);

  if (mode === "DATE") {
    if (input.autoProgression === true) {
      return `${input.sessionDate}@C${cycle}W${week}D${day}`;
    }
    return input.sessionDate;
  }

  if (input.autoProgression === true) {
    return `C${cycle}W${week}D${day}`;
  }

  return `W${week}D${day}`;
}
