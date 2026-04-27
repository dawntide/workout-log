import { and, eq, inArray } from "drizzle-orm";
import { buildSessionKey } from "@/lib/session-key";
import { db } from "@/server/db/client";
import {
  generatedSession,
  plan as planTable,
  planModule,
  planOverride,
  planRuntimeState,
  programTemplate,
  programVersion,
} from "@/server/db/schema";
import { extractTrainingMaxOverridesFromState } from "@/server/progression/reducer";
import { roundUpToNearest2p5 } from "./round";

type AccessoryPatch = {
  op: "ADD_ACCESSORY";
  value: {
    exerciseName: string;
    sets: Array<{ setNumber?: number; reps?: number; weightKg?: number; rpe?: number }>;
    order?: number;
  };
};

type ReplaceExercisePatch = {
  op: "REPLACE_EXERCISE";
  target: { blockTarget: string };
  value: { exerciseName: string };
};

type ReorderBlocksPatch = {
  op: "REORDER_BLOCKS";
  value: { order: string[] };
};

type Patch = AccessoryPatch | ReplaceExercisePatch | ReorderBlocksPatch;

/**
 * DSL v1 contract (minimal):
 * {
 *   dslVersion?: 1,
 *   kind: "531" | "operator" | "candito-linear",
 *   schedule: { weeks: number, sessionsPerWeek: number },
 *   lifts?: string[],          // generic targets
 *   modules?: string[],        // generic targets
 *   progression?: object       // template-specific parameters
 * }
 */
type LogicDefinitionV1 = {
  dslVersion?: number;
  kind: string;
  schedule?: { weeks?: number; sessionsPerWeek?: number };
  lifts?: string[];
  modules?: string[];
  mainLifts?: string[]; // legacy support
  cluster?: string[]; // legacy support
  progression?: Record<string, any>;
  assistance?: string; // 5/3/1: "FSL" | "BBB" | "NONE"
};

type PlannedSet = {
  reps?: number;
  targetWeightKg?: number;
  percent?: number;
  rpe?: number;
  note?: string;
};

type PlannedExercise = {
  exerciseId?: string | null;
  exerciseName: string;
  role: "MAIN" | "ASSIST";
  sets: PlannedSet[];
  sourceBlockTarget?: string;
  order?: number;
  rowType?: "AUTO" | "CUSTOM" | null;
  progressionTarget?: "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL" | null;
  progressionKey?: string | null;
};

type GeneratorCtx = {
  week: number;
  day: number;
  params: any;
  defaults: any;
  forcedTarget?: string;
  orderBase: number;
};

type ProgressionTarget = NonNullable<PlannedExercise["progressionTarget"]>;

type SessionContext = {
  cycle: number;
  week: number;
  day: number;
  sessionDate: string;
  sessionKey: string;
  timezone: string;
};

function toNumberOrNull(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTarget(v: string) {
  return String(v).trim().toUpperCase();
}

function defaultExerciseNameForTarget(target: string) {
  const t = normalizeTarget(target);
  if (t === "SQUAT") return "Back Squat";
  if (t === "BENCH") return "Bench Press";
  if (t === "DEADLIFT") return "Deadlift";
  if (t === "OHP") return "Overhead Press";
  if (t === "PULL") return "Pull-Up";
  return "Main Lift";
}

function inferTargetFromExerciseName(exerciseName: string) {
  const normalized = String(exerciseName).trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("squat")) return "SQUAT";
  if (normalized.includes("bench")) return "BENCH";
  if (normalized.includes("deadlift")) return "DEADLIFT";
  if (normalized.includes("overhead press") || normalized === "ohp" || normalized.includes("shoulder press")) {
    return "OHP";
  }
  if (
    normalized.includes("row") ||
    normalized.includes("pull-up") ||
    normalized.includes("pull up") ||
    normalized.includes("pulldown")
  ) {
    return "PULL";
  }
  return null;
}

function normalizeProgressionTarget(value: unknown): "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL" | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SQUAT" || normalized === "BENCH" || normalized === "DEADLIFT" || normalized === "OHP" || normalized === "PULL") {
    return normalized;
  }
  return inferTargetFromExerciseName(String(value ?? ""));
}

function manualExerciseKey(exerciseName: string) {
  return `EX_${String(exerciseName)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)}`;
}

function roundToNearest2p5(v: number) {
  return Math.round(v / 2.5) * 2.5;
}

function toDateOnlyInTimezone(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function isDateOnlyString(v: string | null | undefined): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

function dateOnlyToUtcMs(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((x) => Number(x));
  return Date.UTC(y, m - 1, d);
}

function clampPositiveInt(v: unknown, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function deriveSessionContext(input: {
  plan: any;
  week?: number;
  day?: number;
  sessionDate?: string;
  timezone?: string;
  runtimeState?: unknown;
}) {
  const params = (input.plan?.params ?? {}) as any;
  const runtimeState =
    input.runtimeState && typeof input.runtimeState === "object" && !Array.isArray(input.runtimeState)
      ? (input.runtimeState as Record<string, unknown>)
      : null;
  const timezone =
    (typeof input.timezone === "string" && input.timezone.trim()) ||
    (typeof params?.timezone === "string" && params.timezone.trim()) ||
    process.env.TZ ||
    "UTC";

  const dateFromInput = isDateOnlyString(input.sessionDate)
    ? input.sessionDate
    : toDateOnlyInTimezone(new Date(), timezone);
  const startDate = isDateOnlyString(params?.startDate) ? params.startDate : null;

  let week = clampPositiveInt(input.week, 1);
  let day = clampPositiveInt(input.day, 1);
  let cycle = 1;
  const hasExplicitWeek = typeof input.week === "number" && Number.isFinite(input.week);
  const hasExplicitDay = typeof input.day === "number" && Number.isFinite(input.day);
  const autoProgressionEnabled = params?.autoProgression === true;
  const hasRuntimeCycle = toNumberOrNull(runtimeState?.cycle) !== null;
  const hasRuntimeWeek = toNumberOrNull(runtimeState?.week) !== null;
  const hasRuntimeDay = toNumberOrNull(runtimeState?.day) !== null;
  const useRuntimeProgression = autoProgressionEnabled && !hasExplicitWeek && !hasExplicitDay && (hasRuntimeWeek || hasRuntimeDay);

  if (useRuntimeProgression) {
    cycle = clampPositiveInt(runtimeState?.cycle, cycle);
    week = clampPositiveInt(runtimeState?.week, week);
    day = clampPositiveInt(runtimeState?.day, day);
  } else {
    if (autoProgressionEnabled && hasRuntimeCycle) {
      cycle = clampPositiveInt(runtimeState?.cycle, cycle);
    }
    if (startDate && !hasExplicitWeek && !hasExplicitDay) {
      const deltaDays = Math.floor((dateOnlyToUtcMs(dateFromInput) - dateOnlyToUtcMs(startDate)) / 86_400_000);
      const schedule = Array.isArray(params?.schedule) ? params.schedule : [];
      const sessionsPerWeek = schedule.length > 0 ? schedule.length : clampPositiveInt(params?.sessionsPerWeek, 7);
      const normalizedDelta = Math.max(0, deltaDays);
      week = Math.floor(normalizedDelta / sessionsPerWeek) + 1;
      day = (normalizedDelta % sessionsPerWeek) + 1;
    }
  }

  const mode = String(params?.sessionKeyMode ?? "").toUpperCase();
  const sessionKey = buildSessionKey({
    mode,
    sessionDate: dateFromInput,
    cycle,
    week,
    day,
    autoProgression: autoProgressionEnabled,
  });

  return {
    cycle,
    week,
    day,
    sessionDate: dateFromInput,
    sessionKey,
    timezone,
  } satisfies SessionContext;
}

function normalizeLookupKeys(keys: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      keys
        .flatMap((key) => {
          const normalized = String(key ?? "").trim();
          return normalized ? [normalized, normalized.toLowerCase()] : [];
        })
        .filter(Boolean),
    ),
  );
}

function pickTrainingMaxKgByKeys(params: any, defaults: any, rawKeys: Array<string | null | undefined>) {
  const keys = normalizeLookupKeys(rawKeys);
  if (keys.length < 1) return null;
  const scoped = (obj: any): number | null => {
    if (!obj) return null;
    const asNum = toNumberOrNull(obj);
    if (asNum !== null) return asNum;
    if (typeof obj !== "object") return null;
    for (const k of keys) {
      const n = toNumberOrNull(obj[k]);
      if (n !== null) return n;
    }
    return null;
  };

  const value = (
    scoped(params?.trainingMaxKg) ??
    scoped(params?.tmKg) ??
    scoped(params?.tm) ??
    scoped(defaults?.trainingMaxKg) ??
    scoped(defaults?.tmKg) ??
    scoped(defaults?.tm)
  );
  if (value === null || value <= 0) return null;
  return value;
}

function pickTrainingMaxKg(params: any, defaults: any, target: string) {
  return pickTrainingMaxKgByKeys(params, defaults, [target]);
}

function resolveOperatorExerciseTrainingMax(input: {
  effectiveParams: any;
  baseParams: any;
  defaults: any;
  exerciseName: string;
  fallbackTarget: string | null;
}) {
  const exactKey = manualExerciseKey(input.exerciseName);
  const exactTm =
    pickTrainingMaxKgByKeys(input.effectiveParams, input.defaults, [exactKey]) ??
    pickTrainingMaxKgByKeys(input.baseParams, input.defaults, [exactKey]);

  if (!input.fallbackTarget) {
    return exactTm;
  }

  const effectiveFamilyTm = pickTrainingMaxKg(input.effectiveParams, input.defaults, input.fallbackTarget);
  if (exactTm === null) {
    return effectiveFamilyTm;
  }

  if (effectiveFamilyTm === null) {
    return exactTm;
  }

  const baseFamilyTm = pickTrainingMaxKg(input.baseParams, input.defaults, input.fallbackTarget);
  // No family-level baseline in plan params (older plans, or plans created
  // without the start-program family fallback). Treat the per-exercise TM as
  // the implicit family baseline so the runtime override delta still reaches
  // the prescribed weight.
  const familyBaseline = baseFamilyTm ?? exactTm;
  return roundToNearest2p5(exactTm + (effectiveFamilyTm - familyBaseline));
}

function requireTrainingMaxKg(params: any, defaults: any, target: string) {
  const tm = pickTrainingMaxKg(params, defaults, target);
  if (tm === null) {
    throw new Error(`1RM/TM 입력이 필요합니다: ${target}`);
  }
  return tm;
}

function normalizeTargets(def: LogicDefinitionV1, fallback: string[]) {
  const raw = [
    ...(Array.isArray(def.lifts) ? def.lifts : []),
    ...(Array.isArray(def.modules) ? def.modules : []),
    ...(Array.isArray(def.mainLifts) ? def.mainLifts : []),
    ...(Array.isArray(def.cluster) ? def.cluster : []),
    ...fallback,
  ]
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((x) => normalizeTarget(x));

  const unique: string[] = [];
  for (const t of raw) {
    if (!unique.includes(t)) unique.push(t);
  }
  return unique.length ? unique : ["CUSTOM"];
}

function buildPercentSets(
  tmKg: number,
  rows: Array<{ reps: number; percent: number; note?: string; rpe?: number }>,
) {
  return rows.map((row) => ({
    reps: row.reps,
    percent: row.percent,
    targetWeightKg: roundUpToNearest2p5(tmKg * row.percent),
    rpe: row.rpe,
    note: row.note,
  }));
}

function buildRepeatedSets(
  count: number,
  row: { reps: number; percent: number; note?: string; rpe?: number },
  tmKg: number,
) {
  return Array.from({ length: count }, () => ({
    reps: row.reps,
    percent: row.percent,
    targetWeightKg: roundUpToNearest2p5(tmKg * row.percent),
    rpe: row.rpe,
    note: row.note,
  }));
}

function buildRepeatedRepOnlySets(
  count: number,
  row: { reps: number; note?: string; rpe?: number },
) {
  return Array.from({ length: count }, () => ({
    reps: row.reps,
    rpe: row.rpe,
    note: row.note,
  }));
}

function normalizeManualRowType(value: unknown): "AUTO" | "CUSTOM" | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "AUTO" || normalized === "ANCHOR" || normalized === "FLEX") return "AUTO";
  if (normalized === "CUSTOM") return "CUSTOM";
  return null;
}

function operatorSchemeByWeek(week: number) {
  const scheme: Record<number, { reps: number; percent: number; note: string }> = {
    1: { reps: 5, percent: 0.7, note: "Operator W1" },
    2: { reps: 5, percent: 0.8, note: "Operator W2" },
    3: { reps: 3, percent: 0.9, note: "Operator W3" },
    4: { reps: 5, percent: 0.75, note: "Operator W4" },
    5: { reps: 3, percent: 0.85, note: "Operator W5" },
    6: { reps: 1, percent: 0.95, note: "Operator W6" },
  };
  return scheme[((week - 1) % 6) + 1] ?? scheme[1];
}

function generate531(def: LogicDefinitionV1, ctx: GeneratorCtx): PlannedExercise[] {
  const targets = ctx.forcedTarget
    ? [normalizeTarget(ctx.forcedTarget)]
    : normalizeTargets(def, ["SQUAT", "BENCH", "DEADLIFT", "OHP"]);
  const target = targets[(ctx.day - 1) % targets.length] ?? targets[0];
  const tm = requireTrainingMaxKg(ctx.params, ctx.defaults, target);
  const weekInCycle = ((ctx.week - 1) % 4) + 1;
  const progressionTarget = normalizeProgressionTarget(target);

  // 공식 5/3/1 메인 세트 테이블 (TM 기준 %)
  // Week 1: 3×5 (65/75/85%), Week 2: 3×3 (70/80/90%)
  // Week 3: 5/3/1 (75/85/95%), Week 4: 딜로드 3×5 (40/50/60%)
  const mainTable: Record<number, Array<{ reps: number; percent: number; note?: string }>> = {
    1: [
      { reps: 5, percent: 0.65 },
      { reps: 5, percent: 0.75 },
      { reps: 5, percent: 0.85, note: "5+" },
    ],
    2: [
      { reps: 3, percent: 0.70 },
      { reps: 3, percent: 0.80 },
      { reps: 3, percent: 0.90, note: "3+" },
    ],
    3: [
      { reps: 5, percent: 0.75 },
      { reps: 3, percent: 0.85 },
      { reps: 1, percent: 0.95, note: "1+" },
    ],
    4: [
      { reps: 5, percent: 0.40, note: "deload" },
      { reps: 5, percent: 0.50 },
      { reps: 5, percent: 0.60 },
    ],
  };

  const weekSets = mainTable[weekInCycle] ?? mainTable[1];
  const firstSetPercent = weekSets[0]?.percent ?? 0.65;

  const exercises: PlannedExercise[] = [
    {
      exerciseName: defaultExerciseNameForTarget(target),
      role: "MAIN",
      rowType: "AUTO",
      sourceBlockTarget: target,
      order: ctx.orderBase,
      progressionTarget: progressionTarget ?? null,
      progressionKey: target,
      sets: buildPercentSets(tm, weekSets),
    },
  ];

  const assistance = String(def.assistance ?? "NONE").toUpperCase();

  if (assistance === "FSL") {
    // FSL(First Set Last): 5×5 — 메인 첫 번째 세트 중량으로 5세트 반복
    exercises.push({
      exerciseName: defaultExerciseNameForTarget(target),
      role: "ASSIST",
      sourceBlockTarget: `${target}_FSL`,
      order: ctx.orderBase + 1,
      sets: Array.from({ length: 5 }, () => ({
        reps: 5,
        percent: firstSetPercent,
        targetWeightKg: roundUpToNearest2p5(tm * firstSetPercent),
        note: "FSL",
      })),
    });
  } else if (assistance === "BBB") {
    // BBB(Boring But Big): 5×10 — TM의 50%로 5세트 10회
    exercises.push({
      exerciseName: defaultExerciseNameForTarget(target),
      role: "ASSIST",
      sourceBlockTarget: `${target}_BBB`,
      order: ctx.orderBase + 1,
      sets: Array.from({ length: 5 }, () => ({
        reps: 10,
        percent: 0.50,
        targetWeightKg: roundUpToNearest2p5(tm * 0.50),
        note: "BBB",
      })),
    });
  }

  return exercises;
}

function generateOperator(def: LogicDefinitionV1, ctx: GeneratorCtx): PlannedExercise[] {
  const dayInWeek = ((ctx.day - 1) % 3) + 1;
  const forcedTarget = normalizeProgressionTarget(ctx.forcedTarget);
  const targets: ProgressionTarget[] = forcedTarget
    ? [forcedTarget]
    : dayInWeek === 3
      ? ["SQUAT", "BENCH", "DEADLIFT"]
      : ["SQUAT", "BENCH", "PULL"];
  const weekInCycle = ((ctx.week - 1) % 6) + 1;
  const mainSets = Math.min(
    5,
    Math.max(3, clampPositiveInt(def.progression?.mainSets ?? 3, 3)),
  );
  const deadliftSets = Math.min(
    5,
    Math.max(1, clampPositiveInt(def.progression?.deadliftSets ?? 3, 3)),
  );

  const scheme = operatorSchemeByWeek(weekInCycle);

  return targets.map((target, i) => {
    const setCount = target === "DEADLIFT" ? deadliftSets : mainSets;
    const tm = pickTrainingMaxKg(ctx.params, ctx.defaults, target);
    return {
      exerciseName: defaultExerciseNameForTarget(target),
      role: "MAIN" as const,
      sourceBlockTarget: target,
      order: ctx.orderBase + i,
      rowType: "AUTO",
      progressionTarget: target,
      progressionKey: target,
      sets:
        tm !== null
          ? buildRepeatedSets(setCount, scheme, tm)
          : buildRepeatedRepOnlySets(setCount, scheme),
    };
  });
}

function generateCanditoLinear(def: LogicDefinitionV1, ctx: GeneratorCtx): PlannedExercise[] {
  const weekInCycle = ((ctx.week - 1) % 6) + 1;
  const dayMap = Array.isArray(def.progression?.dayMap)
    ? def.progression.dayMap.map((x: any) => normalizeTarget(String(x)))
    : ["SQUAT", "BENCH", "DEADLIFT", "BENCH"];
  const target = ctx.forcedTarget
    ? normalizeTarget(ctx.forcedTarget)
    : dayMap[(ctx.day - 1) % dayMap.length] ?? dayMap[0];

  const scheme: Record<number, { sets: number; reps: number; percent: number; note?: string }> = {
    1: { sets: 4, reps: 8, percent: 0.7, note: "volume" },
    2: { sets: 4, reps: 6, percent: 0.75 },
    3: { sets: 5, reps: 4, percent: 0.8, note: "strength" },
    4: { sets: 6, reps: 3, percent: 0.85 },
    5: { sets: 4, reps: 2, percent: 0.9, note: "peak" },
    6: { sets: 3, reps: 1, percent: 0.95, note: "test prep" },
  };

  const tm = requireTrainingMaxKg(ctx.params, ctx.defaults, target);
  const s = scheme[weekInCycle] ?? scheme[1];

  return [
    {
      exerciseName: defaultExerciseNameForTarget(target),
      role: "MAIN",
      sourceBlockTarget: target,
      order: ctx.orderBase,
      sets: buildRepeatedSets(s.sets, s, tm),
    },
  ];
}

function generateFromLogicDefinition(
  definition: unknown,
  ctx: GeneratorCtx,
): PlannedExercise[] {
  const def = (definition ?? {}) as LogicDefinitionV1;
  const kind = String(def.kind ?? "").toLowerCase();

  if (kind === "531") return generate531(def, ctx);
  if (kind === "operator") return generateOperator(def, ctx);
  if (kind === "candito-linear") return generateCanditoLinear(def, ctx);

  const target = ctx.forcedTarget ? normalizeTarget(ctx.forcedTarget) : "CUSTOM";
  return [
    {
      exerciseName: defaultExerciseNameForTarget(target),
      role: "MAIN",
      sourceBlockTarget: target,
      order: ctx.orderBase,
      sets: [{ reps: 5, note: `Unsupported logic kind: ${def.kind ?? "unknown"}` }],
    },
  ];
}

function mapManualSet(s: any): PlannedSet {
  const reps = toNumberOrNull(s?.reps) ?? undefined;
  const targetWeightKg = toNumberOrNull(s?.targetWeightKg ?? s?.weightKg) ?? undefined;
  const percent = toNumberOrNull(s?.percent) ?? undefined;
  const rpe = toNumberOrNull(s?.rpe) ?? undefined;
  const note = typeof s?.note === "string" ? s.note : undefined;
  return { reps, targetWeightKg, percent, rpe, note };
}

function plannedExercisesFromManualSession(manualSession: any): PlannedExercise[] {
  const items = Array.isArray(manualSession?.items) ? manualSession.items : [];
  const out: PlannedExercise[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const exerciseName = String(item?.exerciseName ?? item?.name ?? "").trim();
    if (!exerciseName) continue;

    const setRows = Array.isArray(item?.sets) && item.sets.length > 0 ? item.sets : [item];
    const sets = setRows.map(mapManualSet);

    out.push({
      exerciseId: typeof item?.exerciseId === "string" ? item.exerciseId : null,
      exerciseName,
      role: item?.role === "ASSIST" ? "ASSIST" : "MAIN",
      sets,
      sourceBlockTarget: "MANUAL",
      order: toNumberOrNull(item?.order) ?? i,
      rowType: normalizeManualRowType(item?.rowType ?? item?.slotRole ?? item?.meta?.rowType ?? item?.meta?.slotRole),
      progressionTarget: normalizeProgressionTarget(item?.progressionTarget ?? item?.meta?.progressionTarget),
      progressionKey: null,
    });
  }

  return out;
}

function plannedExercisesFromOperatorManualSession(
  manualSession: any,
  week: number,
  effectiveParams: any,
  baseParams: any,
  defaults: any,
): PlannedExercise[] {
  const items = Array.isArray(manualSession?.items) ? manualSession.items : [];
  const scheme = operatorSchemeByWeek(week);
  const mainSets = 3;
  const deadliftSets = 3;

  return items
    .map((item: any, index: number) => {
      const exerciseName = String(item?.exerciseName ?? item?.name ?? "").trim();
      if (!exerciseName) return null;

      const rowType = normalizeManualRowType(item?.rowType ?? item?.slotRole ?? item?.meta?.rowType ?? item?.meta?.slotRole);
      const progressionTarget =
        normalizeProgressionTarget(item?.progressionTarget ?? item?.meta?.progressionTarget) ??
        inferTargetFromExerciseName(exerciseName);

      if (rowType === "AUTO") {
        const setCount = progressionTarget === "DEADLIFT" ? deadliftSets : mainSets;
        const tm = resolveOperatorExerciseTrainingMax({
          effectiveParams,
          baseParams,
          defaults,
          exerciseName,
          fallbackTarget: progressionTarget,
        });
        return {
          exerciseId: typeof item?.exerciseId === "string" ? item.exerciseId : null,
          exerciseName,
          role: "MAIN" as const,
          sourceBlockTarget: progressionTarget ?? "CUSTOM",
          order: toNumberOrNull(item?.order) ?? index,
          rowType,
          progressionTarget: progressionTarget ?? null,
          progressionKey: manualExerciseKey(exerciseName),
          sets:
            tm !== null
              ? buildRepeatedSets(setCount, scheme, tm)
              : buildRepeatedRepOnlySets(setCount, scheme),
        } satisfies PlannedExercise;
      }

      const setRows = Array.isArray(item?.sets) && item.sets.length > 0 ? item.sets : [item];
      return {
        exerciseId: typeof item?.exerciseId === "string" ? item.exerciseId : null,
        exerciseName,
        role: item?.role === "ASSIST" ? "ASSIST" : "MAIN",
        sets: setRows.map(mapManualSet),
        sourceBlockTarget: progressionTarget ?? "CUSTOM",
        order: toNumberOrNull(item?.order) ?? index,
        rowType: rowType ?? "CUSTOM",
        progressionTarget: progressionTarget ?? null,
        progressionKey: null,
      } satisfies PlannedExercise;
    })
    .filter((exercise: PlannedExercise | null): exercise is PlannedExercise => Boolean(exercise));
}

function plannedExercisesFromBlocks(snapshot: any, week: number, day: number, planParams: any) {
  const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
  const exercises: PlannedExercise[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const forcedTarget =
      typeof b?.target === "string" && normalizeTarget(b.target) !== "CUSTOM"
        ? normalizeTarget(b.target)
        : undefined;
    const generated = generateFromLogicDefinition(b?.definition, {
      week,
      day,
      params: { ...(planParams ?? {}), ...(b?.params ?? {}) },
      defaults: b?.defaults ?? {},
      forcedTarget,
      orderBase: i * 100,
    });
    exercises.push(...generated);
  }

  return exercises;
}

function reorderBlocks(blocks: any[], order: string[]) {
  const map = new Map(blocks.map((b: any) => [b.target, b]));
  const reordered = order.map((k: string) => map.get(k)).filter(Boolean);
  const remaining = blocks.filter((b: any) => !order.includes(b.target));
  return [...reordered, ...remaining];
}

function sortExercises(exercises: PlannedExercise[]) {
  return exercises
    .slice()
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

function applyOverridesToSnapshot(snapshot: any, overrides: any[]) {
  snapshot.overridesApplied = snapshot.overridesApplied ?? [];
  snapshot.exercises = Array.isArray(snapshot.exercises) ? snapshot.exercises : [];
  snapshot.accessories = Array.isArray(snapshot.accessories) ? snapshot.accessories : [];

  for (const o of overrides) {
    const p = o.patch as Patch;
    if (!p || !("op" in p)) continue;

    if (p.op === "ADD_ACCESSORY") {
      const accessory = {
        exerciseName: p.value.exerciseName,
        sets: p.value.sets ?? [],
        order: p.value.order ?? 99,
        source: { overrideId: o.id },
      };
      snapshot.accessories.push(accessory);

      const plannedAccessory: PlannedExercise = {
        exerciseName: p.value.exerciseName,
        role: "ASSIST",
        sourceBlockTarget: "ACCESSORY",
        order: 10000 + (p.value.order ?? 99),
        sets: (p.value.sets ?? []).map((s) => ({
          reps: toNumberOrNull(s?.reps) ?? undefined,
          targetWeightKg: toNumberOrNull(s?.weightKg) ?? undefined,
          rpe: toNumberOrNull(s?.rpe) ?? undefined,
        })),
      };
      snapshot.exercises.push(plannedAccessory);
      snapshot.overridesApplied.push({ overrideId: o.id, op: p.op });
      continue;
    }

    if (p.op === "REPLACE_EXERCISE") {
      const tgt = (p as any).target?.blockTarget;
      if (tgt && Array.isArray(snapshot.blocks)) {
        const block = snapshot.blocks.find((b: any) => b.target === tgt);
        if (block) {
          block.replacements = block.replacements ?? {};
          block.replacements.mainExercise = p.value.exerciseName;
          block.replacements.source = { overrideId: o.id };
        }
      }

      if (tgt && Array.isArray(snapshot.exercises)) {
        let replaced = 0;
        for (const ex of snapshot.exercises as PlannedExercise[]) {
          if (ex.role === "MAIN" && ex.sourceBlockTarget === tgt) {
            ex.exerciseName = p.value.exerciseName;
            replaced += 1;
          }
        }
        if (replaced === 0 && tgt === "CUSTOM") {
          for (const ex of snapshot.exercises as PlannedExercise[]) {
            if (ex.role === "MAIN") {
              ex.exerciseName = p.value.exerciseName;
            }
          }
        }
      }

      snapshot.overridesApplied.push({ overrideId: o.id, op: p.op, target: tgt });
      continue;
    }

    if (p.op === "REORDER_BLOCKS") {
      const order = (p as any).value?.order;
      if (Array.isArray(order) && Array.isArray(snapshot.blocks)) {
        snapshot.blocks = reorderBlocks(snapshot.blocks, order);
      }
      if (Array.isArray(order) && Array.isArray(snapshot.exercises)) {
        const rank = new Map(order.map((k: string, i: number) => [k, i]));
        snapshot.exercises = snapshot.exercises
          .slice()
          .sort((a: PlannedExercise, b: PlannedExercise) => {
            const ra = rank.has(a.sourceBlockTarget ?? "") ? rank.get(a.sourceBlockTarget ?? "")! : 9999;
            const rb = rank.has(b.sourceBlockTarget ?? "") ? rank.get(b.sourceBlockTarget ?? "")! : 9999;
            if (ra !== rb) return ra - rb;
            return (a.order ?? 9999) - (b.order ?? 9999);
          });
      }
      snapshot.overridesApplied.push({ overrideId: o.id, op: p.op });
      continue;
    }
  }

  if (Array.isArray(snapshot.accessories)) {
    snapshot.accessories.sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99));
  }
  if (Array.isArray(snapshot.exercises)) {
    snapshot.exercises = sortExercises(snapshot.exercises);
  }

  return snapshot;
}

function pickManualSession(definition: any, sessionKey: string) {
  if (!definition || definition.kind !== "manual") return null;
  const sessions = Array.isArray(definition.sessions) ? definition.sessions : [];
  return sessions.find((s: any) => s.key === sessionKey) ?? null;
}

function mergePlanParamsWithRuntimeState(planParams: unknown, runtimeState: unknown) {
  const baseParams = (planParams ?? {}) as Record<string, unknown>;
  const runtimeTrainingMax = extractTrainingMaxOverridesFromState(runtimeState);
  if (Object.keys(runtimeTrainingMax).length < 1) return baseParams;

  const existingTrainingMax =
    typeof baseParams.trainingMaxKg === "object" && baseParams.trainingMaxKg
      ? (baseParams.trainingMaxKg as Record<string, unknown>)
      : {};

  return {
    ...baseParams,
    trainingMaxKg: {
      ...existingTrainingMax,
      ...runtimeTrainingMax,
    },
  };
}

function applyManualRuntimeWeightOverrides(
  programSlug: string,
  exercises: PlannedExercise[],
  runtimeState: unknown,
) {
  if (String(programSlug).trim().toLowerCase() !== "greyskull-lp") return exercises;
  const runtimeTrainingMax = extractTrainingMaxOverridesFromState(runtimeState);
  if (Object.keys(runtimeTrainingMax).length < 1) return exercises;

  return exercises.map((exercise) => {
    const target = inferTargetFromExerciseName(exercise.exerciseName);
    if (!target) return exercise;
    const weight = runtimeTrainingMax[target];
    if (!Number.isFinite(weight) || weight <= 0) return exercise;
    return {
      ...exercise,
      sets: (exercise.sets ?? []).map((set) => ({
        ...set,
        targetWeightKg: weight,
      })),
    };
  });
}

/**
 * Snapshot format v3:
 * - keeps legacy fields: blocks[], accessories[], manualSession
 * - adds normalized planned field:
 *   exercises: [
 *     {
 *       exerciseId?: string,
 *       exerciseName: string,
 *       role: "MAIN" | "ASSIST",
 *       sets: [{ reps, targetWeightKg?, percent?, rpe?, note? }]
 *     }
 *   ]
 */
export async function generateAndSaveSession(input: {
  userId: string;
  planId: string;
  week?: number;
  day?: number;
  sessionDate?: string;
  timezone?: string;
}) {
  // plan + runtimeState 병렬 조회 (기존 2-round-trip → 1-round-trip)
  const [pRows, runtimeRows] = await Promise.all([
    db.select().from(planTable).where(eq(planTable.id, input.planId)).limit(1),
    db
      .select({ state: planRuntimeState.state })
      .from(planRuntimeState)
      .where(eq(planRuntimeState.planId, input.planId))
      .limit(1),
  ]);
  const p = pRows[0];
  if (!p) throw new Error("Plan not found");
  if (p.userId !== input.userId) throw new Error("Forbidden");

  const runtimeState = runtimeRows[0]?.state ?? null;
  const effectivePlanParams = mergePlanParamsWithRuntimeState(p.params ?? {}, runtimeState);

  const sessionCtx = deriveSessionContext({
    plan: {
      ...p,
      params: effectivePlanParams,
    },
    week: input.week,
    day: input.day,
    sessionDate: input.sessionDate,
    timezone: input.timezone,
    runtimeState,
  });
  const sessionKey = sessionCtx.sessionKey;

  // overrides + (modules 또는 version/template) 병렬 조회
  let snapshot: any = {
    schemaVersion: 3,
    sessionKey,
    sessionDate: sessionCtx.sessionDate,
    timezone: sessionCtx.timezone,
    week: sessionCtx.week,
    day: sessionCtx.day,
    plan: { id: p.id, type: p.type, name: p.name },
    exercises: [],
  };

  if (p.type === "COMPOSITE") {
    const [overrides, modules] = await Promise.all([
      db
        .select()
        .from(planOverride)
        .where(
          and(
            eq(planOverride.planId, p.id),
            eq(planOverride.scope, "SESSION"),
            eq(planOverride.sessionKey, sessionKey),
          ),
        ),
      db.select().from(planModule).where(eq(planModule.planId, p.id)),
    ]);

    const versionIds = Array.from(new Set(modules.map((m) => m.programVersionId).filter((id): id is string => Boolean(id))));
    const versionsWithTemplates = versionIds.length > 0
      ? await db
          .select({
            version: programVersion,
            template: programTemplate,
          })
          .from(programVersion)
          .innerJoin(programTemplate, eq(programVersion.templateId, programTemplate.id))
          .where(inArray(programVersion.id, versionIds))
      : [];

    const versionMap = new Map(versionsWithTemplates.map((row) => [row.version.id, row]));

    const blocks = modules
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((m) => {
        if (!m.programVersionId) throw new Error("Program version not found");
        const row = versionMap.get(m.programVersionId);
        if (!row) throw new Error("Program version/template not found");
        const { version, template } = row;

        return {
          target: m.target,
          program: {
            slug: template.slug,
            name: template.name,
            type: template.type,
            version: version.version,
          },
          definition: version.definition,
          defaults: version.defaults ?? {},
          params: m.params ?? {},
        };
      });

    snapshot.blocks = blocks;
    snapshot.exercises = plannedExercisesFromBlocks(
      snapshot,
      sessionCtx.week,
      sessionCtx.day,
      effectivePlanParams,
    );
    snapshot = applyOverridesToSnapshot(snapshot, overrides);
  } else {
    if (!p.rootProgramVersionId) throw new Error("rootProgramVersionId missing");

    // overrides + version/template 병렬 조회
    const [overrides, rows] = await Promise.all([
      db
        .select()
        .from(planOverride)
        .where(
          and(
            eq(planOverride.planId, p.id),
            eq(planOverride.scope, "SESSION"),
            eq(planOverride.sessionKey, sessionKey),
          ),
        ),
      db
        .select({
          version: programVersion,
          template: programTemplate,
        })
        .from(programVersion)
        .innerJoin(programTemplate, eq(programVersion.templateId, programTemplate.id))
        .where(eq(programVersion.id, p.rootProgramVersionId))
        .limit(1),
    ]);
    const row = rows[0];
    if (!row) throw new Error("Program version/template not found");
    const { version, template } = row;

    if (p.type === "MANUAL") {
      const schedule = Array.isArray((effectivePlanParams as any)?.schedule)
        ? (effectivePlanParams as any).schedule
        : [];
      const chosenKey = schedule[sessionCtx.day - 1] ?? schedule[(sessionCtx.day - 1) % schedule.length];
      if (!chosenKey) {
        snapshot.manualSession = null;
        snapshot.manualError = "No schedule entry for this day. Provide plan.params.schedule.";
        snapshot.exercises = [];
      } else {
        snapshot.manualSessionKey = chosenKey;
        snapshot.manualSession = pickManualSession(version.definition, chosenKey);
        if (!snapshot.manualSession) {
          snapshot.manualError = `Manual session '${chosenKey}' not found in program definition`;
        }
        const manualDefinition = (version.definition ?? {}) as Record<string, unknown>;
        const isOperatorManual =
          manualDefinition.operatorStyle === true ||
          String(manualDefinition.programFamily ?? "").trim().toLowerCase() === "operator";
        snapshot.exercises = isOperatorManual
          ? plannedExercisesFromOperatorManualSession(
              snapshot.manualSession,
              sessionCtx.week,
              effectivePlanParams,
              p.params ?? {},
              version.defaults ?? {},
            )
          : plannedExercisesFromManualSession(snapshot.manualSession);
        snapshot.exercises = isOperatorManual
          ? snapshot.exercises
          : applyManualRuntimeWeightOverrides(
              template.slug,
              snapshot.exercises,
              runtimeState,
            );
      }

      snapshot.program = {
        slug: template.slug,
        name: template.name,
        type: template.type,
        version: version.version,
      };

      snapshot = applyOverridesToSnapshot(snapshot, overrides);
    } else {
      snapshot.blocks = [
        {
          target: "CUSTOM",
          program: {
            slug: template.slug,
            name: template.name,
            type: template.type,
            version: version.version,
          },
          definition: version.definition,
          defaults: version.defaults ?? {},
          params: effectivePlanParams,
        },
      ];
      snapshot.exercises = plannedExercisesFromBlocks(
        snapshot,
        sessionCtx.week,
        sessionCtx.day,
        effectivePlanParams,
      );
      snapshot = applyOverridesToSnapshot(snapshot, overrides);
    }
  }

  const existing = await db
    .select()
    .from(generatedSession)
    .where(and(eq(generatedSession.planId, p.id), eq(generatedSession.sessionKey, sessionKey)))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(generatedSession)
      .set({ snapshot, updatedAt: new Date() })
      .where(eq(generatedSession.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(generatedSession)
    .values({
      planId: p.id,
      userId: input.userId,
      sessionKey,
      snapshot,
    })
    .returning();

  return created;
}
