import { useEffect } from "react";
import {
  inferSessionDraftsFromTemplate,
  makeSessionKeys,
  type ProgramListItem,
  type ProgramSessionDraft,
  type ProgramTemplate,
  type SessionRule,
} from "@workout/core/program-store/model";
import type { ProgramStoreQueryState } from "./types";
import { formatProgramDisplayName } from "./view";

export type ProgramStoreCustomizeDraft = {
  name: string;
  baseTemplate: ProgramTemplate;
  sessions: ProgramSessionDraft[];
};

export type ProgramStoreCreateMode = "MARKET_BASED" | "FULL_MANUAL";

export type ProgramStoreCreateDraft = {
  name: string;
  mode: ProgramStoreCreateMode;
  sourceTemplateSlug: string | null;
  rule: SessionRule;
  sessions: ProgramSessionDraft[];
};

function parseSearchValue(value: string | string[] | null) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function buildInitialCreateDraft(
  templates: ProgramTemplate[],
): ProgramStoreCreateDraft {
  const sourceTemplate =
    templates.find((template) => template.visibility === "PUBLIC") ??
    templates[0] ??
    null;
  const initialRule: SessionRule = { type: "NUMERIC", count: 2 };
  const keys = makeSessionKeys(initialRule);

  return {
    name: "",
    mode: sourceTemplate ? "MARKET_BASED" : "FULL_MANUAL",
    sourceTemplateSlug: sourceTemplate?.slug ?? null,
    rule: initialRule,
    sessions: keys.map((key) => ({
      id: `${key}-${Date.now()}`,
      key,
      exercises: [],
    })),
  };
}

type UseProgramStoreSheetEntryControllerInput = {
  queryState: ProgramStoreQueryState;
  listItems: ProgramListItem[];
  templates: ProgramTemplate[];
  locale: "ko" | "en";
  setDetailTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  setCustomizeDraft: React.Dispatch<
    React.SetStateAction<ProgramStoreCustomizeDraft | null>
  >;
  setCreateDraft: React.Dispatch<
    React.SetStateAction<ProgramStoreCreateDraft | null>
  >;
};

export function useProgramStoreSheetEntryController({
  queryState,
  listItems,
  templates,
  locale,
  setDetailTargetId,
  setCustomizeDraft,
  setCreateDraft,
}: UseProgramStoreSheetEntryControllerInput) {
  useEffect(() => {
    const detailSlug = parseSearchValue(queryState.detail);
    const customizeSlug = parseSearchValue(queryState.customize);
    const createFlag = parseSearchValue(queryState.create);

    if (detailSlug) {
      const item = listItems.find((entry) => entry.template.slug === detailSlug);
      if (item) setDetailTargetId(item.template.id);
    }

    if (customizeSlug) {
      const item = listItems.find((entry) => entry.template.slug === customizeSlug);
      if (item) {
        setCustomizeDraft({
          name:
            locale === "ko"
              ? `${formatProgramDisplayName(item.template.name)} 커스텀`
              : `${formatProgramDisplayName(item.template.name)} Custom`,
          baseTemplate: item.template,
          sessions: inferSessionDraftsFromTemplate(item.template),
        });
      }
    }

    if (createFlag === "1" && templates.length > 0) {
      setCreateDraft(buildInitialCreateDraft(templates));
    }
  }, [
    listItems,
    locale,
    queryState.create,
    queryState.customize,
    queryState.detail,
    setCreateDraft,
    setCustomizeDraft,
    setDetailTargetId,
    templates,
  ]);
}
