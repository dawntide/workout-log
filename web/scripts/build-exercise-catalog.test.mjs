#!/usr/bin/env node
// 변환 스크립트의 **매핑 계약**을 잠근다.
//
// 스크립트는 일회성 도구지만 산출물이 커밋되므로, 매핑이 조용히 바뀌면 다음 재생성
// 때 723종의 부위·장비·근육이 통째로 달라진다. 그런 변경은 diff가 너무 커서 리뷰로
// 잡히지 않는다.
//
// 스크립트를 import하지 않고 소스를 읽는다 — 스크립트는 실행 즉시 네트워크를 타거나
// 파일을 쓰는 CLI라 모듈로 불러올 수 없다.

import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const SOURCE = readFileSync(path.join(scriptDir, "build-exercise-catalog.mjs"), "utf8");
const CATALOG = readFileSync(
  path.join(repoRoot, "packages/core/src/exercise/catalog.ts"),
  "utf8",
);

/** 스크립트의 객체 리터럴에서 값 집합을 뽑는다. */
function valuesOf(constName) {
  const start = SOURCE.indexOf(`const ${constName} = {`);
  assert.notEqual(start, -1, `${constName}을 못 찾았다 — 테스트가 무력하다`);
  const end = SOURCE.indexOf("\n};", start);
  const block = SOURCE.slice(start, end);
  return new Set([...block.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]));
}

test("장비 매핑의 결과값이 ExerciseEquipment 안에 있다", () => {
  // 오타 하나가 723종의 장비를 유령 값으로 만든다. 타입이 없는 .mjs라 여기서 막는다.
  // 타입은 `EXERCISE_EQUIPMENTS` 값 배열에서 파생된다(런타임 검증에 그 배열이 필요해
  // 유니온 리터럴에서 바꿨다). 스캔 대상도 그 배열이다.
  const block = CATALOG.slice(
    CATALOG.indexOf("export const EXERCISE_EQUIPMENTS = ["),
    CATALOG.indexOf("] as const;", CATALOG.indexOf("export const EXERCISE_EQUIPMENTS = [")),
  );
  const declared = new Set([...block.matchAll(/"(\w+)"/g)].map((m) => m[1]));
  assert.ok(declared.size >= 5, `ExerciseEquipment 스캔 실패(${declared.size}종)`);
  for (const value of valuesOf("EQUIPMENT_MAP")) {
    assert.ok(declared.has(value), `EQUIPMENT_MAP이 만드는 "${value}"가 타입에 없다`);
  }
});

test("부위 매핑의 결과값이 기존 카탈로그 category와 같은 어휘다", () => {
  // 새 어휘를 만들면 CATEGORY_PRIMARY 폴백이 못 잡아 근육군 통계가 Other로 떨어진다.
  const known = new Set(["Legs", "Back", "Chest", "Arm", "Shoulder", "Glute", "Core", "Olympic Lift"]);
  for (const value of valuesOf("MUSCLE_TO_CATEGORY")) {
    assert.ok(known.has(value), `MUSCLE_TO_CATEGORY가 만드는 "${value}"가 기존 어휘에 없다`);
  }
});

test("근육군 매핑의 결과값이 MuscleGroup 9종 안에 있다", () => {
  const declared = new Set([
    "Quad",
    "Hamstring",
    "Glute",
    "Back",
    "Chest",
    "Shoulder",
    "Arm",
    "Core",
    "Other",
  ]);
  for (const value of valuesOf("MUSCLE_TO_GROUP")) {
    assert.ok(declared.has(value), `MUSCLE_TO_GROUP이 만드는 "${value}"가 MuscleGroup에 없다`);
  }
});

test("소스의 모든 근육이 두 매핑에 등재돼 있다", () => {
  // 미등재 근육은 부위 매핑 실패로 항목이 통째로 버려진다 — 조용한 손실이다.
  const SOURCE_MUSCLES = [
    "quadriceps", "hamstrings", "calves", "adductors", "abductors", "glutes",
    "lats", "middle back", "lower back", "traps", "chest", "shoulders", "neck",
    "biceps", "triceps", "forearms", "abdominals",
  ];
  const categoryKeys = new Set(
    [...SOURCE.slice(SOURCE.indexOf("const MUSCLE_TO_CATEGORY = {")).matchAll(
      /^\s*"?([a-z ]+)"?:\s*"/gm,
    )].map((m) => m[1].trim()),
  );
  const missing = SOURCE_MUSCLES.filter((muscle) => !categoryKeys.has(muscle));
  assert.deepEqual(missing, [], `MUSCLE_TO_CATEGORY에 없는 소스 근육: ${missing.join(", ")}`);
});

/** `new Set([...])` 형태의 상수에서 값을 뽑는다. */
function setValuesOf(constName) {
  const start = SOURCE.indexOf(`const ${constName} = new Set([`);
  assert.notEqual(start, -1, `${constName}을 못 찾았다 — 테스트가 무력하다`);
  const end = SOURCE.indexOf("]);", start);
  return new Set([...SOURCE.slice(start, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

test("양식 필터는 근력 계열만 통과시킨다", () => {
  // 스트레칭 123종이 섞이면 "많이"가 "찾기 어렵게"로 바뀐다. 항목별이 아니라 양식
  // 단위 기준이라 판단 비용이 없다 — 그 성격을 유지한다.
  const included = setValuesOf("INCLUDED_CATEGORIES");
  assert.ok(!included.has("stretching"), "스트레칭이 포함되면 선택기가 노이즈로 찬다");
  assert.ok(!included.has("cardio"));
  assert.ok(included.has("strength"));
  assert.ok(included.has("powerlifting"));
});

test("런타임에 원본 JSON을 읽지 않는다", () => {
  // 산출물만 커밋하는 것이 설계다(계획서 §3.4·§6-5). core가 이 스크립트나 원본
  // JSON을 import하기 시작하면 seed 추적 해시가 산출물 기준이 아니게 된다.
  const coreSources = [
    "packages/core/src/exercise/catalog.ts",
    "packages/core/src/db/seed.ts",
  ];
  for (const file of coreSources) {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    assert.ok(
      !text.includes("free-exercise-db") && !text.includes("build-exercise-catalog"),
      `${file}이 변환 스크립트/원본을 참조한다 — 산출물만 커밋해야 한다`,
    );
  }
});
