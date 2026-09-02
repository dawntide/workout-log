import assert from "node:assert/strict";
import test from "node:test";

import { isBodyweightExerciseName } from "../bodyweight-load";
import { REF5_OAP_EXERCISE_NAMES } from "../program-engine/ref5";
import { EXERCISE_CATALOG } from "./all-exercises";
import {
  EXERCISE_NAMES,
  LEGACY_EXERCISE_NAME_FALLBACKS,
  canonicalExerciseNameForInput,
} from "./catalog";

test("squat variants are separate canonical exercises", () => {
  const canonicalNames = new Set<string>(EXERCISE_CATALOG.map((item) => item.name));

  assert.ok(canonicalNames.has(EXERCISE_NAMES.highBarBackSquat));
  assert.ok(canonicalNames.has(EXERCISE_NAMES.lowBarBackSquat));
  assert.ok(canonicalNames.has(EXERCISE_NAMES.frontSquat));
  assert.equal(canonicalNames.has("Back Squat"), false);
});

test("legacy Back Squat resolves only as a high-bar alias", () => {
  const owners = EXERCISE_CATALOG.filter((item) =>
    item.aliases.some((alias) => alias === "Back Squat"),
  );

  assert.deepEqual(owners.map((item) => item.name), [EXERCISE_NAMES.highBarBackSquat]);
});

test("weighted and unweighted pull-ups share one canonical exercise", () => {
  const canonicalNames = new Set<string>(EXERCISE_CATALOG.map((item) => item.name));

  assert.ok(canonicalNames.has(EXERCISE_NAMES.pullUp));
  assert.equal(canonicalNames.has(EXERCISE_NAMES.weightedPullUp), false);
  for (const input of [
    "Pull-Up",
    "Pull Up",
    "Weighted Pull-Up",
    "Weighted Pull Up",
    "중량 풀업",
    "중량풀업",
  ]) {
    assert.equal(canonicalExerciseNameForInput(input), EXERCISE_NAMES.pullUp);
  }
});

test("catalog aliases have one canonical owner", () => {
  const aliases = EXERCISE_CATALOG.flatMap((item) => [...item.aliases]);
  const normalized = aliases.map((alias) => alias.trim().toLowerCase());

  assert.equal(new Set(normalized).size, normalized.length);
});

test("rollout fallbacks cover the two canonical names absent before migration", () => {
  assert.deepEqual(LEGACY_EXERCISE_NAME_FALLBACKS, {
    [EXERCISE_NAMES.highBarBackSquat]: "Back Squat",
    [EXERCISE_NAMES.weightedPullUp]: EXERCISE_NAMES.pullUp,
  });
});

// ── 처방 식별자와 수록 카탈로그의 계약 (M3 PR1) ─────────────────────────────
//
// `ExerciseCatalogItem.name`이 리터럴 유니온이던 시절에는 타입이 "처방 식별자는
// 전부 카탈로그에 있다"를 보장했다. 카탈로그를 오픈 데이터로 확충하려면 그 제약을
// 풀어야 하므로(계획서 §3.2), 같은 계약을 여기서 지킨다.
//
// 이 테스트가 실패한다는 것은 프로그램이 처방하는 운동이 카탈로그에 없다는 뜻이고,
// 그러면 seed가 만든 처방이 존재하지 않는 운동을 가리킨다.

test("G1: EXERCISE_NAMES의 모든 값이 카탈로그로 해석된다", () => {
  // "카탈로그에 같은 이름이 있다"가 아니라 "**해석된다**"가 정확한 계약이다 —
  // weightedPullUp("Weighted Pull-Up")은 의도적으로 pullUp의 별칭이고 별도 항목이
  // 아니다. 첫 시도에서 이 테스트가 그 사실을 드러냈다.
  const unresolved = Object.entries(EXERCISE_NAMES)
    .filter(([, name]) => canonicalExerciseNameForInput(name) === null)
    .map(([key, name]) => `${key} ("${name}")`);
  assert.deepEqual(
    unresolved,
    [],
    `EXERCISE_NAMES에 있는데 카탈로그로 해석되지 않는 종목: ${unresolved.join(", ")}`,
  );
});

test("G1: 스캔이 실제로 값을 읽고 있다 (커버리지 단정)", () => {
  // 두 상수 중 하나가 비면 위 테스트가 조용히 통과한다.
  assert.ok(Object.keys(EXERCISE_NAMES).length >= 30, "EXERCISE_NAMES가 비었거나 급감했다");
  assert.ok(EXERCISE_CATALOG.length >= 30, "EXERCISE_CATALOG가 비었거나 급감했다");
});

test("카탈로그 이름은 중복되지 않는다", () => {
  // exercise 테이블의 exercise_name_uq와 같은 계약 — 중복이 있으면 seed가 조용히
  // 하나를 버린다. 확충 시 가장 흔한 사고다.
  const seen = new Map<string, number>();
  for (const item of EXERCISE_CATALOG) {
    seen.set(item.name, (seen.get(item.name) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  assert.deepEqual(duplicates, [], `카탈로그에 중복된 이름: ${duplicates.join(", ")}`);
});

test("별칭이 다른 종목의 정식 이름과 겹치지 않는다", () => {
  // 겹치면 canonicalExerciseNameForInput이 어느 쪽으로 해석할지 데이터에 달리게 된다.
  const canonical = new Set(EXERCISE_CATALOG.map((item) => item.name.toLowerCase()));
  const collisions: string[] = [];
  for (const item of EXERCISE_CATALOG) {
    for (const alias of item.aliases) {
      const key = alias.toLowerCase();
      if (canonical.has(key) && key !== item.name.toLowerCase()) {
        collisions.push(`${item.name} 의 별칭 "${alias}"`);
      }
    }
  }
  assert.deepEqual(collisions, [], `정식 이름과 충돌하는 별칭:\n${collisions.join("\n")}`);
});

// REF5 저장 경로는 세트의 운동 이름을 이 카탈로그에서 찾지 못하면 저장을 통째로
// 거부한다. v1.4 OAP 슬롯을 넣으면서 실제로 이 공백에 걸렸다(E2E 데모 시드가 500).
// 엔진이 처방하는 이름과 카탈로그를 여기서 묶어 둔다.
test("REF5 OAP 처방 이름이 모두 카탈로그에 있다 (§7.5.1)", () => {
  const catalogNames = new Set(EXERCISE_CATALOG.map((item) => item.name.toLowerCase()));
  const prescribed = Object.values(REF5_OAP_EXERCISE_NAMES).flatMap((byKind) =>
    Object.values(byKind),
  );
  assert.equal(prescribed.length, 6, "팔 2 × 처방 3");
  for (const name of prescribed) {
    assert.ok(
      catalogNames.has(name.toLowerCase()),
      `${name}이(가) 카탈로그에 없다 — REF5 저장이 거부된다`,
    );
  }
});

// 이름이 맨몸 판정에 걸리면 총중량 계산과 체중 프롬프트가 스킬 슬롯을 삼킨다.
// 이름 자체와 별칭 양쪽을 막는다(§7.5.1 이름 제약).
test("REF5 OAP 이름과 별칭에 풀업/친업이 섞이지 않는다 (§7.5.1)", () => {
  const forbidden = ["pull-up", "pull up", "pullup", "chin-up", "chin up", "chinup", "풀업", "친업"];
  const prescribed = Object.values(REF5_OAP_EXERCISE_NAMES).flatMap((byKind) =>
    Object.values(byKind),
  );
  for (const name of prescribed) {
    const entry = EXERCISE_CATALOG.find((item) => item.name === name);
    assert.ok(entry, `${name} 카탈로그 항목`);
    for (const text of [entry!.name, ...(entry!.aliases ?? [])]) {
      const normalized = text.toLowerCase();
      for (const needle of forbidden) {
        assert.equal(
          normalized.includes(needle),
          false,
          `${text}이(가) "${needle}"에 걸린다 — 맨몸 부분일치 판정에 잡힌다`,
        );
      }
    }
    assert.equal(isBodyweightExerciseName(name), false, `${name}이(가) 맨몸 판정에 걸린다`);
  }
});
