// 공식 프로그램별 "커스터마이즈 보존" 메타의 단일 등록 지점.
//
// 커스터마이즈는 원본 프로그램을 fork → manual 정의로 저장하는데, fork는 새 slug를 받으므로
// slug 기반 식별이 깨진다. 그래서 fork 정의에는 `programFamily`를 박고(보존), 처방·진행이 그
// family로 원본 흐름을 되살린다. 그 연결이 과거 3곳(resolveProgramFamily / resolveManualProgramFamily
// / resolveAutoProgressionProgram)에 흩어져 있어 신규 프로그램마다 3곳을 고쳐야 했다(531이 reducer
// family 분기를 빠뜨려 안 됐던 게 그 함정). 이 레지스트리로 모으면 신규 프로그램은 여기 1엔트리 +
// seed definition의 `programFamily`만으로 보존된다.
//
// lib에 두어 model(lib)·generateSession(server)·reducer(server)가 모두 import한다(server→lib 정상).

export type ProgramFlowStyle = "uniform" | "slotted";

// fork 후 처방에 쓸 플래너.
//  - "generic": plannedExercisesFromManualSession (저장된 sets/reps) + family-target 무게 오버라이드
//  - "operator"/"asymptote"/...: 전용 슬롯/per-exercise 플래너 (무게를 직접 계산)
export type ManualPlannerKind =
  | "generic"
  | "operator"
  | "asymptote"
  | "wendler-531"
  | "slotted-lp"; // gzclp/texas — 슬롯별 독립 LP(per-slot workKg)

// 처방 세트에 무게를 채우는 방식.
//  - "family-target": reducer가 family 키(SQUAT/BENCH/...)로 굴린 workKg를 운동명→target 매핑으로 덮어씀
//  - "slotted-internal": 전용 플래너가 TM×coef 등으로 무게를 직접 계산(오버라이드 불필요)
//  - "none": 무게 진행 없음
export type WeightOverrideMode = "family-target" | "slotted-internal" | "none";

export type ProgramFamilyEntry = {
  family: string; // fork 정의에 박히는 programFamily (= 진짜 식별자)
  slugs: string[]; // 원본 seed slug(들)
  kinds: string[]; // 원본 definition.kind(들)
  flowStyle: ProgramFlowStyle;
  manualPlanner: ManualPlannerKind;
  progressionProgram: string; // reducer의 ProgressionProgram 키
  weightOverrideMode: WeightOverrideMode;
};

// 등록된 프로그램만 fork 후 자동진행이 보존된다. 슬롯형(531/gzclp/texas)은 전용 플래너 구현과
// 함께 단계적으로 추가된다 — 미등록이면 fork 시 일반 manual로 안전하게 떨어진다(자동진행만 빠짐).
export const PROGRAM_FAMILY_REGISTRY: ProgramFamilyEntry[] = [
  {
    family: "operator",
    slugs: ["operator"],
    kinds: ["operator"],
    flowStyle: "uniform",
    manualPlanner: "operator",
    progressionProgram: "operator",
    weightOverrideMode: "slotted-internal",
  },
  {
    family: "asymptote",
    slugs: ["asymptote-protocol", "asymptote"],
    kinds: ["asymptote"],
    flowStyle: "slotted",
    manualPlanner: "asymptote",
    progressionProgram: "asymptote",
    weightOverrideMode: "slotted-internal",
  },
  {
    family: "greyskull-lp",
    slugs: ["greyskull-lp"],
    kinds: ["greyskull-lp"],
    flowStyle: "uniform",
    manualPlanner: "generic",
    progressionProgram: "greyskull-lp",
    weightOverrideMode: "family-target",
  },
  {
    family: "starting-strength-lp",
    slugs: ["starting-strength-lp"],
    kinds: ["starting-strength-lp"],
    flowStyle: "uniform",
    manualPlanner: "generic",
    progressionProgram: "starting-strength-lp",
    weightOverrideMode: "family-target",
  },
  {
    family: "stronglifts-5x5",
    slugs: ["stronglifts-5x5"],
    kinds: ["stronglifts-5x5"],
    flowStyle: "uniform",
    manualPlanner: "generic",
    progressionProgram: "stronglifts-5x5",
    weightOverrideMode: "family-target",
  },
  {
    // FSL/BBB 보조는 슬롯 메타(assistance)로 보존되므로 family는 하나로 통합한다.
    family: "wendler-531",
    slugs: ["wendler-531", "wendler-531-fsl", "wendler-531-bbb"],
    kinds: ["531"],
    flowStyle: "slotted",
    manualPlanner: "wendler-531",
    progressionProgram: "wendler-531",
    weightOverrideMode: "slotted-internal",
  },
  {
    // gzclp: T1/T2/T3 tier 슬롯 — 같은 운동이라도 tier별로 독립 진행.
    family: "gzclp",
    slugs: ["gzclp"],
    kinds: ["gzclp"],
    flowStyle: "slotted",
    manualPlanner: "slotted-lp",
    progressionProgram: "gzclp",
    weightOverrideMode: "slotted-internal",
  },
  {
    // texas: 요일별(V/R/I) 슬롯 — 같은 운동이라도 요일별로 독립 진행.
    family: "texas-method",
    slugs: ["texas-method"],
    kinds: ["texas-method"],
    flowStyle: "slotted",
    manualPlanner: "slotted-lp",
    progressionProgram: "texas-method",
    weightOverrideMode: "slotted-internal",
  },
  {
    // madcow: 운동별 슬롯 — 월/수/금이 같은 탑세트 workKg를 공유하고 세트는 퍼센트로 파생된다.
    family: "madcow-5x5",
    slugs: ["madcow-5x5"],
    kinds: ["madcow-5x5"],
    flowStyle: "slotted",
    manualPlanner: "slotted-lp",
    progressionProgram: "madcow-5x5",
    weightOverrideMode: "slotted-internal",
  },
  {
    // reddit-ppl: 메인 리프트만 family LP로 굴리고 보조는 ASSIST(진행 제외)로 둔다.
    family: "reddit-ppl",
    slugs: ["reddit-ppl-6day"],
    kinds: ["reddit-ppl"],
    flowStyle: "uniform",
    manualPlanner: "generic",
    progressionProgram: "reddit-ppl",
    weightOverrideMode: "family-target",
  },
  {
    // phul: 파워데이 메인만 family LP. 근비대일은 전부 ASSIST라 같은 family를 두 번 굴리지 않는다.
    family: "phul",
    slugs: ["phul"],
    kinds: ["phul"],
    flowStyle: "uniform",
    manualPlanner: "generic",
    progressionProgram: "phul",
    weightOverrideMode: "family-target",
  },
  {
    // nsuns: 운동별 슬롯(TM) — 같은 리프트가 T1/T2로 여러 날 등장해도 TM 하나를 공유한다.
    family: "nsuns-lp",
    slugs: ["nsuns-lp-5day"],
    kinds: ["nsuns-lp"],
    flowStyle: "slotted",
    manualPlanner: "slotted-lp",
    progressionProgram: "nsuns-lp",
    weightOverrideMode: "slotted-internal",
  },
];

// 운동별 진행 슬롯 키(`EX_BENCH_PRESS`). operator의 per-exercise 키와 같은 규약으로,
// madcow/nsuns처럼 여러 요일이 한 운동의 workKg를 공유하는 프로그램이 이 키로 묶인다.
// model.ts(스토어 draft)·generateSession(처방)·seed가 같은 키를 만들어야 하므로 여기 단일 정의.
export function exerciseSlotKey(exerciseName: string): string {
  return `EX_${String(exerciseName)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)}`;
}

// 세트 무게를 슬롯 workKg의 퍼센트로 파생하는 family. 나머지 slotted-lp(gzclp/texas)는
// 전 세트가 동일 workKg라 percent를 무시한다 — 여기 추가하면 그 동작이 바뀌니 주의.
export function usesPercentDerivedSets(family: string | null | undefined): boolean {
  const normalized = String(family ?? "").trim().toLowerCase();
  return normalized === "madcow-5x5" || normalized === "nsuns-lp";
}

// slug / kind / family 중 하나로 레지스트리 엔트리를 찾는다. fork는 family로, 원본은 slug/kind로 매칭된다.
// 우선순위: family > slug > kind (fork의 family가 가장 신뢰도 높은 식별자).
export function lookupProgramFamily(opts: {
  slug?: string | null;
  kind?: string | null;
  family?: string | null;
}): ProgramFamilyEntry | null {
  const slug = String(opts.slug ?? "").trim().toLowerCase();
  const kind = String(opts.kind ?? "").trim().toLowerCase();
  const family = String(opts.family ?? "").trim().toLowerCase();

  if (family) {
    const byFamily = PROGRAM_FAMILY_REGISTRY.find((e) => e.family === family);
    if (byFamily) return byFamily;
  }
  if (slug) {
    const bySlug = PROGRAM_FAMILY_REGISTRY.find((e) => e.slugs.includes(slug));
    if (bySlug) return bySlug;
  }
  if (kind) {
    const byKind = PROGRAM_FAMILY_REGISTRY.find((e) => e.kinds.includes(kind));
    if (byKind) return byKind;
  }
  return null;
}
