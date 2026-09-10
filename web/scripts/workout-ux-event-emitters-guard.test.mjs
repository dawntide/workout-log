import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 워크아웃 UX 퍼널 이벤트는 **소비처가 먼저 생기고 emit이 나중에 사라지는** 사고를 이미 한 번
// 겪었다. 2026-03-24 IA 통합(07bf3be8)이 화면을 갈아엎으면서 emit을 전부 걷어냈는데
// 소비처(요약 함수·ops 스냅샷 SQL)는 그대로 남아, 저장 성공률을 비롯한 퍼널 지표가 6개월 동안
// 0/0으로 표시됐다. 아무 게이트도 안 건드리는 종류의 고장이라 눈으로 보기 전엔 드러나지 않는다.
//
// 그래서 이름을 카탈로그 하나로 모으고, 카탈로그의 모든 이름에 **실제 emit 지점이 있는지**
// 여기서 강제한다. 이름을 지우려면 카탈로그에서 지워야 하고, 그러면 소비처 타입이 깨져
// 소비처도 함께 정리된다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const catalogPath = path.join(
  repoRoot,
  "packages/core/src/observability/workout-ux-event-names.ts",
);
const webSrc = path.join(repoRoot, "web/src");

function readCatalogEntries() {
  const source = fs.readFileSync(catalogPath, "utf8");
  // `키: "workout_..."` 꼴만 뽑는다. 카탈로그가 객체 리터럴을 유지하는 한 안정적이다.
  const entries = [...source.matchAll(/(\w+)\s*:\s*"(workout_[a-z0-9_]+)"/g)].map(
    ([, key, name]) => ({ key, name }),
  );
  return entries;
}

function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

test("카탈로그의 모든 UX 이벤트에 emit 지점이 있다", () => {
  const entries = readCatalogEntries();

  // 스캔형 가드는 대상이 0건이면 조용히 통과한다 — 커버리지를 먼저 단정한다.
  assert.ok(
    entries.length >= 5,
    `카탈로그에서 이벤트 이름을 못 찾았다(${entries.length}건). 파싱이 깨졌거나 경로가 틀렸다: ${catalogPath}`,
  );

  const files = collectSourceFiles(webSrc);
  assert.ok(files.length > 100, `web/src 스캔이 비었다(${files.length}개 파일)`);

  const haystack = files
    .filter((file) => !file.endsWith(path.join("lib", "workout-ux-events.ts")))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  // emit은 `trackWorkoutUxEvent(WORKOUT_UX_EVENT_NAMES.<키>, ...)` 꼴을 쓴다.
  // 원시 문자열도 허용하되(마이그레이션 중간 상태), 둘 중 하나는 반드시 있어야 한다.
  const missing = entries.filter(
    ({ key, name }) =>
      !haystack.includes(`WORKOUT_UX_EVENT_NAMES.${key}`) && !haystack.includes(`"${name}"`),
  );

  assert.deepEqual(
    missing.map((entry) => entry.name),
    [],
    "카탈로그에 있는데 아무도 쏘지 않는 이벤트다. emit을 붙이거나, 기능이 사라졌다면 " +
      "카탈로그에서 지우고 소비처(요약 함수·ux-snapshot-service)도 함께 정리할 것.",
  );
});

test("소비처가 카탈로그를 거치지 않고 이벤트 이름을 하드코딩하지 않는다", () => {
  const entries = readCatalogEntries();
  const consumers = [
    path.join(repoRoot, "packages/core/src/stats/ux-snapshot-service.ts"),
    path.join(repoRoot, "web/src/lib/workout-ux-events.ts"),
  ];

  for (const consumer of consumers) {
    const source = fs.readFileSync(consumer, "utf8");
    const hardcoded = entries.filter(({ name }) => source.includes(`'${name}'`) || source.includes(`"${name}"`));
    assert.deepEqual(
      hardcoded.map((entry) => entry.name),
      [],
      `${path.relative(repoRoot, consumer)}가 이벤트 이름을 직접 적었다. ` +
        "카탈로그를 쓰지 않으면 emit과 다시 어긋난다.",
    );
  }
});
