import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@workout/core/db/client";
import { workoutSet } from "@workout/core/db/schema";
import { excludeWarmupSets } from "./set-type-filter";

/** 술어를 실제 쿼리에 넣고 컴파일된 SQL 문자열을 본다(문자열 매칭이 아니라 렌더 결과). */
function renderedSql() {
  return db.select().from(workoutSet).where(excludeWarmupSets()).toSQL().sql;
}

// nullable 컬럼에 `<> 'WARMUP'`을 쓰면 NULL 행이 통째로 떨어진다. NULL이 곧 작업
// 세트이므로 그 실수는 "레거시 로그가 통계에서 전부 사라진다"로 나타난다.
// prod 실측(2026-08-25): 739세트 전부 set_type IS NULL —
//   `is distinct from` → 739 유지, `<>` → 0. 즉 이 한 글자가 전체 통계를 0으로 만든다.
test("술어는 IS DISTINCT FROM으로 컴파일된다 — NULL(작업 세트)을 떨어뜨리지 않는다", () => {
  const sql = renderedSql();
  assert.match(sql, /is distinct from/i);
  assert.doesNotMatch(sql, /set_type"?\s*(<>|!=)/i);
  assert.match(sql, /'WARMUP'/);
});

test("술어가 겨냥하는 컬럼은 workout_set.set_type이다", () => {
  assert.match(renderedSql(), /"workout_set"\."set_type"\s+is distinct from/i);
});

// 실패는 빼지 않는다 — 실패해도 든 무게와 반복은 실제 수행이다(계획서 §3.3).
test("술어는 FAILURE를 건드리지 않는다", () => {
  assert.doesNotMatch(renderedSql(), /FAILURE/);
});
