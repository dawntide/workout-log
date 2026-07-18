import assert from "node:assert/strict";
import test from "node:test";
import {
  toProgramListItems,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import {
  filterProgramListItemsByCategory,
  filterProgramListItemsBySearch,
  getProgramStoreDetailVariants,
  groupProgramStoreListItems,
  resolveProgramStoreSelection,
} from "./view";

function makeTemplate({
  id,
  slug,
  name,
  assistance,
  tags,
  visibility = "PUBLIC",
}: {
  id: string;
  slug: string;
  name: string;
  assistance?: "NONE" | "FSL" | "BBB";
  tags: string[];
  visibility?: ProgramTemplate["visibility"];
}): ProgramTemplate {
  return {
    id,
    slug,
    name,
    type: "LOGIC",
    visibility,
    description: null,
    tags,
    latestVersion: {
      id: `version-${id}`,
      version: 1,
      definition: {
        kind: assistance ? "531" : "operator",
        assistance,
        schedule: { weeks: 4, sessionsPerWeek: 4 },
        modules: ["SQUAT", "BENCH", "DEADLIFT", "OHP"],
      },
      defaults: {},
    },
  };
}

const templates: ProgramTemplate[] = [
  makeTemplate({
    id: "531-base",
    slug: "wendler-531",
    name: "Jim Wendler 5/3/1 (No Assistance)",
    assistance: "NONE",
    tags: ["strength", "5/3/1", "intermediate"],
  }),
  makeTemplate({
    id: "531-fsl",
    slug: "wendler-531-fsl",
    name: "Jim Wendler 5/3/1 + FSL",
    assistance: "FSL",
    tags: ["strength", "5/3/1", "fsl", "intermediate"],
  }),
  makeTemplate({
    id: "531-bbb",
    slug: "wendler-531-bbb",
    name: "Jim Wendler 5/3/1 + BBB",
    assistance: "BBB",
    tags: ["strength", "hypertrophy", "5/3/1", "bbb", "intermediate"],
  }),
  makeTemplate({
    id: "operator",
    slug: "operator",
    name: "Tactical Barbell Operator (Base)",
    tags: ["strength", "operator"],
  }),
  makeTemplate({
    id: "custom-531",
    slug: "my-wendler-531",
    name: "My 5/3/1",
    assistance: "FSL",
    tags: ["strength", "custom"],
    visibility: "PRIVATE",
  }),
];

test("공식 5/3/1 세 템플릿만 스토어에서 하나의 패밀리 카드로 묶는다", () => {
  const templateItems = toProgramListItems(templates, "ko");
  const groupedItems = groupProgramStoreListItems(templateItems, "ko");
  const family = groupedItems.find(
    (item) => item.key === "market-family-wendler-531",
  );

  assert.equal(groupedItems.length, templateItems.length - 2);
  assert.equal(family?.name, "Jim Wendler 5/3/1");
  assert.equal(family?.subtitle, "3가지 방식 · 기본 / FSL / BBB");
  assert.deepEqual(
    family?.variants?.map((variant) => variant.template.slug),
    ["wendler-531", "wendler-531-fsl", "wendler-531-bbb"],
  );
  assert.ok(
    groupedItems.some((item) => item.template.slug === "my-wendler-531"),
    "사용자 커스텀 5/3/1은 별도 프로그램으로 남아야 한다",
  );
});

test("공식 변형이 누락되면 불완전한 패밀리 카드로 위장하지 않는다", () => {
  const incompleteTemplates = templates.filter(
    (template) => template.slug !== "wendler-531-bbb",
  );
  const templateItems = toProgramListItems(incompleteTemplates, "ko");
  const groupedItems = groupProgramStoreListItems(templateItems, "ko");

  assert.equal(groupedItems.length, templateItems.length);
  assert.equal(
    groupedItems.some((item) => item.key === "market-family-wendler-531"),
    false,
  );
});

test("FSL·BBB 검색과 자식 태그 카테고리는 통합 카드로 연결된다", () => {
  const groupedItems = groupProgramStoreListItems(
    toProgramListItems(templates, "ko"),
    "ko",
  );

  const fslResults = filterProgramListItemsBySearch(
    groupedItems,
    "Jim Wendler 5/3/1 + FSL",
    "ko",
  );
  assert.equal(fslResults.length, 1);
  assert.equal(fslResults[0]?.key, "market-family-wendler-531");
  assert.equal(
    resolveProgramStoreSelection(fslResults[0]!, "FSL", "ko").template.slug,
    "wendler-531-fsl",
  );

  const hypertrophyResults = filterProgramListItemsByCategory(
    groupedItems,
    "hypertrophy",
  );
  assert.ok(
    hypertrophyResults.some(
      (item) => item.key === "market-family-wendler-531",
    ),
    "BBB 태그가 통합 카드의 카테고리 검색에도 반영돼야 한다",
  );
});

test("상세 변형 선택은 표시 통합 후에도 실제 세 템플릿 ID를 보존한다", () => {
  const templateItems = toProgramListItems(templates, "ko");
  const bbb = templateItems.find(
    (item) => item.template.slug === "wendler-531-bbb",
  )!;
  const variants = getProgramStoreDetailVariants(templateItems, bbb);

  assert.deepEqual(
    variants.map((variant) => ({
      id: variant.template.id,
      versionId: variant.template.latestVersion?.id,
    })),
    [
      { id: "531-base", versionId: "version-531-base" },
      { id: "531-fsl", versionId: "version-531-fsl" },
      { id: "531-bbb", versionId: "version-531-bbb" },
    ],
  );
});
