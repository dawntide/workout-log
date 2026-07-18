import {
  deriveRef5AuxiliaryCaps,
  floorRef5To2p5,
  validateRef5StartConfig,
  type Ref5DirectStandardsKg,
  type Ref5Lift,
  type Ref5StartConfig,
} from "./ref5";

export const REF5_START_CALIBRATION_VERSION = 1 as const;
export const REF5_START_CALIBRATION_LOOKBACK_DAYS = 56 as const;
export const REF5_START_CALIBRATION_MAX_REPS = 10 as const;

export const REF5_START_CALIBRATION_LIFTS = [
  "SQ",
  "BP",
  "PULL",
  "DL",
  "OHP",
] as const satisfies readonly Ref5Lift[];

export type Ref5CalibrationE1rmKg = Record<Ref5Lift, number>;

export type Ref5CalibrationCapAdjustment = {
  fromKg: number;
  toKg: number;
};

export type Ref5StartCalibration = {
  calibrationVersion: typeof REF5_START_CALIBRATION_VERSION;
  e1rmKg: Ref5CalibrationE1rmKg;
  rawStartingValuesKg: Ref5DirectStandardsKg;
  startConfig: Ref5StartConfig;
  capAdjustments: Partial<Record<"DL" | "OHP", Ref5CalibrationCapAdjustment>>;
};

export type Ref5StartCalibrationResult =
  | { ok: true; value: Ref5StartCalibration }
  | { ok: false; errors: string[] };

export type Ref5CalibrationRecordPoint = {
  date: string;
  e1rm: number;
  weightKg: number;
  reps: number;
};

export type Ref5CalibrationRecord = {
  exerciseName: string;
  best: Ref5CalibrationRecordPoint;
};

export type Ref5StartRecommendationItem = {
  lift: Ref5Lift;
  sourceExerciseName: string;
  e1rmKg: number;
  recordDate: string;
  recordWeightKg: number;
  recordReps: number;
};

export type Ref5StartRecommendation = {
  calibrationVersion: typeof REF5_START_CALIBRATION_VERSION;
  lookbackDays: typeof REF5_START_CALIBRATION_LOOKBACK_DAYS;
  maxReps: typeof REF5_START_CALIBRATION_MAX_REPS;
  items: Ref5StartRecommendationItem[];
  missingLifts: Ref5Lift[];
  calibration: Ref5StartCalibration | null;
};

const REF5_E1RM_TO_START_FACTORS: Readonly<Record<Ref5Lift, number>> = Object.freeze({
  SQ: 82.5 / 104,
  BP: 82.5 / 101,
  PULL: 87.5 / 108,
  DL: 72.5 / 100,
  OHP: 32.5 / 50,
});

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function cleanE1rm(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Converts one-time calibration e1RMs into REF5's canonical direct work loads.
 * The factors are the exact inverse of the existing control-REF equations, not
 * universal %1RM claims. All candidates are floored to the 2.5 kg grid, and
 * auxiliary caps remain authoritative.
 */
export function deriveRef5StartCalibration(value: unknown): Ref5StartCalibrationResult {
  const source = asRecord(value);
  const errors: string[] = [];
  const e1rmKg = {} as Ref5CalibrationE1rmKg;

  for (const lift of REF5_START_CALIBRATION_LIFTS) {
    const raw = source[lift];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
      errors.push(`${lift} e1RM must be a positive finite number`);
      continue;
    }
    e1rmKg[lift] = cleanE1rm(raw);
  }

  if (errors.length > 0) return { ok: false, errors };

  const rawStartingValuesKg: Ref5DirectStandardsKg = {
    sqH3Kg: floorRef5To2p5(e1rmKg.SQ * REF5_E1RM_TO_START_FACTORS.SQ),
    bpFocusKg: floorRef5To2p5(e1rmKg.BP * REF5_E1RM_TO_START_FACTORS.BP),
    pullFocusTotalKg: floorRef5To2p5(e1rmKg.PULL * REF5_E1RM_TO_START_FACTORS.PULL),
    deadliftKg: floorRef5To2p5(e1rmKg.DL * REF5_E1RM_TO_START_FACTORS.DL),
    ohpKg: floorRef5To2p5(e1rmKg.OHP * REF5_E1RM_TO_START_FACTORS.OHP),
  };
  const caps = deriveRef5AuxiliaryCaps(rawStartingValuesKg);
  const startingValuesKg: Ref5DirectStandardsKg = {
    ...rawStartingValuesKg,
    deadliftKg: Math.min(rawStartingValuesKg.deadliftKg, caps.deadliftMaxKg),
    ohpKg: Math.min(rawStartingValuesKg.ohpKg, caps.ohpMaxKg),
  };
  const validated = validateRef5StartConfig(startingValuesKg);
  if (!validated.ok) return { ok: false, errors: validated.errors };

  const capAdjustments: Ref5StartCalibration["capAdjustments"] = {};
  if (rawStartingValuesKg.deadliftKg !== startingValuesKg.deadliftKg) {
    capAdjustments.DL = {
      fromKg: rawStartingValuesKg.deadliftKg,
      toKg: startingValuesKg.deadliftKg,
    };
  }
  if (rawStartingValuesKg.ohpKg !== startingValuesKg.ohpKg) {
    capAdjustments.OHP = {
      fromKg: rawStartingValuesKg.ohpKg,
      toKg: startingValuesKg.ohpKg,
    };
  }

  return {
    ok: true,
    value: {
      calibrationVersion: REF5_START_CALIBRATION_VERSION,
      e1rmKg,
      rawStartingValuesKg,
      startConfig: validated.value,
      capAdjustments,
    },
  };
}

function normalizedExerciseName(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Strict matching prevents rows, pulldowns, squat variants and hinge variants from calibrating REF5. */
export function ref5CalibrationLiftForExerciseName(exerciseName: string): Ref5Lift | null {
  const name = normalizedExerciseName(exerciseName);
  if (!name) return null;

  if (
    name === "back squat" ||
    name === "high bar squat" ||
    name === "high bar back squat" ||
    name === "하이바 스쿼트"
  ) {
    return "SQ";
  }
  if (
    name === "bench press" ||
    name === "flat bench press" ||
    name === "barbell bench press" ||
    name === "bench" ||
    name === "벤치프레스" ||
    name === "벤치"
  ) {
    return "BP";
  }
  if (
    name === "weighted pull up" ||
    name === "weighted pullup" ||
    name === "pull up" ||
    name === "pullup" ||
    name === "중량 풀업" ||
    name === "중량풀업" ||
    name === "풀업"
  ) {
    return "PULL";
  }
  if (
    name === "deadlift" ||
    name === "conventional deadlift" ||
    name === "데드리프트"
  ) {
    return "DL";
  }
  if (
    name === "overhead press" ||
    name === "barbell overhead press" ||
    name === "military press" ||
    name === "ohp" ||
    name === "밀리터리 프레스" ||
    name === "오버헤드 프레스"
  ) {
    return "OHP";
  }
  return null;
}

export function buildRef5StartRecommendation(
  records: readonly Ref5CalibrationRecord[],
): Ref5StartRecommendation {
  const bestByLift = new Map<Ref5Lift, Ref5StartRecommendationItem>();

  for (const record of records) {
    const lift = ref5CalibrationLiftForExerciseName(record.exerciseName);
    if (!lift) continue;
    const e1rmKg = Number(record.best?.e1rm);
    const recordWeightKg = Number(record.best?.weightKg);
    const recordReps = Number(record.best?.reps);
    if (
      !Number.isFinite(e1rmKg) ||
      e1rmKg <= 0 ||
      !Number.isFinite(recordWeightKg) ||
      recordWeightKg <= 0 ||
      !Number.isInteger(recordReps) ||
      recordReps < 1 ||
      recordReps > REF5_START_CALIBRATION_MAX_REPS
    ) {
      continue;
    }

    const candidate: Ref5StartRecommendationItem = {
      lift,
      sourceExerciseName: record.exerciseName,
      e1rmKg: cleanE1rm(e1rmKg),
      recordDate: String(record.best.date ?? ""),
      recordWeightKg: cleanE1rm(recordWeightKg),
      recordReps,
    };
    const current = bestByLift.get(lift);
    if (
      !current ||
      candidate.e1rmKg > current.e1rmKg ||
      (candidate.e1rmKg === current.e1rmKg && candidate.recordDate > current.recordDate)
    ) {
      bestByLift.set(lift, candidate);
    }
  }

  const items = REF5_START_CALIBRATION_LIFTS.flatMap((lift) => {
    const item = bestByLift.get(lift);
    return item ? [item] : [];
  });
  const missingLifts = REF5_START_CALIBRATION_LIFTS.filter(
    (lift) => !bestByLift.has(lift),
  );
  const calibrationResult =
    missingLifts.length === 0
      ? deriveRef5StartCalibration(
          Object.fromEntries(items.map((item) => [item.lift, item.e1rmKg])),
        )
      : null;

  return {
    calibrationVersion: REF5_START_CALIBRATION_VERSION,
    lookbackDays: REF5_START_CALIBRATION_LOOKBACK_DAYS,
    maxReps: REF5_START_CALIBRATION_MAX_REPS,
    items,
    missingLifts: [...missingLifts],
    calibration: calibrationResult?.ok ? calibrationResult.value : null,
  };
}
