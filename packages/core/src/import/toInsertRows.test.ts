import assert from "node:assert/strict";
import test from "node:test";

import { planModule, workoutLog, workoutSet } from "@workout/core/db/schema";
import { toInsertRows } from "./userImport";

// 종전에는 파싱한 JSON을 그대로 `.values(rows as any)`로 넘겨, 무엇이 INSERT되는지
// 코드에서 보이지 않았다. 컬럼 화이트리스트와 타임스탬프 복원을 계약으로 고정한다.

test("테이블에 없는 키는 버린다", () => {
  const [row] = toInsertRows<typeof planModule.$inferInsert>(planModule, [
    { id: "mod-1", planId: "plan-1", target: "SQUAT", bogusColumn: "drop me", __proto__: "x" },
  ]);
  assert.ok(row);
  assert.deepEqual(Object.keys(row!).sort(), ["id", "planId", "target"]);
});

test("지정한 타임스탬프 컬럼만 Date로 되돌린다", () => {
  const [row] = toInsertRows<typeof workoutLog.$inferInsert>(
    workoutLog,
    [{ id: "log-1", performedAt: "2026-07-14T01:00:00.000Z", notes: "2026-07-14" }],
    ["performedAt"],
  );
  assert.ok(row!.performedAt instanceof Date);
  assert.equal((row!.performedAt as Date).toISOString(), "2026-07-14T01:00:00.000Z");
  assert.equal(row!.notes, "2026-07-14", "날짜처럼 보여도 지정하지 않은 컬럼은 문자열 그대로다");
});

test("파싱 불가한 타임스탬프는 원본을 유지해 DB가 거부하게 둔다", () => {
  // 조용히 null/현재시각으로 바꾸면 잘못된 시각이 그대로 저장된다 — 거부가 낫다.
  const [row] = toInsertRows<typeof workoutLog.$inferInsert>(
    workoutLog,
    [{ id: "log-1", performedAt: "not-a-date" }],
    ["performedAt"],
  );
  assert.equal(row!.performedAt, "not-a-date");
});

test("없는 키는 만들어내지 않는다(컬럼 기본값을 살린다)", () => {
  const [row] = toInsertRows<typeof planModule.$inferInsert>(planModule, [
    { id: "mod-1", planId: "plan-1" },
  ]);
  assert.ok(!("createdAt" in row!), "빈 값으로 채우면 defaultNow()가 무력해진다");
});

test("빈 입력은 빈 배열", () => {
  assert.deepEqual(toInsertRows<typeof planModule.$inferInsert>(planModule, []), []);
});

test("additive 컬럼은 화이트리스트 갱신 없이 그대로 들어간다 (set_type 왕복)", () => {
  // export는 db.select()라 새 컬럼이 자동으로 나가고, 여기서 자동으로 되돌아온다.
  // 이 성질이 깨지면 JSON 왕복에서 세트 타입이 조용히 사라진다.
  const [row] = toInsertRows<typeof workoutSet.$inferInsert>(workoutSet, [
    { id: "set-1", logId: "log-1", exerciseName: "Back Squat", setType: "WARMUP" },
  ]);
  assert.equal(row!.setType, "WARMUP");
});

test("세트 타입이 없는 레거시 export는 컬럼을 만들어내지 않는다", () => {
  const [row] = toInsertRows<typeof workoutSet.$inferInsert>(workoutSet, [
    { id: "set-1", logId: "log-1", exerciseName: "Back Squat" },
  ]);
  assert.ok(!("setType" in row!), "없는 키를 넣으면 컬럼 기본값(NULL=작업 세트)이 죽는다");
});
