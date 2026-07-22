import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// db-seed 워크플로는 "추적 파일들의 해시"가 달라졌을 때만 실제 seed를 돌린다
// (seed-if-needed.mjs). 그런데 seed의 내용은 seed.ts 하나가 아니라 그 파일이 import하는
// 카탈로그·blueprint·슬롯 키 헬퍼·라운딩이 함께 결정한다. seed.ts를 건드리지 않고 그쪽만
// 바꾸면 해시가 그대로라 prod seed가 조용히 스킵되고, 로그에는 `seed skipped (hash unchanged)`
// 한 줄만 남아 알아채기 어렵다 — CI는 매번 빈 DB에 seed를 새로 돌리므로 이 누락을 못 잡는다.
//
// 그래서 seed.ts의 로컬 import가 전부 추적 목록에 들어 있는지 여기서 강제한다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const webDir = path.resolve(scriptDir, "..");
const workflowPath = path.resolve(repoRoot, ".github/workflows/db-seed.yml");
const seedPath = path.resolve(repoRoot, "packages/core/src/db/seed.ts");

// seed 내용이 아니라 DB 연결/스키마 정의라 해시 대상이 아니다. 스키마 변경은 마이그레이션이 담당한다.
const STRUCTURE_ONLY_MODULES = new Set(["./client", "./schema"]);

/** 워크플로의 `DB_SEED_TRACKED_FILES: |-` 블록에서 경로 목록을 뽑는다(YAML 파서 없이). */
function readTrackedFiles() {
  const lines = fs.readFileSync(workflowPath, "utf8").split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /DB_SEED_TRACKED_FILES:\s*\|-?\s*$/.test(line));
  assert.notEqual(
    startIndex,
    -1,
    "db-seed.yml에 DB_SEED_TRACKED_FILES 블록이 없다 — 기본값(seed.ts 하나)으로 떨어져 의존 파일 변경을 놓친다",
  );

  const blockIndent = lines[startIndex].search(/\S/);
  const out = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (line.trim() === "") continue;
    if (line.search(/\S/) <= blockIndent) break; // 블록 종료(다음 키)
    out.push(line.trim());
  }
  return out;
}

/** seed.ts의 상대경로 import를 실제 파일 경로로 해석한다. */
function readSeedLocalImports() {
  const source = fs.readFileSync(seedPath, "utf8");
  const specifiers = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map((m) => m[1]);
  return [...new Set(specifiers)];
}

const trackedFiles = readTrackedFiles();

test("추적 목록의 파일이 모두 실제로 존재한다", () => {
  for (const relativePath of trackedFiles) {
    const resolved = path.resolve(webDir, relativePath);
    assert.ok(
      fs.existsSync(resolved),
      `추적 파일이 없다: ${relativePath} — seed-if-needed가 시작 즉시 실패한다`,
    );
  }
});

test("추적 목록에 seed.ts 본체가 들어 있다", () => {
  const resolved = trackedFiles.map((p) => path.resolve(webDir, p));
  assert.ok(resolved.includes(seedPath), "seed.ts 본체가 추적 목록에서 빠졌다");
});

test("seed.ts가 import하는 로컬 모듈이 모두 추적된다", () => {
  const trackedResolved = new Set(trackedFiles.map((p) => path.resolve(webDir, p)));
  const untracked = [];

  for (const specifier of readSeedLocalImports()) {
    if (STRUCTURE_ONLY_MODULES.has(specifier)) continue;
    const resolved = path.resolve(path.dirname(seedPath), `${specifier}.ts`);
    if (!fs.existsSync(resolved)) continue; // 디렉터리 index 등은 대상 밖
    if (!trackedResolved.has(resolved)) {
      untracked.push(path.relative(repoRoot, resolved).replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(
    untracked,
    [],
    `seed.ts가 import하지만 db-seed.yml의 DB_SEED_TRACKED_FILES에 없는 파일: ${untracked.join(", ")}\n` +
      "이 파일만 바뀐 PR은 seed 해시가 그대로라 prod seed가 조용히 스킵된다. 워크플로 목록에 추가할 것.",
  );
});
