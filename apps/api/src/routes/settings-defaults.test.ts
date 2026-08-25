import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS as CORE_DEFAULTS } from "@workout/core/services/settings/settings-snapshot";

import { DEFAULT_SETTINGS as API_DEFAULTS } from "./settings";

// `DEFAULT_SETTINGS`가 두 벌 존재한다 — core의 스냅샷 서비스(RSC 부트스트랩이 읽는다)와
// 이 라우트(브라우저·TUI가 GET /api/settings로 읽는다). 새 설정 키를 한쪽에만 넣으면
// **읽는 경로에 따라 기본값이 달라지고**, 증상은 "설정 화면에선 켜져 있는데 실제로는
// 안 먹는다" 같은 형태로 나타난다.
//
// 이 중복은 경계 규칙(core는 apps/api를 모른다) 때문에 생긴 것이라 없앨 수 없다.
// 대신 어긋나면 여기서 실패시킨다.

test("두 DEFAULT_SETTINGS가 같은 키를 갖는다", () => {
  const coreKeys = Object.keys(CORE_DEFAULTS).sort();
  const apiKeys = Object.keys(API_DEFAULTS).sort();
  assert.ok(coreKeys.length > 0, "키 스캔이 비었다 — 가드가 무력하다");
  assert.deepEqual(
    apiKeys,
    coreKeys,
    "한쪽에만 있는 설정 키가 있다 — 읽는 경로에 따라 기본값이 달라진다",
  );
});

test("두 DEFAULT_SETTINGS가 같은 값을 갖는다", () => {
  const mismatched: string[] = [];
  for (const key of Object.keys(CORE_DEFAULTS)) {
    const core = (CORE_DEFAULTS as Record<string, unknown>)[key];
    const api = (API_DEFAULTS as Record<string, unknown>)[key];
    if (core !== api) mismatched.push(`${key}: core=${String(core)} api=${String(api)}`);
  }
  assert.deepEqual(mismatched, [], `기본값이 어긋난 키:\n${mismatched.join("\n")}`);
});
