#!/usr/bin/env node
// 추정 1RM(e1RM) 공식이 다시 흩어지는 것을 막는다.
//
// 이 계산은 한때 11곳에 복제돼 있었고 그중 셋은 공식이 서로 달랐다 — apps/api는 1렙을
// 특례로 두고, web 모델은 15렙에서 클램프하고, 나머지는 Epley 원식을 그대로 썼다. 같은
// 세트가 화면마다 다른 1RM으로 보였다는 뜻이다. docs/set-type-plan.md §3.1이 이를
// packages/core/src/stats/e1rm.ts 한 곳으로 모았다.
//
// 복제가 다시 생기는 경로는 단순하다: 누구든 `w * (1 + reps / 30)`를 새로 타이핑하면
// 된다. 타입체커도 린트도 그건 못 잡는다. 그래서 리터럴 자체를 금지한다.

import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// CI는 이 스크립트를 `working-directory: web`에서 돌린다. git pathspec은 cwd 기준이라
// 루트를 고정하지 않으면 루트 기준 경로가 `web/…`로 해석돼 매치가 0건이 되고 가드가
// 조용히 항상 통과한다(ref5 가드에서 실제로 그렇게 새 나갔다).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 공식을 구현해도 되는 유일한 두 파일 — TS 정본과 그 Go 짝(파리티는 fixtures/e1rm.json이 잠근다).
const ALLOWED = new Set([
  "packages/core/src/stats/e1rm.ts",
  "apps/tui/internal/ui/log_model.go",
]);

// `/ 30`은 Epley의 서명이다. 분모 30은 다른 맥락(초·일·퍼센트)에도 나오므로 반복 변수와
// 붙어 있는 형태만 본다 — `reps / 30`, `effectiveReps/30`, Go의 `float64(reps)/30.0`,
// 그리고 옛 personal-records가 쓰던 한 글자 별칭 `r / 30`까지.
const EPLEY_PATTERN = String.raw`([Rr]eps?\)? ?/ ?30|[^A-Za-z0-9_]r ?/ ?30)`;

const SEARCH_PATHS = ["packages/core/src", "web/src", "apps/api/src", "apps/tui/internal"];

function grep(pattern, pathspecs) {
  try {
    return execFileSync(
      "git",
      // --untracked: 아직 커밋 안 된 새 파일에 심어도 잡힌다(CI는 전부 tracked라 무해).
      ["grep", "--untracked", "-nIE", pattern, "--", ...pathspecs],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (error) {
    // git grep은 매치가 없으면 exit 1. 그건 오류가 아니다.
    if (error.status === 1) return "";
    throw error;
  }
}

// 두 테스트가 같은 한 번의 스캔을 나눠 본다 — 커버리지를 단정하는 스캔과 위반을 찾는
// 스캔이 다르면, 전자가 통과해도 후자는 아무것도 안 읽고 있을 수 있다.
const rawHits = grep(EPLEY_PATTERN, SEARCH_PATHS)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [file, lineNo, ...rest] = line.split(":");
    return { file, lineNo, text: rest.join(":").trim() };
  });

test("스캔이 실제로 코드를 읽고 있다 (커버리지 단정)", () => {
  // 매치 0건이 "위반 없음"인지 "아무것도 안 읽었음"인지 구분되지 않으면 게이트가 무력하다.
  // 정본 두 파일은 정의상 공식을 담고 있으므로 허용 목록을 빼기 전 원시 매치에 반드시 잡힌다.
  for (const file of ALLOWED) {
    assert.ok(
      rawHits.some((hit) => hit.file === file),
      `정본 ${file}에서 e1RM 공식을 못 찾았다 — 패턴이 낡았거나 경로가 어긋났다(가드 무력화)`,
    );
  }
});

test("e1RM 공식은 정본 두 파일 밖에서 재구현되지 않는다", () => {
  const hits = rawHits
    // 테스트가 기대값을 손으로 쓰는 건 정상이다 — 구현에서 import해 오면 검증이 무의미해진다.
    .filter((hit) => !/\.test\.(ts|tsx|mjs)$|_test\.go$/.test(hit.file))
    .filter((hit) => !ALLOWED.has(hit.file));

  const detail = hits.map((hit) => `  ${hit.file}:${hit.lineNo}  ${hit.text}`).join("\n");
  assert.deepEqual(
    hits,
    [],
    `e1RM 공식이 정본 밖에서 재구현됐다. estimateE1rmKg(packages/core/src/stats/e1rm.ts)를 호출하도록 고칠 것:\n${detail}`,
  );
});
