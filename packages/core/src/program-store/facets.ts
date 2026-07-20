import { isRef5Template, type ProgramTemplate, type ProgramStoreLocale } from "./model";

/**
 * Program store filter facets.
 *
 * The store used to filter on one axis (category) by testing substrings against
 * the template's tags joined into a single string, with ko/en synonyms inlined
 * per branch. Adding axes that way multiplies the synonym tables and matches
 * across tag boundaries (a "beginner-friendly" tag would satisfy "beginner").
 *
 * This module is the single place a program is turned into normalized facet
 * values. Filters only ask "does this program carry this value", so a new axis
 * costs one entry here and nothing at the call sites.
 *
 * Derivation rules, and why they matter:
 * - Tag-based axes (goal/level/style) match tags **exactly**, never as
 *   substrings, and yield an empty set when the program says nothing. That is
 *   deliberate: user-created programs carry only ["manual","custom"], so an
 *   invented default would file every custom program under one value and make
 *   the filter lie.
 * - Definition-based axes (engine/frequency) are computed from data every
 *   program has, so custom programs stay filterable on those. The list
 *   bootstrap already loads `latestVersion.definition`, so this costs no
 *   extra query.
 */

export type ProgramFacetKey = "goal" | "level" | "engine" | "frequency" | "style";

export type ProgramFacetValues = Record<ProgramFacetKey, string[]>;

export type ProgramFacetOption = { value: string; label: string };

export type ProgramFacetGroup = {
  key: ProgramFacetKey;
  label: string;
  options: ProgramFacetOption[];
};

/** Selected values per axis. Empty or missing means "no constraint on this axis". */
export type ProgramFacetSelection = Partial<Record<ProgramFacetKey, string[]>>;

export const PROGRAM_FACET_KEYS: readonly ProgramFacetKey[] = [
  "goal",
  "level",
  "engine",
  "frequency",
  "style",
] as const;

function t(locale: ProgramStoreLocale, ko: string, en: string) {
  return locale === "ko" ? ko : en;
}

// Tag vocabularies. Every accepted spelling of a value lives here and nowhere
// else; matching is exact against a lowercased tag, so unrelated tags that
// merely contain one of these words cannot match.
const GOAL_TAGS: Record<string, string[]> = {
  strength: ["strength", "power", "근력"],
  hypertrophy: ["hypertrophy", "근비대"],
  endurance: ["endurance", "지구력"],
};

const LEVEL_TAGS: Record<string, string[]> = {
  beginner: ["beginner", "novice", "입문", "초보"],
  intermediate: ["intermediate", "중급"],
  advanced: ["advanced", "고급"],
};

const STYLE_TAGS: Record<string, string[]> = {
  linear: ["linear", "선형"],
  undulating: ["weekly-undulation", "undulating", "undulation", "파동"],
  block: ["block-periodization", "block", "블록"],
  adaptive: ["adaptive", "session-based", "적응형"],
};

function matchTagValues(tags: string[], vocabulary: Record<string, string[]>): string[] {
  const present = new Set(tags.map((tag) => String(tag).trim().toLowerCase()));
  return Object.entries(vocabulary)
    .filter(([, spellings]) => spellings.some((spelling) => present.has(spelling)))
    .map(([value]) => value);
}

function frequencyBucket(perWeek: number): string {
  return perWeek >= 5 ? "5plus" : String(perWeek);
}

/**
 * Weekly session counts a program supports.
 *
 * `schedule.sessionsPerWeek` covers the generated kinds; manual programs have no
 * schedule block, so their fixed session list stands in — a 3-session manual
 * program is trained 3 days a week. REF5 is session-based with no schedule at
 * all, and its detail screen advertises "주 2–4회", so it claims that whole
 * range here; leaving it empty would hide it from every frequency filter while
 * the detail screen said it fits.
 */
function frequencyValues(template: ProgramTemplate): string[] {
  if (isRef5Template(template)) return ["2", "3", "4"];

  const definition = template.latestVersion?.definition;
  const scheduled = definition?.schedule?.sessionsPerWeek;
  const perWeek =
    typeof scheduled === "number" && scheduled > 0
      ? scheduled
      : Array.isArray(definition?.sessions) && definition.sessions.length > 0
        ? definition.sessions.length
        : null;
  return perWeek == null ? [] : [frequencyBucket(perWeek)];
}

export function deriveProgramFacets(template: ProgramTemplate): ProgramFacetValues {
  const tags = Array.isArray(template.tags) ? template.tags : [];

  return {
    goal: matchTagValues(tags, GOAL_TAGS),
    level: matchTagValues(tags, LEVEL_TAGS),
    // Every program has a type, so this axis never drops custom programs.
    engine: [template.type === "LOGIC" ? "auto" : "fixed"],
    frequency: frequencyValues(template),
    style: matchTagValues(tags, STYLE_TAGS),
  };
}

export function programFacetGroupLabel(key: ProgramFacetKey, locale: ProgramStoreLocale) {
  switch (key) {
    case "goal":
      return t(locale, "목표", "Goal");
    case "level":
      return t(locale, "난이도", "Level");
    case "engine":
      return t(locale, "진행 방식", "Progression");
    case "frequency":
      return t(locale, "주간 빈도", "Frequency");
    case "style":
      return t(locale, "진행 스타일", "Style");
  }
}

export function programFacetValueLabel(
  key: ProgramFacetKey,
  value: string,
  locale: ProgramStoreLocale,
): string {
  if (key === "goal") {
    if (value === "strength") return t(locale, "근력", "Strength");
    if (value === "hypertrophy") return t(locale, "근비대", "Hypertrophy");
    if (value === "endurance") return t(locale, "지구력", "Endurance");
  }
  if (key === "level") {
    if (value === "beginner") return t(locale, "초급", "Beginner");
    if (value === "intermediate") return t(locale, "중급", "Intermediate");
    if (value === "advanced") return t(locale, "고급", "Advanced");
  }
  if (key === "engine") {
    if (value === "auto") return t(locale, "자동 진행", "Auto progression");
    if (value === "fixed") return t(locale, "세션 고정", "Fixed sessions");
  }
  if (key === "frequency") {
    if (value === "5plus") return t(locale, "주 5회 이상", "5+ days/wk");
    return t(locale, `주 ${value}회`, `${value} days/wk`);
  }
  if (key === "style") {
    if (value === "linear") return t(locale, "선형", "Linear");
    if (value === "undulating") return t(locale, "파동", "Undulating");
    if (value === "block") return t(locale, "블록", "Block");
    if (value === "adaptive") return t(locale, "적응형", "Adaptive");
  }
  return value;
}

// Frequency reads as a number, so sort it numerically; the other axes read best
// in their declared order (beginner → advanced, not alphabetical).
const VALUE_ORDER: Partial<Record<ProgramFacetKey, string[]>> = {
  goal: ["strength", "hypertrophy", "endurance"],
  level: ["beginner", "intermediate", "advanced"],
  engine: ["auto", "fixed"],
  frequency: ["2", "3", "4", "5plus"],
  style: ["linear", "undulating", "block", "adaptive"],
};

/**
 * Facet groups built from the programs actually on hand, so the sheet can only
 * offer values that match something. The previous hard-coded category list
 * offered "지구력" even though no seeded program carries an endurance tag, so
 * picking it always emptied the list.
 */
export function buildProgramFacetGroups(
  templates: ProgramTemplate[],
  locale: ProgramStoreLocale = "ko",
): ProgramFacetGroup[] {
  const present = new Map<ProgramFacetKey, Set<string>>(
    PROGRAM_FACET_KEYS.map((key) => [key, new Set<string>()]),
  );

  for (const template of templates) {
    const facets = deriveProgramFacets(template);
    for (const key of PROGRAM_FACET_KEYS) {
      for (const value of facets[key]) present.get(key)!.add(value);
    }
  }

  return PROGRAM_FACET_KEYS.flatMap((key) => {
    const values = [...(present.get(key) ?? [])];
    // A single option cannot narrow anything — it matches every program that
    // has the axis at all, so showing it is noise.
    if (values.length < 2) return [];
    const order = VALUE_ORDER[key] ?? [];
    values.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    });
    return [
      {
        key,
        label: programFacetGroupLabel(key, locale),
        options: values.map((value) => ({
          value,
          label: programFacetValueLabel(key, value, locale),
        })),
      },
    ];
  });
}

/** OR within an axis, AND across axes. */
export function matchesProgramFacets(
  facets: ProgramFacetValues,
  selection: ProgramFacetSelection,
): boolean {
  return PROGRAM_FACET_KEYS.every((key) => {
    const selected = selection[key];
    if (!selected || selected.length === 0) return true;
    return selected.some((value) => facets[key].includes(value));
  });
}

export function countSelectedFacets(selection: ProgramFacetSelection): number {
  return PROGRAM_FACET_KEYS.reduce(
    (total, key) => total + (selection[key]?.length ?? 0),
    0,
  );
}

export function toggleProgramFacet(
  selection: ProgramFacetSelection,
  key: ProgramFacetKey,
  value: string,
): ProgramFacetSelection {
  const current = selection[key] ?? [];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  const updated: ProgramFacetSelection = { ...selection, [key]: next };
  if (next.length === 0) delete updated[key];
  return updated;
}
