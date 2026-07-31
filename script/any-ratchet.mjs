import fs from "node:fs";
import path from "node:path";

// `any` 랫칫 — 남은 개수를 파일별 허용치로 못박고, 늘어나면 실패한다.
//
// web은 eslint(no-explicit-any)로 이미 0건이 강제되지만 packages/core와 apps/api에는
// eslint가 없어서, 종전 가드는 DSL 3개 경로만 지켰다(경로 나열식이라 그 밖에서 늘어나는 건
// 못 봤다). 여기서는 반대로 src 전체를 훑고 "아직 남은 곳"만 허용 목록에 적는다 —
// 새 any는 어디서 생기든 걸리고, 목록은 줄어들기만 한다.
//
// 허용치가 실제보다 크면(= 정리했는데 목록을 안 낮췄으면) 그것도 실패다. 안 그러면
// 랫칫이 조용히 헐거워져서, 나중에 같은 파일에 any가 다시 늘어도 통과해 버린다.
//
// 사용: node ../../script/any-ratchet.mjs <스캔 디렉터리> <허용목록 JSON>  (cwd = 패키지 루트)

const [scanDir, allowlistPath] = process.argv.slice(2);
if (!scanDir || !allowlistPath) {
  console.error("사용법: any-ratchet.mjs <스캔 디렉터리> <허용목록 JSON>");
  process.exit(2);
}

const ANY_PATTERN = /(:\s*any\b|\bas any\b|\bany\[\]|<any>|Array<any>)/;

/** 테스트는 대상 밖 — 셋업 스텁의 any까지 세면 목록이 테스트 변경마다 흔들린다. */
const isScanned = (name) => name.endsWith(".ts") && !name.endsWith(".test.ts");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (isScanned(entry.name)) out.push(full);
  }
  return out;
}

/** 주석에 적힌 `any`까지 세지 않도록 줄 단위로 코드 부분만 본다(문자열 리터럴은 무시해도 무해). */
function countAny(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, ""))
    .filter((line) => !/^\s*\*/.test(line)) // 블록 주석 본문
    .filter((line) => ANY_PATTERN.test(line)).length;
}

const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const files = walk(scanDir).sort();

if (files.length === 0) {
  console.error(`any 랫칫: ${scanDir}에서 스캔할 파일을 못 찾았다 — 가드가 무력하다`);
  process.exit(1);
}

const violations = [];
const stale = [];
const seen = new Set();

for (const file of files) {
  const key = file.split(path.sep).join("/");
  const actual = countAny(file);
  const allowed = allowlist[key] ?? 0;
  if (allowed > 0) seen.add(key);

  if (actual > allowed) violations.push(`  ${key}: ${actual}건 (허용 ${allowed}건)`);
  else if (actual < allowed) stale.push(`  ${key}: ${actual}건으로 줄었다 → 허용치를 ${actual}로 낮출 것`);
}

const removed = Object.keys(allowlist).filter((key) => !seen.has(key) && !files.some((f) => f.split(path.sep).join("/") === key));

if (violations.length > 0) {
  console.error("any 랫칫 위반 — 허용치를 넘었다:");
  console.error(violations.join("\n"));
  console.error(`\n허용 목록: ${allowlistPath}. any를 늘리는 대신 타입을 좁힐 것.`);
  process.exit(1);
}

if (stale.length > 0) {
  console.error("any 랫칫: 허용치가 실제보다 높다 — 랫칫이 헐거워진다:");
  console.error(stale.join("\n"));
  process.exit(1);
}

if (removed.length > 0) {
  console.error(`any 랫칫: 허용 목록에 없는 파일이 적혀 있다 — 정리할 것: ${removed.join(", ")}`);
  process.exit(1);
}

const total = Object.values(allowlist).reduce((sum, n) => sum + n, 0);
console.log(`any 랫칫 통과 — ${files.length}개 파일 스캔, 잔여 ${total}건(허용 목록 ${Object.keys(allowlist).length}파일)`);
