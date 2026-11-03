import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 에이전트 지침의 단일 원본은 AGENTS.md다. CLAUDE.md는 `@AGENTS.md` import 한 줄만 둔다.
// 예전에는 두 파일이 쌍둥이 사본이라 한쪽만 고치면 스큐가 났다(apps/api 인프로세스 전환 뒤
// AGENTS.md만 낡았던 사례) — 지금은 사본을 다시 만들지 못하게 CLAUDE.md의 모양을 고정한다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

const read = (name) => fs.readFileSync(path.join(repoRoot, name), "utf8").replace(/\r\n/g, "\n");

test("CLAUDE.md는 @AGENTS.md import 한 줄뿐이다", () => {
  assert.equal(
    read("CLAUDE.md").trim(),
    "@AGENTS.md",
    "지침은 AGENTS.md에만 쓴다. CLAUDE.md에 내용을 되살리지 말 것.",
  );
});

test("AGENTS.md가 인계 기록 의무 규칙과 인계 문서를 가리킨다", () => {
  const agents = read("AGENTS.md");
  assert.ok(agents.includes("docs/handoff.md"), "AGENTS.md가 docs/handoff.md를 가리켜야 한다");
  assert.ok(agents.includes("docs/decisions.md"), "AGENTS.md가 docs/decisions.md를 가리켜야 한다");
  for (const file of ["docs/handoff.md", "docs/decisions.md"]) {
    assert.ok(fs.existsSync(path.join(repoRoot, file)), `${file}이 없다`);
  }
});
