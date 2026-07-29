#!/usr/bin/env node
// apps/api 경계 가드 — "언제든 다시 분리 배포할 수 있다"는 전제를 코드로 고정한다.
//
// web(Vercel)이 src/app.ts를 인프로세스로 마운트하면서부터, apps/api 안에서 Next의
// 편의 API를 하나 끌어다 쓰는 게 "그냥 되는" 상태가 됐다. 그 순간 재분리는 env 변경이
// 아니라 리팩터가 되므로 두 규칙을 CI에서 막는다:
//
//   1. framework   — @/(web)·next·react import 금지 (전 파일)
//   2. server-entry— node 서버 어댑터는 standalone 엔트리(src/index.ts) 전용.
//                    app.ts 계보에 섞이면 web 서버리스 번들에 node 전용 서버가 끌려온다.
//
// grep 한 줄이 아니라 node로 쓰는 이유: 셸 부정(`! grep`)이 Windows(cmd)에서 실행되지
// 않아 개발자 로컬에서 가드를 돌려볼 수 없고, 문자열 매칭이 주석까지 잡아 오탐이 난다.
// 여기서는 주석을 걷어낸 뒤 실제 import 지정자만 본다.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const SERVER_ENTRY = join(SRC, "index.ts");

// from "x" / import "x" / import("x") / require("x") / export ... from "x"
const SPECIFIER_RE = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;

/**
 * 주석을 공백으로 치환(길이·줄바꿈 보존 → 줄번호가 어긋나지 않는다). 이 가드는 설계상
 * 자기 자신을 설명하는 주석에 `next/…` 같은 지정자를 적게 되는데, 그걸 위반으로 잡으면
 * 가드를 약화시키고 싶은 압력만 만든다.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

const FRAMEWORK_RE = /^(@\/|next$|next\/|react$|react\/|react-)/;
const SERVER_ADAPTER_RE = /^@hono\/node-server/;

function tsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const violations = [];
const files = tsFiles(SRC);

for (const file of files) {
  const source = stripComments(readFileSync(file, "utf8"));
  const rel = relative(SRC, file).split("\\").join("/");
  for (const match of source.matchAll(SPECIFIER_RE)) {
    const specifier = match[1];
    const line = source.slice(0, match.index).split("\n").length;
    if (FRAMEWORK_RE.test(specifier)) {
      violations.push(
        `src/${rel}:${line} — "${specifier}" (framework): apps/api는 @/(web)·next·react를 import할 수 없습니다.`,
      );
    }
    if (SERVER_ADAPTER_RE.test(specifier) && file !== SERVER_ENTRY) {
      violations.push(
        `src/${rel}:${line} — "${specifier}" (server-entry): node 서버 어댑터는 src/index.ts에만 둡니다.`,
      );
    }
  }
}

// 스캔형 가드는 "0건 통과"가 곧 "글롭이 안 맞았다"일 수 있다. 커버리지를 단정한다.
if (files.length === 0) {
  console.error("경계 가드가 스캔한 파일이 0개입니다 — 스캔 경로를 확인하세요:", SRC);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`apps/api 경계 위반 ${violations.length}건:`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "\napps/api는 분리 배포 가능한 상태로 유지합니다. 프레임워크가 필요한 코드는 web에 두세요.",
  );
  process.exit(1);
}

console.log(`apps/api 경계 가드 통과 — ${files.length}개 파일 스캔 (framework · server-entry)`);
