import assert from "node:assert/strict";
import test from "node:test";

import { demoBodyweightEntries } from "./seed-demo-history";

/** 격자 규칙만 잠근다 — 삭제/삽입은 DB가 있어야 돌아 통합 확인이 맡는다. */
const userId = "00000000-0000-4000-8000-0000000000aa";
const grid = (now: string, weeks = 12) =>
  demoBodyweightEntries({ userId, weeks, now: new Date(now) }).map((v) =>
    (v.measuredAt as Date).toISOString(),
  );

test("주 1회, 12주치를 과거에서 현재로 만든다", () => {
  const at = grid("2026-09-01T15:00:00.000Z");
  assert.equal(at.length, 12);
  for (let i = 1; i < at.length; i += 1) {
    const gap = new Date(at[i]!).getTime() - new Date(at[i - 1]!).getTime();
    assert.equal(gap, 7 * 86_400_000, `${i}번째 간격이 1주가 아니다`);
  }
});

test("미래 측정을 만들지 않는다", () => {
  for (const hour of ["00", "06", "09", "12", "23"]) {
    const now = `2026-09-01T${hour}:00:00.000Z`;
    for (const at of grid(now)) {
      assert.ok(new Date(at).getTime() <= new Date(now).getTime(), `${now}에서 ${at}가 미래다`);
    }
  }
});

test("같은 시각이 겹치지 않는다 — unique 제약에 걸린다", () => {
  // 미래를 당기지 않고 건너뛰는 이유가 이것이다. 당기면 마지막 둘이 같은 시각이 된다.
  const at = grid("2026-09-01T06:00:00.000Z");
  assert.equal(new Set(at).size, at.length);
});

test("격자는 오늘에 앵커돼 날짜가 바뀌면 통째로 밀린다 — 그래서 갈아 끼워야 한다", () => {
  // 누적의 원인이 이것이다. 하루 차이로 12개가 전부 새 시각이 되어 충돌하지 않는다(실측 12→24).
  const a = grid("2026-09-01T15:00:00.000Z");
  const b = grid("2026-09-02T15:00:00.000Z");
  assert.equal(a.filter((v) => b.includes(v)).length, 0, "겹치는 시각이 있으면 이 전제가 깨진다");
});
