import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProgramFacetGroups,
  countSelectedFacets,
  deriveProgramFacets,
  matchesProgramFacets,
  toggleProgramFacet,
} from "./facets";
import type { ProgramTemplate } from "./model";

function template(overrides: Partial<ProgramTemplate> = {}): ProgramTemplate {
  return {
    id: overrides.id ?? "id",
    slug: overrides.slug ?? "slug",
    name: overrides.name ?? "Program",
    type: overrides.type ?? "LOGIC",
    visibility: overrides.visibility ?? "PUBLIC",
    description: overrides.description ?? null,
    tags: overrides.tags ?? null,
    latestVersion:
      overrides.latestVersion === undefined
        ? { id: "v", version: 1, definition: null, defaults: null }
        : overrides.latestVersion,
  };
}

test("tag axes match whole tags, never substrings", () => {
  // The old filter joined tags into one string and used includes(), so a tag
  // that merely contained "beginner" satisfied the beginner category.
  const facets = deriveProgramFacets(
    template({ tags: ["beginner-friendly", "non-strength"] }),
  );
  assert.deepEqual(facets.level, []);
  assert.deepEqual(facets.goal, []);
});

test("tag axes read the seeded vocabulary", () => {
  const facets = deriveProgramFacets(
    template({ tags: ["strength", "barbell", "wendler", "intermediate", "hypertrophy"] }),
  );
  assert.deepEqual(facets.goal.sort(), ["hypertrophy", "strength"]);
  assert.deepEqual(facets.level, ["intermediate"]);
});

test("a program without level tags claims no level", () => {
  // getProgramDetailInfo shows "일반/Standard" here for display. Reusing that as
  // a facet would file every custom program under one level.
  const facets = deriveProgramFacets(template({ tags: ["manual", "custom"] }));
  assert.deepEqual(facets.level, []);
});

test("engine comes from the template type, so custom programs stay filterable", () => {
  assert.deepEqual(deriveProgramFacets(template({ type: "LOGIC" })).engine, ["auto"]);
  assert.deepEqual(
    deriveProgramFacets(template({ type: "MANUAL", tags: ["manual", "custom"] })).engine,
    ["fixed"],
  );
});

test("frequency reads schedule.sessionsPerWeek, falling back to manual session count", () => {
  const scheduled = deriveProgramFacets(
    template({
      latestVersion: {
        id: "v",
        version: 1,
        definition: { kind: "531", schedule: { sessionsPerWeek: 4, weeks: 4 } },
        defaults: null,
      },
    }),
  );
  assert.deepEqual(scheduled.frequency, ["4"]);

  const manual = deriveProgramFacets(
    template({
      type: "MANUAL",
      latestVersion: {
        id: "v",
        version: 1,
        definition: { kind: "manual", sessions: [{ key: "A" }, { key: "B" }, { key: "C" }] },
        defaults: null,
      },
    }),
  );
  assert.deepEqual(manual.frequency, ["3"]);

  const none = deriveProgramFacets(template({ latestVersion: null }));
  assert.deepEqual(none.frequency, []);
});

test("REF5 claims the whole range its detail screen advertises", () => {
  // Session-based, so it has no schedule block. Deriving nothing would hide it
  // from every frequency filter while the detail screen says "주 2–4회".
  const facets = deriveProgramFacets(
    template({
      slug: "ref5-adaptive-strength",
      latestVersion: {
        id: "v",
        version: 1,
        definition: { kind: "ref5" },
        defaults: null,
      },
    }),
  );
  assert.deepEqual(facets.frequency, ["2", "3", "4"]);
});

test("high frequencies collapse into one bucket", () => {
  const facets = deriveProgramFacets(
    template({
      latestVersion: {
        id: "v",
        version: 1,
        definition: { schedule: { sessionsPerWeek: 6 } },
        defaults: null,
      },
    }),
  );
  assert.deepEqual(facets.frequency, ["5plus"]);
});

test("selection is OR within an axis and AND across axes", () => {
  const facets = deriveProgramFacets(
    template({ type: "LOGIC", tags: ["strength", "intermediate"] }),
  );

  assert.equal(matchesProgramFacets(facets, {}), true);
  assert.equal(matchesProgramFacets(facets, { goal: ["strength"] }), true);
  assert.equal(matchesProgramFacets(facets, { goal: ["hypertrophy"] }), false);
  // OR inside the axis
  assert.equal(matchesProgramFacets(facets, { goal: ["hypertrophy", "strength"] }), true);
  // AND across axes
  assert.equal(
    matchesProgramFacets(facets, { goal: ["strength"], engine: ["auto"] }),
    true,
  );
  assert.equal(
    matchesProgramFacets(facets, { goal: ["strength"], engine: ["fixed"] }),
    false,
  );
  // An empty array is no constraint, not an impossible one.
  assert.equal(matchesProgramFacets(facets, { goal: [] }), true);
});

test("a program with no value on a filtered axis is excluded", () => {
  const custom = deriveProgramFacets(template({ type: "MANUAL", tags: ["manual", "custom"] }));
  assert.equal(matchesProgramFacets(custom, { level: ["beginner"] }), false);
  assert.equal(matchesProgramFacets(custom, { engine: ["fixed"] }), true);
});

test("groups only offer values some program actually has", () => {
  // The hard-coded category list offered 지구력 even though nothing carried an
  // endurance tag, so choosing it always emptied the list.
  const groups = buildProgramFacetGroups([
    template({ id: "a", type: "LOGIC", tags: ["strength", "intermediate"] }),
    template({ id: "b", type: "MANUAL", tags: ["strength", "novice"] }),
  ]);
  const goal = groups.find((group) => group.key === "goal");
  const level = groups.find((group) => group.key === "level");

  assert.equal(goal, undefined, "a single-value axis cannot narrow anything");
  assert.deepEqual(
    level?.options.map((option) => option.value),
    ["beginner", "intermediate"],
    "declared order, not alphabetical",
  );
  assert.deepEqual(
    groups.find((group) => group.key === "engine")?.options.map((o) => o.value),
    ["auto", "fixed"],
  );
});

test("frequency options sort numerically", () => {
  const withFrequency = (n: number, id: string) =>
    template({
      id,
      latestVersion: {
        id: "v",
        version: 1,
        definition: { schedule: { sessionsPerWeek: n } },
        defaults: null,
      },
    });
  const groups = buildProgramFacetGroups([
    withFrequency(4, "a"),
    withFrequency(2, "b"),
    withFrequency(3, "c"),
  ]);
  assert.deepEqual(
    groups.find((group) => group.key === "frequency")?.options.map((o) => o.value),
    ["2", "3", "4"],
  );
});

test("toggling drops the axis once its last value is removed", () => {
  let selection = toggleProgramFacet({}, "goal", "strength");
  assert.deepEqual(selection, { goal: ["strength"] });
  assert.equal(countSelectedFacets(selection), 1);

  selection = toggleProgramFacet(selection, "goal", "hypertrophy");
  assert.equal(countSelectedFacets(selection), 2);

  selection = toggleProgramFacet(selection, "goal", "strength");
  selection = toggleProgramFacet(selection, "goal", "hypertrophy");
  assert.deepEqual(selection, {}, "an emptied axis must not linger as a key");
  assert.equal(countSelectedFacets(selection), 0);
});
