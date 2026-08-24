import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  breakdownPlates,
  DEFAULT_BAR_WEIGHT_KG,
  DEFAULT_PLATES_KG,
  formatPerSide,
} from "./plate-breakdown";

type ExpectedCase = {
  target: number;
  expected: {
    kind: "exact" | "nearest" | "below-bar";
    perSide?: number[];
    totalKg?: number;
    barWeightKg?: number;
    requestedKg?: number;
  };
  bar?: number;
  plates?: number[];
};

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/plate-breakdown.json", import.meta.url), "utf8"),
) as Record<string, { bar?: number; plates?: number[]; cases: ExpectedCase[] }>;

function runGroup(groupName: string) {
  const group = fixture[groupName]!;
  for (const testCase of group.cases) {
    const barWeightKg = testCase.bar ?? group.bar!;
    const platesKg = testCase.plates ?? group.plates!;
    const actual = breakdownPlates(testCase.target, { barWeightKg, platesKg });
    const label = `${groupName} target=${testCase.target} bar=${barWeightKg}`;

    assert.equal(actual.kind, testCase.expected.kind, label);
    if (testCase.expected.perSide !== undefined) {
      assert.deepEqual(
        (actual as { perSide: number[] }).perSide,
        testCase.expected.perSide,
        `${label} perSide`,
      );
    }
    if (testCase.expected.totalKg !== undefined) {
      assert.equal(
        (actual as { totalKg: number }).totalKg,
        testCase.expected.totalKg,
        `${label} totalKg`,
      );
    }
    if (testCase.expected.barWeightKg !== undefined) {
      assert.equal(actual.barWeightKg, testCase.expected.barWeightKg, `${label} barWeightKg`);
    }
    if (testCase.expected.requestedKg !== undefined) {
      assert.equal(
        (actual as { requestedKg: number }).requestedKg,
        testCase.expected.requestedKg,
        `${label} requestedKg`,
      );
    }
  }
}

for (const groupName of ["standard", "notAssemblable", "edges", "microPlates"]) {
  test(`plate breakdown golden: ${groupName}`, () => {
    runGroup(groupName);
  });
}

test("perSide always sums back to the reported total", () => {
  const inventory = { barWeightKg: DEFAULT_BAR_WEIGHT_KG, platesKg: DEFAULT_PLATES_KG };
  for (let target = 20; target <= 300; target += 1.25) {
    const result = breakdownPlates(target, inventory);
    if (result.kind === "below-bar") continue;
    const sum = result.perSide.reduce((total, plate) => total + plate, 0);
    const rebuilt = Math.round((result.barWeightKg + sum * 2) * 100) / 100;
    assert.equal(rebuilt, result.totalKg, `target=${target} perSide does not sum to totalKg`);
  }
});

test("the nearest assemblable weight is never further than one micro plate", () => {
  const inventory = { barWeightKg: DEFAULT_BAR_WEIGHT_KG, platesKg: DEFAULT_PLATES_KG };
  const smallest = Math.min(...DEFAULT_PLATES_KG);
  for (let target = 21; target <= 200; target += 0.5) {
    const result = breakdownPlates(target, inventory);
    if (result.kind !== "nearest") continue;
    assert.ok(
      Math.abs(result.totalKg - result.requestedKg) <= smallest * 2,
      `target=${target} landed ${Math.abs(result.totalKg - result.requestedKg)}kg away`,
    );
  }
});

test("negative and non-finite input never throws", () => {
  const inventory = { barWeightKg: DEFAULT_BAR_WEIGHT_KG, platesKg: DEFAULT_PLATES_KG };
  assert.equal(breakdownPlates(-100, inventory).kind, "below-bar");
  assert.equal(breakdownPlates(Number.NaN, inventory).kind, "below-bar");
  assert.doesNotThrow(() => breakdownPlates(0, inventory));
});

test("duplicate and invalid plate entries are normalized away", () => {
  const result = breakdownPlates(60, {
    barWeightKg: 20,
    platesKg: [20, 20, -5, 0, Number.NaN, 20],
  });
  assert.equal(result.kind, "exact");
  assert.deepEqual((result as { perSide: number[] }).perSide, [20]);
});

test("formatPerSide renders a compact summary", () => {
  assert.equal(formatPerSide([]), "");
  assert.equal(formatPerSide([20, 10, 2.5]), "20·10·2.5");
  assert.equal(formatPerSide([25, 1.25]), "25·1.25");
});
