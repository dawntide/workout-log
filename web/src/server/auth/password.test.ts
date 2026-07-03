import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, passwordNeedsRehash } from "./password";

const PASSWORD = "correct-horse-8chars";

// 구(250k) 포맷 해시를 실제로 생성 — 새 코드가 이를 여전히 검증하는지(기존 사용자 로그인 보장) 위해.
async function makeLegacyHash(password: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" }, key, 256),
  );
  const b64 = (b: Uint8Array) => {
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  };
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}

test("현재 해시: hash → verify 라운드트립", async () => {
  const stored = await hashPassword(PASSWORD);
  assert.ok(stored.startsWith("pbkdf2$600000$"), "600k iteration 포맷");
  assert.equal(await verifyPassword(PASSWORD, stored), true);
  assert.equal(await verifyPassword("wrong-password-x", stored), false);
});

test("하위호환(CRITICAL): 구 250k 해시도 새 코드로 검증됨 → 기존 사용자 로그인 유지", async () => {
  const legacy = await makeLegacyHash(PASSWORD, 250_000);
  assert.equal(await verifyPassword(PASSWORD, legacy), true);
  assert.equal(await verifyPassword("nope-nope-nope", legacy), false);
});

test("passwordNeedsRehash: 구 해시 true, 신 해시 false", async () => {
  const legacy = await makeLegacyHash(PASSWORD, 250_000);
  const current = await hashPassword(PASSWORD);
  assert.equal(passwordNeedsRehash(legacy), true, "250k < 600k → 재해시 대상");
  assert.equal(passwordNeedsRehash(current), false, "600k == 정책 → 재해시 불필요");
});

test("passwordNeedsRehash: 미지/손상 포맷은 방어적으로 재해시 대상", () => {
  assert.equal(passwordNeedsRehash("bcrypt$x$y"), true);
  assert.equal(passwordNeedsRehash("pbkdf2$notanumber$s$h"), true);
  assert.equal(passwordNeedsRehash(""), true);
});

test("점진적 재해시 플로우: 구 해시 verify → rehash → 신 해시 verify", async () => {
  const legacy = await makeLegacyHash(PASSWORD, 250_000);
  assert.equal(await verifyPassword(PASSWORD, legacy), true); // 로그인 성공
  assert.equal(passwordNeedsRehash(legacy), true); // 승격 필요
  const upgraded = await hashPassword(PASSWORD); // 재해시
  assert.equal(passwordNeedsRehash(upgraded), false);
  assert.equal(await verifyPassword(PASSWORD, upgraded), true); // 다음 로그인도 OK
});
