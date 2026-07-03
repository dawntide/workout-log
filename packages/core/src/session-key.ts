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
  if (parsed.kind === "cycle-wave") return `C${parsed.cycle}W${parsed.week}D${parsed.day}`;
  return `${parsed.sessionDate} · C${parsed.cycle}W${parsed.week}D${parsed.day}`;
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
      // autoProgression은 cycle/week/day가 runtime_state로 논리 위치를 고정한다.
      // sessionKey에 호출 날짜를 넣으면 같은 논리 세션이 조회 날짜마다 다른 키가 되어
      // (plan_id, sessionKey) unique 기반 upsert를 무력화하고 중복 row가 누적된다.
      // 날짜를 빼 cycle-wave로 수렴시켜 unique 인덱스가 중복을 원천 차단하게 한다.
      // (날짜 정보는 workout_log.performed_at / snapshot.sessionDate에 보존됨)
      return `C${cycle}W${week}D${day}`;
    }
    return input.sessionDate;
  }

  if (input.autoProgression === true) {
    return `C${cycle}W${week}D${day}`;
  }

  return `W${week}D${day}`;
}
