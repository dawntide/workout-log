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

function changedFiles() {
  const out = execFileSync("git", ["diff", "--name-only", `${baseSha}...${headSha}`], {
    encoding: "utf8",
  });
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

let files;
try {
  files = changedFiles();
} catch (error) {
  // base가 fetch되지 않은 경우 등. 가드를 이유로 PR을 막지는 않는다.
  console.log(`변경 파일 목록을 읽지 못해 건너뛴다: ${error.message}`);
  process.exit(0);
}

const protocolTouched = files.filter((file) => PROTOCOL_PATHS.includes(file));
if (protocolTouched.length === 0) {
  console.log("REF5 프로토콜 정의 변경 없음 — 확인할 것이 없다.");
  process.exit(0);
}

// 프로토콜 파일이 바뀌었어도 버전 값 자체가 그대로면(주석·리팩터 등) 스펙 갱신 의무는 없다.
// 선언이 어느 파일에 있는지는 시대에 따라 다르다 — v1.3 범프 시점에는 ref5.ts 안에 있었고
// 지금은 ref5-protocol-version.ts로 분리됐다. 그래서 두 경로를 모두 본다.
const versionDiff = execFileSync(
  "git",
  ["diff", `${baseSha}...${headSha}`, "--", ...PROTOCOL_PATHS],
  { encoding: "utf8" },
);
const versionBumped = /^[+-]export const REF5_PROTOCOL_VERSION/m.test(versionDiff);
if (!versionBumped) {
  console.log(
    `REF5 프로토콜 파일이 바뀌었지만 REF5_PROTOCOL_VERSION 선언은 그대로다(${protocolTouched.join(", ")}) — 통과.`,
  );
  process.exit(0);
}

const specsTouched = files.filter((file) => E2E_SPEC_PATTERN.test(file));
if (specsTouched.length > 0) {
  console.log(`프로토콜 범프와 함께 nightly 스펙이 갱신됐다: ${specsTouched.join(", ")}`);
  process.exit(0);
}

console.error(
  [
    "REF5_PROTOCOL_VERSION이 범프됐는데 nightly REF5 스펙(web/e2e/*ref5*.spec.ts)이 그대로다.",
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
