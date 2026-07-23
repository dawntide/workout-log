import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  planParamsSchema,
  programDefaultsSchema,
  parsePlanParams,
} from "./plan-params";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, "../../fixtures/dsl/plan-params.json");

type Fixture = { params: unknown[]; defaults: unknown[] };

test("every real plan.params + programVersion.defaults parses", () => {
  const { params, defaults } = JSON.parse(
    fs.readFileSync(fixturePath, "utf8"),
  ) as Fixture;
  assert.ok(params.length > 0, "expected dumped plan.params");

  for (const p of params) {
    const r = planParamsSchema.safeParse(p);
    assert.ok(r.success, `plan.params failed to parse: ${JSON.stringify(p)}`);
  }
  for (const d of defaults) {
    const r = programDefaultsSchema.safeParse(d);
    assert.ok(r.success, `defaults failed to parse: ${JSON.stringify(d)}`);
  }
});

test("known fields are typed; unknown keys survive passthrough; malformed falls back", () => {
  const parsed = parsePlanParams({
    timezone: "Asia/Seoul",
    trainingMaxKg: { SQUAT: 150, BENCH: 110 },
    schedule: ["D1", "D2", "D3"],
    futureKnob: 42,
  });
  assert.equal(parsed.timezone, "Asia/Seoul");
  assert.equal(parsed.trainingMaxKg?.SQUAT, 150);
  assert.deepEqual(parsed.schedule, ["D1", "D2", "D3"]);
  assert.equal((parsed as Record<string, unknown>).futureKnob, 42); // passthrough

  assert.deepEqual(parsePlanParams(null), {}); // fallback, no throw
  assert.deepEqual(parsePlanParams("nonsense"), {});
});
