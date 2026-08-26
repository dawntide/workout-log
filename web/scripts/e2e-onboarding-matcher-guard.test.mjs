#!/usr/bin/env node
// E2E의 온보딩 해제 헬퍼가 **느슨한 "닫기" 매처**를 쓰지 못하게 막는다.
//
// `getByRole("button", { name: /닫기/ })`는 정규식이라 앵커가 없다. 화면에 "닫기"를
// 포함하는 다른 버튼이 있으면 그것도 잡는다 — 실제로 이메일 인증 배너의
// **"인증 배너 닫기"**를 잡아 온보딩 대신 배너를 클릭했고, 배너가 안 사라져
// `toHaveCount(0)`이 영원히 실패했다.
//
// 로컬에서는 안 걸린다. `NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED`가 기본 off라 배너가
// 아예 안 뜨기 때문이다. CI·nightly는 그 플래그가 켜져 있어서 거기서만 터진다 —
// 2026-08-25 nightly가 3개 스펙에서 이걸로 깨졌다(1 failed + 2 flaky).
//
// 온보딩 닫기 버튼의 접근명은 정확히 `"닫기"`다(v2-onboarding.tsx). `exact: true`면
// 배너를 안 잡는다.

import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// CI는 `working-directory: web`에서 돌린다 — git pathspec은 cwd 기준이라 루트를
// 고정하지 않으면 매치가 0건이 되고 가드가 조용히 통과한다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function grep(pattern) {
  try {
    return execFileSync("git", ["grep", "-nE", pattern, "--", "web/e2e"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

test("스캔이 실제 스펙을 읽고 있다 (커버리지 단정)", () => {
  // 0건이 "위반 없음"인지 "아무것도 안 읽었음"인지 구분되지 않으면 게이트가 무력하다.
  const anyClose = grep('name: "닫기"');
  assert.ok(
    anyClose.length > 0,
    `온보딩 해제를 쓰는 스펙을 하나도 못 찾았다 — 경로나 패턴이 낡았다`,
  );
});

test("온보딩 해제가 느슨한 정규식으로 '닫기'를 찾지 않는다", () => {
  // `/닫기/`뿐 아니라 `/닫기|Close/`처럼 묶은 형태도 같은 문제다 — 정규식이면 전부.
  const loose = grep('getByRole\\("button", \\{ name: /[^/]*닫기');
  assert.deepEqual(
    loose,
    [],
    `느슨한 "닫기" 매처:\n${loose.map((line) => `  ${line}`).join("\n")}\n` +
      `\`{ name: "닫기", exact: true }\`를 쓸 것 — 정규식은 "인증 배너 닫기"까지 잡아` +
      ` 온보딩 대신 배너를 클릭한다(로컬에서는 배너 플래그가 꺼져 있어 안 걸린다).`,
  );
});
