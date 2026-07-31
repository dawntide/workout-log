import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// web의 유닛 테스트 목록을 디스크에서 직접 찾는다.
//
// 원래 이 목록은 package.json의 `test:unit`/`test:extra`에 손으로 나열돼 있었다. 그 방식은
// "새 테스트 파일을 추가했는데 어느 목록에도 안 넣으면 CI에서 조용히 안 돈다"는 침묵 실패를
// 만든다 — #591에서 `session-labels.test.ts`가 실제로 그렇게 0개로 집계됐고, 전체 시스템 점검
// 2026-07(§5.4-4)이 "고아 테스트 가드는 별도 과제"로 남긴 항목이 이것이다.
//
// 목록을 가드로 지키는 대신 목록 자체를 없앤다. packages/core가 이미 `find src -name '*.test.ts'`로
// 같은 일을 하지만, 여기는 Windows 로컬에서도 그대로 돌아야 해서(개발 셸이 POSIX가 아닐 수 있다)
// 셸 글롭 대신 node로 걷는다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const webDir = path.resolve(scriptDir, "..");

/** 걷지 않을 디렉터리 — 빌드 산출물·의존성. */
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);

function walk(dir, matches, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), matches, out);
    } else if (entry.isFile() && matches(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** webDir 기준 상대경로(POSIX 구분자)로 정규화 — CLI 인자와 가드 비교에 같은 형태를 쓴다. */
function toRelative(absolutePaths) {
  return absolutePaths
    .map((absolute) => path.relative(webDir, absolute).split(path.sep).join("/"))
    .sort();
}

/**
 * web의 유닛 테스트를 러너별로 나눠 찾는다.
 * - `scripts/*.test.mjs`: 워크플로/스크립트 가드. 순수 node라 `node --test`로 돈다.
 * - `src/**\/*.test.ts(x)`: 앱 유닛. TS라 tsx 로더가 필요하다.
 *
 * packages/core의 테스트는 core 자체 게이트(`pnpm -C packages/core test`)가 글롭으로 돌리므로
 * 여기서 중복 실행하지 않는다.
 */
export function discoverUnitTests() {
  const nodeTests = toRelative(
    walk(path.join(webDir, "scripts"), (name) => name.endsWith(".test.mjs"), []),
  );
  const tsxTests = toRelative(
    walk(path.join(webDir, "src"), (name) => /\.test\.tsx?$/.test(name), []),
  );
  return { nodeTests, tsxTests };
}
