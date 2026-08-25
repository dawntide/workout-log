import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 평균 RPE에서 0(미입력·REF5 센티널)을 빼야 하는데, **어디서 빼느냐가 전부**다.
//
// 같은 쿼리가 sessions·totalVolume도 함께 집계한다. WHERE에 `rpe > 0`을 넣으면
// 그 둘까지 필터돼 볼륨이 통째로 사라진다 — prod 실측으로 확인한 수치:
//
//   현재:            세션 69, 볼륨 154,464kg, 평균 RPE 0.16
//   WHERE 필터(오답): 세션  3, 볼륨   4,052kg
//   NULLIF(정답):    세션 69, 볼륨 154,464kg, 평균 RPE 8.00
//
// 소스를 읽는 얕은 검사지만, 이 실수는 "볼륨이 왜 이렇게 줄었지"로만 드러나고
// 타입체커도 린트도 못 잡는다.

const SOURCE = readFileSync(
  new URL("./get-exercise-detail-bootstrap.ts", import.meta.url),
  "utf8",
);

test("평균 RPE는 집계 안에서 0을 제외한다", () => {
  assert.match(
    SOURCE,
    /avg\(nullif\(\$\{workoutSet\.rpe\}, 0\)\)/,
    "avg(nullif(rpe, 0)) 형태여야 한다",
  );
});

test("rpe 필터가 WHERE로 새어 나가지 않는다", () => {
  // WHERE 절은 `.where(` 다음의 and(...) 블록이다. 거기서 rpe를 언급하면 안 된다.
  const whereStart = SOURCE.indexOf(".where(", SOURCE.indexOf("avgRpe:"));
  assert.notEqual(whereStart, -1, "avgRpe 쿼리의 where 절을 못 찾았다 — 검사가 무력하다");
  const whereBlock = SOURCE.slice(whereStart, SOURCE.indexOf("\n    );", whereStart));
  assert.ok(
    !/rpe/i.test(whereBlock),
    `avgRpe 쿼리의 WHERE에 rpe 조건이 있다 — sessions·totalVolume까지 필터된다:\n${whereBlock}`,
  );
});
