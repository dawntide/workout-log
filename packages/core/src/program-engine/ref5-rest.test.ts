import assert from "node:assert/strict";
import test from "node:test";
import { createInitialRef5State, generateRef5Session, ref5RestSecondsForStream } from "./ref5";
import { toRef5GeneratedSnapshot } from "./ref5-integration";

/**
 * 스펙 §19.1(수행 운영 지침 · 휴식)의 표를 코드가 그대로 구현하는지 고정한다.
 * 스펙은 범위로 적혀 있고 엔진은 하나를 골라야 하므로, 각 값이 스펙 범위 안에
 * 있는지까지 함께 단언한다 — 표를 고치면 이 테스트가 먼저 깨진다.
 */
const SPEC: Array<{
  stream: Parameters<typeof ref5RestSecondsForStream>[0];
  seconds: number;
  rangeMin: number;
  rangeMax: number;
  spec: string;
}> = [
  { stream: "SQ_H3", seconds: 240, rangeMin: 180, rangeMax: 300, spec: "SQ H3 집중 3-5분" },
  { stream: "SQ_H2", seconds: 240, rangeMin: 180, rangeMax: 300, spec: "SQ H2 집중 3-5분" },
  { stream: "BP_FOCUS", seconds: 240, rangeMin: 180, rangeMax: 300, spec: "BP 집중 3-5분" },
  { stream: "PULL_FOCUS", seconds: 240, rangeMin: 180, rangeMax: 300, spec: "PULL 집중 3-5분" },
  { stream: "SQ_V_NORMAL", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "SQ V 볼륨 2-3분" },
  { stream: "BP_VOLUME_NORMAL", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "BP 볼륨 2-3분" },
  { stream: "PULL_VOLUME_NORMAL", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "PULL 볼륨 2-3분" },
  { stream: "OHP", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "OHP 2-3분" },
  { stream: "SQ_V_MICRO", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "마이크로 2-3분" },
  { stream: "BP_VOLUME_MICRO", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "마이크로 2-3분" },
  { stream: "PULL_VOLUME_MICRO", seconds: 150, rangeMin: 120, rangeMax: 180, spec: "마이크로 2-3분" },
  { stream: "DL", seconds: 180, rangeMin: 120, rangeMax: 240, spec: "DL 2-4분" },
];

test("REF5 rest prescriptions match the spec table in 19.1", () => {
  for (const row of SPEC) {
    const actual = ref5RestSecondsForStream(row.stream);
    assert.equal(actual, row.seconds, `${row.stream} (${row.spec})`);
    assert.ok(
      actual >= row.rangeMin && actual <= row.rangeMax,
      `${row.stream} rest ${actual}s is outside the spec range ${row.rangeMin}-${row.rangeMax}s (${row.spec})`,
    );
  }
});

test("every REF5 stream has a rest prescription", () => {
  // 새 스트림이 생기면 Record 타입이 컴파일을 막지만, 값이 0이나 음수로 들어오는
  // 실수는 타입이 못 잡으므로 여기서 막는다.
  for (const row of SPEC) {
    assert.ok(ref5RestSecondsForStream(row.stream) > 0, `${row.stream} has no rest prescription`);
  }
});

test("prescribed rest reaches the generated session snapshot", () => {
  const domain = generateRef5Session(createInitialRef5State(), {
    sessionId: "REF5:2026-08-24:evt-1",
    snapshotId: "evt-1:snapshot",
    actualStartAt: "2026-08-24T09:00:00.000Z",
    timeZone: "Asia/Seoul",
    todayBodyweightKg: 75,
    recent7DayMeasurementCount: 0,
    recent7DayAverageKg: null,
    manualMicro: false,
  });
  const snapshot = toRef5GeneratedSnapshot({
    planId: "plan-1",
    planName: "REF5",
    sessionKey: "REF5:2026-08-24:evt-1",
    domain,
    startEventId: "evt-1",
    runtimeRevisionAfter: 1,
    startCommitted: true,
  }) as { exercises?: Array<{ sets?: Array<{ restSeconds?: unknown }> }> };

  const exercises = snapshot.exercises ?? [];
  assert.ok(exercises.length > 0, "snapshot has no exercises");

  // mapManualSet처럼 명시 조립하는 경로라, 필드를 빠뜨리면 여기서 undefined가 된다.
  for (const exercise of exercises) {
    for (const set of exercise.sets ?? []) {
      assert.equal(
        typeof set.restSeconds,
        "number",
        `set is missing restSeconds: ${JSON.stringify(set)}`,
      );
      assert.ok((set.restSeconds as number) > 0, "restSeconds must be positive");
    }
  }
});
