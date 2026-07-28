#!/usr/bin/env node
// REF5 프로토콜이 범프된 PR인데 nightly REF5 스펙이 그대로면 실패시킨다.
//
// ref5-protocol-version-guard가 막는 것은 "현재 버전 리터럴 복제"뿐이다. 프로토콜 변경이
// 스펙에 미치는 영향은 그것만이 아니다 — v1.3(#617)은 정상 세션 세트 수를 9→10으로 바꿨고,
// 스펙에 박힌 `"9 sets"`·`setCount: 9` 같은 **파생 기대값**이 전부 낡았다. 이런 값은 구현에서
// import해 버리면 검증이 무의미해지므로(구현이 틀려도 항상 통과) 스펙에 남을 수밖에 없고,
// 결국 사람이 함께 갱신해야 한다.
//
// nightly는 PR 게이트가 아니라서 이 누락이 머지 시점에 드러나지 않는다(#617은 엿새간 실패).
// 그래서 "프로토콜을 건드렸으면 nightly 스펙도 봤는가"를 PR에서 묻는다. 파일이 바뀌었는지만
// 보는 얕은 검사라 형식적으로 우회할 수 있지만, 이 사고에서 필요했던 건 정확히 그 질문이다.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// CI는 이 스크립트를 `working-directory: web`에서 돌린다. git pathspec은 cwd 기준이라
// 루트를 고정하지 않으면 `packages/core/…`가 `web/packages/core/…`로 해석돼 아무것도
// 매치되지 않고, 가드가 조용히 항상 통과한다(실제로 그렇게 새 나갔다).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// stderr는 흘리지 않는다 — 후보 경로를 하나씩 `git show`로 찔러 보는 구조라, 그 리비전에
// 없는 파일에 대한 fatal이 정상 흐름에서 매번 찍힌다.
const git = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

// 버전 선언이 어느 파일에 있는지는 시대에 따라 다르다 — v1.3 범프 때는 ref5.ts 안이었고
// 지금은 ref5-protocol-version.ts로 분리됐다. 양쪽을 모두 후보로 둔다.
const PROTOCOL_PATHS = [
  "packages/core/src/program-engine/ref5-protocol-version.ts",
  "packages/core/src/program-engine/ref5.ts",
];
const E2E_SPEC_PATTERN = /^web\/e2e\/.*ref5.*\.spec\.ts$/i;

const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;

if (!baseSha || !headSha) {
  console.log("BASE_SHA/HEAD_SHA가 없다 — PR 컨텍스트가 아니므로 건너뛴다.");
  process.exit(0);
}

/**
 * 해당 리비전에서 선언된 프로토콜 버전 값을 읽는다.
 *
 * diff에 선언 줄이 등장했는지로 판정하면 이번처럼 값은 그대로 두고 파일만 옮긴 리팩터까지
 * 범프로 오인한다. 실제로 필요한 질문은 "값이 달라졌는가"뿐이므로 양쪽 값을 직접 비교한다.
 */
function readVersionAt(ref) {
  for (const candidate of PROTOCOL_PATHS) {
    let source;
    try {
      source = git(["show", `${ref}:${candidate}`]);
    } catch {
      continue; // 그 리비전에는 없는 파일
    }
    const match = source.match(/export const REF5_PROTOCOL_VERSION\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

let baseVersion;
let headVersion;
let files;
try {
  baseVersion = readVersionAt(baseSha);
  headVersion = readVersionAt(headSha);
  files = git(["diff", "--name-only", `${baseSha}...${headSha}`])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
} catch (error) {
  // base가 fetch되지 않은 경우 등. 가드를 이유로 PR을 막지는 않는다.
  console.log(`변경 내역을 읽지 못해 건너뛴다: ${error.message}`);
  process.exit(0);
}

if (!baseVersion || !headVersion) {
  console.log(
    `REF5_PROTOCOL_VERSION 선언을 찾지 못했다(base=${baseVersion ?? "none"}, head=${headVersion ?? "none"}) — 선언이 옮겨졌다면 이 스크립트의 PROTOCOL_PATHS를 갱신할 것.`,
  );
  process.exit(0);
}

if (baseVersion === headVersion) {
  console.log(`REF5 프로토콜 버전 변화 없음(${headVersion}) — 확인할 것이 없다.`);
  process.exit(0);
}

const specsTouched = files.filter((file) => E2E_SPEC_PATTERN.test(file));
if (specsTouched.length > 0) {
  console.log(`프로토콜 범프와 함께 nightly 스펙이 갱신됐다: ${specsTouched.join(", ")}`);
  process.exit(0);
}

console.error(
  [
    `REF5_PROTOCOL_VERSION이 ${baseVersion} → ${headVersion}으로 범프됐는데 nightly REF5 스펙(web/e2e/*ref5*.spec.ts)이 그대로다.`,
    "",
    "프로토콜 변경은 스펙에 박힌 파생 기대값까지 낡게 만든다 — v1.3에서는 정상 세션 세트 수가",
    "9→10이 되면서 `\"9 sets\"`·`setCount: 9`가 전부 어긋났고, nightly가 엿새간 실패했다.",
    "nightly는 PR 게이트가 아니라 머지 시점에 드러나지 않으니 지금 확인할 것:",
    "",
    "  1. 세션 세트 수·판정창 등 스펙의 기대값이 새 프로토콜과 맞는가",
    "  2. 브랜치에서 실행해 확인:  gh workflow run e2e-nightly.yml --ref <branch>",
    "",
    "스펙 변경이 정말 불필요하다면 그 근거를 PR 본문에 적고 이 스텝을 건너뛰도록 조정할 것.",
  ].join("\n"),
);
process.exit(1);
