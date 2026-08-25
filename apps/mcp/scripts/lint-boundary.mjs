#!/usr/bin/env node
// apps/mcp 경계 가드 — **HTTP 밖으로 나가지 않는다.**
//
// MCP 서버가 `@workout/core`나 DB를 직접 만지기 시작하면 두 가지를 잃는다:
//   1. 배포 독립성 — core가 바뀔 때마다 MCP도 같이 나가야 한다
//   2. 단일 진실원 — 도메인 로직이 서버와 MCP 두 곳으로 갈라진다
//
// 계획서 §6-3. apps/api의 같은 가드와 짝이다.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 금지 import — 이유를 함께 적는다. */
const FORBIDDEN = [
  { pattern: "@workout/core", reason: "core를 import하면 HTTP 경계가 무너진다" },
  { pattern: "@workout/api", reason: "apps/api를 직접 부르면 배포가 묶인다" },
  { pattern: "drizzle-orm", reason: "DB를 직접 만지면 안 된다 — API로만 말한다" },
  { pattern: "node:pg", reason: "DB 드라이버 금지" },
  { pattern: "from \"pg\"", reason: "DB 드라이버 금지" },
  { pattern: "next/", reason: "프레임워크 무지" },
  { pattern: "react", reason: "프레임워크 무지" },
];

function grep(pattern) {
  try {
    return execFileSync("git", ["grep", "-lF", "--untracked", pattern, "--", "src"], {
      cwd: packageRoot,
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

// 스캔 대상 파일 수. `git grep -l ""`은 파일 목록이 아니라 매치 검색이라 못 쓴다.
let scanned = 0;
try {
  scanned = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src"],
    { cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
    .split("\n")
    .filter((line) => line.endsWith(".ts")).length;
} catch {
  scanned = 0;
}

// 0건이 "위반 없음"인지 "아무것도 안 읽었음"인지 구분되지 않으면 게이트가 무력하다.
if (scanned === 0) {
  console.error("apps/mcp 경계 가드: src에서 파일을 하나도 못 읽었다 — 스캔이 낡았다");
  process.exit(1);
}

const violations = [];
for (const { pattern, reason } of FORBIDDEN) {
  for (const file of grep(pattern)) {
    violations.push(`  ${file}: "${pattern}" — ${reason}`);
  }
}

if (violations.length > 0) {
  console.error("apps/mcp 경계 위반:\n" + violations.join("\n"));
  console.error("\nMCP 서버는 공개 API를 HTTP로만 부르는 얇은 래퍼여야 한다.");
  process.exit(1);
}

console.log(`apps/mcp 경계 가드 통과 — ${scanned}개 파일 스캔 (HTTP 전용)`);
