import { useMemo } from "react";
import {
  isOperatorTemplate,
  toProgramListItems,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import {
  buildProgramFacetGroups,
  countSelectedFacets,
  type ProgramFacetSelection,
} from "@workout/core/program-store/facets";
import {
  filterProgramListItemsBySearch,
  filterProgramListItemsByFacets,
  getProgramStoreDetailVariants,
  groupProgramStoreListItems,
} from "./view";

type UseProgramStoreDerivedStateInput = {
  templates: ProgramTemplate[];
  locale: "ko" | "en";
  storeQuery: string;
  facetSelection: ProgramFacetSelection;
  detailTargetId: string | null;
  customizeDraft: {
    baseTemplate: ProgramTemplate;
  } | null;
};

export function useProgramStoreDerivedState({
  templates,
  locale,
  storeQuery,
  facetSelection,
  detailTargetId,
  customizeDraft,
}: UseProgramStoreDerivedStateInput) {
  // Built from the loaded programs, so the sheet can only offer values that
  // match something.
  const facetGroups = useMemo(
    () => buildProgramFacetGroups(templates, locale),
    [locale, templates],
  );

  const selectedFacetCount = useMemo(
    () => countSelectedFacets(facetSelection),
    [facetSelection],
  );

  const templateItems = useMemo(
    () => toProgramListItems(templates, locale),
    [locale, templates],
  );

  const listItems = useMemo(
    () => groupProgramStoreListItems(templateItems, locale),
    [locale, templateItems],
  );

  const filteredListItems = useMemo(
    () => filterProgramListItemsBySearch(listItems, storeQuery, locale),
    [listItems, locale, storeQuery],
  );

  const facetFilteredItems = useMemo(
    () => filterProgramListItemsByFacets(filteredListItems, facetSelection),
    [facetSelection, filteredListItems],
  );

  const publicTemplates = useMemo(
    () => templates.filter((template) => template.visibility === "PUBLIC"),
    [templates],
  );

  const manualPublicTemplate = useMemo(
    () => publicTemplates.find((template) => template.type === "MANUAL") ?? null,
    [publicTemplates],
  );

  const detailTarget = useMemo(
    () =>
      templateItems.find((entry) => entry.template.id === detailTargetId) ?? null,
    [detailTargetId, templateItems],
  );

  const detailVariants = useMemo(
    () => getProgramStoreDetailVariants(templateItems, detailTarget),
    [detailTarget, templateItems],
  );

  const customProgramCount = useMemo(
    () => templateItems.filter((entry) => entry.source === "CUSTOM").length,
    [templateItems],
  );

  const marketListItems = useMemo(
    () => facetFilteredItems.filter((entry) => entry.source === "MARKET"),
    [facetFilteredItems],
  );

  const customListItems = useMemo(
    () => facetFilteredItems.filter((entry) => entry.source === "CUSTOM"),
    [facetFilteredItems],
  );

  const isOperatorCustomization = useMemo(
    () => isOperatorTemplate(customizeDraft?.baseTemplate),
    [customizeDraft],
  );

  return {
    facetGroups,
    selectedFacetCount,
    templateItems,
    listItems,
    filteredListItems,
    facetFilteredItems,
    publicTemplates,
    manualPublicTemplate,
    detailTarget,
    detailVariants,
    customProgramCount,
    marketListItems,
    customListItems,
    isOperatorCustomization,
  };
}
