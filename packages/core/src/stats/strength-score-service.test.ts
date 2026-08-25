import assert from "node:assert/strict";
import test from "node:test";
import { bodyweightAsOf, normalizeBodyweightPoints } from "./bodyweight-timeline";
import { pickTotalRatioDate } from "./strength-score-service";

// 이 서비스는 DB를 타므로 여기서는 **결정 규칙**만 잠근다. 규칙이 흐려지면 화면이
// "무엇으로 나눈 값인지" 말할 수 없게 된다(계획서 §3.3).

test("총 배율 분모는 가장 최근 최고 기록의 날짜다", () => {
  assert.equal(
    pickTotalRatioDate(["2026-01-10", "2026-06-01", "2026-03-20"]),
    "2026-06-01",
  );
});

test("기록이 없는 종목은 무시한다", () => {
  assert.equal(pickTotalRatioDate([null, "2026-03-20", null]), "2026-03-20");
});

test("3대 전부 기록이 없으면 null — 호출자가 설정값으로 떨어진다", () => {
  assert.equal(pickTotalRatioDate([null, null, null]), null);
  assert.equal(pickTotalRatioDate([]), null);
});

// ── 소급 적용의 변경분 (계획서 G4) ───────────────────────────────────────────
// "6개월 전 e1RM ÷ 오늘 체중"을 "6개월 전 e1RM ÷ 그때 체중"으로 바꾼다.
// 서비스가 조합하는 두 조각(시점 조회 + 폴백)이 실제로 그 결과를 내는지 본다.

const timeline = normalizeBodyweightPoints([
  { measuredAt: "2026-01-01T00:00:00Z", valueKg: 68 },
  { measuredAt: "2026-06-01T00:00:00Z", valueKg: 76 },
]);

/** 서비스의 bodyweightOn과 같은 조합: 그 날 이력 → 없으면 설정 현재값. */
function denominatorFor(date: string, settingKg: number | null): number | null {
  return bodyweightAsOf(timeline, new Date(`${date}T23:59:59.999Z`)) ?? settingKg;
}

test("기록이 있는 사용자는 그 시점 체중으로 나눈다", () => {
  const e1rm = 136;
  // 이전: 136 / 76(오늘) = 1.79 — 1월 기록인데 6월 체중을 썼다.
  // 이후: 136 / 68(그때) = 2.00
  assert.equal(denominatorFor("2026-02-15", 76), 68);
  assert.equal(Math.round((e1rm / denominatorFor("2026-02-15", 76)!) * 100) / 100, 2);
});

test("첫 기록보다 이전은 설정값으로 떨어진다 — 체중을 지어내지 않는다", () => {
  assert.equal(denominatorFor("2025-12-01", 76), 76);
});

test("기록이 없는 사용자는 수치가 바뀌지 않는다", () => {
  // 이 마일스톤 이전과 동일한 계산이어야 한다 — 대다수 사용자가 여기 해당한다.
  const denominator = bodyweightAsOf([], new Date("2026-02-15T23:59:59.999Z")) ?? 76;
  assert.equal(denominator, 76);
});
