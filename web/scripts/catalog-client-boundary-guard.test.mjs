#!/usr/bin/env node
// 오픈 카탈로그(723종)가 클라이언트 번들로 새지 않게 막는다.
//
// 실제로 한 번 샜다. `stats/default-exercise.ts`를 전체 카탈로그 해석기로 바꿨는데
// 그 모듈을 클라이언트 훅(`use-stats-1rm-controller.ts`)이 쓰고 있어서, 카탈로그
// 723종이 통째로 클라이언트 청크에 실렸다 — 그 청크의 95%가 카탈로그였고 gzip
// 10KB였다. 번들 **예산은 통과**했으므로(여유가 있었다) 예산 가드로는 안 잡힌다.
//
// 그래서 경계 자체를 잠근다: 무거운 모듈을 누가 import할 수 있는지 명시한다.
// 계획서: docs/exercise-catalog-plan.md §4 G6.

import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// CI는 `working-directory: web`에서 돌린다 — git pathspec은 cwd 기준이라 루트를
// 고정하지 않으면 매치가 0건이 되고 가드가 조용히 통과한다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** 오픈 데이터 723종을 끌고 오는 모듈들. */
// 상대 경로("./open-catalog")와 별칭 경로("@workout/core/exercise/all-exercises")를
// 모두 잡아야 한다 — 접두사를 고정하면 같은 패키지 안의 상대 import를 놓친다.
const HEAVY_MODULES = ["open-catalog", "all-exercises"];

/**
 * 무거운 모듈을 import해도 되는 파일 — **전부 서버 전용 경로여야 한다.**
 *
 * 새 파일을 넣기 전에 "이 모듈이 클라이언트 컴포넌트에서 도달 가능한가"를 확인할 것.
 * 도달 가능하면 넣지 말고, `catalog.ts`의 경량 경로(`open-equipment.ts`)를 쓴다.
 */
const SERVER_ONLY_IMPORTERS = new Set([
  "packages/core/src/exercise/all-exercises.ts", // 자기 자신(open-catalog 소비)
  "packages/core/src/db/seed.ts", // 전역 exercise 테이블 채우기
  "packages/core/src/muscle-groups/category-to-muscle.ts", // 근육군 해석(통계 서비스)
  "packages/core/src/exercise/resolve.ts", // 기록 저장·통계의 이름 해석
  "packages/core/src/exercise/catalog.test.ts",
  "packages/core/src/exercise/catalog.equipment.test.ts",
]);

function grep(pattern, pathspecs) {
  try {
    return execFileSync(
      "git",
      ["grep", "--untracked", "-lE", pattern, "--", ...pathspecs],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}

const SEARCH_PATHS = ["packages/core/src", "web/src", "apps/api/src"];
const importers = grep(
  HEAVY_MODULES.map((module) => `from "[^"]*/${module}"`).join("|"),
  SEARCH_PATHS,
)
  .split("\n")
  .filter(Boolean);

test("스캔이 실제로 import를 읽고 있다 (커버리지 단정)", () => {
  // 0건이 "위반 없음"인지 "아무것도 안 읽었음"인지 구분되지 않으면 게이트가 무력하다.
  assert.ok(
    importers.includes("packages/core/src/db/seed.ts"),
    `알려진 importer가 스캔에 안 잡혔다 — 패턴이나 경로가 낡았다: ${importers.join(", ")}`,
  );
});

test("오픈 카탈로그는 서버 전용 경로에서만 import된다", () => {
  const unexpected = importers.filter((file) => !SERVER_ONLY_IMPORTERS.has(file));
  assert.deepEqual(
    unexpected,
    [],
    `오픈 카탈로그를 import하는 미분류 파일:\n${unexpected.map((f) => `  ${f}`).join("\n")}\n` +
      `클라이언트에서 도달 가능하면 723종이 번들에 실린다. 장비 판별만 필요하면 ` +
      `catalog.ts의 supportsPlateBreakdown/resolveExerciseEquipment를 쓸 것 ` +
      `(그쪽은 경량 open-equipment.ts만 참조한다).`,
  );
});

test("catalog.ts는 무거운 모듈을 참조하지 않는다", () => {
  // 이 파일은 클라이언트 컴포넌트가 직접 import한다(supportsPlateBreakdown).
  // 여기서 전체 카탈로그를 참조하면 위 목록과 무관하게 곧장 샌다.
  const heavyImporters = new Set(importers);
  assert.ok(
    !heavyImporters.has("packages/core/src/exercise/catalog.ts"),
    "catalog.ts가 오픈 카탈로그를 참조한다 — 클라이언트 진입점이라 곧장 번들에 실린다",
  );
});

test("허용 목록에 사라진 파일이 남아 있지 않다", () => {
  const stale = [...SERVER_ONLY_IMPORTERS].filter((file) => !importers.includes(file));
  assert.deepEqual(
    stale,
    [],
    `더 이상 오픈 카탈로그를 import하지 않는 허용 항목: ${stale.join(", ")} — 목록에서 지울 것`,
  );
});
