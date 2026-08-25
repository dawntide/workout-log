import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyweightAsOf,
  bodyweightTimelineSignature,
  normalizeBodyweightPoints,
  type BodyweightPoint,
} from "./bodyweight-timeline";

const at = (iso: string, valueKg: number): BodyweightPoint => ({
  measuredAt: new Date(iso),
  valueKg,
});

const series = [
  at("2026-01-01T00:00:00Z", 70),
  at("2026-03-01T00:00:00Z", 74),
  at("2026-06-01T00:00:00Z", 72),
];

test("기록이 없으면 null — 호출자가 설정값으로 폴백한다", () => {
  assert.equal(bodyweightAsOf([], new Date("2026-05-01T00:00:00Z")), null);
});

test("첫 기록보다 이전 시점은 null — 뒤로 외삽하지 않는다", () => {
  // 첫 값을 과거로 늘리면 "기록을 시작하기 전의 체중"을 지어내게 된다.
  assert.equal(bodyweightAsOf(series, new Date("2025-12-31T23:59:59Z")), null);
});

test("asOf 이전 가장 최근 값을 준다", () => {
  assert.equal(bodyweightAsOf(series, new Date("2026-02-01T00:00:00Z")), 70);
  assert.equal(bodyweightAsOf(series, new Date("2026-04-01T00:00:00Z")), 74);
  assert.equal(bodyweightAsOf(series, new Date("2026-12-01T00:00:00Z")), 72);
});

test("경계는 포함이다 — 기록 시각 정각은 그 기록을 쓴다", () => {
  assert.equal(bodyweightAsOf(series, new Date("2026-03-01T00:00:00Z")), 74);
});

test("같은 날 두 기록이면 나중 것을 쓴다", () => {
  const sameDay = normalizeBodyweightPoints([
    { measuredAt: "2026-03-01T07:00:00Z", valueKg: 74 },
    { measuredAt: "2026-03-01T21:00:00Z", valueKg: 75.5 },
  ]);
  assert.equal(bodyweightAsOf(sameDay, new Date("2026-03-01T23:00:00Z")), 75.5);
  assert.equal(bodyweightAsOf(sameDay, new Date("2026-03-01T12:00:00Z")), 74);
});

test("정규화가 순서를 바로잡는다 — DB 정렬을 신뢰하지 않는다", () => {
  const unsorted = normalizeBodyweightPoints([
    { measuredAt: "2026-06-01T00:00:00Z", valueKg: 72 },
    { measuredAt: "2026-01-01T00:00:00Z", valueKg: 70 },
    { measuredAt: "2026-03-01T00:00:00Z", valueKg: 74 },
  ]);
  assert.deepEqual(unsorted.map((p) => p.valueKg), [70, 74, 72]);
  assert.equal(bodyweightAsOf(unsorted, new Date("2026-02-01T00:00:00Z")), 70);
});

test("정규화가 비유효 값을 버린다", () => {
  const cleaned = normalizeBodyweightPoints([
    { measuredAt: "not-a-date", valueKg: 70 },
    { measuredAt: "2026-01-01T00:00:00Z", valueKg: 0 },
    { measuredAt: "2026-01-02T00:00:00Z", valueKg: -5 },
    { measuredAt: "2026-01-03T00:00:00Z", valueKg: null },
    { measuredAt: "2026-01-04T00:00:00Z", valueKg: "73.5" },
  ]);
  assert.deepEqual(cleaned.map((p) => p.valueKg), [73.5]);
});

test("numeric이 문자열로 오는 Postgres 응답을 받는다", () => {
  // pg는 numeric을 문자열로 준다 — 파싱을 호출자에 미루면 어딘가에서 빠뜨린다.
  const fromDb = normalizeBodyweightPoints([
    { measuredAt: new Date("2026-01-01T00:00:00Z"), valueKg: "70.25" },
  ]);
  assert.equal(fromDb[0]!.valueKg, 70.25);
});

test("서명은 개수·최신 시각·최신 값이 바뀌면 달라진다", () => {
  const base = normalizeBodyweightPoints([
    { measuredAt: "2026-01-01T00:00:00Z", valueKg: 70 },
    { measuredAt: "2026-03-01T00:00:00Z", valueKg: 74 },
  ]);
  const signature = bodyweightTimelineSignature(base);

  const added = normalizeBodyweightPoints([
    { measuredAt: "2026-01-01T00:00:00Z", valueKg: 70 },
    { measuredAt: "2026-03-01T00:00:00Z", valueKg: 74 },
    { measuredAt: "2026-06-01T00:00:00Z", valueKg: 72 },
  ]);
  const corrected = normalizeBodyweightPoints([
    { measuredAt: "2026-01-01T00:00:00Z", valueKg: 70 },
    { measuredAt: "2026-03-01T00:00:00Z", valueKg: 75 },
  ]);

  assert.notEqual(bodyweightTimelineSignature(added), signature);
  assert.notEqual(bodyweightTimelineSignature(corrected), signature);
  assert.equal(bodyweightTimelineSignature(base), signature, "같은 입력은 같은 서명");
});

test("서명: 기록이 없으면 안정적인 상수", () => {
  assert.equal(bodyweightTimelineSignature([]), "none");
});
