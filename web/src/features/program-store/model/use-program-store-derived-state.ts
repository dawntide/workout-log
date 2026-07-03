import { useMemo } from "react";
import {
  getProgramScheduleLabel,
  isOperatorTemplate,
  toProgramListItems,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import {
  filterProgramListItemsByCategory,
  formatProgramDisplayName,
  normalizeSearchText,
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

  const listItems = useMemo(() => toProgramListItems(templates, locale), [locale, templates]);

  const filteredListItems = useMemo(() => {
    const normalizedQuery = storeQuery.trim().toLowerCase();
    if (!normalizedQuery) return listItems;
    return listItems.filter((item) => {
      const scheduleLabel = getProgramScheduleLabel(item.template, locale);
      const tags = Array.isArray(item.template.tags) ? item.template.tags.join(" ") : "";
      return normalizeSearchText(
        formatProgramDisplayName(item.name),
        item.subtitle,
        item.description,
        scheduleLabel,
        tags,
      ).includes(normalizedQuery);
    });
  }, [listItems, locale, storeQuery]);

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
    () => listItems.find((entry) => entry.template.id === detailTargetId) ?? null,
    [detailTargetId, listItems],
  );

  const customProgramCount = useMemo(
    () => listItems.filter((entry) => entry.source === "CUSTOM").length,
    [listItems],
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
    listItems,
    filteredListItems,
    categoryFilteredItems,
    publicTemplates,
    manualPublicTemplate,
    detailTarget,
    customProgramCount,
    marketListItems,
    customListItems,
    isOperatorCustomization,
  };
}
