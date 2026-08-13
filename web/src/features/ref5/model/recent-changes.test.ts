import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRef5RecentChangeRows,
  type Ref5RecentChangeRow,
} from "./recent-changes";

type Change = {
  eventId: string;
  lift: string;
  kind: string;
  beforeKg: number;
  afterKg: number;
  causeEventIds: string[];
};

function change(partial: Partial<Change> & Pick<Change, "lift" | "kind">): Change {
  return {
    eventId: `${partial.kind}:${partial.lift}:c1`,
    beforeKg: 100,
    afterKg: 100,
    causeEventIds: [],
    ...partial,
  };
}

function statusWith(changes: Change[]) {
  return { recentChanges: changes } as unknown as Parameters<typeof buildRef5RecentChangeRows>[0];
}

function rowsOf(changes: Change[], locale: "ko" | "en" = "ko"): Ref5RecentChangeRow[] {
  return buildRef5RecentChangeRows(statusWith(changes), locale);
}

test("최신순으로 뒤집는다 — 엔진은 오래된 것부터 쌓는다", () => {
  const rows = rowsOf([
    change({ lift: "SQ", kind: "INCREASE", beforeKg: 97.5, afterKg: 100 }),
    change({ lift: "BP", kind: "MAINTAIN", beforeKg: 62.5, afterKg: 62.5 }),
    change({ lift: "DL", kind: "INCREASE", beforeKg: 140, afterKg: 142.5 }),
  ]);
  assert.deepEqual(
    rows.map((row) => row.liftLabel),
    ["DL", "BP 집중", "SQ 하드"],
  );
});

test("증량 행 — 화살표·기준 변화·종류", () => {
  const [row] = rowsOf([change({ lift: "SQ", kind: "INCREASE", beforeKg: 100, afterKg: 102.5 })]);
  assert.equal(row!.liftLabel, "SQ 하드");
  assert.equal(row!.arrow, "↑");
  assert.equal(row!.direction, "up");
  assert.equal(row!.weightText, "100 → 102.5 kg");
  assert.equal(row!.kindLabel, "증량");
});

test("유지는 화살표 →, 무게를 한 번만 적는다(62.5 → 62.5 금지)", () => {
  const [row] = rowsOf([change({ lift: "BP", kind: "MAINTAIN", beforeKg: 62.5, afterKg: 62.5 })]);
  assert.equal(row!.arrow, "→");
  assert.equal(row!.direction, "flat");
  assert.equal(row!.weightText, "62.5 kg");
  assert.equal(row!.kindLabel, "유지");
});

test("감량 3종은 사유가 라벨로 구분된다 — 전부 ↓", () => {
  const rows = rowsOf([
    change({ lift: "SQ", kind: "IMMEDIATE_DECREASE", beforeKg: 100, afterKg: 97.5 }),
    change({ lift: "PULL", kind: "STAGNATION_DECREASE", beforeKg: 90, afterKg: 87.5 }),
    change({ lift: "OHP", kind: "AUXILIARY_CAP_DECREASE", beforeKg: 45, afterKg: 43.75 }),
  ]);
  assert.deepEqual(
    rows.map((row) => `${row.arrow} ${row.liftLabel} ${row.weightText} ${row.kindLabel}`),
    [
      "↓ OHP 45 → 43.75 kg 상한 감량",
      "↓ PULL 집중(총하중) 90 → 87.5 kg 정체 감량",
      "↓ SQ 하드 100 → 97.5 kg 즉시 감량",
    ],
  );
});

// 재고정의 before/after는 기준 총하중이 아니라 추가 중량이라, PULL 기준 변화 행과
// 섞이면 같은 숫자 축으로 읽힌다. 종류 라벨이 그 구분을 지는지 고정한다.
test("PULL 재고정은 별도 종류 라벨을 단다", () => {
  const [changed] = rowsOf([change({ lift: "PULL", kind: "PULL_RELOCK", beforeKg: 20, afterKg: 22.5 })]);
  assert.equal(changed!.kindLabel, "창 재고정");
  assert.equal(changed!.arrow, "↑");
  assert.equal(changed!.weightText, "20 → 22.5 kg");

  const [same] = rowsOf([change({ lift: "PULL", kind: "PULL_RELOCK", beforeKg: 20, afterKg: 20 })]);
  assert.equal(same!.arrow, "→", "값이 그대로면 방향 없음");
  assert.equal(same!.weightText, "20 kg");
});

test("en 로케일 라벨", () => {
  const rows = rowsOf(
    [
      change({ lift: "SQ", kind: "INCREASE", beforeKg: 100, afterKg: 102.5 }),
      change({ lift: "BP", kind: "MAINTAIN", beforeKg: 62.5, afterKg: 62.5 }),
    ],
    "en",
  );
  assert.deepEqual(
    rows.map((row) => `${row.liftLabel} ${row.kindLabel}`),
    ["BP focus hold", "SQ hard increase"],
  );
});

test("비어 있거나 값이 깨진 항목은 조용히 건너뛴다", () => {
  assert.deepEqual(buildRef5RecentChangeRows(null, "ko"), []);
  assert.deepEqual(buildRef5RecentChangeRows(statusWith([]), "ko"), []);
  const rows = rowsOf([
    change({ lift: "SQ", kind: "INCREASE", beforeKg: Number.NaN, afterKg: 102.5 }),
    change({ lift: "DL", kind: "INCREASE", beforeKg: 140, afterKg: 142.5 }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.liftLabel, "DL");
});
