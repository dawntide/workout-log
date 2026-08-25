import assert from "node:assert/strict";
import test from "node:test";
import { clampIndex, resolveIndex } from "./trend-line-chart";

// 스크럽 좌표 계산은 e1RM 전용이었다가 체중 차트와 공유하게 됐다. 두 차트가 같은
// 구현을 쓰는 것이 이 파일이 존재하는 이유이므로, 경계 동작을 여기서 잠근다.

test("clampIndex: 범위를 벗어난 인덱스를 끝으로 붙인다", () => {
  assert.equal(clampIndex(-5, 10), 0);
  assert.equal(clampIndex(99, 10), 9);
  assert.equal(clampIndex(3, 10), 3);
});

test("clampIndex: 빈 시리즈는 0", () => {
  assert.equal(clampIndex(5, 0), 0);
  assert.equal(clampIndex(-1, 0), 0);
});

test("resolveIndex: 폭 안의 위치를 인덱스로 환산한다", () => {
  // 폭 100, 점 5개 → 0·25·50·75·100 위치가 각각 0..4
  assert.equal(resolveIndex(0, 0, 100, 5), 0);
  assert.equal(resolveIndex(50, 0, 100, 5), 2);
  assert.equal(resolveIndex(100, 0, 100, 5), 4);
});

test("resolveIndex: 요소 좌측 오프셋을 뺀다", () => {
  assert.equal(resolveIndex(250, 200, 100, 5), 2);
});

test("resolveIndex: 밖으로 나간 포인터는 양 끝으로 붙는다", () => {
  // 스크럽 중 손가락이 차트를 벗어나도 선택이 튀지 않아야 한다.
  assert.equal(resolveIndex(-999, 0, 100, 5), 0);
  assert.equal(resolveIndex(999, 0, 100, 5), 4);
});

test("resolveIndex: 점이 하나이거나 폭이 0이면 0", () => {
  assert.equal(resolveIndex(50, 0, 100, 1), 0);
  assert.equal(resolveIndex(50, 0, 0, 5), 0);
});
