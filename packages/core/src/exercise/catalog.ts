export const EXERCISE_NAMES = {
  highBarBackSquat: "High-Bar Back Squat",
  lowBarBackSquat: "Low-Bar Back Squat",
  frontSquat: "Front Squat",
  benchPress: "Bench Press",
  deadlift: "Deadlift",
  overheadPress: "Overhead Press",
  barbellRow: "Barbell Row",
  pullUp: "Pull-Up",
  weightedPullUp: "Weighted Pull-Up",
  powerClean: "Power Clean",
  inclineBenchPress: "Incline Bench Press",
  romanianDeadlift: "Romanian Deadlift",
  legPress: "Leg Press",
  latPulldown: "Lat Pulldown",
  dumbbellShoulderPress: "Dumbbell Shoulder Press",
  hipThrust: "Hip Thrust",
} as const;

export type ExerciseCatalogItem = {
  name: (typeof EXERCISE_NAMES)[keyof typeof EXERCISE_NAMES];
  category: string;
  aliases: readonly string[];
};

/** Temporary resolution bridge while application code and the data migration roll out. */
export const LEGACY_EXERCISE_NAME_FALLBACKS: Readonly<Record<string, string>> = {
  [EXERCISE_NAMES.highBarBackSquat]: "Back Squat",
  [EXERCISE_NAMES.weightedPullUp]: EXERCISE_NAMES.pullUp,
};

/**
 * Shared canonical exercise taxonomy.
 *
 * `Back Squat` remains an input alias for historical clients and records, but
 * is not a canonical exercise: all existing ambiguous Back Squat data is known
 * to be high-bar. New squat records must select an explicit variation.
 */
export const EXERCISE_CATALOG = [
  {
    name: EXERCISE_NAMES.highBarBackSquat,
    category: "Legs",
    aliases: [
      "Back Squat",
      "High Bar Back Squat",
      "High-Bar Squat",
      "High Bar Squat",
      "Squat",
      "스쿼트",
      "하이바 스쿼트",
      "하이바 백스쿼트",
    ],
  },
  {
    name: EXERCISE_NAMES.lowBarBackSquat,
    category: "Legs",
    aliases: [
      "Low Bar Back Squat",
      "Low-Bar Squat",
      "Low Bar Squat",
      "로우바 스쿼트",
      "로우바 백스쿼트",
    ],
  },
  {
    name: EXERCISE_NAMES.frontSquat,
    category: "Legs",
    aliases: ["FSQ", "프론트 스쿼트"],
  },
  {
    name: EXERCISE_NAMES.benchPress,
    category: "Chest",
    aliases: ["Bench", "벤치프레스"],
  },
  {
    name: EXERCISE_NAMES.deadlift,
    category: "Back",
    aliases: ["DL", "데드리프트"],
  },
  {
    name: EXERCISE_NAMES.overheadPress,
    category: "Shoulder",
    aliases: ["OHP", "Press", "밀리터리 프레스"],
  },
  {
    name: EXERCISE_NAMES.barbellRow,
    category: "Back",
    aliases: ["BB Row", "바벨 로우"],
  },
  {
    name: EXERCISE_NAMES.pullUp,
    category: "Back",
    aliases: ["Pull Up", "풀업", "턱걸이"],
  },
  {
    name: EXERCISE_NAMES.weightedPullUp,
    category: "Back",
    aliases: ["Weighted Pull Up", "Weighted Pullup", "중량 풀업", "중량풀업"],
  },
  {
    name: EXERCISE_NAMES.powerClean,
    category: "Olympic Lift",
    aliases: ["Clean", "파워 클린", "파워클린"],
  },
  {
    name: EXERCISE_NAMES.inclineBenchPress,
    category: "Chest",
    aliases: ["인클라인 벤치"],
  },
  {
    name: EXERCISE_NAMES.romanianDeadlift,
    category: "Legs",
    aliases: ["RDL", "루마니안 데드리프트"],
  },
  {
    name: EXERCISE_NAMES.legPress,
    category: "Legs",
    aliases: ["레그 프레스"],
  },
  {
    name: EXERCISE_NAMES.latPulldown,
    category: "Back",
    aliases: ["랫풀다운", "Lat Pull"],
  },
  {
    name: EXERCISE_NAMES.dumbbellShoulderPress,
    category: "Shoulder",
    aliases: ["덤벨 숄더 프레스", "DB Shoulder Press"],
  },
  {
    name: EXERCISE_NAMES.hipThrust,
    category: "Glute",
    aliases: ["힙 쓰러스트"],
  },
] as const satisfies readonly ExerciseCatalogItem[];
