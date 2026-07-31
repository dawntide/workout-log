import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// CLAUDE.md와 AGENTS.md는 대상 에이전트 이름만 다른 쌍둥이 문서다. 한쪽만 갱신되면 다른 쪽
// 에이전트가 틀린 전제로 세션을 시작한다 — 실제로 apps/api 인프로세스 전환(#634·#639) 뒤
// AGENTS.md만 "프록시 cutover, apps/api 동반 실행 필요" 상태로 남아 있었다. 문서 스큐는
// 아무 게이트도 안 건드려서 눈으로 보기 전엔 드러나지 않으므로 여기서 강제한다.
//
// 갱신 방법: CLAUDE.md를 고친 뒤 아래 치환만 적용해 AGENTS.md에 그대로 반영한다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

/** CLAUDE.md → AGENTS.md 정규화. 두 문서의 허용된 차이는 이 3줄이 전부다. */
const HEADER_SUBSTITUTIONS = [
  ["# CLAUDE.md", "# AGENTS.md"],
  [
    "This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.",
    "This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.",
  ],
  ["# Workout Log — Claude Code 가이드", "# Workout Log — Codex 가이드"],
];

const read = (name) => fs.readFileSync(path.join(repoRoot, name), "utf8").replace(/\r\n/g, "\n");

test("AGENTS.md가 CLAUDE.md와 동기화돼 있다", () => {
  let expected = read("CLAUDE.md");
  for (const [claudeText, agentsText] of HEADER_SUBSTITUTIONS) {
    assert.ok(
      expected.includes(claudeText),
      `CLAUDE.md에서 헤더 문구를 못 찾았다: ${claudeText}\n` +
        "문구가 바뀌었다면 이 가드의 HEADER_SUBSTITUTIONS도 함께 갱신할 것.",
    );
    expected = expected.replace(claudeText, agentsText);
  }

  const actual = read("AGENTS.md");
  if (actual === expected) return;

  // 어디가 어긋났는지 첫 지점을 짚어 준다(문서가 길어 통짜 diff는 읽기 어렵다).
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const at = expectedLines.findIndex((line, index) => actualLines[index] !== line);

  assert.fail(
    `AGENTS.md가 CLAUDE.md와 어긋났다 (첫 차이: ${at + 1}번째 줄)\n` +
      `  CLAUDE.md: ${expectedLines[at] ?? "(파일 끝)"}\n` +
      `  AGENTS.md: ${actualLines[at] ?? "(파일 끝)"}\n` +
      "CLAUDE.md를 고쳤다면 AGENTS.md에도 같은 내용을 반영할 것.",
  );
});
