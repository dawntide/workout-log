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
  backsquat: { Quad: 1.0, Glute: 0.5 },
  benchpress: { Chest: 1.0, Shoulder: 0.3, Arm: 0.3 },
  deadlift: { Back: 1.0, Hamstring: 0.7, Glute: 0.5 },
  overheadpress: { Shoulder: 1.0, Arm: 0.4 },
  barbellrow: { Back: 1.0, Arm: 0.4 },
  pullup: { Back: 1.0, Arm: 0.4 },
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

export function resolveMuscleContribution(
  exerciseName: string,
  category: string | null | undefined,
): MuscleContribution {
  const exerciseKey = normalizeExerciseKey(exerciseName);
  if (exerciseKey && EXERCISE_CONTRIBUTIONS[exerciseKey]) {
    return EXERCISE_CONTRIBUTIONS[exerciseKey];
  }

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
