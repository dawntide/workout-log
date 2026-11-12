import assert from "node:assert/strict";
import test from "node:test";
import {
  isStoredSessionTokenHashed,
  sessionTokenCandidates,
  sessionTokenDisplayValue,
  storedSessionToken,
} from "./session-token";
import { sha256Hex } from "./token";

const RAW = "a".repeat(64);

test("stored value is a prefixed sha256 of the cookie token", async () => {
  const stored = await storedSessionToken(RAW);
  assert.equal(stored, `sha256:${await sha256Hex(RAW)}`);
  assert.equal(isStoredSessionTokenHashed(stored), true);
  assert.notEqual(stored, RAW);
});

test("candidates put the hashed value first and accept a legacy plaintext row", async () => {
  const candidates = await sessionTokenCandidates(RAW);
  assert.deepEqual(candidates, [await storedSessionToken(RAW), RAW]);
});

test("an empty token matches nothing", async () => {
  assert.deepEqual(await sessionTokenCandidates(""), []);
});

test("a leaked stored value cannot be replayed as a cookie", async () => {
  const stored = await storedSessionToken(RAW);

  // 저장값을 통째로 쿠키에 넣는 경우: 평문 형식이 아니라 평문 후보가 생기지 않는다.
  const replayedWhole = await sessionTokenCandidates(stored);
  assert.equal(replayedWhole.length, 1);
  assert.equal(replayedWhole.includes(stored), false);

  // 접두사를 떼고 hex만 넣는 경우: 평문 후보는 생기지만 저장값(접두사 포함)과 다르다.
  const hexOnly = stored.slice("sha256:".length);
  const replayedHex = await sessionTokenCandidates(hexOnly);
  assert.equal(replayedHex.includes(stored), false);
});

test("tokens outside the legacy plaintext format never get a plaintext candidate", async () => {
  for (const token of ["wlpat_abcdef", "A".repeat(64), "a".repeat(63), `${"a".repeat(64)} `]) {
    assert.equal((await sessionTokenCandidates(token)).length, 1, token);
  }
});

test("display value drops the storage prefix", async () => {
  const stored = await storedSessionToken(RAW);
  assert.equal(sessionTokenDisplayValue(stored), await sha256Hex(RAW));
  assert.equal(sessionTokenDisplayValue(RAW), RAW);
});
