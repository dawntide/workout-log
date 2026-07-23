import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateFromLogicDefinition } from "./generateSession";

/**
 * DSL golden master (docs/program-dsl-typing-plan.md, Phase 0 / G1).
 *
 * Pins generateFromLogicDefinition output for every real LOGIC definition dumped
 * from the DB (fixtures/dsl/inputs.json). The upcoming DSL retyping (Phases 1-5)
 * must keep this byte-identical — typecheck can't catch a changed fallback, this
 * can. ref5 is excluded (routed outside this dispatcher); manual/slotted paths are
 * covered by the existing behavioral tests and get their own golden in later phases.
 *
 * Regenerate intentionally (only when output SHOULD change) with:
 *   UPDATE_DSL_GOLDEN=1 pnpm -C packages/core exec tsx --test src/program-engine/dsl-golden.test.ts
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, "../../fixtures/dsl");
const goldenPath = path.join(fixturesDir, "golden-logic.json");

type InputEntry = {
  slug: string;
  type: string;
  kind: string | null;
  definition: unknown;
  defaults: unknown;
};

// Fixed, deterministic context. Exact weights don't matter — only that output is
// stable across the refactor. Covers a small week/day spread per definition.
const CANON_PARAMS = {
  trainingMaxKg: { SQUAT: 200, BENCH: 140, DEADLIFT: 240, OHP: 100, PULL: 60 },
  oneRepMaxKg: { SQUAT: 220, BENCH: 155, DEADLIFT: 265, OHP: 110, PULL: 70 },
  schedule: ["D1", "D2", "D3"],
};
const WEEK_DAYS: Array<[number, number]> = [
  [1, 1],
  [2, 1],
  [3, 1],
  [1, 2],
];

function buildActual(): Record<string, Record<string, unknown>> {
  const inputs = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "inputs.json"), "utf8"),
  ) as InputEntry[];

  const logic = inputs
    .filter((e) => e.type === "LOGIC" && e.kind !== "ref5")
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const actual: Record<string, Record<string, unknown>> = {};
  for (const entry of logic) {
    const bySlot: Record<string, unknown> = {};
    for (const [week, day] of WEEK_DAYS) {
      bySlot[`w${week}-d${day}`] = generateFromLogicDefinition(entry.definition, {
        week,
        day,
        params: CANON_PARAMS,
        defaults: entry.defaults,
        orderBase: 0,
      });
    }
    actual[entry.slug] = bySlot;
  }
  return actual;
}

test("DSL golden: LOGIC dispatcher output is unchanged", () => {
  const actual = buildActual();
  const serialized = JSON.stringify(actual, null, 2) + "\n";

  if (process.env.UPDATE_DSL_GOLDEN === "1" || !fs.existsSync(goldenPath)) {
    fs.writeFileSync(goldenPath, serialized);
    // Regeneration run — assert we at least produced non-empty coverage.
    assert.ok(Object.keys(actual).length > 0, "expected at least one LOGIC definition");
    return;
  }

  const expected = fs.readFileSync(goldenPath, "utf8");
  assert.equal(
    serialized,
    expected,
    "generateFromLogicDefinition output drifted from the golden — if intentional, regenerate with UPDATE_DSL_GOLDEN=1",
  );
});
