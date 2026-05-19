export type ProgramTemplate = {
  id: string;
  slug: string;
  name: string;
  type: "LOGIC" | "MANUAL";
  visibility: "PUBLIC" | "PRIVATE";
  description: string | null;
  tags: string[] | null;
  latestVersion: {
    id: string;
    version: number;
    definition: any;
    defaults: any;
  } | null;
};

export type ProgramListItem = {
  key: string;
  source: "MARKET" | "CUSTOM";
  name: string;
  subtitle: string;
  description: string;
  template: ProgramTemplate;
};

export type OneRmTarget = {
  key: string;
  label: string;
  fallbackKey?: string | null;
};

export type ProgramExerciseMode = "MARKET" | "MANUAL";
export type ProgramRowType = "AUTO" | "CUSTOM";
export type ProgramProgressionTarget = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";
export type ProgramSetRepDefaults = { sets: number; reps: number };

export type ProgramExerciseDraft = {
  id: string;
  exerciseName: string;
  mode: ProgramExerciseMode;
  marketTemplateSlug: string | null;
  rowType?: ProgramRowType | null;
  progressionTarget?: ProgramProgressionTarget | null;
  sets: number;
  reps: number;
  note: string;
};

export type ProgramSessionDraft = {
  id: string;
  key: string;
  exercises: ProgramExerciseDraft[];
};

export type SessionRuleType = "AB" | "NUMERIC";

export type SessionRule = {
  type: SessionRuleType;
  count: number;
};

type ManualDefinitionSession = {
  key: string;
  name: string;
  items: Array<{
    exerciseName: string;
    role: "MAIN" | "ASSIST";
    rowType?: ProgramRowType;
    progressionTarget?: ProgramProgressionTarget;
    slotRole?: "ANCHOR" | "FLEX" | "CUSTOM";
    sets: Array<{
      setNumber: number;
      reps: number;
      targetWeightKg: number;
      note?: string;
    }>;
  }>;
};

function isProgramRowType(value: unknown): value is ProgramRowType {
  return value === "AUTO" || value === "CUSTOM";
}

function normalizeProgramRowType(value: unknown): ProgramRowType | null {
  if (isProgramRowType(value)) return value;
  if (value === "ANCHOR" || value === "FLEX") return "AUTO";
  if (value === "CUSTOM") return "CUSTOM";
  return null;
}

export function isOperatorAutoRowType(rowType: ProgramRowType | null | undefined) {
  return rowType === "AUTO";
}

function isProgramProgressionTarget(value: unknown): value is ProgramProgressionTarget {
  return value === "SQUAT" || value === "BENCH" || value === "DEADLIFT" || value === "OHP" || value === "PULL";
}

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function defaultExerciseNameForTarget(targetRaw: string) {
  const target = String(targetRaw).trim().toUpperCase();
  if (target === "SQUAT") return "Back Squat";
  if (target === "BENCH") return "Bench Press";
  if (target === "DEADLIFT") return "Deadlift";
  if (target === "OHP") return "Overhead Press";
  if (target === "PULL") return "Pull-Up";
  return targetRaw || "Exercise";
}

export function inferProgressionTargetFromExerciseName(exerciseName: string): ProgramProgressionTarget | null {
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

function normalizeProgressionTarget(value: unknown): ProgramProgressionTarget | null {
  if (isProgramProgressionTarget(value)) return value;
  return inferProgressionTargetFromExerciseName(String(value ?? ""));
}

export type ProgramStatItem = {
  key: "difficulty" | "frequency" | "cycle" | "type" | "split" | "duration";
  label: string;
  value: string;
};

export type ProgramSessionBreakdown = {
  key: string;
  exercises: Array<{ name: string; setsReps: string; hasAmrap: boolean }>;
};

export type ProgramDetailInfo = {
  scheduleLabel: string;
  stats: ProgramStatItem[];
  sessions: ProgramSessionBreakdown[] | null;
  modules: string[] | null;
  progressionNote: string | null;
};

export type ProgramStoreLocale = "ko" | "en";

const ENGLISH_PROGRAM_DESCRIPTIONS: Partial<Record<string, string>> = {
  operator:
    "A submaximal strength program built for tactical athletes and field operators. It uses 90% of true 1RM as the training max, runs squat, bench, and deadlift through a 6-week wave, and prioritizes repeatable heavy practice without grinding failures. After each cycle, the training max is nudged upward to sustain long-term progressive overload.",
  manual:
    "A fully open manual template for lifters who want to design every exercise, set, and rep themselves. There is no automatic progression engine, so each session can be logged exactly as written. It works well when you want full control instead of adapting to a prebuilt system.",
  "starting-strength-lp":
    "Mark Rippetoe's classic novice linear progression. Train an A/B full-body split three days per week with squats, presses, deadlifts, and power cleans, adding 2.5 to 5 kg whenever the work sets are completed. The program strips away distractions and leans hard into compound barbell lifts to maximize the novice effect.",
  "stronglifts-5x5":
    "A novice linear progression popularized by Mehdi. It resembles Starting Strength, but most main lifts are performed for 5x5 while deadlift stays lower in volume. Weight increases happen in small, predictable jumps, and the reset rules are simple enough that new lifters can run it with very little friction.",
  "texas-method":
    "A weekly undulating progression for intermediate lifters who have outgrown session-to-session linear gains. The standard flow is volume day, recovery day, and intensity day within the same week, letting stress, recovery, and peak output cycle together. It is a strong bridge for athletes who still want predictable progression without novice-level recovery speed.",
  gzclp:
    "Cody LeFever's tiered linear progression built around T1, T2, and T3 work. T1 lifts emphasize heavy strength practice, T2 movements drive additional volume, and T3 slots add high-rep work capacity and hypertrophy. It is a good fit for beginners and early intermediates who want more exercise variety than classic novice LPs.",
  "wendler-531":
    "Jim Wendler's 5/3/1 base template with no additional assistance work. It runs a 4-week cycle using a 90% training max, builds around submaximal top sets, and finishes each main week with an AMRAP set to drive long-term progress. This version is clean and minimal: just the main work and the progression engine.",
  "wendler-531-fsl":
    "A 5/3/1 variant that adds First Set Last work after the main sets. The first working-set load is repeated for 5x5, giving you extra technical practice and useful volume without losing the character of the original program. It is one of the most practical ways to make 5/3/1 feel more productive week to week.",
  "wendler-531-bbb":
    "A 5/3/1 variant that adds Boring But Big assistance after the main work. The follow-up 5x10 sets create a much larger hypertrophy and work-capacity stimulus while the core progression still comes from the 5/3/1 top sets. It is the volume-heavy option for lifters who want more size alongside strength.",
  "greyskull-lp":
    "A novice LP built on classic barbell basics with an AMRAP final set. After the first two work sets, the last set pushes for extra reps, letting volume auto-regulate based on how the athlete feels that day. It keeps progression simple while giving beginners more flexibility and a clearer path to adding optional assistance work.",
  "asymptote-protocol":
    "A performance-gated strength program for intermediates whose recovery, nutrition, or sleep is inconsistent. Three rotating sessions (A/B/C) cycle through four phases per block — acclimation, build, validation, deload — and the training max only moves when a cycle-3 AMRAP earns it. Five lifts (Squat, Bench, Weighted Pull-Up, Deadlift, Overhead Press) with auxiliary TMs derived from the mains, on a session-based rotation that ignores the calendar.",
};

function t(locale: ProgramStoreLocale, ko: string, en: string) {
  return locale === "ko" ? ko : en;
}

export function getProgramDescription(
  template: ProgramTemplate,
  locale: ProgramStoreLocale = "ko",
) {
  if (locale === "en") {
    const override = ENGLISH_PROGRAM_DESCRIPTIONS[template.slug];
    if (override) return override;
  }
  return template.description ?? null;
}

function statLabel(
  key: ProgramStatItem["key"],
  locale: ProgramStoreLocale,
) {
  if (key === "difficulty") return t(locale, "난이도", "Difficulty");
  if (key === "frequency") return t(locale, "주간 빈도", "Frequency");
  if (key === "cycle") return t(locale, "사이클", "Cycle");
  if (key === "type") return t(locale, "방식", "Type");
  if (key === "split") return t(locale, "분할", "Split");
  return t(locale, "기간", "Duration");
}

function difficultyText(tags: string[], locale: ProgramStoreLocale) {
  if (tags.some((t) => t === "novice" || t === "beginner")) return t(locale, "초급", "Beginner");
  if (tags.some((t) => t === "intermediate")) return t(locale, "중급", "Intermediate");
  if (tags.some((t) => t === "advanced")) return t(locale, "고급", "Advanced");
  return t(locale, "일반", "Standard");
}

function typeText(type: ProgramTemplate["type"], locale: ProgramStoreLocale) {
  return type === "LOGIC" ? t(locale, "자동 진행", "Auto Progression") : t(locale, "세션 고정", "Fixed Sessions");
}

function frequencyText(sessionsPerWeek: number | undefined, locale: ProgramStoreLocale) {
  if (!sessionsPerWeek) return "-";
  return locale === "ko" ? `주 ${sessionsPerWeek}회` : `${sessionsPerWeek} days/wk`;
}

function cycleText(weeks: number | undefined, locale: ProgramStoreLocale) {
  if (!weeks) return "-";
  return locale === "ko" ? `${weeks}주` : `${weeks} wk`;
}

function cycleDetailText(weeks: number | undefined, locale: ProgramStoreLocale) {
  if (!weeks) return "";
  return locale === "ko" ? `${weeks}주 사이클` : `${weeks}-week cycle`;
}

function asymptoteCycleText(cycles: number | undefined, locale: ProgramStoreLocale) {
  if (!cycles) return "-";
  return locale === "ko" ? `${cycles}사이클/블록` : `${cycles}-cycle block`;
}

function asymptoteCycleDetailText(
  cycles: number | undefined,
  locale: ProgramStoreLocale,
) {
  if (!cycles) return "";
  return locale === "ko" ? `${cycles}사이클 블록` : `${cycles}-cycle block`;
}

function splitText(count: number, locale: ProgramStoreLocale) {
  return locale === "ko" ? `${count}분할` : `${count}-day split`;
}

function durationText(locale: ProgramStoreLocale) {
  return t(locale, "무제한", "Open Ended");
}

function setsFallbackText(count: number, locale: ProgramStoreLocale) {
  return locale === "ko" ? `${count}세트` : `${count} sets`;
}

export function toProgramListItems(
  templates: ProgramTemplate[],
  locale: ProgramStoreLocale = "ko",
): ProgramListItem[] {
  return templates
    .map((template) => {
      const source: ProgramListItem["source"] = template.visibility === "PUBLIC" ? "MARKET" : "CUSTOM";
      const subtitle = source === "MARKET"
        ? t(locale, "시중 프로그램", "Official Library")
        : t(locale, "사용자 커스터마이징", "Custom Build");
      const fallbackDesc =
        source === "MARKET"
          ? t(locale, "시중 프로그램 라이브러리에서 제공되는 기본 템플릿입니다.", "A curated template from the public program library.")
          : t(locale, "사용자가 생성/커스터마이징한 프로그램입니다.", "A user-created or customized training program.");
      const tagsText = Array.isArray(template.tags) && template.tags.length > 0
        ? `${t(locale, "태그", "Tags")}: ${template.tags.join(", ")}`
        : "";
      const versionText = template.latestVersion
        ? `v${template.latestVersion.version}`
        : t(locale, "버전 없음", "No version");
      const description = [getProgramDescription(template, locale) ?? "", tagsText, versionText].filter(Boolean).join(" / ") || fallbackDesc;

      return {
        key: `${source.toLowerCase()}-${template.id}`,
        source,
        name: template.name,
        subtitle,
        description,
        template,
      };
    })
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "MARKET" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function getProgramScheduleLabel(
  template: ProgramTemplate,
  locale: ProgramStoreLocale = "ko",
): string {
  const def = template.latestVersion?.definition;
  if (!def) return "";

  if (def.kind === "operator") {
    const parts: string[] = [];
    const sessionsPerWeek = def.schedule?.sessionsPerWeek;
    const weeks = def.schedule?.weeks;
    if (sessionsPerWeek) parts.push(frequencyText(sessionsPerWeek, locale));
    if (weeks) parts.push(cycleDetailText(weeks, locale));
    return parts.join(" · ");
  }

  if (def.kind === "asymptote") {
    const parts: string[] = [];
    const sessionsPerCycle = def.schedule?.sessionsPerWeek;
    const cyclesPerBlock = def.schedule?.weeks;
    if (sessionsPerCycle) parts.push(frequencyText(sessionsPerCycle, locale));
    if (cyclesPerBlock) parts.push(asymptoteCycleDetailText(cyclesPerBlock, locale));
    return parts.join(" · ");
  }

  if (def.kind === "531") {
    const rawModules: string[] = Array.isArray(def.modules) ? (def.modules as string[]) : ["SQUAT", "BENCH", "DEADLIFT", "OHP"];
    const count = Math.min(rawModules.length, 4);
    const dayLabels = ["D1", "D2", "D3", "D4"].slice(0, count);
    return `${splitText(count, locale)} · ${dayLabels.join("/")}`;
  }

  if (def.kind === "manual" && Array.isArray(def.sessions) && def.sessions.length > 0) {
    const keys = (def.sessions as Array<{ key: string }>).map((s) => s.key).join("/");
    return `${splitText(def.sessions.length, locale)} · ${keys}`;
  }

  return "";
}

export function getProgramDetailInfo(
  template: ProgramTemplate,
  locale: ProgramStoreLocale = "ko",
): ProgramDetailInfo {
  const def = template.latestVersion?.definition;
  const defaults = template.latestVersion?.defaults;
  const tags = Array.isArray(template.tags) ? template.tags : [];

  const difficultyValue = difficultyText(tags, locale);
  const typeValue = typeText(template.type, locale);

  if (!def) {
    return {
      scheduleLabel: "",
      stats: [
        { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
        { key: "type", label: statLabel("type", locale), value: typeValue },
      ],
      sessions: null,
      modules: null,
      progressionNote: null,
    };
  }

  if (def.kind === "operator") {
    const sessionsPerWeek = def.schedule?.sessionsPerWeek as number | undefined;
    const weeks = def.schedule?.weeks as number | undefined;
    const parts: string[] = [];
    if (sessionsPerWeek) parts.push(frequencyText(sessionsPerWeek, locale));
    if (weeks) parts.push(cycleDetailText(weeks, locale));

    const stats: ProgramStatItem[] = [
      { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
      { key: "frequency", label: statLabel("frequency", locale), value: frequencyText(sessionsPerWeek, locale) },
      { key: "cycle", label: statLabel("cycle", locale), value: cycleText(weeks, locale) },
      { key: "type", label: statLabel("type", locale), value: typeValue },
    ];

    const modules = Array.isArray(def.modules) ? (def.modules as string[]) : null;

    const mainSets = (def.progression?.mainSets as number | undefined) ?? 3;
    const mainReps = 5;
    const setsRepsLabel = `${mainSets}×${mainReps}`;
    const sessions: ProgramSessionBreakdown[] = [
      {
        key: "D1",
        exercises: [
          { name: targetLabel("SQUAT"), setsReps: setsRepsLabel, hasAmrap: false },
          { name: targetLabel("BENCH"), setsReps: setsRepsLabel, hasAmrap: false },
          { name: "Pull-Up", setsReps: setsRepsLabel, hasAmrap: false },
        ],
      },
      {
        key: "D2",
        exercises: [
          { name: targetLabel("SQUAT"), setsReps: setsRepsLabel, hasAmrap: false },
          { name: targetLabel("BENCH"), setsReps: setsRepsLabel, hasAmrap: false },
          { name: "Pull-Up", setsReps: setsRepsLabel, hasAmrap: false },
        ],
      },
      {
        key: "D3",
        exercises: [
          { name: targetLabel("SQUAT"), setsReps: setsRepsLabel, hasAmrap: false },
          { name: targetLabel("BENCH"), setsReps: setsRepsLabel, hasAmrap: false },
          { name: targetLabel("DEADLIFT"), setsReps: setsRepsLabel, hasAmrap: false },
        ],
      },
    ];

    const tmPercent = typeof defaults?.tmPercent === "number" ? Math.round(defaults.tmPercent * 100) : null;
    const progressionParts: string[] = [];
    if (tmPercent) progressionParts.push(`TM ${tmPercent}%`);
    progressionParts.push(locale === "ko" ? `메인 ${mainSets}세트` : `Main ${mainSets} sets`);

    return {
      scheduleLabel: parts.join(" · "),
      stats,
      sessions,
      modules,
      progressionNote: progressionParts.join(" · ") || null,
    };
  }

  if (def.kind === "asymptote") {
    const sessionsPerCycle = def.schedule?.sessionsPerWeek as number | undefined;
    const cyclesPerBlock = def.schedule?.weeks as number | undefined;
    const parts: string[] = [];
    if (sessionsPerCycle) parts.push(frequencyText(sessionsPerCycle, locale));
    if (cyclesPerBlock) parts.push(asymptoteCycleDetailText(cyclesPerBlock, locale));

    const stats: ProgramStatItem[] = [
      { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
      { key: "frequency", label: statLabel("frequency", locale), value: frequencyText(sessionsPerCycle, locale) },
      { key: "cycle", label: statLabel("cycle", locale), value: asymptoteCycleText(cyclesPerBlock, locale) },
      { key: "type", label: statLabel("type", locale), value: typeValue },
    ];

    const modules = Array.isArray(def.modules) ? (def.modules as string[]) : ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"];

    const sessions: ProgramSessionBreakdown[] = [
      {
        key: "A",
        exercises: [
          { name: "Back Squat", setsReps: "4×3+", hasAmrap: true },
          { name: "Bench Press", setsReps: "4×5", hasAmrap: false },
          { name: "Weighted Pull-Up", setsReps: "4×3+", hasAmrap: true },
        ],
      },
      {
        key: "B",
        exercises: [
          { name: "Back Squat", setsReps: "5×5", hasAmrap: false },
          { name: "Deadlift", setsReps: "3×3", hasAmrap: false },
          { name: "Weighted Pull-Up", setsReps: "3×8", hasAmrap: false },
        ],
      },
      {
        key: "C",
        exercises: [
          { name: "Back Squat", setsReps: "6×3", hasAmrap: false },
          { name: "Bench Press", setsReps: "4×3+", hasAmrap: true },
          { name: "Overhead Press", setsReps: "4×5", hasAmrap: false },
        ],
      },
    ];

    const tmPercent = typeof defaults?.tmPercent === "number" ? Math.round(defaults.tmPercent * 100) : null;
    const progressionParts: string[] = [];
    if (tmPercent) progressionParts.push(`TM ${tmPercent}%`);
    progressionParts.push(
      locale === "ko" ? "사이클 3 AMRAP 게이팅" : "Cycle 3 AMRAP gating",
    );

    return {
      scheduleLabel: parts.join(" · "),
      stats,
      sessions,
      modules,
      progressionNote: progressionParts.join(" · ") || null,
    };
  }

  if (def.kind === "531") {
    const sessionsPerWeek = def.schedule?.sessionsPerWeek as number | undefined;
    const weeks = def.schedule?.weeks as number | undefined;
    const parts: string[] = [];
    if (sessionsPerWeek) parts.push(frequencyText(sessionsPerWeek, locale));
    if (weeks) parts.push(cycleDetailText(weeks, locale));

    const stats: ProgramStatItem[] = [
      { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
      { key: "frequency", label: statLabel("frequency", locale), value: frequencyText(sessionsPerWeek, locale) },
      { key: "cycle", label: statLabel("cycle", locale), value: cycleText(weeks, locale) },
      { key: "type", label: statLabel("type", locale), value: typeValue },
    ];

    const rawModules: string[] = Array.isArray(def.modules) ? (def.modules as string[]) : ["SQUAT", "BENCH", "DEADLIFT", "OHP"];
    const dayLabels = ["D1", "D2", "D3", "D4"];
    const assistance = String(def.assistance ?? "NONE").toUpperCase();

    const sessions: ProgramSessionBreakdown[] = rawModules.slice(0, 4).map((mod, i) => {
      const exercises: Array<{ name: string; setsReps: string; hasAmrap: boolean }> = [
        {
          name: targetLabel(mod),
          setsReps: locale === "ko" ? "3세트 (주차별 %)" : "3 sets (% by week)",
          hasAmrap: true,
        },
      ];
      if (assistance === "FSL") {
        exercises.push({ name: `${targetLabel(mod)} FSL`, setsReps: "5×5", hasAmrap: false });
      } else if (assistance === "BBB") {
        exercises.push({ name: `${targetLabel(mod)} BBB`, setsReps: "5×10", hasAmrap: false });
      }
      return { key: dayLabels[i] ?? `D${i + 1}`, exercises };
    });

    const tmPercent = typeof defaults?.tmPercent === "number" ? Math.round(defaults.tmPercent * 100) : null;
    const progressionParts: string[] = [];
    if (tmPercent) progressionParts.push(`TM ${tmPercent}%`);
    if (assistance === "FSL") progressionParts.push(locale === "ko" ? "FSL 보조" : "FSL assistance");
    else if (assistance === "BBB") progressionParts.push(locale === "ko" ? "BBB 보조" : "BBB assistance");
    else progressionParts.push(locale === "ko" ? "보조 없음" : "No assistance");

    return {
      scheduleLabel: parts.join(" · "),
      stats,
      sessions,
      modules: null,
      progressionNote: progressionParts.join(" · ") || null,
    };
  }

  if (def.kind === "manual" && Array.isArray(def.sessions)) {
    type RawSet = { reps?: number; note?: string };
    type RawItem = { exerciseName: string; sets?: RawSet[] };
    type RawSession = { key: string; items?: RawItem[] };

    const rawSessions = def.sessions as RawSession[];
    const sessions: ProgramSessionBreakdown[] = rawSessions.map((session) => ({
      key: session.key,
      exercises: (session.items ?? []).map((item) => {
        const sets = item.sets ?? [];
        const setCount = sets.length;
        const firstReps = sets[0]?.reps;
        const hasAmrap = sets.some((s) => String(s.note ?? "").toUpperCase().includes("AMRAP"));
        const setsReps =
          setCount > 0 && firstReps != null
            ? `${setCount}×${firstReps}${hasAmrap ? "+" : ""}`
            : setCount > 0
              ? setsFallbackText(setCount, locale)
              : "";
        return { name: item.exerciseName, setsReps, hasAmrap };
      }),
    }));

    const sessionCount = sessions.length;
    const scheduleLabel =
      sessionCount > 0 ? `${splitText(sessionCount, locale)} · ${sessions.map((s) => s.key).join("/")}` : "";

    const stats: ProgramStatItem[] = [
      { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
      { key: "split", label: statLabel("split", locale), value: sessionCount > 0 ? splitText(sessionCount, locale) : "-" },
      { key: "duration", label: statLabel("duration", locale), value: durationText(locale) },
      { key: "type", label: statLabel("type", locale), value: typeValue },
    ];

    return { scheduleLabel, stats, sessions, modules: null, progressionNote: null };
  }

  return {
    scheduleLabel: "",
    stats: [
      { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
      { key: "type", label: statLabel("type", locale), value: typeValue },
    ],
    sessions: null,
    modules: null,
    progressionNote: null,
  };
}

function normalizeTargets(definition: any): string[] {
  const raw = [
    ...(Array.isArray(definition?.lifts) ? definition.lifts : []),
    ...(Array.isArray(definition?.modules) ? definition.modules : []),
    ...(Array.isArray(definition?.mainLifts) ? definition.mainLifts : []),
    ...(Array.isArray(definition?.cluster) ? definition.cluster : []),
    ...(Array.isArray(definition?.progression?.dayMap) ? definition.progression.dayMap : []),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const target of raw) {
    if (!unique.includes(target)) unique.push(target);
  }
  return unique;
}

function canonicalTarget(raw: string) {
  const normalized = String(raw).trim().toUpperCase();
  if (!normalized) return "";
  if (normalized.includes("SQUAT")) return "SQUAT";
  if (normalized.includes("BENCH")) return "BENCH";
  if (normalized.includes("DEADLIFT") || normalized === "DEAD") return "DEADLIFT";
  if (normalized.includes("OHP") || normalized.includes("OVERHEAD") || normalized.includes("PRESS")) return "OHP";
  if (normalized.includes("PULL") || normalized.includes("ROW")) return "PULL";
  return normalized;
}

function targetLabel(target: string) {
  const canonical = canonicalTarget(target);
  if (canonical === "SQUAT") return "Back Squat";
  if (canonical === "BENCH") return "Bench Press";
  if (canonical === "DEADLIFT") return "Deadlift";
  if (canonical === "OHP") return "Overhead Press";
  if (canonical === "PULL") return "Pull-Up / Row";
  return defaultExerciseNameForTarget(canonical || target);
}

export function isOperatorTemplate(template: ProgramTemplate | null | undefined) {
  if (!template) return false;
  const slug = String(template.slug ?? "").trim().toLowerCase();
  const kind = String(template.latestVersion?.definition?.kind ?? "").trim().toLowerCase();
  return (
    slug === "operator" ||
    kind === "operator" ||
    template.latestVersion?.definition?.operatorStyle === true ||
    String(template.latestVersion?.definition?.programFamily ?? "").trim().toLowerCase() === "operator"
  );
}

function manualExerciseKey(exerciseName: string) {
  return `EX_${exerciseName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)}`;
}

function oneRmTargetsFromManualDefinition(definition: any): OneRmTarget[] {
  if (definition?.kind !== "manual" || !Array.isArray(definition.sessions)) return [];
  const operatorStyle = definition?.operatorStyle === true || String(definition?.programFamily ?? "").trim().toLowerCase() === "operator";
  const out: OneRmTarget[] = [];
  for (const session of definition.sessions) {
    const items = Array.isArray(session?.items) ? session.items : [];
    for (const item of items) {
      const rowType =
        normalizeProgramRowType(item?.rowType) ??
        normalizeProgramRowType(item?.slotRole) ??
        normalizeProgramRowType(item?.meta?.rowType) ??
        normalizeProgramRowType(item?.meta?.slotRole);
      if (operatorStyle && !isOperatorAutoRowType(rowType)) continue;
      const exerciseName = String(item?.exerciseName ?? item?.name ?? "").trim();
      if (!exerciseName) continue;
      if (operatorStyle) {
        const key = manualExerciseKey(exerciseName);
        if (!out.some((entry) => entry.key === key)) {
          out.push({
            key,
            label: exerciseName,
            fallbackKey: normalizeProgressionTarget(item?.progressionTarget) ?? inferProgressionTargetFromExerciseName(exerciseName),
          });
        }
        continue;
      }
      const inferred = inferProgressionTargetFromExerciseName(exerciseName);
      const key = inferred ? inferred : manualExerciseKey(exerciseName);
      const label = inferred ? targetLabel(inferred) : exerciseName;
      if (!out.some((entry) => entry.key === key)) {
        out.push({ key, label });
      }
    }
  }
  return out;
}

export function extractOneRmTargetsFromTemplate(template: ProgramTemplate): OneRmTarget[] {
  const definition = template.latestVersion?.definition ?? {};
  const fromLogic: OneRmTarget[] = normalizeTargets(definition)
    .map(canonicalTarget)
    .filter(Boolean)
    .map((key) => ({ key, label: targetLabel(key) }));
  const fromManual = oneRmTargetsFromManualDefinition(definition);
  const merged: OneRmTarget[] = [];
  for (const target of [...fromLogic, ...fromManual]) {
    if (!merged.some((entry) => entry.key === target.key)) {
      merged.push(target);
    }
  }

  if (String(definition?.kind ?? "").trim().toLowerCase() === "operator") {
    const hasPull = merged.some((entry) => entry.key === "PULL");
    if (!hasPull) {
      merged.push({ key: "PULL", label: targetLabel("PULL") });
    }
  }

  if (merged.length > 0) return merged;
  const fallback = template.type === "LOGIC" ? ["SQUAT", "BENCH", "DEADLIFT"] : ["SQUAT"];
  return fallback.map((key) => ({ key, label: targetLabel(key) }));
}

function sessionDraftFromManual(session: any): ProgramSessionDraft {
  const key = String(session?.key ?? "").trim() || "A";
  const items = Array.isArray(session?.items) ? session.items : [];
  return {
    id: uid("session"),
    key,
    exercises: items.map((item: any, index: number) => {
      const sets = Array.isArray(item?.sets) ? item.sets : [];
      const first = sets[0] ?? {};
      return {
        id: uid(`exercise-${index + 1}`),
        exerciseName: String(item?.exerciseName ?? item?.name ?? "").trim() || `Exercise ${index + 1}`,
        mode: "MANUAL" as const,
        marketTemplateSlug: null,
        rowType:
          normalizeProgramRowType(item?.rowType) ??
          normalizeProgramRowType(item?.slotRole) ??
          normalizeProgramRowType(item?.meta?.rowType) ??
          normalizeProgramRowType(item?.meta?.slotRole),
        progressionTarget:
          normalizeProgressionTarget(item?.progressionTarget) ??
          normalizeProgressionTarget(item?.meta?.progressionTarget) ??
          inferProgressionTargetFromExerciseName(String(item?.exerciseName ?? item?.name ?? "")),
        sets: Math.max(1, sets.length || Number(item?.setsCount) || 1),
        reps: Math.max(1, Number(first?.reps) || Number(item?.reps) || 5),
        note: typeof first?.note === "string" ? first.note : "",
      };
    }),
  };
}

function createFixedExerciseDraft(
  exerciseName: string,
  rowType: ProgramRowType,
  progressionTarget: ProgramProgressionTarget | null,
  sets = 3,
  reps = 5,
): ProgramExerciseDraft {
  return {
    id: uid("exercise"),
    exerciseName,
    mode: "MANUAL",
    marketTemplateSlug: null,
    rowType,
    progressionTarget,
    sets,
    reps,
    note: "",
  };
}

export function resolveOperatorExerciseDefaults(
  exerciseName: string,
  rowType: ProgramRowType | null | undefined,
): ProgramSetRepDefaults {
  if (rowType === "CUSTOM") {
    return { sets: 3, reps: 8 };
  }

  return { sets: 3, reps: 5 };
}

function asymptoteSessionDrafts(): ProgramSessionDraft[] {
  return [
    {
      id: uid("session"),
      key: "A",
      exercises: [
        createFixedExerciseDraft("Back Squat", "AUTO", "SQUAT", 4, 3),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH", 4, 5),
        createFixedExerciseDraft("Weighted Pull-Up", "AUTO", "PULL", 4, 3),
      ],
    },
    {
      id: uid("session"),
      key: "B",
      exercises: [
        createFixedExerciseDraft("Back Squat", "AUTO", "SQUAT", 5, 5),
        createFixedExerciseDraft("Deadlift", "AUTO", "DEADLIFT", 3, 3),
        createFixedExerciseDraft("Weighted Pull-Up", "AUTO", "PULL", 3, 8),
      ],
    },
    {
      id: uid("session"),
      key: "C",
      exercises: [
        createFixedExerciseDraft("Back Squat", "AUTO", "SQUAT", 6, 3),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH", 4, 3),
        createFixedExerciseDraft("Overhead Press", "AUTO", "OHP", 4, 5),
      ],
    },
  ];
}

function operatorSessionDrafts(): ProgramSessionDraft[] {
  return [
    {
      id: uid("session"),
      key: "D1",
      exercises: [
        createFixedExerciseDraft("Back Squat", "AUTO", "SQUAT"),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH"),
        createFixedExerciseDraft("Pull-Up", "AUTO", "PULL"),
      ],
    },
    {
      id: uid("session"),
      key: "D2",
      exercises: [
        createFixedExerciseDraft("Back Squat", "AUTO", "SQUAT"),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH"),
        createFixedExerciseDraft("Pull-Up", "AUTO", "PULL"),
      ],
    },
    {
      id: uid("session"),
      key: "D3",
      exercises: [
        createFixedExerciseDraft("Back Squat", "AUTO", "SQUAT"),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH"),
        createFixedExerciseDraft("Deadlift", "AUTO", "DEADLIFT"),
      ],
    },
  ];
}

function sessionKeysFromTargets(targets: string[]): string[] {
  if (targets.length <= 2) return ["A", "B"];
  if (targets.length === 3) return ["A", "B", "C"];
  if (targets.length >= 4) return ["1", "2", "3", "4"];
  return ["A", "B"];
}

export function inferSessionDraftsFromTemplate(template: ProgramTemplate): ProgramSessionDraft[] {
  const definition = template.latestVersion?.definition ?? {};
  if (definition?.kind === "manual" && Array.isArray(definition.sessions)) {
    const mapped = definition.sessions.map(sessionDraftFromManual).filter((entry: ProgramSessionDraft) => entry.key);
    if (mapped.length > 0) return mapped;
  }
  if (isOperatorTemplate(template)) {
    return operatorSessionDrafts();
  }

  if (definition?.kind === "asymptote") {
    return asymptoteSessionDrafts();
  }

  if (definition?.kind === "531") {
    const modules: string[] = Array.isArray(definition.modules) ? definition.modules as string[] : ["SQUAT", "BENCH", "DEADLIFT", "OHP"];
    const dayLabels = ["D1", "D2", "D3", "D4"];
    return modules.slice(0, 4).map((target, i) => ({
      id: uid("session"),
      key: dayLabels[i] ?? `D${i + 1}`,
      exercises: [createFixedExerciseDraft(defaultExerciseNameForTarget(target), "AUTO", target as ProgramProgressionTarget)],
    }));
  }

  const targets = normalizeTargets(definition);
  const keys = sessionKeysFromTargets(targets);
  const sessions = keys.map((key) => ({
    id: uid("session"),
    key,
    exercises: [] as ProgramExerciseDraft[],
  }));

  if (targets.length === 0) {
    sessions[0].exercises.push({
      id: uid("exercise"),
      exerciseName: defaultExerciseNameForTarget(template.name),
      mode: "MARKET",
      marketTemplateSlug: template.slug,
      sets: 5,
      reps: 5,
      note: "",
    });
    return sessions;
  }

  targets.forEach((target, index) => {
    const session = sessions[index % sessions.length];
    session.exercises.push({
      id: uid("exercise"),
      exerciseName: defaultExerciseNameForTarget(target),
      mode: "MARKET",
      marketTemplateSlug: template.slug,
      sets: 5,
      reps: 5,
      note: "",
    });
  });

  return sessions;
}

export function makeSessionKeys(rule: SessionRule): string[] {
  if (rule.type === "AB") return ["A", "B"];
  const count = Math.min(4, Math.max(1, Math.floor(rule.count)));
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

export function reconcileSessionsByKeys(
  current: ProgramSessionDraft[],
  nextKeys: string[],
): ProgramSessionDraft[] {
  const byKey = new Map(current.map((entry) => [entry.key, entry]));
  return nextKeys.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    return {
      id: uid("session"),
      key,
      exercises: [],
    };
  });
}

export function createEmptyExerciseDraft(
  defaultSlug: string | null = null,
  rowType: ProgramRowType | null = null,
): ProgramExerciseDraft {
  const operatorDefaults = rowType && isOperatorAutoRowType(rowType) ? resolveOperatorExerciseDefaults("", rowType) : null;
  return {
    id: uid("exercise"),
    exerciseName: "",
    mode: defaultSlug ? "MARKET" : "MANUAL",
    marketTemplateSlug: defaultSlug,
    rowType,
    progressionTarget: null,
    sets: operatorDefaults?.sets ?? 3,
    reps: operatorDefaults?.reps ?? 8,
    note: "",
  };
}

export function moveExerciseBetweenSessions(
  sessions: ProgramSessionDraft[],
  sourceSessionId: string,
  sourceExerciseId: string,
  targetSessionId: string,
  targetIndex: number,
): ProgramSessionDraft[] {
  const sourceSession = sessions.find((session) => session.id === sourceSessionId);
  if (!sourceSession) return sessions;
  const moving = sourceSession.exercises.find((exercise) => exercise.id === sourceExerciseId);
  if (!moving) return sessions;

  const cleaned = sessions.map((session) => {
    if (session.id !== sourceSessionId) return session;
    return {
      ...session,
      exercises: session.exercises.filter((exercise) => exercise.id !== sourceExerciseId),
    };
  });

  return cleaned.map((session) => {
    if (session.id !== targetSessionId) return session;
    const next = [...session.exercises];
    const insertIndex = Math.max(0, Math.min(targetIndex, next.length));
    next.splice(insertIndex, 0, moving);
    return {
      ...session,
      exercises: next,
    };
  });
}

export function reorderExercises(
  sessions: ProgramSessionDraft[],
  sessionId: string,
  sourceExerciseId: string,
  targetExerciseId: string,
): ProgramSessionDraft[] {
  return sessions.map((session) => {
    if (session.id !== sessionId) return session;
    const sourceIndex = session.exercises.findIndex((exercise) => exercise.id === sourceExerciseId);
    const targetIndex = session.exercises.findIndex((exercise) => exercise.id === targetExerciseId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return session;
    const next = [...session.exercises];
    const [moving] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moving);
    return {
      ...session,
      exercises: next,
    };
  });
}

export function toManualDefinition(
  sessions: ProgramSessionDraft[],
  options?: { operatorStyle?: boolean; programFamily?: string | null },
) {
  const normalized: ManualDefinitionSession[] = sessions.map((session) => ({
    key: session.key,
    name: `Session ${session.key}`,
    items: session.exercises.map((exercise) => ({
      exerciseName: exercise.exerciseName.trim() || "Unnamed Exercise",
      role: "MAIN",
      rowType: exercise.rowType ?? undefined,
      progressionTarget: exercise.progressionTarget ?? undefined,
      sets: Array.from({ length: Math.max(1, exercise.sets) }, (_, index) => ({
        setNumber: index + 1,
        reps: Math.max(1, Math.round(exercise.reps)),
        targetWeightKg: 0,
        note:
          exercise.note.trim() ||
          (exercise.mode === "MARKET" && exercise.marketTemplateSlug
            ? `based-on:${exercise.marketTemplateSlug}`
            : undefined),
      })),
    })),
  }));

  return {
    kind: "manual",
    operatorStyle: options?.operatorStyle === true,
    programFamily: options?.programFamily ?? undefined,
    sessions: normalized,
  };
}

export function hasAtLeastOneExercise(sessions: ProgramSessionDraft[]) {
  return sessions.some((session) => session.exercises.length > 0);
}

export function makeForkSlug(prefix: string) {
  const sanitized = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  const timestamp = Date.now().toString(36);
  return `${sanitized || "custom-program"}-${timestamp}`;
}
