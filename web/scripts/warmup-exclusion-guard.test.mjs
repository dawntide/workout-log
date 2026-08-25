#!/usr/bin/env node
// `workout_set`을 읽는 모든 쿼리가 웜업을 어떻게 다루는지 **명시적으로** 정한다.
//
// M1-3 PR4가 웜업을 통계·진행 판정에서 뺐다. 문제는 대상이 한두 곳이 아니라는 것이다 —
// 이 리포에서 workout_set을 읽는 쿼리는 20곳이 넘고, 그중 절반은 필터가 필요하고 절반은
// 넣으면 안 된다(export가 웜업을 빠뜨리면 데이터 손실이고, 로그 상세가 빠뜨리면 사용자가
// 방금 기록한 세트를 못 본다). 새 쿼리를 추가하는 사람이 어느 쪽인지 **결정하게** 만드는
// 것이 이 가드의 목적이다. 미분류 파일은 실패한다.
//
// 계획서: docs/set-type-plan.md §3.3.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// CI는 `working-directory: web`에서 돌린다 — git pathspec은 cwd 기준이라 루트를
// 고정하지 않으면 매치가 0건이 되고 가드가 조용히 항상 통과한다.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** SQL `WHERE`에 excludeWarmupSets()를 넣어야 하는 집계 경로. */
const FILTERS_IN_SQL = new Set([
  "packages/core/src/home/home-service.ts",
  "packages/core/src/stats/asymptote-monitor-service.ts",
  "packages/core/src/stats/bundle-service.ts",
  "packages/core/src/stats/e1rm-service.ts",
  "packages/core/src/stats/endurance-service.ts",
  "packages/core/src/stats/muscle-volume-service.ts",
  "packages/core/src/stats/prs-service.ts",
  "packages/core/src/stats/strength-score-service.ts",
  "packages/core/src/stats/volume-series-service.ts",
  "apps/api/src/routes/stats.ts",
  "web/src/server/services/exercises/get-exercise-detail-bootstrap.ts",
]);

/**
 * SQL로 좁히지 않고 JS에서 거르는 경로 — 대신 `setType`을 **select에 실어야** 한다.
 * 실어 나르지 않으면 그 아래 판정 로직은 웜업을 영영 못 본다(계획서 §6-2).
 */
const FILTERS_IN_JS = new Set([
  "packages/core/src/progression/autoProgression.ts",
  "packages/core/src/services/workout-log/personal-records.ts",
]);

/** 웜업을 포함해야 정상인 경로 — 이유를 함께 적는다. */
const INCLUDES_ALL_SETS = new Map([
  ["packages/core/src/export/userExport.ts", "export는 기록 전부를 내보낸다 — 빠뜨리면 데이터 손실"],
  ["packages/core/src/import/userImport.ts", "import는 파일에 있는 대로 되돌린다"],
  ["packages/core/src/services/workout-log/upsert-log.ts", "저장 경로 — 웜업도 저장된다"],
  ["packages/core/src/progression/ref5-auto-progression.ts", "REF5는 웜업을 애초에 기록하지 않는다(spec §11.3)"],
  ["packages/core/src/stats/ux-snapshot-service.ts", "UX 텔레메트리 — 실제 기록량을 세는 게 목적"],
  ["apps/api/src/routes/logs.ts", "로그 조회 — 사용자가 기록한 세트를 전부 보여준다"],
  ["apps/api/src/routes/exercises.ts", "\"이 종목을 해 본 적 있나\" 판정 — 웜업으로만 해 봤어도 아는 종목이라 검색 상단에 와야 한다"],
  ["web/src/server/services/workout-log/load-workout-log-context.ts", "편집 화면 — 전체 세트가 필요하다"],
  ["web/src/server/db/backfillExerciseIds.ts", "일회성 백필 스크립트"],
  ["web/src/server/db/verifyProgramWorkflows.ts", "점검 스크립트"],
  ["web/src/server/db/verifyWorkoutLogIdempotency.ts", "점검 스크립트"],
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
const queryFiles = grep(String.raw`(from|innerJoin|leftJoin)\(workoutSet`, SEARCH_PATHS)
  .split("\n")
  .filter(Boolean)
  .filter((file) => !/\.test\.tsx?$/.test(file));

/** 인덱스가 아니라 디스크를 읽는다 — 가드는 지금 파일에 뭐가 적혀 있는지를 본다. */
function read(file) {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

test("스캔이 실제로 쿼리를 읽고 있다 (커버리지 단정)", () => {
  // 0건이 "위반 없음"인지 "아무것도 안 읽었음"인지 구분되지 않으면 게이트가 무력하다.
  assert.ok(queryFiles.length >= 15, `workout_set 쿼리 파일 ${queryFiles.length}개 — 스캔이 어긋났다`);
  assert.ok(
    queryFiles.includes("packages/core/src/stats/e1rm-service.ts"),
    "알려진 집계 파일이 스캔에 안 잡혔다 — 패턴이나 경로가 낡았다",
  );
});

test("workout_set을 읽는 모든 파일이 웜업 처리 방침을 갖는다", () => {
  const unclassified = queryFiles.filter(
    (file) => !FILTERS_IN_SQL.has(file) && !FILTERS_IN_JS.has(file) && !INCLUDES_ALL_SETS.has(file),
  );
  assert.deepEqual(
    unclassified,
    [],
    `workout_set을 읽는데 웜업 방침이 없는 파일:\n${unclassified.map((f) => `  ${f}`).join("\n")}\n` +
      `web/scripts/warmup-exclusion-guard.test.mjs의 세 목록 중 하나에 넣을 것 ` +
      `(집계면 FILTERS_IN_SQL, JS에서 거르면 FILTERS_IN_JS, 전부 포함이 맞으면 이유와 함께 INCLUDES_ALL_SETS).`,
  );
});

test("집계 경로는 excludeWarmupSets()를 쓴다", () => {
  const missing = [...FILTERS_IN_SQL].filter((file) => !read(file).includes("excludeWarmupSets("));
  assert.deepEqual(missing, [], `집계인데 웜업 필터가 없는 파일: ${missing.join(", ")}`);
});

test("JS 필터 경로는 setType을 select에 싣는다", () => {
  const missing = [...FILTERS_IN_JS].filter((file) => !read(file).includes("setType: workoutSet.setType"));
  assert.deepEqual(
    missing,
    [],
    `setType을 select하지 않는 JS 필터 경로: ${missing.join(", ")} — 판정 로직이 웜업을 못 본다`,
  );
});

test("전부 포함이 맞는 경로에는 필터가 들어가 있지 않다", () => {
  const wrong = [...INCLUDES_ALL_SETS.keys()].filter((file) => read(file).includes("excludeWarmupSets("));
  assert.deepEqual(
    wrong,
    [],
    `웜업을 포함해야 하는데 필터가 들어간 파일: ${wrong.join(", ")}`,
  );
});

// TTL이 metric 문자열 범프를 대신한다 — 읽기 쪽이 maxAgeSeconds를 빠뜨리면 그 캐시는
// 영원히 살아, 정의가 바뀌어도 구 payload가 계속 나간다.
test("stats_cache 읽기는 전부 maxAgeSeconds를 넘긴다", () => {
  const files = grep(String.raw`getStatsCache<`, ["packages/core/src"]).split("\n").filter(Boolean);
  assert.ok(files.length > 0, "getStatsCache 호출을 하나도 못 찾았다 — 가드가 무력하다");
  const offenders = [];
  for (const file of files) {
    for (const match of read(file).matchAll(/getStatsCache<[^>]*>\(\{([\s\S]*?)\n\s*\}\)/g)) {
      if (!match[1].includes("maxAgeSeconds")) {
        offenders.push(`${file}: ${(/metric:\s*"([^"]+)"/.exec(match[1]) ?? [, "?"])[1]}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `maxAgeSeconds 없는 stats_cache 읽기:\n${offenders.join("\n")}\n` +
      `TTL이 없으면 구 정의 payload가 영원히 살아남는다 — metric 문자열을 범프하거나 TTL을 줄 것.`,
  );
});
