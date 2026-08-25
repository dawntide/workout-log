import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiTokenRateLimits, apiTokenSurfaceSnapshot } from "./api-token-surface";

/**
 * 커밋된 OpenAPI 스펙이 **실제 공개 표면과 일치하는지** 확인한다.
 *
 * 스펙은 생성물이지만 커밋되므로, 표면을 고치고 재생성을 잊으면 문서가 조용히
 * 거짓말을 시작한다. 공개 API 문서의 거짓말은 일반 문서보다 비싸다 — 읽는 쪽이
 * 그걸 계약으로 믿는다.
 *
 * 실패하면: `pnpm -C apps/api build:openapi`
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(dirname, "../../../docs/api/openapi.json");

type Spec = {
  paths: Record<string, Record<string, { "x-required-scopes": string[] }>>;
  "x-rate-limits": {
    read: { max: number; windowSeconds: number };
    write: { max: number; windowSeconds: number };
  };
};

function loadSpec(): Spec {
  return JSON.parse(readFileSync(specPath, "utf8")) as Spec;
}

/** Hono의 `:param`을 OpenAPI의 `{param}`으로. 생성기와 같은 규칙이다. */
function toOpenApiPath(honoPath: string): string {
  return honoPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function specOperations(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const [pathName, operations] of Object.entries(spec.paths)) {
    for (const method of Object.keys(operations)) {
      out.add(`${method.toUpperCase()} ${pathName}`);
    }
  }
  return out;
}

test("스펙이 공개 표면과 정확히 같은 집합이다", () => {
  const spec = loadSpec();
  const { read, write } = apiTokenSurfaceSnapshot();
  const expected = new Set(
    [...read, ...write].map((entry) => {
      const [method, honoPath] = entry.split(" ");
      return `${method} ${toOpenApiPath(honoPath)}`;
    }),
  );
  const actual = specOperations(spec);

  assert.ok(expected.size > 10, `표면이 ${expected.size}개 — 스캔이 낡았다`);

  const undocumented = [...expected].filter((entry) => !actual.has(entry));
  assert.deepEqual(
    undocumented,
    [],
    `공개했는데 문서에 없는 경로: ${undocumented.join(", ")} — build:openapi를 돌릴 것`,
  );

  const overdocumented = [...actual].filter((entry) => !expected.has(entry));
  assert.deepEqual(
    overdocumented,
    [],
    `문서에만 있고 실제로는 닫힌 경로: ${overdocumented.join(", ")} — 읽는 쪽이 열려 있다고 믿는다`,
  );
});

test("스펙의 스코프 표기가 실제 강제와 같다", () => {
  const spec = loadSpec();
  const { write } = apiTokenSurfaceSnapshot();
  const writeSet = new Set(
    write.map((entry) => {
      const [method, honoPath] = entry.split(" ");
      return `${method} ${toOpenApiPath(honoPath)}`;
    }),
  );

  for (const [pathName, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const key = `${method.toUpperCase()} ${pathName}`;
      const scopes = operation["x-required-scopes"];
      if (writeSet.has(key)) {
        assert.deepEqual(
          scopes,
          ["read_write"],
          `${key}는 쓰기인데 문서가 read도 허용한다고 말한다`,
        );
      } else {
        assert.ok(
          scopes.includes("read"),
          `${key}는 읽기인데 문서가 read를 빠뜨렸다`,
        );
      }
    }
  }
});

test("스펙의 rate limit 수치가 실제 한도와 같다", () => {
  const spec = loadSpec();
  const limits = apiTokenRateLimits();
  assert.equal(spec["x-rate-limits"].read.max, limits.read.max);
  assert.equal(spec["x-rate-limits"].write.max, limits.write.max);
  assert.equal(spec["x-rate-limits"].read.windowSeconds, limits.read.windowMs / 1000);
  assert.equal(spec["x-rate-limits"].write.windowSeconds, limits.write.windowMs / 1000);
});
