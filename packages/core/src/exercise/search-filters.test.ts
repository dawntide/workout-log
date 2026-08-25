import test from "node:test";
import assert from "node:assert/strict";

import { EXERCISE_CATALOG } from "./all-exercises";
import { resolveExerciseEquipment } from "./catalog";
import {
  EXERCISE_CATEGORY_FILTERS,
  EXERCISE_EQUIPMENT_FILTERS,
} from "./search-filters";

/** 노출 칩이 결과 0건이 되면 안 되는 최소치. */
const MIN_ITEMS_PER_CHIP = 5;
/** 이만큼 쌓였는데 칩이 없으면 "숨은 무더기"다. */
const HIDDEN_BUCKET_THRESHOLD = 20;

function countByCategory() {
  const counts = new Map<string, number>();
  for (const item of EXERCISE_CATALOG) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return counts;
}

test("스캔이 실제 카탈로그를 읽고 있다 (커버리지 단정)", () => {
  // 0건이 "위반 없음"인지 "빈 카탈로그"인지 구분되지 않으면 아래 단정이 전부 무력하다.
  assert.ok(
    EXERCISE_CATALOG.length > 500,
    `카탈로그가 ${EXERCISE_CATALOG.length}종 — 확충 산출물이 빠졌다`,
  );
});

test("부위 칩은 전부 결과가 있다 (죽은 칩 없음)", () => {
  const counts = countByCategory();
  const dead = EXERCISE_CATEGORY_FILTERS.filter(
    (category) => (counts.get(category) ?? 0) < MIN_ITEMS_PER_CHIP,
  );
  assert.deepEqual(
    dead,
    [],
    `결과가 ${MIN_ITEMS_PER_CHIP}건 미만인 부위 칩: ${dead
      .map((c) => `${c}(${counts.get(c) ?? 0})`)
      .join(", ")} — 칩 하나가 가로 스크롤만 늘린다`,
  );
});

test("칩 없는 대량 부위가 없다 (숨은 무더기 없음)", () => {
  // 오픈 데이터를 재생성해 새 category가 대량으로 생기면 필터로 도달할 수 없다.
  const exposed = new Set<string>(EXERCISE_CATEGORY_FILTERS);
  const hidden = [...countByCategory()]
    .filter(([category, count]) => !exposed.has(category) && count >= HIDDEN_BUCKET_THRESHOLD)
    .map(([category, count]) => `${category}(${count})`);
  assert.deepEqual(
    hidden,
    [],
    `칩이 없는데 ${HIDDEN_BUCKET_THRESHOLD}종 이상인 부위: ${hidden.join(", ")} — ` +
      `EXERCISE_CATEGORY_FILTERS에 추가하거나, 왜 숨기는지 주석으로 남길 것`,
  );
});

test("장비 칩은 전부 결과가 있고 unknown을 노출하지 않는다", () => {
  const counts = new Map<string, number>();
  for (const item of EXERCISE_CATALOG) {
    const equipment = resolveExerciseEquipment(item.name) ?? "unknown";
    counts.set(equipment, (counts.get(equipment) ?? 0) + 1);
  }
  assert.ok(
    !(EXERCISE_EQUIPMENT_FILTERS as readonly string[]).includes("unknown"),
    "unknown은 '기타'로 내밀면 그 안에서 다시 못 찾는다 — 노출 금지",
  );
  const dead = EXERCISE_EQUIPMENT_FILTERS.filter(
    (equipment) => (counts.get(equipment) ?? 0) < MIN_ITEMS_PER_CHIP,
  );
  assert.deepEqual(dead, [], `결과가 없는 장비 칩: ${dead.join(", ")}`);
});

test("장비 필터를 켜면 도달 못 하는 종목이 있다는 사실을 수치로 남긴다", () => {
  // 계약이 아니라 **기록**이다. unknown 비율이 크게 흔들리면 '전체' 없이 탐색하는
  // 사용자에게 사각지대가 얼마나 되는지 다시 판단해야 한다.
  const unknown = EXERCISE_CATALOG.filter(
    (item) => (resolveExerciseEquipment(item.name) ?? "unknown") === "unknown",
  ).length;
  const ratio = unknown / EXERCISE_CATALOG.length;
  console.log(
    `  장비 unknown: ${unknown}/${EXERCISE_CATALOG.length} (${(ratio * 100).toFixed(1)}%) — 장비 칩으로는 도달 불가, '전체'로만 보인다`,
  );
  assert.ok(ratio < 0.45, `unknown이 ${(ratio * 100).toFixed(1)}% — 장비 필터의 유용성이 무너진다`);
});
