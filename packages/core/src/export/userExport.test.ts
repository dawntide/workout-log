import assert from "node:assert/strict";
import test from "node:test";

import { getTableColumns } from "drizzle-orm";
import { workoutSet } from "@workout/core/db/schema";
import { WORKOUT_SET_CSV_HEADER } from "./userExport";

// JSON export는 `db.select()`(컬럼 미나열)라 additive 컬럼이 자동으로 따라오고, import는
// `toInsertRows`가 테이블 컬럼을 훑어 자동 반영한다. **CSV만 수동**이다 — 헤더 배열과 행
// 배열을 손으로 맞춰야 하고, 컬럼을 추가하며 여기를 빠뜨리면 조용히 누락된다.

/** CSV의 `setId`는 `workout_set.id`다. 나머지는 컬럼명과 그대로 대응한다. */
const CSV_ALIASES: Record<string, string> = { id: "setId" };

/** 조인해 오는 workout_log 열 — workout_set에는 없지만 CSV에는 있어야 정상이다. */
const JOINED_LOG_COLUMNS = new Set(["performedAt", "planId", "generatedSessionId"]);

test("CSV 헤더는 workout_set의 모든 컬럼을 담는다", () => {
  const columns = Object.keys(getTableColumns(workoutSet));
  assert.ok(columns.length > 0, "컬럼 스캔이 비었다 — 가드가 무력하다");

  const missing = columns
    .map((name) => CSV_ALIASES[name] ?? name)
    .filter((name) => !WORKOUT_SET_CSV_HEADER.includes(name as never));

  assert.deepEqual(
    missing,
    [],
    `CSV export에서 빠진 컬럼: ${missing.join(", ")} — packages/core/src/export/userExport.ts의 ` +
      `WORKOUT_SET_CSV_HEADER와 행 배열 양쪽에 추가할 것`,
  );
});

test("CSV 헤더에 유령 열이 없다", () => {
  const known = new Set([
    ...Object.keys(getTableColumns(workoutSet)).map((name) => CSV_ALIASES[name] ?? name),
    ...JOINED_LOG_COLUMNS,
  ]);
  const unknown = WORKOUT_SET_CSV_HEADER.filter((name) => !known.has(name));
  assert.deepEqual(unknown, [], `대응 컬럼이 없는 CSV 열: ${unknown.join(", ")}`);
});
