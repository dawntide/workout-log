import { mapExerciseNameToTarget } from "../strength-engine/target-mapping";
import { EXERCISE_NAMES } from "../exercise/catalog";
import {
  ASYMPTOTE_HYBRID_TM_PERCENT,
  ASYMPTOTE_SESSIONS,
  ASYMPTOTE_SESSION_LABELS,
} from "./asymptote-blueprint";

export { ASYMPTOTE_HYBRID_TM_PERCENT };
import { lookupProgramFamily } from "./program-registry";

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

// 슬롯형 프로그램(asymptote 등)에서 이 행이 차지하는 슬롯의 흐름 메타.
// 운동명은 유저가 교체해도, 슬롯의 흐름(coef·amrap)과 역할 설명은 슬롯에 종속된다.
export type ProgramSlotMeta = {
  role: { ko: string; en: string }; // 슬롯 역할 라벨(중강도/볼륨/폭발/메인/보조/T1…) — 유저에게 노출
  sessionKey: string; // 어느 세션 슬롯인지
  coef?: number; // TM 대비 슬롯 계수(asymptote 등 흐름 강도)
  amrap?: boolean; // 검증(AMRAP) 슬롯 여부
  assistance?: "main" | "fsl" | "bbb"; // 531 메인/보조(FSL·BBB) 슬롯 구분
  tier?: "T1" | "T2" | "T3"; // gzclp 계층
  texasRole?: "volume" | "recovery" | "intensity"; // texas 요일 역할
  progressionKey?: string; // 슬롯 독립 진행 키(gzclp/texas per-slot LP). 운동명 교체에 면역.
  startWeightKg?: number; // 슬롯 시작 워킹 무게(reducer workKg가 생기기 전 첫 세션 폴백)
};

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
  slot?: ProgramSlotMeta | null; // 슬롯형 프로그램에서만 채워진다
};

export type ProgramSessionDraft = {
  id: string;
  key: string;
  exercises: ProgramExerciseDraft[];
};

export type SessionRuleType = "NUMERIC";

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
    slot?: ProgramSlotMeta | null;
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
  if (target === "SQUAT") return EXERCISE_NAMES.highBarBackSquat;
  if (target === "BENCH") return "Bench Press";
  if (target === "DEADLIFT") return "Deadlift";
  if (target === "OHP") return "Overhead Press";
  if (target === "PULL") return "Pull-Up";
  return targetRaw || "Exercise";
}

// 정규 매퍼 재노출(audit §3.6). ProgramProgressionTarget ≡ StrengthTarget(동일 유니온).
export const inferProgressionTargetFromExerciseName = mapExerciseNameToTarget;

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

// 마켓 템플릿 소개글은 코드 사전(appCopyByLocale 패턴)을 정본으로 ko/en을 함께 둔다.
// 사용자 커스텀 프로그램은 이 맵에 slug가 없으므로 DB의 template.description으로 폴백한다.
const PROGRAM_DESCRIPTIONS: Record<ProgramStoreLocale, Partial<Record<string, string>>> = {
  ko: {
    operator:
      "전술 운동선수와 현장 요원을 위한 서브맥시멀 스트렝스 프로그램입니다. 실제 1RM의 90%를 훈련 최대 중량(TM)으로 사용해 스쿼트·벤치·데드리프트를 6주 파동으로 운영하며, 실패 직전까지 갈아 넣기보다 반복 가능한 고중량 훈련을 우선합니다. 매 사이클이 끝나면 TM을 조금씩 올려 장기적인 점진적 과부하를 유지합니다.",
    manual:
      "모든 운동·세트·횟수를 직접 설계하고 싶은 리프터를 위한 완전 개방형 수동 템플릿입니다. 자동 진행 엔진이 없어 각 세션을 작성한 그대로 기록합니다. 미리 짜인 시스템에 맞추기보다 전적인 통제권을 원할 때 잘 맞습니다.",
    "starting-strength-lp":
      "마크 리피토의 고전적인 초보자 선형 진행 프로그램입니다. 주 3회 A/B 전신 분할로 스쿼트·프레스·데드리프트·파워클린을 훈련하며, 작업 세트를 완료할 때마다 2.5~5kg을 더합니다. 군더더기를 걷어내고 복합 바벨 운동에 집중해 초보자 효과를 극대화합니다.",
    "stronglifts-5x5":
      "Mehdi가 대중화한 초보자 선형 진행 프로그램입니다. 스타팅 스트렝스와 비슷하지만 대부분의 메인 리프트를 5×5로 수행하고 데드리프트는 볼륨을 낮게 유지합니다. 중량은 작고 예측 가능한 폭으로 증가하며, 리셋 규칙이 단순해 초보자도 거의 마찰 없이 운영할 수 있습니다.",
    "texas-method":
      "세션마다 중량을 올리는 선형 성장을 졸업한 중급 리프터를 위한 주간 비선형(undulating) 진행 프로그램입니다. 한 주 안에 볼륨일·회복일·강도일을 배치해 스트레스·회복·최대 출력을 함께 순환시킵니다. 초보자 수준의 회복 속도는 지났지만 여전히 예측 가능한 진행을 원하는 사람에게 좋은 다리 역할을 합니다.",
    gzclp:
      "Cody LeFever가 만든 T1·T2·T3 계층 구조의 선형 진행 프로그램입니다. T1은 고중량 스트렝스 훈련, T2는 추가 볼륨, T3는 고반복 작업 능력과 근비대를 담당합니다. 고전적인 초보 LP보다 다양한 종목을 원하는 초보자와 초기 중급자에게 잘 맞습니다.",
    "wendler-531":
      "짐 웬들러의 5/3/1 기본 템플릿으로, 추가 보조 운동이 없습니다. 훈련 최대 중량(TM)의 90%를 기준으로 4주 사이클을 운영하고, 서브맥시멀 톱세트를 중심으로 구성하며, 각 메인 주차를 AMRAP 세트로 마무리해 장기적인 성장을 끌어냅니다. 메인 운동과 진행 엔진만 남긴 깔끔하고 미니멀한 버전입니다.",
    "wendler-531-fsl":
      "메인 세트 뒤에 First Set Last(FSL) 작업을 더한 5/3/1 변형입니다. 첫 작업 세트 중량을 5×5로 반복해, 원래 프로그램의 성격을 유지하면서 추가적인 기술 연습과 유용한 볼륨을 확보합니다. 5/3/1을 주차마다 더 알차게 만드는 가장 실용적인 방법 중 하나입니다.",
    "wendler-531-bbb":
      "메인 운동 뒤에 Boring But Big(BBB) 보조 운동을 더한 5/3/1 변형입니다. 이어지는 5×10 세트가 훨씬 큰 근비대·작업 능력 자극을 만들고, 핵심 진행은 여전히 5/3/1 톱세트에서 나옵니다. 스트렝스와 함께 더 큰 사이즈를 원하는 리프터를 위한 고볼륨 옵션입니다.",
    "greyskull-lp":
      "고전적인 바벨 기본기에 AMRAP 마지막 세트를 더한 초보자 선형 진행 프로그램입니다. 처음 두 작업 세트 뒤, 마지막 세트에서 최대한 많은 횟수를 시도해 그날 컨디션에 따라 볼륨이 자동으로 조절되도록 합니다. 진행은 단순하게 유지하면서도 초보자에게 더 많은 유연성과 선택적 보조 운동을 추가할 명확한 경로를 제공합니다.",
    "asymptote-protocol":
      "회복·영양·수면이 불안정한 중급 리프터를 위한 성과 기반(performance-gated) 스트렝스 프로그램입니다. 3개 세션(A/B/C)이 블록마다 적응·빌드·검증·디로드 네 단계를 순환하며, 훈련 최대 중량(TM)은 자동으로 오르지 않고 사이클 3의 AMRAP 검증을 통과해야만 갱신됩니다. 스쿼트·벤치·중량 풀업·데드리프트·오버헤드 프레스 5개 종목으로 구성되고, 보조 TM은 메인 종목에서 파생되며, 캘린더에 묶이지 않는 세션 기반 로테이션으로 진행됩니다.",
    "ref5-adaptive-strength":
      "불규칙한 주 2–4회 일정에 맞춰 다음 처방을 자동 결정하는 세션 기반 스트렝스 프로그램입니다. 하이바 스쿼트를 최우선으로 다섯 종목만 사용하며, 시작할 때 최근 기록이나 e1RM으로 첫 작업중량을 추천할 수 있습니다. 이후에는 실측 1RM 테스트나 AMRAP 없이 유효 반복과 종료 사유를 PASS·HOLD·FAIL·INVALID로 분류하고, 직접 작업 기준과 보조 상한을 독립 상태 머신이 조정합니다.",
  },
  en: {
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
    "ref5-adaptive-strength":
      "A session-based strength program for an irregular 2–4 day training schedule. High-bar squat stays first priority across exactly five lifts. Recent records or e1RM can suggest the first work loads; after start, there is no 1RM test or AMRAP. Valid reps and stop reasons produce PASS, HOLD, FAIL, or INVALID while an independent state machine manages direct work baselines and auxiliary caps without finite weeks or blocks.",
  },
};

function t(locale: ProgramStoreLocale, ko: string, en: string) {
  return locale === "ko" ? ko : en;
}

export function getProgramDescription(
  template: ProgramTemplate,
  locale: ProgramStoreLocale = "ko",
) {
  const override = PROGRAM_DESCRIPTIONS[locale]?.[template.slug];
  if (override) return override;
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

  if (isRef5Template(template)) {
    return t(
      locale,
      "주 2–4회 · 세션 기반 · 블록 없음",
      "2–4 days/wk · Session-based · No blocks",
    );
  }

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

  if (isRef5Template(template)) {
    const modules = Array.isArray(def.modules)
      ? (def.modules as string[])
      : ["SQUAT", "PULL", "BENCH", "DEADLIFT", "OHP"];
    return {
      scheduleLabel: t(
        locale,
        "주 2–4회 · 세션 기반 · 블록 없음",
        "2–4 days/wk · Session-based · No blocks",
      ),
      stats: [
        { key: "difficulty", label: statLabel("difficulty", locale), value: difficultyValue },
        { key: "frequency", label: statLabel("frequency", locale), value: t(locale, "주 2–4회", "2–4 days/wk") },
        { key: "cycle", label: statLabel("cycle", locale), value: t(locale, "블록 없음", "No blocks") },
        { key: "type", label: statLabel("type", locale), value: typeValue },
      ],
      // REF5는 런타임 상태가 다음 처방을 선택하므로 유한 A/B나 week/day 그리드를 만들지 않는다.
      sessions: null,
      modules,
      progressionNote: t(
        locale,
        "최근 기록/e1RM 첫 처방 · 직접 kg PASS/HOLD/FAIL/INVALID",
        "Recent records/e1RM first Rx · Direct kg PASS/HOLD/FAIL/INVALID",
      ),
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
          { name: EXERCISE_NAMES.highBarBackSquat, setsReps: "4×3+", hasAmrap: true },
          { name: "Bench Press", setsReps: "4×5", hasAmrap: false },
          { name: "Weighted Pull-Up", setsReps: "4×3+", hasAmrap: true },
        ],
      },
      {
        key: "B",
        exercises: [
          { name: EXERCISE_NAMES.highBarBackSquat, setsReps: "5×5", hasAmrap: false },
          { name: "Deadlift", setsReps: "3×3", hasAmrap: false },
          { name: "Weighted Pull-Up", setsReps: "3×8", hasAmrap: false },
        ],
      },
      {
        key: "C",
        exercises: [
          { name: EXERCISE_NAMES.highBarBackSquat, setsReps: "6×3", hasAmrap: false },
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
  if (canonical === "SQUAT") return EXERCISE_NAMES.highBarBackSquat;
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

// 앱의 asymptote 프로그램(= Asymptote × Async 하이브리드 엔진). slug/kind/family로 판별.
export function isAsymptoteTemplate(template: ProgramTemplate | null | undefined) {
  if (!template) return false;
  const slug = String(template.slug ?? "").trim().toLowerCase();
  const kind = String(template.latestVersion?.definition?.kind ?? "").trim().toLowerCase();
  return (
    slug === "asymptote-protocol" ||
    slug === "asymptote" ||
    kind === "asymptote" ||
    String(template.latestVersion?.definition?.programFamily ?? "").trim().toLowerCase() === "asymptote"
  );
}

// REF5는 일반 LOGIC fork family가 아니라 독립 엔진이다. 공개 식별자인 slug/kind/family만
// 판별하되 program-registry에는 등록하지 않아 일반 manual 커스터마이즈 의미로 변환되지 않게 한다.
export function isRef5Template(template: ProgramTemplate | null | undefined) {
  if (!template) return false;
  const definition = template.latestVersion?.definition ?? {};
  const slug = String(template.slug ?? "").trim().toLowerCase();
  const kind = String(definition?.kind ?? "").trim().toLowerCase();
  const family = String(definition?.family ?? "").trim().toLowerCase();
  return slug === "ref5-adaptive-strength" || kind === "ref5" || family === "ref5";
}

export type ProgramFlowStyle = "uniform" | "slotted";

// 프로그램의 자동진행 "무게 흐름"이 모든 운동에 균일한가(uniform), 세션마다 슬롯별로 다른가(slotted).
//  - uniform(operator 등): 운동 구성 자유. 각 AUTO 운동이 같은 주차 스킴을 따른다.
//  - slotted(asymptote 등): 슬롯마다 흐름이 달라, 운동을 슬롯에 끼워넣어야 흐름이 유지된다.
export function programFlowStyle(
  template: ProgramTemplate | null | undefined,
): ProgramFlowStyle {
  if (!template) return "uniform";
  const definition = template.latestVersion?.definition ?? {};
  const familyHint =
    String(definition?.programFamily ?? "").trim().toLowerCase() ||
    (definition?.operatorStyle === true ? "operator" : "");
  const entry = lookupProgramFamily({
    slug: template.slug,
    kind: definition?.kind,
    family: familyHint,
  });
  return entry?.flowStyle ?? "uniform";
}

// 커스터마이즈 fork를 저장할 때 보존할 자동진행 family. 처방 엔진(generateSession)과 진행 리듀서가
// 이 값으로 해당 프로그램의 무게 흐름을 되살린다. 미지원 family는 null(=수동 manual로 저장).
export function resolveProgramFamily(
  template: ProgramTemplate | null | undefined,
): string | null {
  if (!template) return null;
  const definition = template.latestVersion?.definition ?? {};
  const familyHint =
    String(definition?.programFamily ?? "").trim().toLowerCase() ||
    (definition?.operatorStyle === true ? "operator" : "");
  const entry = lookupProgramFamily({
    slug: template.slug,
    kind: definition?.kind,
    family: familyHint,
  });
  return entry?.family ?? null;
}

function manualExerciseKey(exerciseName: string) {
  return `EX_${exerciseName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)}`;
}

/**
 * manualExerciseKey의 역연산. per-exercise 키(`EX_BENCH_PRESS`)를 family 매핑에 쓸 수 있는
 * 운동명 형태(`"BENCH PRESS"`)로 되돌린다. 원본 운동명을 정확히 복원하는 것이 목적이 아니라
 * mapExerciseNameToTarget이 substring으로 family를 찾을 수 있는 형태면 충분하다. 비-EX_ 키는 그대로 반환.
 */
export function decodeExerciseKey(key: string): string {
  const raw = String(key ?? "").trim();
  return raw.startsWith("EX_") ? raw.slice(3).replace(/_/g, " ").trim() : raw;
}

/**
 * per-exercise(EX_) baseline 키가 묶이는 family canonical 키(SQUAT/BENCH/...)를 반환한다.
 * 프로그램 시작 시 fallbackKey를 만드는 것과 동일한 정규 매퍼(mapExerciseNameToTarget)를 사용하므로,
 * "시작 시 펼친 family 그림자 키"를 표시 단계에서 그대로 되접을 수 있다. canonical/비-EX_/미매핑 키는 null.
 */
export function familyFallbackKeyForBaselineKey(key: string): string | null {
  const raw = String(key ?? "").trim();
  if (!raw.startsWith("EX_")) return null;
  return mapExerciseNameToTarget(decodeExerciseKey(raw));
}

/**
 * 평면 strength baseline 키 집합에서, per-exercise(EX_) 키와 짝을 이루는 family canonical 키
 * (예: `EX_BENCH_PRESS` ↔ `BENCH`)를 "그림자"로 보고 표시 대상에서 제외한 키 목록을 반환한다.
 * 입력 순서는 보존한다. 짝이 없는 canonical 키(EX_ 키를 안 쓰는 LOGIC 프로그램 등)나
 * family로 매핑되지 않는 EX_ 키는 그대로 유지된다.
 */
export function selectDisplayStrengthBaselineKeys(keys: string[]): string[] {
  const present = keys.map((key) => String(key ?? "").trim()).filter(Boolean);
  const presentSet = new Set(present);
  const shadowed = new Set<string>();
  for (const key of presentSet) {
    const family = familyFallbackKeyForBaselineKey(key);
    if (family && presentSet.has(family)) shadowed.add(family);
  }
  return present.filter((key, index) => present.indexOf(key) === index && !shadowed.has(key));
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
  if (isRef5Template(template)) return [];
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
        slot: (item?.slot as ProgramSlotMeta | null | undefined) ?? null,
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
  slot: ProgramSlotMeta | null = null,
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
    slot,
  };
}

export function resolveOperatorExerciseDefaults(
  rowType: ProgramRowType | null | undefined,
): ProgramSetRepDefaults {
  if (rowType === "CUSTOM") {
    return { sets: 3, reps: 8 };
  }

  return { sets: 3, reps: 5 };
}

function asymptoteSessionDrafts(): ProgramSessionDraft[] {
  // 슬롯 구성은 asymptote-blueprint(단일 진실원)에서 가져온다. 각 슬롯의 흐름 메타(coef·amrap·
  // 역할 라벨)를 draft에 실어, 커스터마이즈 시트가 슬롯 역할을 표시하고 저장 시 보존할 수 있게 한다.
  return Object.entries(ASYMPTOTE_SESSIONS).map(([sessionNum, rows]) => {
    const sessionKey = ASYMPTOTE_SESSION_LABELS[Number(sessionNum)] ?? sessionNum;
    return {
      id: uid("session"),
      key: sessionKey,
      exercises: rows.map((row) =>
        createFixedExerciseDraft(row.name, "AUTO", row.target, row.sets, row.reps, {
          role: row.role,
          coef: row.coef,
          amrap: row.amrap,
          sessionKey,
        }),
      ),
    };
  });
}

// gzclp/texas note("T1 main"/"volume day"…)에서 슬롯 역할·시작무게를 만든다.
// 진행키는 sessionKey+슬롯인덱스 기반(`{sessionKey}_s{index}`) 고정 ID — 운동명/note가 바뀌어도
// 진행 정체성이 유지된다(note 리워딩 표류 면역). server의 원본(미-fork) 동적 추론도 이 함수를 재사용한다.
export function buildSlottedLpSlot(
  note: string,
  family: string,
  sessionKey: string,
  index: number,
  startWeightKg: number,
): ProgramSlotMeta {
  const progressionKey = `${sessionKey}_s${index}`;
  const startW = startWeightKg > 0 ? startWeightKg : undefined;
  const n = note.toLowerCase();
  if (family === "gzclp") {
    const tier: "T1" | "T2" | "T3" = n.includes("t1")
      ? "T1"
      : n.includes("t2")
        ? "T2"
        : n.includes("t3")
          ? "T3"
          : index === 0
            ? "T1"
            : index === 1
              ? "T2"
              : "T3";
    const label = tier === "T1" ? "T1 · 메인" : tier === "T2" ? "T2 · 볼륨" : "T3 · 보조";
    return { role: { ko: label, en: tier }, sessionKey, tier, progressionKey, startWeightKg: startW };
  }
  // texas: 요일 역할(볼륨/회복/강도)
  const texasRole: "volume" | "recovery" | "intensity" | undefined = n.includes("volume")
    ? "volume"
    : n.includes("recovery")
      ? "recovery"
      : n.includes("intensity")
        ? "intensity"
        : undefined;
  const label =
    texasRole === "volume"
      ? "볼륨일"
      : texasRole === "recovery"
        ? "회복일"
        : texasRole === "intensity"
          ? "강도일"
          : sessionKey;
  return { role: { ko: label, en: texasRole ?? sessionKey }, sessionKey, texasRole, progressionKey, startWeightKg: startW };
}

function slottedLpSessionDrafts(sessions: any[], family: string): ProgramSessionDraft[] {
  return sessions.map((session: any) => {
    const sessionKey = String(session?.key ?? "").trim() || "D1";
    const items = Array.isArray(session?.items) ? session.items : [];
    return {
      id: uid("session"),
      key: sessionKey,
      exercises: items.map((item: any, idx: number) => {
        const name =
          String(item?.exerciseName ?? item?.name ?? "").trim() || `Exercise ${idx + 1}`;
        const target = inferProgressionTargetFromExerciseName(name);
        const setRows = Array.isArray(item?.sets) ? item.sets : [];
        const first = setRows[0] ?? {};
        const note = String(first?.note ?? item?.note ?? "");
        const startWeightKg = Number(first?.targetWeightKg) || 0;
        // fork 재편집 시 기존 slot 보존(progressionKey 안정), 원본 seed는 note에서 추론.
        const existing = (item?.slot ?? null) as ProgramSlotMeta | null;
        const slot =
          existing && existing.progressionKey
            ? existing
            : buildSlottedLpSlot(note, family, sessionKey, idx, startWeightKg);
        return createFixedExerciseDraft(
          name,
          "AUTO",
          target,
          Math.max(1, setRows.length || 1),
          Math.max(1, Number(first?.reps) || 5),
          slot,
        );
      }),
    };
  });
}

function operatorSessionDrafts(): ProgramSessionDraft[] {
  return [
    {
      id: uid("session"),
      key: "D1",
      exercises: [
        createFixedExerciseDraft(EXERCISE_NAMES.highBarBackSquat, "AUTO", "SQUAT"),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH"),
        createFixedExerciseDraft("Pull-Up", "AUTO", "PULL"),
      ],
    },
    {
      id: uid("session"),
      key: "D2",
      exercises: [
        createFixedExerciseDraft(EXERCISE_NAMES.highBarBackSquat, "AUTO", "SQUAT"),
        createFixedExerciseDraft("Bench Press", "AUTO", "BENCH"),
        createFixedExerciseDraft("Pull-Up", "AUTO", "PULL"),
      ],
    },
    {
      id: uid("session"),
      key: "D3",
      exercises: [
        createFixedExerciseDraft(EXERCISE_NAMES.highBarBackSquat, "AUTO", "SQUAT"),
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
  // gzclp/texas: kind=manual이지만 슬롯(tier/요일)별 독립 진행이라, sessionDraftFromManual 대신
  // 슬롯 메타(tier·진행키·시작무게)를 주입하는 전용 빌더를 먼저 탄다.
  const slottedLpFamily = resolveProgramFamily(template);
  if (
    (slottedLpFamily === "gzclp" || slottedLpFamily === "texas-method") &&
    Array.isArray(definition.sessions)
  ) {
    return slottedLpSessionDrafts(definition.sessions, slottedLpFamily);
  }
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
    const assistance531 = String(definition.assistance ?? "NONE").trim().toUpperCase();
    return modules.slice(0, 4).map((target, i) => {
      const sessionKey = dayLabels[i] ?? `D${i + 1}`;
      const exerciseName = defaultExerciseNameForTarget(target);
      const exercises: ProgramExerciseDraft[] = [
        createFixedExerciseDraft(exerciseName, "AUTO", target as ProgramProgressionTarget, 3, 5, {
          role: { ko: "메인 5/3/1", en: "Main 5/3/1" },
          sessionKey,
          assistance: "main",
        }),
      ];
      if (assistance531 === "FSL") {
        exercises.push(
          createFixedExerciseDraft(exerciseName, "AUTO", target as ProgramProgressionTarget, 5, 5, {
            role: { ko: "보조 · FSL 5×5", en: "Assist · FSL 5×5" },
            sessionKey,
            assistance: "fsl",
          }),
        );
      } else if (assistance531 === "BBB") {
        exercises.push(
          createFixedExerciseDraft(exerciseName, "AUTO", target as ProgramProgressionTarget, 5, 10, {
            role: { ko: "보조 · BBB 5×10", en: "Assist · BBB 5×10" },
            sessionKey,
            assistance: "bbb",
          }),
        );
      }
      return { id: uid("session"), key: sessionKey, exercises };
    });
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
  const count = Math.min(7, Math.max(1, Math.floor(rule.count)));
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
  const operatorDefaults = rowType && isOperatorAutoRowType(rowType) ? resolveOperatorExerciseDefaults(rowType) : null;
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
      slot: exercise.slot ?? undefined,
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
