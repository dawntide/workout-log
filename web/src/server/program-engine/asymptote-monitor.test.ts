// Asymptote × Async Hybrid — e1RM 연속 모니터 테스트 (`asymptote-async-hybrid.md` §3.5).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASYMPTOTE_MONITOR_WINDOW,
  aggregateDriverExposures,
  asymptoteDriverTrend,
  epleyE1rm,
  type DriverExposure,
  type LoggedSetRow,
} from "./asymptote-monitor";

test("epleyE1rm: w*(1+reps/30), 비유효 입력은 0", () => {
  assert.equal(Math.round(epleyE1rm(100, 5) * 100) / 100, 116.67);
  assert.ok(Math.abs(epleyE1rm(100, 1) - (100 + 100 / 30)) < 1e-9);
  assert.equal(epleyE1rm(0, 5), 0);
  assert.equal(epleyE1rm(100, 0), 0);
  assert.equal(epleyE1rm(-5, 5), 0);
});

function series(e1rmWeights: Array<[string, number, number]>): DriverExposure[] {
  // [date, weight, reps]
  return e1rmWeights.map(([performedAt, weightKg, reps]) => ({ performedAt, weightKg, reps }));
}

test("window 미만이면 INSUFFICIENT", () => {
  const out = asymptoteDriverTrend(series([
    ["2026-01-01", 100, 3],
    ["2026-01-03", 102.5, 3],
  ]));
  assert.equal(out.trend, "INSUFFICIENT");
  assert.equal(out.points.length, 2);
  assert.ok(out.latestMovingAvg !== null);
});

test("꾸준히 오르면 RISING (7세션 이동평균)", () => {
  const data: Array<[string, number, number]> = [];
  let w = 90;
  for (let i = 0; i < 10; i += 1) {
    data.push([`2026-02-${String(i + 1).padStart(2, "0")}`, w, 3]);
    w += 2.5;
  }
  const out = asymptoteDriverTrend(series(data));
  assert.equal(out.points.length, 10);
  assert.equal(out.trend, "RISING");
  assert.equal(ASYMPTOTE_MONITOR_WINDOW, 7);
});

test("정체(동일 무게)면 FLAT", () => {
  const data: Array<[string, number, number]> = [];
  for (let i = 0; i < 10; i += 1) data.push([`2026-03-${String(i + 1).padStart(2, "0")}`, 100, 3]);
  const out = asymptoteDriverTrend(series(data));
  assert.equal(out.trend, "FLAT");
});

test("하락하면 FALLING", () => {
  const data: Array<[string, number, number]> = [];
  let w = 120;
  for (let i = 0; i < 10; i += 1) {
    data.push([`2026-04-${String(i + 1).padStart(2, "0")}`, w, 3]);
    w -= 2.5;
  }
  const out = asymptoteDriverTrend(series(data));
  assert.equal(out.trend, "FALLING");
});

test("풀업 총중량(BW+추중량)으로 e1RM 계산", () => {
  // 추중량만 보면 정체처럼 보이지만 체중이 늘면 총중량 e1RM은 상승.
  const data: DriverExposure[] = [];
  for (let i = 0; i < 8; i += 1) {
    data.push({ performedAt: `2026-05-${String(i + 1).padStart(2, "0")}`, weightKg: 20, reps: 3, bodyweightKg: 68 + i });
  }
  const out = asymptoteDriverTrend(data);
  // 첫 노출 e1RM = (20+68)*(1+3/30) = 96.8
  assert.equal(out.points[0]!.e1rm, Math.round((20 + 68) * 1.1 * 10) / 10);
  assert.equal(out.trend, "RISING");
});

test("aggregateDriverExposures: 드라이버 버킷팅 + 일자별 탑세트 + 풀업 BW 보정", () => {
  const rows: LoggedSetRow[] = [
    { performedAt: "2026-06-01", exerciseName: "Back Squat", weightKg: 80, reps: 5 },
    { performedAt: "2026-06-01", exerciseName: "Back Squat", weightKg: 90, reps: 3 }, // 같은 날 더 무거움 → 탑세트
    { performedAt: "2026-06-01", exerciseName: "Bench Press", weightKg: 70, reps: 5 },
    { performedAt: "2026-06-01", exerciseName: "Weighted Pull-Up", weightKg: 20, reps: 5 },
    { performedAt: "2026-06-01", exerciseName: "Bicep Curl", weightKg: 15, reps: 12 }, // 비드라이버 → 무시
    { performedAt: "2026-06-03", exerciseName: "Back Squat", weightKg: 92.5, reps: 3 },
  ];
  const out = aggregateDriverExposures(rows, 70);

  assert.equal(out.SQUAT.length, 2, "스쿼트 2일");
  assert.equal(out.SQUAT[0]!.weightKg, 90, "6-01 탑세트 = 90×3 (e1rm 99 > 80×5의 93.3)");
  assert.equal(out.SQUAT[0]!.reps, 3);
  assert.equal(out.SQUAT[0]!.bodyweightKg, undefined, "스쿼트는 BW 미적용");
  assert.equal(out.BENCH.length, 1);
  assert.equal(out.PULL.length, 1);
  assert.equal(out.PULL[0]!.bodyweightKg, 70, "풀업은 BW 보정");
});

test("aggregateDriverExposures: bodyweightKg 없으면 풀업도 추중량만", () => {
  const rows: LoggedSetRow[] = [
    { performedAt: "2026-06-01", exerciseName: "Weighted Pull-Up", weightKg: 20, reps: 5 },
  ];
  const out = aggregateDriverExposures(rows, null);
  assert.equal(out.PULL[0]!.bodyweightKg, undefined);
});

test("정렬: 입력 순서 무관하게 performedAt 오름차순 처리", () => {
  const out = asymptoteDriverTrend(series([
    ["2026-06-03", 105, 3],
    ["2026-06-01", 100, 3],
    ["2026-06-02", 102.5, 3],
  ]));
  assert.equal(out.points[0]!.performedAt, "2026-06-01");
  assert.equal(out.points[2]!.performedAt, "2026-06-03");
});
