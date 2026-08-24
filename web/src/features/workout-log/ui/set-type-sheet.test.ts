import assert from "node:assert/strict";
import test from "node:test";
import { WORKOUT_SET_TYPES } from "@workout/core/workout-set-type";
import { SET_TYPE_OPTIONS } from "./set-type-sheet";

// 값 집합에 타입을 추가하고 시트를 잊으면 사용자가 그 타입을 고를 수 없다 —
// 저장 경로는 다 통과하므로 아무 게이트도 울리지 않는다.
test("시트는 WORKOUT_SET_TYPES 전부와 작업 세트(null)를 제공한다", () => {
  const values = SET_TYPE_OPTIONS.map((option) => option.value);
  assert.ok(values.includes(null), "작업 세트로 되돌릴 방법이 없으면 태그를 취소할 수 없다");
  for (const type of WORKOUT_SET_TYPES) {
    assert.ok(values.includes(type), `${type} 옵션이 시트에 없다`);
  }
  assert.equal(values.length, WORKOUT_SET_TYPES.length + 1, "대응 값이 없는 옵션이 있다");
});

test("모든 옵션이 한국어·영어 라벨과 설명을 갖는다", () => {
  for (const option of SET_TYPE_OPTIONS) {
    for (const field of ["label", "hint"] as const) {
      assert.ok(option[field].ko.trim(), `${option.value}: ${field}.ko 비었음`);
      assert.ok(option[field].en.trim(), `${option.value}: ${field}.en 비었음`);
    }
  }
});
