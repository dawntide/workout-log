import assert from "node:assert/strict";
import test from "node:test";

import { replaySessionPerformedAt } from "./seed-demo-program-replay";

/**
 * 날짜 계산만 잠근다 — 재생 자체는 DB가 있어야 돌아 `db:verify:programs`가 맡는다.
 * 여기 규칙 하나가 틀리면 캘린더가 비거나 시드가 통째로 실패하는데, 둘 다 DB 없이 잡힌다.
 */
const COUNT = 6;
const at = (now: string, index: number, wallClock = now) =>
  replaySessionPerformedAt({
    now: new Date(now),
    sessionCount: COUNT,
    index,
    wallClock: new Date(wallClock),
  }).toISOString();

test("마지막 세션은 오늘이다 — 어제서 끊으면 월초에 빈 달력이 뜬다", () => {
  assert.equal(at("2026-09-01T15:00:00.000Z", COUNT - 1).slice(0, 10), "2026-09-01");
});

test("이틀 간격으로 과거에서 현재로 온다", () => {
  const days = Array.from({ length: COUNT }, (_, i) => at("2026-09-01T15:00:00.000Z", i).slice(0, 10));
  assert.deepEqual(days, [
    "2026-08-22", "2026-08-24", "2026-08-26", "2026-08-28", "2026-08-30", "2026-09-01",
  ]);
});

test("09:00 UTC 전에 시드하면 오늘 몫을 현재 시각으로 당긴다", () => {
  // 자르지 않으면 미래에 한 운동이 된다.
  assert.equal(at("2026-09-01T06:00:00.000Z", COUNT - 1), "2026-09-01T06:00:00.000Z");
  // 이전 세션들은 그대로 09:00이다 — 마지막 하나만 걸린다.
  assert.equal(at("2026-09-01T06:00:00.000Z", COUNT - 2), "2026-08-30T09:00:00.000Z");
});

test("09:00 UTC 후에 시드하면 그대로 09:00이다", () => {
  assert.equal(at("2026-09-01T15:00:00.000Z", COUNT - 1), "2026-09-01T09:00:00.000Z");
});

test("미래로 주입된 now도 벽시계에서 잘린다", () => {
  // 이것이 실측으로 시드를 통째로 깨뜨린 경우다 — REF5는 시작이 미래인 세션을
  // "completedAt cannot precede actualStartAt"으로 거부한다. now만 보면 09:00이
  // now(15:00)보다 이르니 통과해 버리는데, 진짜 시각은 07:00이라 미래다.
  assert.equal(
    at("2026-09-01T15:00:00.000Z", COUNT - 1, "2026-09-01T07:00:00.000Z"),
    "2026-09-01T07:00:00.000Z",
  );
});

test("어떤 시각에 돌려도 미래 세션을 만들지 않는다", () => {
  for (const hour of ["00", "06", "09", "12", "23"]) {
    const now = `2026-09-01T${hour}:00:00.000Z`;
    for (let i = 0; i < COUNT; i += 1) {
      assert.ok(
        new Date(at(now, i)).getTime() <= new Date(now).getTime(),
        `${now} index=${i} 가 미래다`,
      );
    }
  }
});

test("자른 뒤에도 시간순이 유지된다 — 뒤집히면 진행 재생이 어긋난다", () => {
  for (const hour of ["00", "06", "09", "15"]) {
    const now = `2026-09-01T${hour}:00:00.000Z`;
    const times = Array.from({ length: COUNT }, (_, i) => new Date(at(now, i)).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b), `${now}에서 순서가 깨졌다`);
    assert.equal(new Set(times).size, COUNT, `${now}에서 같은 시각이 겹쳤다`);
  }
});
