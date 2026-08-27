import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeNextSaveFailure,
  isNextSaveFailureArmed,
  setNextSaveFailureArmed,
  subscribeDebugFlags,
} from "./debug-flags";

// "다음 저장 1회 실패"는 토글이 아니라 **일회용**이다. 이 계약이 깨지면(소비 후에도 무장이
// 남으면) 테스터가 왜 저장이 계속 실패하는지 모른 채 진짜 버그로 오인하게 된다.

test("기본값은 무장 해제이고, 소비해도 아무 일이 없다", () => {
  setNextSaveFailureArmed(false);
  assert.equal(isNextSaveFailureArmed(), false);
  assert.equal(consumeNextSaveFailure(), false);
});

test("무장하면 한 번만 소비된다", () => {
  setNextSaveFailureArmed(true);
  assert.equal(isNextSaveFailureArmed(), true);

  assert.equal(consumeNextSaveFailure(), true, "첫 저장은 실패해야 한다");
  assert.equal(isNextSaveFailureArmed(), false, "소비 후에는 스스로 꺼져야 한다");
  assert.equal(consumeNextSaveFailure(), false, "두 번째 저장은 통과해야 한다");
});

test("상태가 바뀔 때만 구독자에게 알린다", () => {
  setNextSaveFailureArmed(false);
  let calls = 0;
  const unsubscribe = subscribeDebugFlags(() => {
    calls += 1;
  });

  setNextSaveFailureArmed(true);
  assert.equal(calls, 1);

  // 같은 값으로 다시 세팅하면 알리지 않는다 — UI가 불필요하게 리렌더할 이유가 없다.
  setNextSaveFailureArmed(true);
  assert.equal(calls, 1);

  // 소비도 상태 변화이므로 알린다(패널의 "무장됨" 표시가 스스로 풀려야 한다).
  assert.equal(consumeNextSaveFailure(), true);
  assert.equal(calls, 2);

  unsubscribe();
  setNextSaveFailureArmed(true);
  assert.equal(calls, 2, "구독 해제 후에는 알리지 않는다");
  setNextSaveFailureArmed(false);
});
