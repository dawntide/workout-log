import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverUnitTests, webDir } from "./unit-test-discovery.mjs";

// 유닛 테스트 발견이 다시 "손으로 나열한 목록"으로 돌아가지 못하게 막는다.
//
// 목록 방식의 실패는 조용하다: 파일을 빼먹어도 CI는 초록이고, 로그에는 줄어든 테스트 수만 남는다.
// (#591에서 session-labels.test.ts가 실제로 그렇게 빠졌다.) 그래서 ① test:unit이 러너를 쓰는지,
// ② CI가 그 스크립트를 실제로 부르는지, ③ 디스크의 테스트가 전부 발견되는지를 함께 확인한다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const packageJson = JSON.parse(fs.readFileSync(path.join(webDir, "package.json"), "utf8"));

test("test:unit이 파일을 나열하지 않고 러너에 위임한다", () => {
  assert.equal(
    packageJson.scripts["test:unit"],
    "node scripts/run-unit-tests.mjs",
    "test:unit이 러너가 아니다 — 파일을 손으로 나열하면 새 테스트가 조용히 빠진다",
  );
});

test("web 테스트를 여러 개 나열하는 집합 스크립트가 새로 생기지 않는다", () => {
  // 단일 파일 단축 스크립트(test:settings:policy 등)는 개발 중 한 스위트만 빨리 돌리는 용도라
  // 그대로 둔다 — 커버리지를 자처하지 않으므로 드리프트가 생기지 않는다. 위험한 건 "이 목록이
  // 곧 전체"인 척하는 집합 스크립트다: 파일을 빼먹어도 초록으로 통과한다.
  const listPattern = /(^|[\s"'])src\/[^\s"']*\.test\.tsx?\b/g;
  const offenders = Object.entries(packageJson.scripts)
    .filter(([name]) => name.startsWith("test"))
    .filter(([, script]) => (script.match(listPattern) ?? []).length >= 2)
    .map(([name]) => name);

  assert.deepEqual(
    offenders,
    [],
    `web 테스트 파일을 여러 개 나열하는 스크립트: ${offenders.join(", ")}\n` +
      "발견은 scripts/unit-test-discovery.mjs 한 곳이 담당한다. 목록이 늘면 다시 드리프트가 생긴다.",
  );
});

test("CI가 test:unit을 실제로 부른다", () => {
  const ci = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  assert.match(
    ci,
    /run:\s*pnpm test:unit\b/,
    "ci.yml이 test:unit을 부르지 않는다 — 러너가 아무 데서도 안 돈다",
  );
});

test("git이 추적하는 web 테스트가 전부 발견된다", () => {
  // 발견 로직(fs 재귀)과 같은 버그를 공유하지 않도록, 기대 목록은 git 인덱스에서 받는다.
  const listed = spawnSync("git", ["-C", repoRoot, "ls-files", "web/src", "web/scripts"], {
    encoding: "utf8",
  });
  assert.equal(listed.status, 0, `git ls-files 실패: ${listed.stderr}`);

  const expected = listed.stdout
    .split("\n")
    .filter((file) => /\.test\.(tsx?|mjs)$/.test(file))
    .map((file) => file.replace(/^web\//, ""))
    .sort();

  assert.ok(expected.length > 0, "git이 추적하는 web 테스트가 0건 — 스캔 기준이 무너졌다");

  const { nodeTests, tsxTests } = discoverUnitTests();
  const discovered = new Set([...nodeTests, ...tsxTests]);
  const missing = expected.filter((file) => !discovered.has(file));

  assert.deepEqual(
    missing,
    [],
    `러너가 못 찾는 테스트 파일: ${missing.join(", ")}\n` +
      "이 파일들은 CI에서 한 번도 실행되지 않는다.",
  );
});
