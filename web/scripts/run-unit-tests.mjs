import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { discoverUnitTests, webDir } from "./unit-test-discovery.mjs";

// `pnpm test:unit`의 진입점. 실행 대상은 디스크에서 찾는다(unit-test-discovery.mjs 참고) —
// package.json에 파일을 나열하지 않으므로 새 테스트가 목록 누락으로 빠질 수 없다.

const require = createRequire(import.meta.url);

/**
 * tsx CLI의 실제 진입 파일. `.bin/tsx` 셸 래퍼는 Windows에서 직접 spawn할 수 없어
 * 패키지의 bin 엔트리를 풀어 node로 띄운다.
 */
function resolveTsxCli() {
  const manifestPath = require.resolve("tsx/package.json");
  const { bin } = require("tsx/package.json");
  const entry = typeof bin === "string" ? bin : bin.tsx;
  return path.resolve(path.dirname(manifestPath), entry);
}

function run(label, fileCount, command, args) {
  console.log(`\n▶ ${label} (${fileCount}개 파일)`);
  const result = spawnSync(command, args, {
    cwd: webDir,
    stdio: "inherit",
    env: {
      ...process.env,
      // 일부 유닛 테스트가 db/client를 전이적으로 import해 로드 시점에 DATABASE_URL을 요구한다.
      // 연결은 lazy라 실제 I/O는 없고, import 가드만 통과시키면 된다(CI도 같은 더미를 쓴다).
      DATABASE_URL: process.env.DATABASE_URL || "postgres://ci:ci@127.0.0.1:5432/ci_unit",
    },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const { nodeTests, tsxTests } = discoverUnitTests();

// 스캔이 조용히 0건으로 떨어지면 "전부 통과"로 보여 게이트가 무력해진다 — 커버리지를 단정한다.
if (nodeTests.length === 0) {
  console.error("유닛 테스트 발견 실패: web/scripts에 *.test.mjs 가드가 하나도 없다");
  process.exit(1);
}
if (tsxTests.length === 0) {
  console.error("유닛 테스트 발견 실패: web/src에 *.test.ts(x)가 하나도 없다");
  process.exit(1);
}

const nodeStatus = run("스크립트 가드", nodeTests.length, process.execPath, ["--test", ...nodeTests]);
if (nodeStatus !== 0) process.exit(nodeStatus);

const tsxStatus = run("앱 유닛", tsxTests.length, process.execPath, [
  resolveTsxCli(),
  "--test",
  ...tsxTests,
]);
process.exit(tsxStatus);
