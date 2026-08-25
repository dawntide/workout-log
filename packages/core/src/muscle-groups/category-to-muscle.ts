import { EXERCISE_CATALOG } from "../exercise/all-exercises";

export type MuscleGroup =
  | "Quad"
  | "Hamstring"
  | "Glute"
  | "Back"
  | "Chest"
  | "Shoulder"
  | "Arm"
  | "Core"
  | "Other";

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  "Quad",
  "Hamstring",
  "Glute",
  "Back",
  "Chest",
  "Shoulder",
  "Arm",
  "Core",
  "Other",
] as const;

export type MuscleContribution = Partial<Record<MuscleGroup, number>>;

const CATEGORY_PRIMARY: Record<string, MuscleGroup> = {
  legs: "Quad",
  leg: "Quad",
  glute: "Glute",
  glutes: "Glute",
  back: "Back",
  chest: "Chest",
  shoulder: "Shoulder",
  shoulders: "Shoulder",
  "olympic lift": "Back",
  arm: "Arm",
  arms: "Arm",
  core: "Core",
};

const EXERCISE_CONTRIBUTIONS: Record<string, MuscleContribution> = {
  // Seed exercises (web/src/server/db/seed.ts)
  highbarbacksquat: { Quad: 1.0, Glute: 0.5 },
  lowbarbacksquat: { Quad: 0.8, Glute: 0.7, Hamstring: 0.3, Back: 0.2 },
  backsquat: { Quad: 1.0, Glute: 0.5 },
  benchpress: { Chest: 1.0, Shoulder: 0.3, Arm: 0.3 },
  deadlift: { Back: 1.0, Hamstring: 0.7, Glute: 0.5 },
  overheadpress: { Shoulder: 1.0, Arm: 0.4 },
  barbellrow: { Back: 1.0, Arm: 0.4 },
  pullup: { Back: 1.0, Arm: 0.4 },
  weightedpullup: { Back: 1.0, Arm: 0.4 },
  powerclean: { Back: 0.7, Glute: 0.7, Hamstring: 0.5, Quad: 0.5, Shoulder: 0.4 },
  frontsquat: { Quad: 1.0, Glute: 0.4, Core: 0.4 },
  inclinebenchpress: { Chest: 1.0, Shoulder: 0.5, Arm: 0.3 },
  romaniandeadlift: { Hamstring: 1.0, Glute: 0.6, Back: 0.4 },
  legpress: { Quad: 1.0, Glute: 0.5 },
  latpulldown: { Back: 1.0, Arm: 0.4 },
  dumbbellshoulderpress: { Shoulder: 1.0, Arm: 0.4 },
  hipthrust: { Glute: 1.0, Hamstring: 0.4 },

  // Common variants
  squat: { Quad: 1.0, Glute: 0.5 },
  sumodeadlift: { Back: 0.8, Hamstring: 0.6, Glute: 0.8, Quad: 0.4 },
  conventionaldeadlift: { Back: 1.0, Hamstring: 0.7, Glute: 0.5 },
  dumbbellbenchpress: { Chest: 1.0, Shoulder: 0.3, Arm: 0.3 },
  inclinedumbbellpress: { Chest: 1.0, Shoulder: 0.5, Arm: 0.3 },
  bentoverrow: { Back: 1.0, Arm: 0.4 },
  cablerow: { Back: 1.0, Arm: 0.3 },
  seatedrow: { Back: 1.0, Arm: 0.3 },
  tbarrow: { Back: 1.0, Arm: 0.4 },
  bicepcurl: { Arm: 1.0 },
  barbellcurl: { Arm: 1.0 },
  dumbbellcurl: { Arm: 1.0 },
  hammercurl: { Arm: 1.0 },
  tricepextension: { Arm: 1.0 },
  tricepspushdown: { Arm: 1.0 },
  skullcrusher: { Arm: 1.0 },
  closegripbenchpress: { Arm: 0.7, Chest: 0.7, Shoulder: 0.3 },
  lateralraise: { Shoulder: 1.0 },
  frontraise: { Shoulder: 1.0 },
  rearlateralraise: { Shoulder: 0.8, Back: 0.4 },
  facepull: { Shoulder: 0.7, Back: 0.5 },
  shrug: { Back: 1.0 },
  plank: { Core: 1.0 },
  abrollout: { Core: 1.0 },
  hangingleg: { Core: 1.0 },
  legraise: { Core: 1.0 },
  legcurl: { Hamstring: 1.0 },
  legextension: { Quad: 1.0 },
  lunge: { Quad: 0.8, Glute: 0.7, Hamstring: 0.3 },
  bulgariansplitsquat: { Quad: 0.8, Glute: 0.7 },
  gobletsquat: { Quad: 1.0, Glute: 0.5 },
  pushup: { Chest: 1.0, Shoulder: 0.3, Arm: 0.3 },
  dip: { Chest: 0.7, Arm: 0.7, Shoulder: 0.3 },
  chinup: { Back: 1.0, Arm: 0.5 },
  calfraise: { Hamstring: 0.2 },
  goodmorning: { Hamstring: 1.0, Glute: 0.5, Back: 0.4 },
  gluteham: { Hamstring: 1.0, Glute: 0.7 },
  hipthruster: { Glute: 1.0, Hamstring: 0.4 },
};

function normalizeExerciseKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizeCategoryKey(category: string | null | undefined): string | null {
  if (!category) return null;
  const trimmed = category.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * 카탈로그 항목의 `muscles`를 이름으로 찾는다. 오픈 데이터 종목이 여기 걸린다.
 *
 * 지연 초기화하는 이유: 이 모듈은 `catalog.ts`가 타입만 가져가는 쪽이라 런타임
 * 순환은 없지만, 모듈 로드 시점에 카탈로그 755종을 훑으면 초기화가 그만큼 늦어진다.
 */
let catalogMusclesByName: Map<string, MuscleContribution> | null = null;

function lookupCatalogMuscles(exerciseName: string): MuscleContribution | null {
  if (!catalogMusclesByName) {
    catalogMusclesByName = new Map();
    for (const item of EXERCISE_CATALOG) {
      if (!item.muscles || Object.keys(item.muscles).length === 0) continue;
      catalogMusclesByName.set(item.name.trim().toLowerCase(), item.muscles);
    }
  }
  return catalogMusclesByName.get(exerciseName.trim().toLowerCase()) ?? null;
}

export function resolveMuscleContribution(
  exerciseName: string,
  category: string | null | undefined,
): MuscleContribution {
  const exerciseKey = normalizeExerciseKey(exerciseName);
  // 수기 가중치가 최우선이다 — 큐레이션이 오픈 데이터보다 정확하다.
  if (exerciseKey && EXERCISE_CONTRIBUTIONS[exerciseKey]) {
    return EXERCISE_CONTRIBUTIONS[exerciseKey];
  }

  // 그다음이 카탈로그의 muscles(오픈 데이터의 primary/secondary 변환값).
  const fromCatalog = lookupCatalogMuscles(exerciseName);
  if (fromCatalog) return fromCatalog;

  const categoryKey = normalizeCategoryKey(category);
  if (categoryKey && CATEGORY_PRIMARY[categoryKey]) {
    return { [CATEGORY_PRIMARY[categoryKey]]: 1.0 };
  }

  return { Other: 1.0 };
}

export function resolvePrimaryMuscleGroup(
  exerciseName: string,
  category: string | null | undefined,
): MuscleGroup {
  const contribution = resolveMuscleContribution(exerciseName, category);
  let bestGroup: MuscleGroup = "Other";
  let bestWeight = -1;
  for (const group of MUSCLE_GROUPS) {
    const weight = contribution[group];
    if (weight !== undefined && weight > bestWeight) {
      bestWeight = weight;
      bestGroup = group;
    }
  }
  return bestGroup;
}
