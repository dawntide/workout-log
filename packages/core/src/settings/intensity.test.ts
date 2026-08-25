import assert from "node:assert/strict";
import test from "node:test";
import { toDisplayIntensity, toStoredIntensity, toStoredRpe } from "./intensity";

// 이 함수의 존재 이유는 "미입력을 0으로 저장하던 것"을 끊는 것이다. 0을 다시
// 통과시키면 평균 RPE가 조용히 희석된다(prod에서 실제로 0.16이 표시됐다).

test("미입력은 null이다 — 0을 저장하지 않는다", () => {
  assert.equal(toStoredRpe(0), null);
  assert.equal(toStoredRpe(null), null);
  assert.equal(toStoredRpe(undefined), null);
  assert.equal(toStoredRpe(Number.NaN), null);
  assert.equal(toStoredRpe(-3), null, "음수는 클램프 후 0 → null");
});

test("입력값은 0.5 단위로 스냅한다", () => {
  assert.equal(toStoredRpe(8), 8);
  assert.equal(toStoredRpe(8.5), 8.5);
  assert.equal(toStoredRpe(8.3), 8.5);
  assert.equal(toStoredRpe(8.2), 8);
});

test("범위를 벗어난 입력은 클램프된다", () => {
  assert.equal(toStoredRpe(99), 10);
  assert.equal(toStoredRpe(10.4), 10);
});

test("반올림이 0으로 떨어지면 null이다", () => {
  // 0.2 -> 0 -> null. 0을 반환하면 다시 희석이 시작된다.
  assert.equal(toStoredRpe(0.2), null);
  assert.equal(toStoredRpe(0.25), 0.5, "0.25는 0.5로 올라가 유효값이 된다");
});

// ── RIR 변환 (M2-2 PR3) ─────────────────────────────────────────────────────

test("G1: 두 모드에서 저장→표시가 왕복한다", () => {
  for (const rpe of [5, 5.5, 6, 7.5, 8, 9, 9.5, 10]) {
    assert.equal(toStoredIntensity(toDisplayIntensity(rpe, "RPE"), "RPE"), rpe, `RPE ${rpe}`);
    assert.equal(toStoredIntensity(toDisplayIntensity(rpe, "RIR"), "RIR"), rpe, `RIR ${rpe}`);
  }
});

test("RIR은 rpe = 10 - rir로 뒤집힌다", () => {
  assert.equal(toStoredIntensity(0, "RIR"), 10, "rir 0(한계까지) = rpe 10");
  assert.equal(toStoredIntensity(2, "RIR"), 8);
  assert.equal(toStoredIntensity(5, "RIR"), 5);
  assert.equal(toDisplayIntensity(10, "RIR"), 0);
  assert.equal(toDisplayIntensity(8, "RIR"), 2);
});

// 이 단언이 결정 1의 안전성을 기계로 고정한다. rir을 10까지 열면 rpe=0이 나와
// REF5의 "값 없음" 센티널과 구별할 수 없게 된다.
test("G2: RIR 모드의 어떤 입력도 rpe = 0을 만들지 않는다", () => {
  const inputs = [0, 0.5, 2.5, 5, 5.5, 6, 9, 10, 99, -3, 0.1, Number.MAX_SAFE_INTEGER];
  for (const input of inputs) {
    const stored = toStoredIntensity(input, "RIR");
    assert.notEqual(stored, 0, `rir=${input} 이 rpe=0을 만들었다 — REF5 센티널과 충돌한다`);
    assert.ok(stored !== null && stored >= 5 && stored <= 10, `rir=${input} → rpe=${stored} 가 5~10 밖`);
  }
});

test("RIR 모드도 미입력은 null이다", () => {
  // rir=0은 유효 입력(한계까지)이라 null이 아니다 — RPE 모드의 0과 의미가 다르다.
  assert.equal(toStoredIntensity(null, "RIR"), null);
  assert.equal(toStoredIntensity(undefined, "RIR"), null);
  assert.equal(toStoredIntensity(Number.NaN, "RIR"), null);
  assert.equal(toStoredIntensity(0, "RIR"), 10, "rir 0은 값이 있다");
});

test("표시: 값 없음(0·null)은 두 모드 모두 null이다", () => {
  for (const mode of ["RPE", "RIR"] as const) {
    assert.equal(toDisplayIntensity(0, mode), null, `${mode}: REF5 센티널 0은 빈 칸`);
    assert.equal(toDisplayIntensity(null, mode), null);
    assert.equal(toDisplayIntensity(undefined, mode), null);
  }
});

test("RIR 상한을 넘는 옛 기록은 클램프하지 않고 그대로 보여준다", () => {
  // rpe 3으로 기록된 세트는 rir 7이다. 5로 낮춰 표시하면 사용자가 실제로 기록한
  // 강도를 앱이 임의로 왜곡하는 셈이다.
  assert.equal(toDisplayIntensity(3, "RIR"), 7);
});

test("RIR 입력도 0.5 단위로 스냅한다", () => {
  assert.equal(toStoredIntensity(2.3, "RIR"), 7.5);
  assert.equal(toStoredIntensity(2.2, "RIR"), 8);
});
