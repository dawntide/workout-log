import { useMemo } from "react";
import {
  isOperatorTemplate,
  toProgramListItems,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import {
  filterProgramListItemsBySearch,
  filterProgramListItemsByCategory,
  getProgramStoreDetailVariants,
  groupProgramStoreListItems,
  storeCategories,
} from "./view";

type UseProgramStoreDerivedStateInput = {
  templates: ProgramTemplate[];
  locale: "ko" | "en";
  storeQuery: string;
  categoryFilter: string;
  detailTargetId: string | null;
  customizeDraft: {
    baseTemplate: ProgramTemplate;
  } | null;
};

export function useProgramStoreDerivedState({
  templates,
  locale,
  storeQuery,
  categoryFilter,
  detailTargetId,
  customizeDraft,
}: UseProgramStoreDerivedStateInput) {
  const categoryOptions = useMemo(() => storeCategories(locale), [locale]);

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

  const categoryFilteredItems = useMemo(
    () => filterProgramListItemsByCategory(filteredListItems, categoryFilter),
    [categoryFilter, filteredListItems],
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
    () => categoryFilteredItems.filter((entry) => entry.source === "MARKET"),
    [categoryFilteredItems],
  );

  const customListItems = useMemo(
    () => categoryFilteredItems.filter((entry) => entry.source === "CUSTOM"),
    [categoryFilteredItems],
  );

  const isOperatorCustomization = useMemo(
    () => isOperatorTemplate(customizeDraft?.baseTemplate),
    [customizeDraft],
  );

  return {
    categoryOptions,
    templateItems,
    listItems,
    filteredListItems,
    categoryFilteredItems,
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
