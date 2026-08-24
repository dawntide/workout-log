export const EXERCISE_NAMES = {
  highBarBackSquat: "High-Bar Back Squat",
  lowBarBackSquat: "Low-Bar Back Squat",
  frontSquat: "Front Squat",
  benchPress: "Bench Press",
  deadlift: "Deadlift",
  sumoDeadlift: "Sumo Deadlift",
  closeGripBenchPress: "Close-Grip Bench Press",
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
  // PPL·PHUL 보조 운동. 진행 추적 대상이 아니라 처방·기록용이다.
  seatedRow: "Seated Row",
  dumbbellRow: "Dumbbell Row",
  facePull: "Face Pull",
  lateralRaise: "Lateral Raise",
  bicepCurl: "Bicep Curl",
  hammerCurl: "Hammer Curl",
  tricepsPushdown: "Triceps Pushdown",
  tricepsExtension: "Triceps Extension",
  skullcrusher: "Skullcrusher",
  chestFly: "Chest Fly",
  inclineDumbbellBenchPress: "Incline Dumbbell Bench Press",
  legCurl: "Leg Curl",
  legExtension: "Leg Extension",
  calfRaise: "Calf Raise",
  lunge: "Lunge",
} as const;

/**
 * 종목이 쓰는 장비. 부위(`category`)와는 다른 축이다.
 *
 * 지금 이 값을 읽는 곳은 플레이트 계산기 하나뿐이고 `barbell`만 노출 대상이지만,
 * 프로그램 스토어의 장비 필터·통계 분해에도 쓸 수 있게 종류를 나눠 둔다.
 * 카탈로그에 없는 사용자 생성 운동은 `unknown`으로 떨어진다.
 */
export type ExerciseEquipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "unknown";

export type ExerciseCatalogItem = {
  name: (typeof EXERCISE_NAMES)[keyof typeof EXERCISE_NAMES];
  category: string;
  aliases: readonly string[];
  equipment: ExerciseEquipment;
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
    equipment: "barbell",
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
    equipment: "barbell",
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
    equipment: "barbell",
    aliases: ["FSQ", "프론트 스쿼트"],
  },
  {
    name: EXERCISE_NAMES.benchPress,
    category: "Chest",
    equipment: "barbell",
    aliases: ["Bench", "벤치프레스"],
  },
  {
    name: EXERCISE_NAMES.deadlift,
    category: "Back",
    equipment: "barbell",
    aliases: ["DL", "데드리프트"],
  },
  {
    name: EXERCISE_NAMES.sumoDeadlift,
    category: "Back",
    equipment: "barbell",
    aliases: ["Sumo DL", "스모 데드리프트"],
  },
  {
    name: EXERCISE_NAMES.closeGripBenchPress,
    category: "Chest",
    equipment: "barbell",
    aliases: ["CGBP", "Close Grip Bench Press", "클로즈그립 벤치"],
  },
  {
    name: EXERCISE_NAMES.overheadPress,
    category: "Shoulder",
    equipment: "barbell",
    aliases: ["OHP", "Press", "밀리터리 프레스"],
  },
  {
    name: EXERCISE_NAMES.barbellRow,
    category: "Back",
    equipment: "barbell",
    aliases: ["BB Row", "바벨 로우"],
  },
  {
    name: EXERCISE_NAMES.pullUp,
    category: "Back",
    equipment: "bodyweight",
    aliases: [
      "Pull Up",
      "Weighted Pull-Up",
      "Weighted Pull Up",
      "Weighted Pullup",
      "풀업",
      "중량 풀업",
      "중량풀업",
      "턱걸이",
    ],
  },
  {
    name: EXERCISE_NAMES.powerClean,
    category: "Olympic Lift",
    equipment: "barbell",
    aliases: ["Clean", "파워 클린", "파워클린"],
  },
  {
    name: EXERCISE_NAMES.inclineBenchPress,
    category: "Chest",
    equipment: "barbell",
    aliases: ["인클라인 벤치"],
  },
  {
    name: EXERCISE_NAMES.romanianDeadlift,
    category: "Legs",
    equipment: "barbell",
    aliases: ["RDL", "루마니안 데드리프트"],
  },
  {
    name: EXERCISE_NAMES.legPress,
    category: "Legs",
    equipment: "machine",
    aliases: ["레그 프레스"],
  },
  {
    name: EXERCISE_NAMES.latPulldown,
    category: "Back",
    equipment: "cable",
    aliases: ["랫풀다운", "Lat Pull"],
  },
  {
    name: EXERCISE_NAMES.dumbbellShoulderPress,
    category: "Shoulder",
    equipment: "dumbbell",
    aliases: ["덤벨 숄더 프레스", "DB Shoulder Press"],
  },
  {
    name: EXERCISE_NAMES.hipThrust,
    category: "Glute",
    equipment: "barbell",
    aliases: ["힙 쓰러스트"],
  },
  {
    name: EXERCISE_NAMES.seatedRow,
    category: "Back",
    equipment: "cable",
    aliases: ["Cable Row", "Seated Cable Row", "시티드 로우", "케이블 로우"],
  },
  {
    name: EXERCISE_NAMES.dumbbellRow,
    category: "Back",
    equipment: "dumbbell",
    aliases: ["One Arm Row", "Bent Over One Arm Row", "DB Row", "덤벨 로우", "원암 로우"],
  },
  {
    name: EXERCISE_NAMES.facePull,
    category: "Shoulder",
    equipment: "cable",
    aliases: ["페이스 풀"],
  },
  {
    name: EXERCISE_NAMES.lateralRaise,
    category: "Shoulder",
    equipment: "dumbbell",
    aliases: ["Side Raise", "사이드 레터럴 레이즈", "레터럴 레이즈"],
  },
  {
    name: EXERCISE_NAMES.bicepCurl,
    category: "Arm",
    equipment: "dumbbell",
    aliases: ["Barbell Curl", "Dumbbell Curl", "Incline Curl", "바벨 컬", "덤벨 컬", "이두 컬"],
  },
  {
    name: EXERCISE_NAMES.hammerCurl,
    category: "Arm",
    equipment: "dumbbell",
    aliases: ["해머 컬"],
  },
  {
    name: EXERCISE_NAMES.tricepsPushdown,
    category: "Arm",
    equipment: "cable",
    aliases: ["Tricep Pushdown", "Cable Pushdown", "트라이셉 푸시다운", "케이블 푸시다운"],
  },
  {
    name: EXERCISE_NAMES.tricepsExtension,
    category: "Arm",
    equipment: "dumbbell",
    aliases: ["Tricep Extension", "Overhead Triceps Extension", "트라이셉 익스텐션"],
  },
  {
    name: EXERCISE_NAMES.skullcrusher,
    category: "Arm",
    equipment: "barbell",
    aliases: ["Lying Triceps Extension", "스컬 크러셔"],
  },
  {
    name: EXERCISE_NAMES.chestFly,
    category: "Chest",
    equipment: "dumbbell",
    aliases: ["Dumbbell Fly", "Pec Deck", "체스트 플라이", "덤벨 플라이"],
  },
  {
    name: EXERCISE_NAMES.inclineDumbbellBenchPress,
    category: "Chest",
    equipment: "dumbbell",
    aliases: ["Incline Dumbbell Press", "인클라인 덤벨 프레스", "인클라인 덤벨 벤치"],
  },
  {
    name: EXERCISE_NAMES.legCurl,
    category: "Legs",
    equipment: "machine",
    aliases: ["Seated Leg Curl", "Lying Leg Curl", "레그 컬"],
  },
  {
    name: EXERCISE_NAMES.legExtension,
    category: "Legs",
    equipment: "machine",
    aliases: ["레그 익스텐션"],
  },
  {
    name: EXERCISE_NAMES.calfRaise,
    category: "Legs",
    equipment: "machine",
    aliases: ["Standing Calf Raise", "Seated Calf Raise", "카프 레이즈", "종아리 raise"],
  },
  {
    name: EXERCISE_NAMES.lunge,
    category: "Legs",
    equipment: "dumbbell",
    aliases: ["Barbell Lunge", "Walking Lunge", "런지"],
  },
] as const satisfies readonly ExerciseCatalogItem[];

/** Resolve a user/program label to the catalog identity used for history and stats. */
export function canonicalExerciseNameForInput(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;

  for (const item of EXERCISE_CATALOG) {
    if (item.name.toLowerCase() === normalized) return item.name;
    if (item.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return item.name;
    }
  }
  return null;
}

/**
 * 종목 이름(별칭 포함)으로 장비를 해석한다. 카탈로그에 없으면 `"unknown"`.
 *
 * 사용자가 직접 만든 운동은 카탈로그에 없으므로 `"unknown"`이 되고, 플레이트 계산기는
 * 이를 **노출 쪽**으로 처리한다 — 필요 없으면 안 누르면 그만이지만, 바벨 종목인데
 * 계산기가 없으면 실제로 불편하기 때문이다. 이름이 카탈로그 별칭과 겹치면 자동으로
 * 정확한 장비가 잡힌다.
 */
export function resolveExerciseEquipment(exerciseName: string): ExerciseEquipment {
  const canonical = canonicalExerciseNameForInput(exerciseName);
  if (!canonical) return "unknown";
  const item = EXERCISE_CATALOG.find((candidate) => candidate.name === canonical);
  return item?.equipment ?? "unknown";
}

/**
 * 플레이트 분해를 보여줄 종목인가.
 *
 * 1차는 `barbell`만이다. 플레이트로드 머신(레그프레스 등)은 기구마다 스택식/플레이트식이
 * 갈리는데 카탈로그가 그걸 구분하지 못한다 — `machine`을 세분화하는 것은 후속 과제다.
 * `unknown`(사용자 생성 운동)은 위 주석대로 노출한다.
 */
export function supportsPlateBreakdown(exerciseName: string): boolean {
  const equipment = resolveExerciseEquipment(exerciseName);
  return equipment === "barbell" || equipment === "unknown";
}
