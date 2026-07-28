import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// REF5 프로토콜 버전은 web·apps/api·apps/tui가 함께 쓰는 교차패키지 값이라, 범프 때
// "리터럴 전수 갱신"이 필요한 구조였다. v1.3 컷오버(#617)는 그 전수를 한 곳 놓쳤다 —
// web/e2e의 REF5 재개 스펙만 `protocolVersion: "1.2"`를 박아 둔 채 남았고, 서버가 그
// 요청을 REF5_STALE_VERSION(409)로 거부하면서 nightly가 엿새간 실패했다. 유닛 테스트는
// PR 게이트라 범프 누락이 즉시 빨간불이 되지만, nightly 스펙은 게이트 밖이라 조용히 썩는다.
//
// 그래서 "현재 프로토콜 버전을 뜻하는 자리"에 리터럴을 두는 것 자체를 금지한다. 상수를
// 참조하면 범프가 자동으로 전파되므로 갱신 누락이라는 실패 모드가 사라진다.
//
// 과거 버전 리터럴("1.1"·"1.2" 등)은 대상이 아니다. legacy 거부 테스트처럼 과거를
// 가리키는 값은 범프 후에도 그대로여야 정상이고, core가 그 용도의 상수를 따로 export한다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const sourceOfTruth = path.resolve(
  repoRoot,
  "packages/core/src/program-engine/ref5-protocol-version.ts",
);
// TUI는 Go라 core를 import할 수 없다. 자체 상수 하나만 두고 값 일치를 여기서 검사한다.
const goConstantFile = path.resolve(repoRoot, "apps/tui/internal/api/plans.go");

const SCAN_ROOTS = [
  "web/src",
  "web/e2e",
  "web/scripts",
  "apps/api/src",
  "apps/tui",
  "packages/core/src",
];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".go"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "dist", ".git", "test-results"]);

/**
 * 유닛 테스트 픽스처는 대상 밖이다 — PR 게이트에서 돌기 때문에 범프를 놓치면 그 자리에서
 * 빨간불이 된다. 반면 web/e2e의 `*.spec.ts`는 nightly 전용이라 반드시 포함한다.
 */
function isExemptTestFile(relativePath) {
  if (relativePath.startsWith("web/e2e/")) return false;
  return /\.test\.(ts|tsx|mjs)$/.test(relativePath) || /_test\.go$/.test(relativePath);
}

function readCurrentVersion() {
  const source = fs.readFileSync(sourceOfTruth, "utf8");
  const match = source.match(/export const REF5_PROTOCOL_VERSION\s*=\s*"([^"]+)"/);
  assert.ok(
    match,
    `${path.relative(repoRoot, sourceOfTruth)}에서 REF5_PROTOCOL_VERSION 선언을 찾지 못했다 — 가드가 무력화된다`,
  );
  return match[1];
}

function* walk(absoluteDir) {
  if (!fs.existsSync(absoluteDir)) return;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* walk(path.join(absoluteDir, entry.name));
      continue;
    }
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
    yield path.join(absoluteDir, entry.name);
  }
}

function scanFiles() {
  const out = [];
  for (const root of SCAN_ROOTS) {
    for (const absolutePath of walk(path.resolve(repoRoot, root))) {
      const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
      out.push({ absolutePath, relativePath });
    }
  }
  return out;
}

const currentVersion = readCurrentVersion();

test("진실원이 유효한 프로토콜 버전을 선언한다", () => {
  assert.match(
    currentVersion,
    /^\d+\.\d+$/,
    `REF5_PROTOCOL_VERSION이 "major.minor" 형식이 아니다: ${currentVersion}`,
  );
});

test("현재 프로토콜 버전을 리터럴로 복제한 자리가 없다", () => {
  const literal = `"${currentVersion}"`;
  const violations = [];

  for (const { absolutePath, relativePath } of scanFiles()) {
    if (absolutePath === sourceOfTruth) continue;
    if (isExemptTestFile(relativePath)) continue;

    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes(literal)) return;
      // protocolVersion을 다루는 줄만 본다. 무관한 "1.3"(예: 표시 문자열)까지 잡으면
      // 가드가 소음이 되어 결국 꺼진다.
      if (!/protocolversion/i.test(line)) return;
      // Go 상수 선언 한 줄은 값 일치 검사가 따로 담당한다(core를 import할 수 없다).
      if (absolutePath === goConstantFile && /^\s*Ref5ProtocolVersion\s*=/.test(line)) return;
      violations.push(`${relativePath}:${index + 1}  ${line.trim()}`);
    });
  }

  assert.deepEqual(
    violations,
    [],
    `현재 프로토콜 버전(${currentVersion})이 리터럴로 박혀 있다:\n` +
      `${violations.join("\n")}\n\n` +
      "@workout/core/program-engine/ref5-protocol-version의 REF5_PROTOCOL_VERSION을 참조할 것. " +
      "리터럴로 두면 다음 범프에서 이 자리만 옛 버전으로 남아 조용히 깨진다(#617에서 실제로 발생).",
  );
});

test("TUI(Go) 상수가 진실원과 같은 버전을 가리킨다", () => {
  const source = fs.readFileSync(goConstantFile, "utf8");
  const match = source.match(/Ref5ProtocolVersion\s*=\s*"([^"]+)"/);
  assert.ok(
    match,
    `${path.relative(repoRoot, goConstantFile)}에서 Ref5ProtocolVersion 선언을 찾지 못했다 — 상수가 옮겨졌다면 이 가드의 경로도 함께 갱신할 것`,
  );
  assert.equal(
    match[1],
    currentVersion,
    `TUI의 Ref5ProtocolVersion(${match[1]})이 엔진의 REF5_PROTOCOL_VERSION(${currentVersion})과 다르다. ` +
      "TUI는 Go라 core를 import할 수 없으므로 범프 때 이 상수를 손으로 맞춰야 한다.",
  );
});
