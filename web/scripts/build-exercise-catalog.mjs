#!/usr/bin/env node
// free-exercise-db(Unlicense, 퍼블릭 도메인)를 우리 카탈로그 항목으로 변환한다.
//
// **일회성 빌드 도구다.** 산출물(TS 배열)을 커밋하고 런타임에는 원본 JSON을 읽지
// 않는다 — core는 의존성 경량 원칙이고, seed 추적 해시도 산출물 기준이어야 한다
// (계획서 docs/exercise-catalog-plan.md §3.4).
//
// 사용:
//   node web/scripts/build-exercise-catalog.mjs --report            # 리포트만
//   node web/scripts/build-exercise-catalog.mjs --out <path.ts>     # 산출물 생성
//   node web/scripts/build-exercise-catalog.mjs --source <path.json>
//
// 소스를 주지 않으면 원격에서 받는다(네트워크 필요). 재현성을 위해 실제 확충 시에는
// 받은 파일을 넘겨 쓰는 것을 권한다.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ── 우리 체계로의 매핑 ────────────────────────────────────────────────────

/**
 * 소스 `equipment` → 우리 `ExerciseEquipment`.
 *
 * 케틀벨·밴드·메디신볼은 실제 장비지만 우리 6종에 없다. 없는 것을 억지로 끼워
 * 맞추는 대신 `unknown`으로 둔다 — 이 값을 읽는 곳은 플레이트 계산기 하나이고
 * `barbell`만 노출 대상이라, 오분류가 빈 값보다 나쁘다.
 */
const EQUIPMENT_MAP = {
  barbell: "barbell",
  "e-z curl bar": "barbell",
  dumbbell: "dumbbell",
  machine: "machine",
  cable: "cable",
  "body only": "bodyweight",
};

/**
 * 소스 `primaryMuscles[0]` → 우리 `category`.
 *
 * ⚠️ 소스의 `category`는 **부위가 아니라 양식**이다(strength/stretching/cardio/…).
 * 우리 `category`는 부위(Legs/Back/Chest/…)라 의미가 다르다 — 계획서 §3.4가
 * "소스 category를 우리 체계로 정규화"라고 적은 것은 그 차이를 보기 전이었다.
 * 부위는 primaryMuscles에서 끌어온다.
 */
const MUSCLE_TO_CATEGORY = {
  quadriceps: "Legs",
  hamstrings: "Legs",
  calves: "Legs",
  adductors: "Legs",
  abductors: "Legs",
  glutes: "Glute",
  lats: "Back",
  "middle back": "Back",
  "lower back": "Back",
  traps: "Back",
  chest: "Chest",
  shoulders: "Shoulder",
  neck: "Shoulder",
  biceps: "Arm",
  triceps: "Arm",
  forearms: "Arm",
  abdominals: "Core",
};

/** 소스 근육명 → 우리 `MuscleGroup` 9종. */
const MUSCLE_TO_GROUP = {
  quadriceps: "Quad",
  hamstrings: "Hamstring",
  glutes: "Glute",
  calves: "Other",
  adductors: "Other",
  abductors: "Other",
  lats: "Back",
  "middle back": "Back",
  "lower back": "Back",
  traps: "Back",
  chest: "Chest",
  shoulders: "Shoulder",
  neck: "Other",
  biceps: "Arm",
  triceps: "Arm",
  forearms: "Arm",
  abdominals: "Core",
};

/**
 * 수록할 양식. 근력 기록 앱의 운동 선택기에 스트레칭 123종이 섞이면 "많이"가
 * "찾기 어렵게"로 바뀐다 — 벤치마킹의 교훈은 종수가 아니라 검색성이었다.
 *
 * 항목별 큐레이션이 아니라 **양식 단위 기준**이라 판단 비용이 들지 않는다.
 */
const INCLUDED_CATEGORIES = new Set([
  "strength",
  "powerlifting",
  "olympic weightlifting",
  "strongman",
  "plyometrics",
]);

const SECONDARY_WEIGHT = 0.4;

// ── 변환 ──────────────────────────────────────────────────────────────────

function normalizeName(raw) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

function toMuscleContribution(entry) {
  const contribution = {};
  const add = (muscle, weight) => {
    const group = MUSCLE_TO_GROUP[muscle];
    if (!group) return;
    contribution[group] = Math.max(contribution[group] ?? 0, weight);
  };
  for (const muscle of entry.primaryMuscles ?? []) add(muscle, 1.0);
  for (const muscle of entry.secondaryMuscles ?? []) add(muscle, SECONDARY_WEIGHT);
  return contribution;
}

function convert(source) {
  const skippedByCategory = [];
  const unknownEquipment = new Map();
  const unmappedMuscles = new Map();
  const items = [];

  for (const entry of source) {
    if (!INCLUDED_CATEGORIES.has(String(entry.category))) {
      skippedByCategory.push(entry.name);
      continue;
    }
    const name = normalizeName(entry.name);
    if (!name) continue;

    const rawEquipment = String(entry.equipment ?? "");
    const equipment = EQUIPMENT_MAP[rawEquipment] ?? "unknown";
    if (equipment === "unknown") {
      unknownEquipment.set(rawEquipment, (unknownEquipment.get(rawEquipment) ?? 0) + 1);
    }

    const primary = (entry.primaryMuscles ?? [])[0];
    const category = MUSCLE_TO_CATEGORY[primary];
    if (!category) {
      unmappedMuscles.set(primary, (unmappedMuscles.get(primary) ?? 0) + 1);
      continue;
    }

    items.push({
      name,
      category,
      aliases: [],
      equipment,
      muscles: toMuscleContribution(entry),
    });
  }

  return { items, skippedByCategory, unknownEquipment, unmappedMuscles };
}

// ── 기존 카탈로그와의 충돌 ────────────────────────────────────────────────

/**
 * 기존 항목의 정식 이름·별칭을 읽는다. 정규식으로 뽑는다 — 이 스크립트는 빌드
 * 도구라 core를 TS로 로드하지 않는다(tsx 의존을 만들지 않는다).
 */
function readExistingCatalog() {
  const source = readFileSync(
    path.join(repoRoot, "packages/core/src/exercise/catalog.ts"),
    "utf8",
  );
  const names = new Set();
  const aliases = new Set();
  for (const match of source.matchAll(/^\s+(\w+): "([^"]+)",$/gm)) {
    // EXERCISE_NAMES 맵의 표시명
    names.add(match[2].toLowerCase());
  }
  for (const match of source.matchAll(/aliases: \[([^\]]*)\]/g)) {
    for (const alias of match[1].matchAll(/"([^"]+)"/g)) {
      aliases.add(alias[1].toLowerCase());
    }
  }
  return { names, aliases };
}

// ── 실행 ──────────────────────────────────────────────────────────────────

async function loadSource(argSource) {
  if (argSource) return JSON.parse(readFileSync(argSource, "utf8"));
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`source fetch failed: ${response.status}`);
  return response.json();
}

const GENERATED_HEADER = [
  "// 자동 생성 — web/scripts/build-exercise-catalog.mjs",
  "//",
  "// 출처: free-exercise-db (https://github.com/yuhonas/free-exercise-db), Unlicense",
  "// (퍼블릭 도메인 — 표기 의무는 없으나 출처를 남긴다).",
  "//",
  "// 손으로 고치지 말 것. 큐레이션이 필요하면 CURATED_EXERCISE_CATALOG에 넣는다 —",
  "// 이름이 겹치면 수기 항목이 이긴다.",
  "",
];

/**
 * 장비만 담은 **클라이언트 안전** 산출물.
 *
 * 전체 카탈로그(이름·부위·별칭·근육 723종)는 gzip 10KB인데, 클라이언트가 실제로
 * 필요로 하는 것은 `supportsPlateBreakdown`의 장비 판별 하나다. 전체를 딸려
 * 보내면 매 페이지에 그만큼이 낭비된다(계획서 §4 G6이 막으라던 것 — 실제로
 * 측정해 보니 그 청크의 95%가 카탈로그였다).
 *
 * `unknown`은 싣지 않는다 — 조회 실패의 기본값이 곧 `unknown`이라 같은 결과다.
 */
function renderEquipmentOutput(items) {
  const lines = [
    ...GENERATED_HEADER,
    'import type { ExerciseEquipment } from "./catalog";',
    "",
    "/** 소문자 이름 → 장비. 장비를 아는 항목만 담는다(미수록 = unknown). */",
    "export const OPEN_EXERCISE_EQUIPMENT: Readonly<Record<string, ExerciseEquipment>> = {",
  ];
  for (const item of items) {
    if (item.equipment === "unknown") continue;
    lines.push(`  ${JSON.stringify(item.name.toLowerCase())}: ${JSON.stringify(item.equipment)},`);
  }
  lines.push("};", "");
  return lines.join("\n");
}

function renderOutput(items) {
  const lines = [
    ...GENERATED_HEADER,
    "// ⚠️ **서버 전용**이다. 클라이언트에서 import하면 723종이 번들에 실린다 —",
    "// 장비 판별만 필요하면 open-equipment.ts를 쓸 것.",
    "",
    'import type { ExerciseCatalogItem } from "./catalog";',
    "",
    "export const OPEN_EXERCISE_CATALOG: readonly ExerciseCatalogItem[] = [",
  ];
  for (const item of items) {
    const muscles = Object.entries(item.muscles)
      .map(([group, weight]) => `${group}: ${weight}`)
      .join(", ");
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(item.name)},`);
    lines.push(`    category: ${JSON.stringify(item.category)},`);
    lines.push("    aliases: [],");
    lines.push(`    equipment: ${JSON.stringify(item.equipment)},`);
    if (muscles) lines.push(`    muscles: { ${muscles} },`);
    lines.push("  },");
  }
  lines.push("] as const;", "");
  return lines.join("\n");
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const sourceIndex = args.indexOf("--source");
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
const sourcePath = sourceIndex >= 0 ? args[sourceIndex + 1] : null;

const source = await loadSource(sourcePath);
const { items, skippedByCategory, unknownEquipment, unmappedMuscles } = convert(source);
const existing = readExistingCatalog();

const nameCollisions = items.filter((item) => existing.names.has(item.name.toLowerCase()));
const aliasCollisions = items.filter((item) => existing.aliases.has(item.name.toLowerCase()));
const kept = items.filter(
  (item) =>
    !existing.names.has(item.name.toLowerCase()) &&
    !existing.aliases.has(item.name.toLowerCase()),
);

const withMuscles = kept.filter((item) => Object.keys(item.muscles).length > 0).length;
const otherOnly = kept.filter(
  (item) =>
    Object.keys(item.muscles).length > 0 &&
    Object.keys(item.muscles).every((group) => group === "Other"),
).length;

console.log("── 변환 리포트 ──────────────────────────────────────────");
console.log(`소스 종목            ${source.length}`);
console.log(`양식 필터로 제외      ${skippedByCategory.length} (stretching·cardio 등)`);
console.log(`부위 매핑 실패        ${[...unmappedMuscles.values()].reduce((a, b) => a + b, 0)}`);
console.log(`변환 성공            ${items.length}`);
console.log(`기존 정식명과 충돌     ${nameCollisions.length}`);
console.log(`기존 별칭과 충돌       ${aliasCollisions.length}`);
console.log(`최종 수록            ${kept.length}`);
console.log("");
console.log(
  `근육 매핑 커버리지     ${withMuscles}/${kept.length} (${((withMuscles / kept.length) * 100).toFixed(1)}%)`,
);
console.log(`  그중 Other 전용     ${otherOnly}`);
console.log("");
if (unknownEquipment.size > 0) {
  console.log("장비 unknown 내역:");
  for (const [raw, count] of [...unknownEquipment].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${raw || "(빈 값)"}: ${count}`);
  }
  console.log("");
}
if (unmappedMuscles.size > 0) {
  console.log("부위 매핑 실패 근육:", Object.fromEntries(unmappedMuscles));
  console.log("");
}
if (nameCollisions.length > 0) {
  console.log("기존 항목이 이긴 이름(수기 큐레이션 보존):");
  for (const item of nameCollisions) console.log(`  ${item.name}`);
  console.log("");
}
if (aliasCollisions.length > 0) {
  console.log("기존 별칭과 겹쳐 제외된 이름:");
  for (const item of aliasCollisions) console.log(`  ${item.name}`);
  console.log("");
}

if (outPath) {
  writeFileSync(outPath, renderOutput(kept), "utf8");
  const equipmentPath = outPath.replace(/open-catalog\.ts$/, "open-equipment.ts");
  writeFileSync(equipmentPath, renderEquipmentOutput(kept), "utf8");
  const knownEquipment = kept.filter((item) => item.equipment !== "unknown").length;
  console.log(`산출물 기록: ${outPath} (${kept.length}종, 서버 전용)`);
  console.log(`산출물 기록: ${equipmentPath} (${knownEquipment}종, 클라이언트 안전)`);
} else {
  console.log("(--out 미지정 — 리포트만 출력했다)");
}
