import test from "node:test";
import assert from "node:assert/strict";

import {
  API_TOKEN_PREFIX,
  API_TOKEN_SCOPES,
  DEFAULT_API_TOKEN_SCOPE,
  isApiTokenValue,
  normalizeApiTokenScope,
} from "./api-token";
import { generateAuthTokenPair, sha256Hex } from "./token";

/**
 * DB를 타는 발급·폐기·검증은 E2E가 덮는다(발급 → 호출 → 폐기 → 401).
 * 여기서는 **순수부의 계약**을 잠근다.
 */

test("PAT 접두사로 세션 토큰과 갈린다", () => {
  assert.equal(isApiTokenValue(`${API_TOKEN_PREFIX}abc123`), true);
  // 세션 토큰은 접두사 없는 hex다 — 잘못 갈리면 세션이 PAT 표면 제한에 걸린다.
  assert.equal(isApiTokenValue("2f6a9c1b4e8d"), false);
  assert.equal(isApiTokenValue(""), false);
  // 접두사가 **앞**에 있어야 한다. 중간에 있는 건 PAT가 아니다.
  assert.equal(isApiTokenValue(`abc${API_TOKEN_PREFIX}123`), false);
});

test("기본 스코프는 read — 쓰기는 명시 선택이다", () => {
  assert.equal(DEFAULT_API_TOKEN_SCOPE, "read");
  // 알 수 없는 값이 read_write로 승격되면 안 된다.
  for (const bad of [null, undefined, "", "admin", "write", "READ_WRITE_PLUS", 42, {}]) {
    const scope = normalizeApiTokenScope(bad);
    assert.notEqual(
      scope,
      "read_write",
      `${JSON.stringify(bad)}가 쓰기 스코프로 승격됐다`,
    );
  }
  assert.equal(normalizeApiTokenScope("read_write"), "read_write");
  assert.equal(normalizeApiTokenScope("READ_WRITE"), "read_write");
  assert.equal(normalizeApiTokenScope("  read  "), "read");
});

test("스코프 값 집합이 둘뿐이다", () => {
  assert.deepEqual([...API_TOKEN_SCOPES], ["read", "read_write"]);
});

test("해시는 접두사까지 포함한 제시 문자열 기준이다", async () => {
  // 발급이 `prefix + hex`를 해시하므로 검증도 같은 문자열을 해시해야 맞는다.
  // 접두사를 떼고 해시하면 발급한 토큰으로 인증이 안 된다.
  const pair = await generateAuthTokenPair();
  const presented = `${API_TOKEN_PREFIX}${pair.token}`;
  const hashOfPresented = await sha256Hex(presented);
  assert.notEqual(
    hashOfPresented,
    pair.tokenHash,
    "접두사 없는 해시와 같다면 어느 쪽을 저장했는지 구분되지 않는다",
  );
  assert.equal(hashOfPresented, await sha256Hex(presented));
  assert.equal(hashOfPresented.length, 64);
});

test("토큰은 매번 다르다", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    const pair = await generateAuthTokenPair();
    assert.equal(seen.has(pair.token), false, "랜덤 토큰이 반복됐다");
    seen.add(pair.token);
  }
});
