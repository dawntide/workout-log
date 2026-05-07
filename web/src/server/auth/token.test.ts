import assert from "node:assert/strict";
import { test } from "node:test";
import { generateAuthTokenPair, sha256Hex } from "./token";

test("sha256Hex is deterministic and hex encoded", async () => {
  const a = await sha256Hex("token-value");
  const b = await sha256Hex("token-value");

  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("generateAuthTokenPair returns a raw token and matching stored hash", async () => {
  const pair = await generateAuthTokenPair();

  assert.match(pair.token, /^[0-9a-f]{64}$/);
  assert.match(pair.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(pair.token, pair.tokenHash);
  assert.equal(await sha256Hex(pair.token), pair.tokenHash);
});
